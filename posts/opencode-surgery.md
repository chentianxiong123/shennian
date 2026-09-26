---
title: 'Opencode 手术方案'
date: 2026-07-12
---

# Opencode 手术方案

> 目标：根治 event 表膨胀，不改 UI 不崩重放
> 基于 `D:\agent\opencode` (dev 分支, 1.17.18)

---

## 原则

- **不改 Schema** — 不新建事件类型，不改表结构
- **不改 UI** — Web/CLI 消费端不动
- **改的越少越好** — 聚焦合并写入，不做架构重写

---

## 手术一: 合并 step-finish + cleanup

### 现状

`processor.ts` 里每个 LLM turn 至少 2 次 `updateMessage`:

1. **step-finish** (L456): 写 `finish`, `cost`, `tokens`
2. **cleanup** (L596): 写 `time.completed`

加上 `prompt.ts` 里创建 assistant message 那次，同一消息 3 次 `message.updated.1`。

### 改法

在 `cleanup` 里不调 `updateMessage`，让 `step-finish` 已经写了 `time.completed`（或者反过来）。

具体: `processor.ts:456` 的 `step-finish` case 里，加上 `ctx.assistantMessage.time.completed = Date.now()`，然后 L596 删掉 `yield* session.updateMessage(ctx.assistantMessage)`。

但 `cleanup` 在中断/错误时也会执行，所以不能直接删。正确做法：

```typescript
// step-finish (L456):
ctx.assistantMessage.time.completed = Date.now()  // 加这一行
yield* session.updateMessage(ctx.assistantMessage)

// cleanup (L596):
// 如果 time.completed 已经设过（step-finish 已写），跳过
if (!ctx.assistantMessage.time.completed) {
  ctx.assistantMessage.time.completed = Date.now()
  yield* session.updateMessage(ctx.assistantMessage)
}
```

**效果**: 正常流程每条 assistant 消息 2 次 → 1 次（省 50%）
**风险**: 低 — cleanup 兜底处理中断/错误场景

---

## 手术二: 合并创建 + 首次更新

### 现状

`prompt.ts:1201` 创建 assistant message 时 `updateMessage` 一次，然后 `processor.ts:456` step-finish 又 `updateMessage` 一次。创建时消息还是空的（无 content, cost=0, tokens=0），纯占位。

### 改法

创建时不发 durable event，只在本地建消息记录。创建改用一个独立的非 durable publish，或者延迟到 `step-finish` 才写。

但这个改动大，涉及 `prompt.ts` 和 `processor.ts` 的交互，**不优先做**。

---

## 手术三: PartUpdated 去 durable (可选)

### 现状

`PartUpdated` (`message.part.updated.1`) 260,911 行 / 1,047 MB — 占数据量的 **68%**。

每条 `updatePart` 都写完整 part JSON 到 event 表。streaming 过程中 `text-start`, `text-end`, `reasoning-start`, `reasoning-end`, `step-start`, `step-finish` 每次都触发。

而 `PartDelta` (`message.part.delta`) 已经是非 durable 的正确先例。

### 改法

`schema/src/v1/session.ts:612`：

```typescript
PartUpdated: define({
  type: "message.part.updated",
  // 去掉 ...options (去掉 durable)
  schema: {
    sessionID: SessionID,
    part: Part,
    time: Schema.Finite,
  },
}),
```

但 `PartUpdated` 也有 projector 吗？查了：**没有**。`PartUpdated` 的 projector 不存在（只有 `MessageUpdated` 的 projector 写 `MessageTable`）。所以去掉 durable 不会影响数据保存，只影响 event 表。

不过 UI 端通过 V2 sync 消费 `PartUpdated` 吗？查一下消息总线——UI 走的是 GlobalBus，不依赖 event 表。改非 durable 后 event 表不写，但 GlobalBus 应该继续推（`updatePart` 内部先 `events.publish` 再走 bridge → GlobalBus）。

**这不完全确定**，需要验证 GlobalBus 推送路径是否依赖 event 表写入。

### 效果

+ 去掉 260,911 行 / 1,047 MB 的未来增量
+ 现有行不删，但不再增长
+ **风险**: 需要确认 Web UI 重放是否依赖 event 表里的 `PartUpdated`

---

## 手术优先级

| 手术 | 效果 | 风险 | 工作量 | 顺序 |
|------|------|------|--------|------|
| 一: 合并 finish+cleanup | 省 33% 的 `message.updated.1` | 低 | 2 行 | **1** |
| 二: 合并创建+首次更新 | 省 33% 的 `message.updated.1` | 中 | 修改创建流程 | 3 |
| 三: PartUpdated 去 durable | 省 68% 的 event 行 | **中-高** | 1 行 | **先验证** |

---

## 先验证: PartUpdated 去 durable 是否安全

要回答的问题:
1. Web UI 的「会话重放」是否读 event 表的 `message.part.updated.1`?
2. V2 sync (`EventV2Bridge`) 是把 event 表作为来源，还是独立推送？

查 `packages/app/src/context/global-sync/event-reducer.ts`：只看 `message.updated` 和 `session.updated`，**不看 `message.part.updated`**。

但 `packages/app/src/context/server-session.ts:786` 的 `apply` method 处理 `message.updated`，同样不处理 `part.updated`。

也就是说 `PartUpdated` **event 表行对 Web UI 无意义** — UI 只看 `MessageTable` + live stream。

如果确认这一点，手术三就是安全的。

---

## 立即动手

1. **手术一** — 改 `processor.ts`，2 行代码，低风险
2. **验证手术三** — grep `PartUpdated` 的消费者确认无依赖
3. **手术三** — 改 `session.ts`，1 行代码

完成后 build 测试：跑一个 LLM turn，看 event 表增量有没有降。
