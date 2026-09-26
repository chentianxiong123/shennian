---
title: 'CC Switch 显示错误模型名的排查与解决'
date: 2026-06-14
---

# CC Switch 显示错误模型名的排查与解决

## 问题描述

我用 CC Switch + 自建代理（DeepSeek Web Agent Proxy）给 Claude Code 做中转，代理后端是通义千问（Qwen）。代理本身没问题 — 响应里每个 SSE chunk 都返回 `"model": "qwen3.7-max"`，但 CC Switch 的用量面板里一直显示 `claude-opus-4-8`。

其他中转站没这个问题，只有自建代理会出现。

## 排查过程

### 1. 确认代理侧没问题

抓包确认，我们代理的响应**每个 chunk 都带了正确的 model**：

```json
data: {"id":"...","object":"chat.completion.chunk","model":"qwen3.7-max","choices":[...],"usage":{...}}
```

非流式响应也一样：

```json
{"id":"...","model":"qwen3.7-max","choices":[...],"usage":{...}}
```

响应 100% 正确，问题不在我们这边。

### 2. 查 CC Switch 日志

翻 CC Switch 的日志文件 `~/.cc-switch/logs/cc-switch.log`，发现转发时 model 已经被正确替换了：

```
[Claude] >>> 请求 URL: http://127.0.0.1:48391/v1/chat/completions (model=qwen3.7-max)
```

日志显示 CC Switch **知道**实际转发的是 `qwen3.7-max`。

### 3. 查 CC Switch 数据库

CC Switch 用 SQLite 存请求日志。查 `proxy_request_logs` 表：

```sql
SELECT model, request_model FROM proxy_request_logs 
WHERE app_type='claude' ORDER BY created_at DESC LIMIT 5;
```

结果：

| model | request_model |
|-------|---------------|
| claude-opus-4-8 | claude-opus-4-8 |
| claude-opus-4-8 | claude-opus-4-8 |
| claude-opus-4-8 | claude-opus-4-8 |

`model` 和 `request_model` 都是 `claude-opus-4-8`。CC Switch 转发时用了 `qwen3.7-max`，但**写数据库时没记录转发后的 model**。

### 4. 定位根因

搜 CC Switch 的 GitHub Issues，找到了 [Issue #3846](https://github.com/farion1231/cc-switch/issues/3846)：

> **Bug: Streaming timeout causes wrong model name and zero tokens in usage logs**
> 
> 当流式响应的 model 提取失败时，`claude_model_extractor` 回退到 `request_model`（请求体的原始 model）。

根本原因在 CC Switch 的 Rust 代码里。CC Switch 做 Anthropic → OpenAI 格式转换时，转发器会把 model 替换成配置的模型名（`qwen3.7-max`），但**写数据库的 usage 收集器**从 SSE 事件中提取 model 名时失败了，回退到了 `request_model`（Claude Code 发过来的 `claude-opus-4-8`）。

流程是这样的：

```
Claude Code 发请求 → body.model = "claude-opus-4-8"
    ↓
CC Switch 转发 → 替换为 model = "qwen3.7-max"，发给我们的代理
    ↓
我们的代理返回 → 响应 model = "qwen3.7-max"（正确）
    ↓
CC Switch 收到响应 → 转回 Anthropic 格式给 Claude Code
    ↓
CC Switch 写数据库 → model_extractor 从 SSE 事件中提取 model 失败
    ↓
回退到 request_model = "claude-opus-4-8"（错误）
```

### 5. 为什么其他中转站没问题？

其他中转站（如 pie-xian）用的是 **Anthropic 原生格式**（`apiFormat: "anthropic"`），CC Switch 不需要做格式转换，直接透传。这种情况下 model 提取是正常的。

我们用的是 **OpenAI Chat Completions 格式**（`apiFormat: "openai_chat"`），CC Switch 需要做 Anthropic ↔ OpenAI 的双向转换。格式转换路径上的 model 提取逻辑有 bug。

## 解决方案

CC Switch v3.16.3（2026-06-14 发布）修复了这个问题。

### 更新日志关键内容

> **路由接管流量按真实上游模型计费**
> 
> 当请求被路由到了不同的上游时，代理过去会按上游回显的模型来归因和计价...现在转发器会捕获真实的出站模型，按「上游回显 → 出站模型 → 客户端别名」的顺序归因，并在每行持久化实际使用的定价依据（schema v11）。

> **PR #2774**：修复 Completions 转 Anthropic 时不记录实际返回模型、input token 计算错误。

### 升级方法

1. 从 [GitHub Releases](https://github.com/farion1231/cc-switch/releases/latest) 下载 v3.16.3 的 MSI 安装包
2. 安装后重启 CC Switch
3. 发一个请求验证

### 验证

升级后查数据库：

```sql
SELECT model, request_model FROM proxy_request_logs 
WHERE app_type='claude' ORDER BY created_at DESC LIMIT 5;
```

应该能看到：

| model | request_model |
|-------|---------------|
| qwen3.7-max | claude-opus-4-8 |

`model` 变成了实际转发的 `qwen3.7-max`，`request_model` 保留了 Claude Code 发来的 `claude-opus-4-8`。

## 关键文件路径

| 文件 | 说明 |
|------|------|
| `~/.cc-switch/cc-switch.db` | SQLite 数据库，`proxy_request_logs` 表存请求日志 |
| `~/.cc-switch/logs/cc-switch.log` | CC Switch 运行日志 |
| `~/.cc-switch/settings.json` | 全局设置 |

## 总结

- 问题出在 CC Switch 的格式转换路径（OpenAI → Anthropic）上，model 提取逻辑有 bug
- 不是代理的问题，代理响应完全正确
- 升级到 CC Switch v3.16.3 即可解决
- 其他中转站用 Anthropic 原生格式不受影响，只有用 OpenAI Chat Completions 格式的自建代理会遇到
