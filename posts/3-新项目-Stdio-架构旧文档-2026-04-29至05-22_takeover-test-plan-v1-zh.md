---
title: 'HomeSense Studio Plus 接管测试清单 v1'
date: 2026-04-29
---

# HomeSense Studio Plus 接管测试清单 v1

> 文档定位：这是“如何接管这份按文档生成出来的项目”的第一份测试与修复清单。
> 目标不是全面验收所有能力，而是先验证这份代码是否还能接、从哪里开始测最划算、第一条真实闭环应该怎么跑。

## 1. 先说结论

这份项目代码可以要，而且建议保留。

原因不是“它已经做完了”，而是：

- 架构骨架已经生成出来了。
- 后端可以编译。
- 路由、事件、Workflow、CLI Bridge、Skills、Memory 这些大件都已经落了代码。
- 它确实是按 `新生` 文档长出来的，不是完全胡写。

但它还没有被真正接管，所以不能直接拿它去验证最终产品能力。

正确方式应该是：

```text
保留骨架
-> 修关键接缝
-> 从一条英雄路径开始测试
-> 边测边接管
```

## 2. 第一条英雄路径

第一条必须固定，不要来回变。

当前 Hero 场景定为：

```text
我想看 B 站
-> 意图识别
-> 上下文补全为“在东芝电视上看 B 站”
-> 调用设备与技能知识
-> 通过米家/红外控制电视与机顶盒上电
-> 不断等待并连接 ADB
-> 查看包名列表
-> 启动小电视应用
-> 进入可继续操作的 B 站电视端状态
```

这条链不是凭空想的，它在老项目里已经有闭环痕迹：

- 老项目成功路径里有 `watch_bilibili_demo`。
- 旧链路明确是 `hami -> adb wait -> hami -> adb ensure_connected -> adb list_packages(keyword=bili) -> adb launch_app(com.xiaodianshi.tv.yst)`；这只作为历史证据保留，V1 当前主线已切换为 `mi-cli -> adb-cli`。

对应参考：

- `D:/files/HomeSense/agent/dist/tools/success_paths/data/paths.json`
- `D:/files/HomeSense/新生/00-老项目评估/00-HomeSense老项目正式总档案.md`

所以这条路最适合做新项目接管起点，因为它同时证明：

- 家庭娱乐场景真实存在。
- 老项目确实做过，不是空想。
- 新项目只要接住这条线，就能迅速判断骨架值不值得继续投。

## 3. 测试目标

这次接管测试不是问“系统高级不高级”，而是问四件事：

1. 这份代码能不能稳定构建与启动。
2. 设备执行边界能不能真正跑通。
3. Hero 场景能不能形成一条端到端闭环。
4. 这条闭环能不能成为后续 Chat、Workflow、Studio 的母路径。

## 4. 接管原则

### 先测单一路径，不测整个平台

不要一上来测：

- Studio 全部节点
- 多 Agent 调度
- 全部设备发现
- 全部模型能力
- 全部记忆机制

先只测一条：

```text
看 B 站
```

### 先测边界，再测智能

测试顺序必须是：

```text
构建
-> CLI 契约
-> 执行链路
-> Chat
-> Experience 写回
-> Workflow/Studio
```

不是反过来。

### 先用老项目经验对齐新项目，不急着推倒重写

旧项目已经证明过“这条路能走通”，新项目的任务不是重新发明，而是：

- 把旧闭环拆成新架构里的模块。
- 找出现在生成代码哪些接缝没接上。
- 用第一条母路径验证模块边界是否靠谱。

## 5. 第一阶段测试顺序

### T0：构建与启动体检

目标：

- 确认当前工程不是死骨架。

必须检查：

- backend 是否能 build。
- frontend 是否能 build。
- backend 是否能启动。
- DB 是否能初始化。
- skills 是否能加载。

当前已知结论：

- backend 可以编译通过。
- frontend 当前构建失败，原因是 `@vue-flow/background/dist/style.css` 导入路径不对。
- skills parser 与现有 `SKILL.md` 表格格式不一致。

这一阶段通过标准：

```text
npm run build
npm run dev:backend
npm run dev:frontend
```

至少要修到：

- 前后端都能起。
- 启动后没有立刻因为 schema 或依赖问题崩掉。

### T1：CLI 契约测试

目标：

- 验证 `backend -> cliBridge -> mi-cli` 这条边界。

必须检查：

- action 名称是否一致。
- params 结构是否一致。
- 成功结构和错误结构是否稳定。
- stdout 是否干净 JSON。
- timeout 是否可控。

这一阶段不是测智能，而是测“手还在不在”。

通过标准：

```text
TS 可以稳定调用 Python CLI
CLI 返回结构固定
错误不会把上层打穿
```

### T2：Hero 场景拆段测试

不要一上来整条自动跑完。先拆成 5 段：

1. `意图与上下文`
   - 输入：`我想看 B 站`
   - 输出：识别成“在东芝电视上看 B 站”

2. `设备执行计划`
   - 输出步骤应接近：
   ```text
   开东芝电视
   开机顶盒
   等待 ADB 在线
   查包名
   打开 B 站电视应用
   ```

3. `红外执行`
   - 能否通过米家/红外中枢控制电视和机顶盒上电。

