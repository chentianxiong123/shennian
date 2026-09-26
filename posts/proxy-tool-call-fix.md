---
title: 'DeepSeek Web Agent Proxy - 工具调用解析修复记录'
date: 2026-06-26
---

# DeepSeek Web Agent Proxy - 工具调用解析修复记录

## 问题现象

OpenCode 通过 cc-switch → proxy → Qwen 后端发送工具调用请求时，模型输出了正确的工具调用文本（如 `工具 Write\nfile_path="..."\ncontent="..."`），但 OpenCode 报错：

```
The model's tool call could not be parsed (retry also failed).
```

模型的工具调用文本被当作普通 content 原样返回，没有被解析成 OpenAI `tool_calls` 格式。

## 排查过程

### 1. 检查正则表达式

`tool_format.py` 中的 `TOOL_BLOCK_RE` 正则本身能正确匹配模型输出的工具块文本。直接调用 `parse_tool_blocks()` 可以解析出 `{name, arguments}`。

### 2. 发现 codec_id 跳过逻辑

`handler.py` 的 `_detect_tool_blocks()` 函数有一个关键判断：

```python
if tool_codec_id != "deepseek_natural":
    return text, []  # 直接跳过，不解析！
```

Qwen 后端设置 `_tool_codec_id = "openai_json"`，导致工具块文本**从未被解析**。

### 3. 发现流式 content 泄漏

即使修复了 codec_id 跳过逻辑，流式路径还有一个问题：当 Qwen 后端同时返回结构化 `tool_call` 事件和 content 中的工具块文本时，原代码在 `tool_calls_acc` 非空时直接把原始 content 发出去，没有清理其中的工具块文本。

### 4. 发现转义函数过度处理

`_unescape()` 函数将 `\t` 转成 tab、`\n` 转成换行。但 Windows 路径中 `\test.txt` 的 `\t` 是路径分隔符，不是转义序列。这导致路径被破坏。

### 5. 发现 SSE chunk 格式不对

将整个 `tool_call`（name + arguments）放在一个 SSE chunk 里发送。OpenAI 标准流式格式是分步的：
- chunk1: `tool_calls[0] = {id, type, function: {name, arguments: ""}}`
- chunk2: `tool_calls[0] = {function: {arguments: "<完整 JSON>"}}`

## 修复内容

### handler.py

1. **`_detect_tool_blocks()`** — 移除 `tool_codec_id` 跳过逻辑，始终尝试解析工具块
2. **`stream_response()`** — 始终调用 `_detect_tool_blocks()` 清理 content 中的工具块文本
3. **`collect_response()`** — 同上，非流式路径也始终解析
4. **新增 `_stream_tool_call_chunks()`** — 将单个 tool_call 拆成 OpenAI 标准的增量 SSE chunks

### tool_format.py

5. **`_unescape()`** — 只处理 `\"` 和 `\\`，不再处理 `\n` `\t`，避免破坏 Windows 路径

## 最终 SSE 输出格式

```
data: {"choices": [{"delta": {"role": "assistant", "content": ""}}]}
data: {"choices": [{"delta": {"tool_calls": [{"index": 0, "id": "call_xxx", "type": "function", "function": {"name": "Write", "arguments": ""}}]}}]}
data: {"choices": [{"delta": {"tool_calls": [{"index": 0, "function": {"arguments": "{\"file_path\": \"C:\\\\Users\\\\...\", \"content\": \"hello\"}"}}]}}]}
data: {"choices": [{"delta": {}, "finish_reason": "tool_calls"}], "usage": {...}}
data: [DONE]
```

## 涉及文件

- `proxy/handler.py` — 流式/非流式响应编排
- `proxy/tool_format.py` — 工具块正则解析
- `proxy/backends/qwen_web/__init__.py` — Qwen 后端（`_tool_codec_id = "openai_json"`）
- `proxy/backends/qwen_web/qwen_api.py` — Qwen API 调用（yield content + tool_call 事件）
