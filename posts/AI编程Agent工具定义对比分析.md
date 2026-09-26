---
title: 'AI 编程 Agent 工具定义对比分析：Claude Code、OpenCode、Pi、Codex'
date: 2026-06-26
---

# AI 编程 Agent 工具定义对比分析：Claude Code、OpenCode、Pi、Codex

## 前言

在开发 AI 编程代理（Agent）的过程中，工具定义（Tool Definition）是连接模型与执行环境的核心桥梁。不同的 Agent 框架对工具的定义方式各不相同，这给跨平台兼容性带来了挑战。

本文对目前主流的四个 AI 编程 Agent 的工具定义进行了深入对比分析：**Claude Code**、**OpenCode**、**Pi Agent** 和 **Codex**。

---

## 一、四大 Agent 工具定义对比

### 1. Claude Code

Claude Code 是 Anthropic 官方的编程 Agent，工具定义采用 OpenAI 函数调用格式。

**Bash 工具：**
```json
{
  "command": "string (required)",
  "description": "string (optional)",
  "timeout": "number (optional)"
}
```

**Read 工具：**
```json
{
  "file_path": "string (required)",
  "offset": "number (optional)",
  "limit": "number (optional)"
}
```

**Write 工具：**
```json
{
  "file_path": "string (required)",
  "content": "string (required)"
}
```

**Edit 工具：**
```json
{
  "file_path": "string (required)",
  "old_string": "string (required)",
  "new_string": "string (required)"
}
```

### 2. OpenCode

OpenCode 是一个开源的终端 AI 编程助手，工具定义与 Claude Code **完全一致**。

**Bash 工具：**
```json
{
  "command": "string (required)",
  "timeout": "number (optional)"
}
```

**View 工具（相当于 Read）：**
```json
{
  "file_path": "string (required)",
  "offset": "number (optional)",
  "limit": "number (optional)"
}
```

**Write 工具：**
```json
{
  "file_path": "string (required)",
  "content": "string (required)"
}
```

**Edit 工具：**
```json
{
  "file_path": "string (required)",
  "old_string": "string (required)",
  "new_string": "string (required)"
}
```

### 3. Pi Agent

Pi Agent 是一个新兴的 AI 编程框架，工具定义有以下特点：

**Bash 工具：**
```json
{
  "command": "string (required)",
  "timeout": "number (optional)"
}
```

**Read 工具：**
```json
{
  "path": "string (required)",  // 注意：用 path 而非 file_path
  "offset": "number (optional)",
  "limit": "number (optional)"
}
```

**Write 工具：**
```json
{
  "path": "string (required)",  // 注意：用 path 而非 file_path
  "content": "string (required)"
}
```

**Edit 工具：**
```json
{
  "path": "string (required)",
  "edits": [
    {
      "oldText": "string (required)",
      "newText": "string (required)"
    }
  ]  // 支持批量编辑
}
```

### 4. Codex

Codex 是 OpenAI 的编程 Agent，采用完全不同的设计理念：

**shell_command 工具：**
```json
{
  "command": "string (required)",
  "workdir": "string (optional)",
  "timeout_ms": "number (optional)",
  "login": "boolean (optional)"
}
```

**exec_command 工具：**
```json
{
  "cmd": "string (required)",
  "workdir": "string (optional)",
  "tty": "boolean (optional)",
  "yield_time_ms": "number (optional)",
  "max_output_tokens": "number (optional)",
  "shell": "string (optional)",
  "login": "boolean (optional)"
}
```

**apply_patch 工具（Freeform）：**
- 使用 Lark 语法定义补丁格式
- 不是传统的 Read/Write/Edit 模式
- 通过 shell 命令读写文件

---

## 二、对比总结表

| Agent | Bash | Read/View | Write | Edit |
|-------|------|-----------|-------|------|
| **Claude Code** | `command, description, timeout` | `file_path, offset, limit` | `file_path, content` | `file_path, old_string, new_string` |
| **OpenCode** | `command, timeout` | `file_path, offset, limit` | `file_path, content` | `file_path, old_string, new_string` |
| **Pi Agent** | `command, timeout` | `path, offset, limit` | `path, content` | `path, edits[{oldText, newText}]` |
| **Codex** | `command, workdir, timeout_ms` | 无（用 shell） | 无（用 shell） | `apply_patch`（Lark 语法） |

---

## 三、关键差异分析

### 1. 参数命名差异

- **Claude Code / OpenCode**：使用 `file_path`
- **Pi Agent**：使用 `path`
- **Codex**：使用 `command` / `cmd`

### 2. Edit 工具结构差异

- **Claude Code / OpenCode**：单次编辑，`old_string` + `new_string`
- **Pi Agent**：支持批量编辑，`edits[{oldText, newText}]`
- **Codex**：没有传统 Edit，使用 `apply_patch`（Lark 语法）

### 3. 设计哲学差异

- **Claude Code / OpenCode**：傻瓜式，直观易用
- **Pi Agent**：参数精简，支持批量操作
- **Codex**：Unix 风格，灵活但复杂

---

## 四、实际应用建议

### 1. 如果只服务 Claude Code

直接使用 Claude Code 的格式即可，无需适配。

### 2. 如果需要支持 Claude Code + OpenCode

两者格式完全一致，无需任何适配。

### 3. 如果需要支持 Pi Agent

需要做参数名映射：
- `path` ↔ `file_path`
- `edits[{oldText, newText}]` ↔ `old_string` + `new_string`

### 4. 如果需要支持 Codex

需要完全不同的适配层：
- `shell_command` ↔ `Bash`
- `apply_patch` ↔ `Edit`

---

## 五、系统提示词设计对比

### Pi Agent 的极简风格

```
你是一个专业的编程助手，运行在 Claude Code 代理中。
你帮助用户读取文件、执行命令、编辑代码和编写新文件。
```

**特点**：
- 角色定义：1 句话
- 工具列表：只给 snippet（每工具 1 行）
- 指南：动态生成（根据可用工具）
- Skills：按需加载（只列元数据）

### 我们的精简版

```
你是一个专业的编程助手，运行在 Claude Code 代理中。
你通过读取文件、执行命令、编辑代码和编写新文件来帮助用户完成任务。
```

**结构**：
- `01-role.md`：角色定义（1 行）
- `02-workspace.md`：工作目录（1 行）
- `03-tools.md`：工具占位符（1 行）
- `04-format.md`：调用格式（3 行）
- `05-escape.md`：转义规则（3 行）
- `06-example.md`：示例（4 行）
- `07-example-code.md`：代码示例（6 行）
- `08-rules.md`：规则（3 行）

---

## 六、总结

1. **Claude Code 和 OpenCode 格式完全一致**，可以无缝切换
2. **Pi Agent** 参数名不同，需要适配层
3. **Codex** 设计哲学完全不同，适配成本高
4. **系统提示词**应该精简，像 Pi Agent 那样

**建议**：
- 如果只服务 Claude Code/OpenCode，保持现状
- 如果要支持更多 Agent，设计统一的工具执行器 + 参数映射层
- 系统提示词参考 Pi Agent 的极简风格

---

## 参考资料

- [Pi Agent GitHub](https://github.com/earendil-works/pi)
- [Codex GitHub](https://github.com/openai/codex)
- [OpenCode GitHub](https://github.com/opencode-ai/opencode)
- [Claude Code Documentation](https://docs.anthropic.com/claude-code)

---

*本文基于对各 Agent 源码的分析，数据截至 2026 年 6 月。*