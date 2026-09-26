---
title: '为什么选精简版 Claude(结论)'
date: 2026-08-02
---

# 为什么选精简版 Claude(结论)

> 结论:用 **MiniClaude**(txl16095)替代官方 Claude Code。

---

## 一、背景

电脑上原本装了官方 `@anthropic-ai/claude-code`(v2.1.215)。在折腾配置、cloaking、接管方案时,逐步清理掉并按"精简优先"选型。

## 二、为什么要"精简"替代官方

| 维度 | 官方 Claude Code | 精简版(MiniClaude) | 结论 |
|---|---|---|---|
| 逻辑 | 闭源 | 开源(可审计) | 精简胜 |
| 体积/依赖 | 重、全功能 | 精简、单文件自包含 | 精简胜 |
| 特遥测/云服务 | 有 | **去遥测/去云(DISABLE_TELEMETRY、CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)** | 精简胜 |
| 命令 | 覆盖 `claude` | 命令 `claude`(不覆盖系统命令) | 精简胜 |
| 配置兼容 | 官方 `~/.claude` 结构 | **完全兼容官方结构** → 能被 cc-switch 接管 | 下手处 |
| 扩展 | 仅官方 | 多 Provider 热切换、MCP、插件市场 | 精简更灵活 |

## 三、候选对比(真实数据)

| 候选 | 类型 | 星 | 定位 | 结论 |
|---|---|---|---|---|
| 官方 anthropic claude-code | 闭源 | 139k | 官方 | 被替换 |
| CCB / claude-code-best | fork/逆向 | 21.7k⭐ | 最全/重 | 加法,不要 |
| **MiniClaude** | 开源重建 | 174⭐ | 精简、去遥测 | **✅ 选它** |
| nano-claude | 开源 | 351⭐ | 极简 | 参考 |

## 四、最关键的坑

- **`npm i -g` 一键装不了**:npm 世界包名 `miniclaude` **已被另一个 Python 项目(smmh)占用**。
- MiniClaude **没有 npm 版、没有预编译产物** → **只能 `git clone + bun install + bun build` 源码构建**。
- 构建 + SSD 策略见《SSD 寿命洁癖》篇。

## 五、一句话结论

官方下面,生活里开着一个可审计、去遥测、兼容官方配置的精简开源客户端 —— 用 **MiniClaude**。