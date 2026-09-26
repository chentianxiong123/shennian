---
title: 'Java老兵转型TypeScript：为什么我写惯Java觉得TS项目跟屎一样难受'
date: 2026-06-02
---

# Java老兵转型TypeScript：为什么我写惯Java觉得TS项目跟屎一样难受

> 一篇拖了半年的反思文。从 Spring 全家桶到 Node/TS 全栈，从"工程严谨"到"屎山自由"，我用一年时间踩完所有坑后写的总结。

---

## 引子：从"工程严谨"到"屎山自由"的我

我写了五年 Java。Spring Boot + Maven + MyBatis + JUnit 一把梭，团队里 50 个微服务井水不犯河水。新人入职第一天就能上手，因为**结构是被工具强制约束的**。

去年开始接手一个 TypeScript 全栈项目（Node + Fastify + Vue + SQLite），AI 协助开发，目标是搭一个智能家居 Agent 平台。一年后，代码库长到 4 万多行后端、3 万多行前端，我打开 IDE 第一反应是：**这玩意儿怎么没人管？**

我不是说 TS 不好。我是说，**TS 项目非常容易烂掉，而且烂得没有边界**。今天这篇文章，我想把这半年的反思写下来，给同样从 Java 转型过来的兄弟们提个醒。

---

## 一、Java 给我"免费"了什么

先把结论摆出来：**Java 项目的"工程感"不全是 Java 本身带来的，是 Maven + Spring + JUnit 这一套生态叠加出来的**。把同样的约束搬到 TS 上，TS 也能写得像样；缺了这些约束，Java 一样会烂。

### 1. 模块边界是"物理隔离"

Java 项目的目录结构是 Maven 模块：

```
parent
├── user-service        (一个独立 jar)
├── order-service       (一个独立 jar)
└── common-utils        (一个独立 jar)
```

`order-service` 想 `import common-utils`？行，**先在 pom.xml 里加 dependency**。想用 `user-service` 的某个内部类？**编译都过不了**——`user-service` 没有把它 export 到 classpath 之外。

**这是构建系统在保护你**。

TS 项目呢？目录随便取名，`import` 任何文件都 OK。`packages/backend/src/modules/agent-runtime/index.ts` 想调 `packages/backend/src/modules/compensation/index.ts` 的私有函数？**没有任何机制拦你**。一行 `import` 就进去了。

这就是为什么我以前觉得 Java 写起来"舒适"——不是 IDE 智能，是**架构边界被工具强制执行**。

### 2. Package-private 是真的 private

Java 里的 `class Foo` 默认是 package-private，外部包根本看不见。`public class Foo` 才是给别人用的。

TS 里没有这个概念。一个文件 `export` 的东西就是公共 API，没 `export` 的就是"公共但没名字"。你想"我先 export 出去，但是只给自己模块用"？不好意思，要么全 export 要么不 export，没有中间态。

于是 TS 项目里到处是这种代码：

```typescript
// modules/memory/index.ts
export const memoryKernel = new MemoryKernelService()  // 公共单例
export const planLibrary = new PlanLibrary()            // 公共单例
```

所有人都可以从 `import { memoryKernel } from '../memory/index.js'` 拿到这个实例，然后**直接调它内部方法、改它内部状态**。没有封装可言。

### 3. DI 容器是默认项

Spring 写一个 Service：

```java
@Service
public class OrderService {
    private final UserRepository userRepository;
    
    public OrderService(UserRepository userRepository) {
        this.userRepository = userRepository;  // 构造器注入，编译期检查
    }
}
```

新人想绕过去 `new OrderService()` 不带依赖？**编译报错**。想 mock 一个依赖测试？Mockito 一行代码。

TS 项目里我看到的是：

```typescript
export const orderService = new OrderService()  // 没人传依赖，因为没有依赖
```

