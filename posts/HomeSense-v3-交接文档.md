---
title: 'HomeSense v3 交接文档'
date: 2026-08-29
---

# HomeSense v3 交接文档

> 写给下一个接手的人。读完这份文档,你应该知道:项目是什么、做到哪了、已定案什么决策、代码在哪、下一步干什么。
>
> 状态: 架构定案完成,尚未开始写代码 (Phase 0 ✅ / Phase 1 未开始)

---

## 一、项目是什么

**HomeSense = 云边协同的智能家居 AI 管家 SaaS。**

一个 Android/iOS 电视盒子控制项目演化而来,核心能力是:用户说一句话("打开电视看B站"),云端 Agent 理解意图,家里的边缘盒子执行(ADB/miio 控制路由器、电视、投影仪、智能家居设备)。

### 一句话价值主张
> 用户什么都不会(不懂 adb、不懂 miio、不懂配网),产品要让他插上盒子、扫码、对话,就能控制家里所有设备。断网也能用基础功能。

### 产品形态(SaaS + 硬件混合)
```
云端 SaaS: Agent 大脑(复杂推理/记忆/多设备统筹) —— 订阅费是收入核心
边缘盒子: 即插即用(主动连云端/本地规则/断网降级) —— 硬件是入口和留存
App/Web:  极简界面,用户只看到 "对话 + 按钮"
```

---

## 二、仓库状态

| 项 | 值 |
|----|-----|
| 工作仓库 | `/mnt/shared/HomeSense-Studio-v3` |
| 当前分支 | `main` |
| 最近提交 | 架构文档(2026-08-29,约15条 docs(v3) 提交) |
| 文档位置 | `docs/v3/ARCHITECTURE.md` (核心,先读它) |
| 旧版归档 | v1/v2 全部压缩在 `origin/archive/v2-main`, `origin/v1.0-master`, `origin/source/*` 分支 |

⚠️ **注意**:仓库挂载在 NFS (`192.168.31.82:/mnt/shared`),git 操作要小心跨文件系统问题。大仓库克隆用 codeload tarball,不要 git clone(浪费流量)。

---

## 三、已定案的架构决策 (全部写进 docs/v3/ARCHITECTURE.md)

### 3.1 技术栈
- **Next.js 16 (App Router) 全栈** — 前后端一体,API Routes 做后端(用户明确拒绝 NestJS,不要再提)
- **React 19 + shadcn/ui + Tailwind v4 + @tabler/icons** — UI 模仿 PicoClaw 风格(简约好用)
- **SQLite(Node better-sqlite3)** 一租户一个 `.db` 文件,物理隔离
- **WebSocket** 云端↔盒子长连接(盒子主动出站,NAT 反向穿透,无需公网IP)
- **LangGraph + Vercel AI SDK** — Agent 层(DeepSeek/OpenAI 可切换)
- 类型校验 TypeBox

### 3.2 多租户(SaaS 核心)
```
/home/homesense/data/
  ├── tenant_1.db    # 每个用户一个独立文件
  ├── tenant_2.db
  └── ...
```
- 路由层按 token 分发到对应文件
- 备份 = `cp 文件`;销毁 = 删文件;零耦合
- **禁止 per-user 容器**(100用户=300容器必炸)
- 单文件>100MB 或租户>10000 才考虑换 Postgres(大概率不会触发)

### 3.3 云边协同
```
用户(任意网络) ──WebSocket──▶ 云端SaaS(大脑) ──WebSocket──▶ 家里盒子(手脚) ──▶ 设备
   App/Web                      多租户Agent服务               ADB/miio/蓝牙      电视/灯/空调
```
- **盒子永远主动连云端(出站),绝不接收入站** — 这是"用户在外能控家"的解法
- 云端:复杂推理/记忆/跨设备统筹
- 盒子:本地规则/即时响应/断网降级/隐私
- 盒子 = ADB 的代理,真正的 adb 命令在盒子上跑

### 3.4 产品=多租户 Agent 服务,基础设施不暴露
- 用户接触:App/Web → Agent → LLM → 结果
- n8n/HA/Postgres 等是内部工具,用户看不见摸不着
- 自由版(1盒子/基础功能) → Pro版(¥29/月) → 企业版(私有化)

### 3.5 巨人肩膀原则
- 用库/官方包 90%(miio、adbkit、shadcn、React Flow、n8n自用)
- 自己写 10%: 云端编排层 + 账号 + 设备 JSON 模型
- ❌ 不裁剪任何人源码(教训: v2 裁剪 n8n 源码是最大的坑)
- ⚠️ 商业红线: n8n 免费版禁止打包进商业 SaaS(SUPL 许可证)

---