4. `ADB 接管`
   - 能否不断尝试连接。
   - 能否拉包名列表。
   - 能否启动 `com.xiaodianshi.tv.yst`。

5. `状态确认`
   - 至少能知道：设备已进入“B 站电视端可继续操作状态”。

这 5 段都通了，整条 Hero 路径才算通。

### T3：Chat 闭环测试

目标：

- 让 Hero 场景通过 Chat 跑起来。

最小通过标准：

- Chat 输入：`我想看 B 站`
- Agent 能产出步骤
- 能触发真实执行链
- Trace 有过程
- 最终有成功/失败结果

这一阶段还不要求：

- 很强的多轮对话
- 很漂亮的 UI
- 很复杂的经验检索

### T4：Experience 写回测试

目标：

- Hero 路径成功后，系统要留下可复用痕迹。

至少要验证：

- 成功后写入 Experience。
- Experience 可被再次召回。
- 第二次再说 `看 B 站` 时，路径更短或更稳定。

这一步决定新项目是不是只是“新壳子”，还是开始重新拥有老项目的“自增强味道”。

### T5：Workflow 接管测试

目标：

- 把 Hero 路径变成 Workflow，而不是仅停留在 Chat。

最小要求：

- 能把“看 B 站”保存成 Workflow。
- Workflow 可以手动运行。
- Workflow Trace 可见。
- Chat 第二次可以直接调用该 Workflow。

这一阶段先不要碰多 Agent 中枢，只验证：

```text
Chat 成功路径
-> Experience
-> Workflow candidate
-> Workflow run
```

### T6：Studio 接管测试

目标：

- 确认 Studio 不是摆设。

最小要求：

- 画布能显示节点。
- 节点保存有效。
- 节点运行顺序正确。
- Trace 能反映节点级状态。

先不追求：

- 所有节点类型
- 多 Agent 节点
- 高级调试面板

只要能把 `看 B 站` 这条路径画出来、跑起来，就够了。

## 6. Hero 场景标准执行链

接管测试时，默认以这条“目标执行链”作为参照：

```text
用户：我想看 B 站
-> intent_router 判断娱乐/观影意图
-> context_completer 结合家庭设备上下文
-> 归一化为：在东芝电视上看 B 站
-> skills / memory / success path 召回
-> 计划：
   1. 红外打开东芝电视
   2. 红外打开机顶盒
   3. ADB 等待电视端上线
   4. ADB 查找 bili 相关包名
   5. ADB 启动 com.xiaodianshi.tv.yst
-> Trace 输出全过程
-> 写回 Experience
```

老项目里的闭环证据是：

```text
mi-cli scene_execute(东芝电视开机)
-> mi-cli speaker_execute(打开东芝电视和机顶盒)
-> adb wait 15s
-> adb ensure_connected(max_attempts=5)
-> adb list_packages(keyword=bili)
-> adb launch_app(package=com.xiaodianshi.tv.yst)
```

新项目测试时，不要求步骤完全一样，但最终闭环要等价。

## 7. 第一批必须修的地方

在正式跑 Hero 场景前，我建议只修这些，不多修：

1. 前端构建错误  
   `StudioView.vue` 的 Vue Flow background CSS 导入路径。

2. Skill parser 对齐  
   让 `skills/mi-cli/SKILL.md` 的表格 action 能被 backend 正确索引。

3. CLI 协议统一  
   确认 `cliBridge.run()` 发送结构与 Python CLI 接收结构一致。

4. 启动配置统一  
   DB、skills 目录、provider 配置、CLI 路径在 dev 环境可稳定工作。

5. Trace 最小可见  
   至少能看到 Hero 场景每一步有没有执行。

这些修复都属于“接管式修复”，不是大重构。

## 8. 现有项目还能不能要

答案是：能要，而且现在最不该做的就是推倒重来。

这份生成项目目前的真实状态更像：

```text
高级架构骨架已生成
+ 一部分代码能工作
+ 一部分代码只停留在“形状正确”
+ 文档与实现还没完全对齐
```

它的问题主要是：

- 接缝没接上。
- 生成质量不均匀。
- 测试还没接管。

它的价值主要是：

- 模块边界已经铺出来。
- 新架构方向已经体现在代码里。
- 不用从零把 20 多个参考项目重新吸收一遍。

所以策略应该是：

```text
保留
-> 修接缝
-> 用 Hero 场景接管
-> 再决定哪些模块需要重写
```

## 9. 第一周接管目标

如果按一周节奏来收敛，我建议只追这三个结果：

1. 前后端都能启动。
2. `我想看 B 站` 这条 Hero 路径至少能拆段跑通。
3. Hero 路径成功后，能保存为 Workflow 雏形。

只要这三件事成了，这份项目就被真正接管了。

## 10. 接管完成的标志

这份项目什么时候算“从前任 AI 交接到我手里了”？

不是文档写完的时候。

而是下面这些都成立的时候：

- 我们知道第一条母路径是什么。
- 我们知道它在旧项目里确实做过。
- 我们知道新项目里哪些模块支撑这条路径。
- 我们修完最关键的接缝。
- 我们能在新项目里把它重新跑通。

一旦 `看 B 站` 这条路在新项目里重新站起来，后面的 Studio、Agent 中枢、B 站 CLI、多 Agent 调度才值得继续扩。