`OrderService` 内部需要 `UserRepository`，那就 `import { userRepository } from '../user/index.js'`——**直接拿全局单例**。测试时怎么 mock？`vi.mock('../user/index.js')`，**monkey-patch**。改了一个文件，不知道哪个测试在偷偷 patch 它。

### 4. 测试是文化，不是装饰

Java 项目里，`@SpringBootTest`、`@WebMvcTest`、`@DataJpaTest` 是约定俗成的分层测试。一个 Service 没有单元测试，**PR 直接被 reviewer 打回**。

TS 项目里我看到的现实：

- 200 多个测试，5 个 fail 还能 commit
- 很多模块**根本没有测试**
- 测试覆盖率没人看
- mock 全靠 `vi.mock` 调全局单例，测一个模块等于把整个项目都拉起来

这不是 TS 的问题，是**没有人用工程文化的尺子去量 TS 项目**。

### 5. 编译期错误 vs 运行时错误

Java 编译期就报：`找不到符号`、`方法签名不匹配`、`依赖循环`。**这些错误在 CI 第一关就拦下来了**。

TS 也编译，但 `any`、`as any`、`@ts-ignore`、`@ts-expect-error`——**全是逃生通道**。AI 生成的代码 80% 带 `any`，IDE 黄色波浪线提示从不阻塞构建。

我曾在一个 5 万行的 TS 项目里搜 `// @ts-ignore`，**278 处**。278 个"我知道这里有问题但我懒得修"的墓碑。

---

## 二、TS 项目的"屎山进化论"

我观察到的 TS 项目从 1 万行到 5 万行的演化：

### 阶段 1：1 万行以下，看着还不错

- 模块少，文件少，谁导了谁一眼能看出来
- 测试覆盖率还挺高
- 单例是"方便的捷径"

### 阶段 2：2-3 万行，开始有味道

- 出现"god object"：一个文件 500-800 行，干了 6 件事
- 单例之间的依赖关系变成了一张**隐性图**，没人画过
- 测试开始脆：改一个常量，5 个测试 fail
- AI 开始介入开发，**生成大量"能跑但是耦合"的代码**

### 阶段 3：4 万行以上，屎山成型

- 没人敢动核心模块
- 改一行代码要读 20 个文件确认不会爆炸
- "先这样吧"成为口头禅
- 新人入职一周还没搞懂模块边界
- **回滚比重构便宜**

我的项目正好踩在阶段 2-3 之间。最近一次重构我移除了 5 个"过度设计"的模块（auth、approval、compensation、channels、agent-adapter），删完立刻**单测覆盖率从模糊变成 0**——因为这些模块根本就没独立测试过。

---

## 三、一个真实案例：600 行的 god object

我项目里有个 `agent-runtime/index.ts`，**631 行**。它干了这些事：

1. 接收 LLM 流式输出
2. 解析 tool calls
3. 调 L1 规则引擎匹配
4. 调 L2 候选计划检索
5. 调 CLI bridge 执行 mi-cli / adb-cli
6. 调 mi-cli 高危动作的 approval
7. 失败时调 compensation service 建补偿任务
8. 调 memory kernel 记录 outcome
9. 调 self-enhancement 自我强化

一个文件、一个类、9 个职责。**这是 Java 里绝对过不了 review 的代码**，但在 TS 里它"能跑"。

为什么 Java 写不出这种东西？因为：

```java
@Service
public class AgentRuntime {
    // 600 行是不可能过 PMD/SonarQube 的
    // "Cognitive Complexity" 阈值默认 15
    // "Class too large" 阈值默认 500 行
}
```

Java 生态有 **Checkstyle、PMD、SonarQube**，CI 集成，**硬指标**。TS 生态有 ESLint，但**规则深度差一个量级**。

---

## 四、我现在的解法：把 Java 的"免费约束"搬过来

不引新框架，**引约束**。具体做四件事：

### 1. ESLint 模块边界硬约束

```json
// .eslintrc.json
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [{
        "group": ["**/modules/*/internal/**", "**/modules/*/!(index).ts"],
        "message": "Only import from modules/*/index.ts"
      }]
    }]
  }
}
```