## 四、v2 留下的资产(可以搬,不要重写)

v2 在 `origin/archive/v2-main` 分支,大量自研代码可以直接复用:

### 后端核心模块 (studio-v1/packages/backend/src/modules/)
| 模块 | 行数 | 内容 |
|------|------|------|
| workflow | ~7200行 | 自研轻量工作流引擎(v1替代n8n的底子) |
| chat | ~3800行 | 会话系统 |
| device | ~2650行 | 设备 JSON 孪生 |
| memory-kernel | ~2100行 | 记忆内核 |
| intent-router | ~640行 | 意图路由(顶层编排雏形) |
| rule-engine | ~830行 | 规则引擎 |
| skills-system | ~435行 | 技能系统 |
| executor-gateway | ~434行 | 执行器网关 |

### 协议层(最值钱,别人写不出)
- `packages/mi-cli` (~4000行) — 完整米家协议: auth/设备/IR/场景/音箱/能力字典
- `packages/adb-cli` (~2200行) — ADB 电视控制
- `packages/media-cli` (~2200行) — 媒体/投屏

### 已死的资产(直接丢弃,别复活)
- ❌ n8n 源码裁剪 (n8n-runtime-trim) — 许可证+维护地狱
- ❌ HomeCast 投屏自研系统 — 用现成 dlna
- ❌ 多余的 Python CLI 壳 (cli/adb, cli/hami) — 用库
- ❌ 四套前端 — 只留 one shadcn 前端

---

## 五、下一步(Phase 1: monorepo 骨架 + 云端核心)

```
HomeSense-Studio-v3/
  apps/
    web/        # Next.js 前端 + API Routes
    hub/        # 边缘盒子轻量进程 (Node.js)
  packages/
    device/     # 设备 JSON 模型 + CAPABILITY_REGISTRY
    agent/      # 顶层编排 + 角色路由
    workflow/   # 从 v2 workflow 模块搬来
    memory/     # 从 v2 memory-kernel 搬来
    protocol/   # TypeBox 协议
    db/         # SQLite 租户路由层
  docs/v3/      # 架构文档
```

**第一个里程碑**:本地跑通 PicoClaw 风格 UI 骨架 + 一个"对话→Agent→模拟执行设备"的最小闭环。

---

## 六、环境与开发注意事项

### 网络(npm 安装)
- npm registry: `https://registry.npmmirror.com`
- 代理: `http://127.0.0.1:7897`(Clash Verge 混合端口,不是 7890)
- 曾踩坑: 大仓库 git clone 浪费 306MB;用 codeload tarball 只拉最新代码

### 参考项目(已研究)
- **PicoClaw UI**: `/tmp/picoclaw-main/web/frontend` — React 19 + shadcn/ui + TanStack Router,UI 风格来源(174源文件,14路由,21 shadcn组件)
- **OpenClaw 架构**: `/mnt/shared/openclaw` — 网关/记忆/多通道路由思想来源(UI太重用它的,不用它UI)
- **pi-web**: `/mnt/shared/pi-web-study` — 可运行参考,Next.js 16 已验证可以在本机跑

### 开发节奏(用户的血泪教训)
1. 用户痛恨"太重太慢",要**快速看到可运行的东西**
2. 不重写已有资产,搬运+整合
3. 界面要**极简**,用户(和面试官)看的都是演示效果
4. 用户的核心诉求: **能演示、能上简历、能装逼**

---

## 七、用户画像(接手人必读)

- 单干开发者,有 v1/v2 两代智能家居项目经验(44个模块)
- 情绪化,容易焦虑("太难了" "放弃"),但方向感强
- **要什么**: 一个能跑、能演示、技术有深度的项目,能写进简历
- **怕什么**: 复杂到跑不起来、又要重写、浪费时间
- 沟通建议: 少讨论多动手,先出可运行原型,再聊架构

---

## 附:常见问题速答

**Q: 用户不会配盒子怎么用?**
A: 出厂预配置好,插电+扫码配对(像连WiFi),之后全是对话。

**Q: 用户在外面怎么控制家里?**
A: 盒子主动连云端(WebSocket 出站),App连云端,云端转发指令。无需公网IP/端口映射。

**Q: 为什么不用 Postgres?**
A: 规模不到。SQLite 一租户一文件,简单够用,备份即复制。真到了1万租户再换。

**Q: 为什么不用 n8n 商业版?**
A: 自用(开发/家庭)用 n8n 没问题;打包进商业SaaS 违反 SUPL 许可证。自己的 workflow 引擎已有底子(v2 7200行)。

**Q: Agent 放盒子还是云?**
A: 两层都放。云=大脑(推理/记忆),盒子=手脚(执行/断网降级)。