---
title: 'CPA Auto API 池方案总结'
date: 2026-07-05
---

# CPA Auto API 池方案总结

## 目标
- 10 个子代理并发执行，每代理处理 10 个 job（一个文件夹）
- 多个 API provider 自动负载均衡，不限速、不绑死

## CPA 配置改动（已生效）

### 1. 路由策略：填充 → 轮询
```yaml
routing:
  strategy: "round-robin"       # 原 fill-first，现轮询分配
  session-affinity: false       # 关粘性会话，防止子代理绑死同一个 key
```

### 2. 实现逻辑
所有启用的 provider 的 model 统一命名为同一个名字（如 `split-agent`），子代理只调这个名字：
```
请求 split-agent → CPA 轮询 → 依次分到 agnes → 小水管user → yjjhwjw → sensenova → ...
```

### 3. 请求失败时的 fallback 路径
```
请求 A 失败（429/超时）
  → CPA 自动冷却当前 provider（disable-cooling: false 已开）
  → 轮询到下一个 provider 重试
  → 最多重试 2 次（request-retry: 2）
```

## 当前启用的 provider

| Provider | Model | Key 数 | 状态 |
|---|---|---|---|
| agnes | agnes-2.0-flash | 1 个真实 key | ✅ 启用 |
| yjjhwjw | agnes-2.0-flash | 1 个 key | ✅ 启用 |
| 小水管user | deepseek-v4-flash 等 | 1 个 key | ✅ 启用 |
| 小水管claude | deepseek-v4-flash | 1 个 key | ✅ 启用 |
| SenseNova | deepseek-v4-flash | 1 个 key | ✅ 启用 |

其他 provider 已 disabled。

## 最终批处理流程（10×10）
```
pending/ 按 10 个一分文件夹
       ↓
调度器派发：一次派 10 个文件夹给 AI
       ↓
AI 启动 10 个子代理并发执行
       ↓
每子代理调 CPA（model=split-agent）
       ↓
CPA 轮询分配请求到不同 provider
       ↓
子代理完成 → 报告调度器 → 领下一批 10 个文件夹
```

## 注意事项
- CPA 不做速率感知（不知道每个 provider 当前接近限速值），靠 429 冷却被动降级
- 部分 Sensonova 模型（6.7-flash-lite）返回空内容，已在 CPA 配置中不列入
- 如某 provider 反复失败，考虑在 CPA 中暂时 disabled