这一条规则，**等价于 Maven 的模块隔离**。`agent-runtime` 想偷偷 import `compensation` 的非 index 文件？CI 直接红。

### 2. 单例退役，工厂上线

```typescript
// 以前
export const executorGateway = new ExecutorGatewayService()

// 现在
export function createExecutorGateway(deps: ExecutorGatewayDeps) {
  return new ExecutorGatewayService(deps)
}

// 唯一允许实例化的地方：composition root
const container = buildContainer()
const executorGateway = createExecutorGateway({ cliBridge: container.cliBridge })
```

测试时：

```typescript
const gw = createExecutorGateway({ cliBridge: fakeCliBridge })
```

**没有 vi.mock、没有 monkey-patch、依赖显式、测试脆度可控**。

### 3. god object 拆开

`agent-runtime` 拆成 4 个：

- `router.ts`：意图→路由（L1/L2/L3）
- `tool-executor.ts`：cli/service 调用
- `plan-runner.ts`：compiled plan 执行
- `chat-loop.ts`：LLM 流式对话

每个 < 200 行，每个有自己的 `*.test.ts`，每个有自己的 `index.ts` 公共入口。

### 4. 测试作为"模块完整性"指标

新规则：

- 每个模块的 `index.ts` 必须至少被一个 `*.test.ts` 引用
- 每个公开导出的函数必须有调用测试
- `coverage/` 报告纳入 PR 检查

---

## 五、写给同样从 Java 转过来的兄弟们

### 不要把 TS 当 Java 写

TS 项目不应该模仿 Java 的"重"，**但应该继承 Java 的"严"**。我见过两种极端：

- **TS 当 Python 写**：动态类型、any 满天飞、单例、global state
- **TS 当 Java 写**：引入 NestJS、tsyringe、class-validator、class-transformer，**用 5 个库模拟 Spring**

**都不对**。TS 的正确打开方式是：**用 TypeScript 类型系统当主约束，用 ESLint 当 CI 闸门，用显式 factory 当 DI 替代品**。

### 接受 TS 的"开放性"是设计选择

TS 选择不强制 package-private、不强制循环检测、不强制模块边界——**这是给"小项目快速迭代"留的空间**。问题不是 TS 设计错了，是**项目长大了还没补上约束**。

### AI 生成的代码会加速屎山化

我必须说一句得罪人的话：**LLM 生成的 TS 代码平均耦合度，比人写的 Java 高 3 倍**。原因很简单——LLM 看到的是文件级的局部最优，它不知道你的项目有 4 万行、不知道你想保持模块边界、不知道你想以后拆微服务。

**用 AI 写 TS 项目，必须配套：**

- 模块边界 lint 规则
- 单测覆盖率门槛
- god object 静态检查（用 ESLint 的 max-lines + complexity）
- 提交前 review bot（自定义）

否则你会在 3 个月内得到一个**AI 写的 5 万行屎山**。

---

## 写在最后

我花了半年才接受一个事实：**TS 项目的"工程感"不是语言给的，是文化给的**。Java 之所以"舒适"，是因为**整个生态 25 年来建立了工程文化的默认值**——Maven 校验、Spring 注入、SonarQube 静态检查、PR 流程规范。

TS 也有 ESLint、Prettier、tsc，但**默认值不一样**。如果你不主动设置自己的默认值，**默认值就是"能跑就行"**。

我现在重构项目的第一原则不再是"用对库"，而是**"建好结构"**：

1. 删掉所有 god object
2. 删掉所有单例
3. 加 ESLint 边界规则
4. 每个模块有独立测试
5. composition root 集中装配

这套做完之后，**才像 Java 时代那么顺手**。

如果你也是 Java 老兵转型 TS，欢迎交流踩坑经验。

---

*本文不引战语言，只谈工程。TS 是好语言，前提是你愿意给它配上工程文化的围栏。*
