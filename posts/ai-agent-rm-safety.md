---
title: 'AI Agent 时代运维安全：rm 防误删方案对比'
date: 2026-07-29
---

# AI Agent 时代运维安全：rm 防误删方案对比

> 写于 2026-07-29，基于 OpenCode / Claude Code / Cursor 等 AI 编程工具的实际经验。

---

## 问题

AI 编程 Agent（OpenCode、Claude Code、Cursor、Codex 等）拥有 bash 执行权限。
一个 `rm -rf` 就能永久删除文件，没有 Ctrl+Z。

### 真实事故

| 事件 | 后果 |
|------|------|
| Claude Code 执行 `rm -rf` 删除用户家目录 | 项目代码全丢 |
| Claude Code 执行 `terraform destroy` 删除生产库 | 2.5 年数据蒸发 |
| Agent 执行 `git reset --hard` 丢弃未提交代码 | 数小时工作白费 |
| Agent 执行 `git clean -fd` 清理"临时文件" | 删除重要配置 |

**根本原因：** `rm` 是不可逆操作。Agent 会把破坏性命令当"捷径"用。

---

## 方案对比

### 1. alias rm='trash'（bashrc）

```bash
echo "alias rm='trash'" >> ~/.bashrc
```

| 维度 | 评价 |
|------|------|
| 原理 | shell alias，执行 `rm` 时替换为 `trash` |
| 优点 | 最简单，一行搞定 |
| 缺点 | **非交互式 shell 不读 .bashrc，alias 不生效** |
| 适合 | 个人终端手动操作 |

**致命缺陷：** AI Agent 的 bash 工具通常启动非交互式 shell（如 Claude Code），
`.bashrc` 根本不被加载，alias 直接被跳过。**对 Agent 无效。**

---

### 2. safe-rm

```bash
apt install safe-rm
```

| 维度 | 评价 |
|------|------|
| 原理 | 替换 `/usr/bin/rm`，保护关键路径（`/`、`/etc` 等） |
| 优点 | 防删系统目录，零配置 |
| 缺点 | 只保护系统路径，不保护项目文件 |
| 适合 | 基础防护层 |

**局限：** Agent 删 `src/`、`package.json` 等项目文件，safe-rm 不管。

---

### 3. trash-cli（Python）

```bash
apt install trash-cli
# 或 pip install trash-cli
```

| 维度 | 评价 |
|------|------|
| 原理 | Python 实现 FreeDesktop Trash 规范 |
| 优点 | 成熟稳定，社区大，文档多 |
| 缺点 | 依赖 Python，ARM 上安装麻烦，体积大 |
| 命令 | `trash-put`、`trash-list`、`trash-restore`、`trash-empty` |
| 适合 | 桌面 Linux 环境 |

**问题：** 盒子是 ARM + Ubuntu 20.04，Python 环境可能冲突。
`trash-put` 命令名和 `rm` 不兼容，需要额外 alias。

---

### 4. gtrash（Go）

```bash
curl -fsSL https://github.com/umlx5h/gtrash/releases/latest/download/gtrash-linux-armhf \
  -o /usr/local/bin/gtrash && chmod +x /usr/local/bin/gtrash
```

| 维度 | 评价 |
|------|------|
| 原理 | Go 单文件，遵循 FreeDesktop Trash 规范 |
| 优点 | **2MB 单文件，无依赖，armhf 原生，rm 参数兼容好** |
| 缺点 | 社区比 trash-cli 小 |
| 命令 | `gtrash put`、`gtrash list`、`gtrash restore`、`gtrash empty` |
| 适合 | **服务器、ARM 设备、容器环境** |

**亮点：** `gtrash put` 不需要 `-r` 参数就能删目录，和 `rm` 行为一致。

---

### 5. ai-trash（专门为 AI Agent 设计）

```bash
curl -fsSL https://raw.githubusercontent.com/forethought-studio/ai-trash/main/install.sh | bash
```

| 维度 | 评价 |
|------|------|
| 原理 | PATH shim + 进程树检测，自动识别 AI 工具 |
| 优点 | 自动区分"你的 rm"和"Agent 的 rm"，只拦截 Agent |
| 缺点 | 复杂，macOS 为主，Linux 支持不完善 |
| 支持 | Claude Code、Cursor、Copilot、Codex、Aider、OpenCode 等全系列 |
| 适合 | macOS 多工具环境 |

**亮点：** 你自己用 `rm` 正常执行，Agent 用 `rm` 自动进回收站。

---

### 6. rm-airbag

```bash
# macOS only
curl -fsSL https://raw.githubusercontent.com/gy-0/rm-airbag/main/install.sh | zsh
```

| 维度 | 评价 |
|------|------|
| 原理 | PATH shim，把 `rm` 替换为 trash 脚本 |
| 优点 | 透明拦截，零配置 |
| 缺点 | **仅 macOS**（依赖 `/usr/bin/trash`） |
| 适合 | Mac 用户 |

---

### 7. OpenCode 插件

```javascript
// .opencode/plugins/rm-guard.js
export const RmGuard = async () => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash") {
        output.args.command = output.args.command
          .replace(/\brm\s+(-[a-zA-Z]*\s+)?/g, 'trash ')
      }
    },
  }
}
```

| 维度 | 评价 |
|------|------|
| 原理 | `tool.execute.before` 钩子，拦截 bash 命令并改写 |
| 优点 | 原生集成，可以精确控制 |
| 缺点 | 只保护 OpenCode，需要写代码 |
| 适合 | 只用 OpenCode 的环境 |

---

### 8. Claude Code hooks

```json
// .claude/settings.json
{
  "permissions": {
    "deny": ["Bash(rm:*)"],
    "allow": ["Bash(trash *)"]
  }
}
```

```markdown
<!-- CLAUDE.md -->
## No `rm` Rule
Never use `rm`. Always use `trash` instead.
```

| 维度 | 评价 |
|------|------|
| 原理 | 权限 deny + 系统提示 |
| 优点 | Claude Code 官方推荐 |
| 缺点 | 只保护 Claude Code，Agent 可能忽略提示 |
| 适合 | 只用 Claude Code 的环境 |

---

## 综合对比

| 方案 | 拦截范围 | Agent 无感 | 安装难度 | ARM 支持 | 推荐度 |
|------|----------|------------|----------|----------|--------|
| alias rm='trash' | 仅交互式 shell | ❌ | ⭐ | ✅ | ⭐ |
| safe-rm | 系统路径 | ✅ | ⭐ | ✅ | ⭐⭐ |
| trash-cli | 需配合 alias | ❌ | ⭐⭐ | ⚠️ | ⭐⭐ |
| **gtrash** | **需配合 shim** | **✅** | **⭐** | **✅** | **⭐⭐⭐** |
| ai-trash | AI 工具自动识别 | ✅ | ⭐⭐ | ⚠️ | ⭐⭐⭐ |
| rm-airbag | PATH shim | ✅ | ⭐ | ❌ | ⭐⭐ |
| OpenCode 插件 | 仅 OpenCode | ✅ | ⭐⭐⭐ | ✅ | ⭐⭐ |
| Claude hooks | 仅 Claude Code | ✅ | ⭐⭐ | ✅ | ⭐⭐ |

---

## 我们的方案：PATH shim + gtrash

### 为什么选这个

1. **PATH shim 是唯一对所有 shell 都生效的方案**
   - alias 只对交互式 shell 生效
   - 插件只对特定工具生效
   - PATH 是环境变量，子进程继承，**不管是交互式还是非交互式**

2. **gtrash 是最轻的回收站工具**
   - Go 单文件，2MB，无依赖
   - armhf 原生支持，直接 curl 下载
   - rm 参数兼容好，不需要特殊处理

3. **完全无感**
   - Agent 照常用 `rm`，不知道背后换了 trash
   - 不需要改配置，不需要写插件，不需要改提示词

### 实现步骤

#### 第 1 步：安装 gtrash

```bash
# ARM 设备（盒子）
ssh hi-box "curl -fsSL https://github.com/umlx5h/gtrash/releases/latest/download/gtrash-linux-armhf \
  -o /usr/local/bin/gtrash && chmod +x /usr/local/bin/gtrash"

# x86 机器
curl -fsSL https://github.com/umlx5h/gtrash/releases/latest/download/gtrash-linux-amd64 \
  -o /usr/local/bin/gtrash && chmod +x /usr/local/bin/gtrash
```

#### 第 2 步：写 PATH shim

```bash
cat > /usr/local/bin/rm << 'SHIM'
#!/bin/bash
# rm shim - 把 rm 转发给 gtrash，保护文件不被永久删除
# 真删请用 /bin/rm
args=()
for arg in "$@"; do
  [[ "$arg" == -* ]] && continue
  args+=("$arg")
done
if [ ${#args[@]} -eq 0 ]; then
  exec /bin/rm "$@"
fi
exec /usr/local/bin/gtrash put "${args[@]}"
SHIM
chmod +x /usr/local/bin/rm
```

#### 第 3 步：确认 PATH 优先级

```bash
which rm
# 应该输出 /usr/local/bin/rm（不是 /bin/rm）

# 如果不是，确保 PATH 最前面有 /usr/local/bin
export PATH="/usr/local/bin:$PATH"
```

### 日常使用

| 操作 | 命令 |
|------|------|
| 删文件（安全，进回收站） | `rm file.txt` / `rm -rf dir/` |
| 查看回收站 | `gtrash list` |
| 恢复文件 | `gtrash restore` |
| 交互式恢复 | `gtrash restore`（带选择界面） |
| 清空回收站 | `gtrash empty` |
| 清空 30 天前的 | `gtrash empty 30` |
| 真删（绕过保护） | `/bin/rm -rf xxx` |

### 已知限制

| 场景 | 问题 | 解决 |
|------|------|------|
| `sudo rm` | sudo 重置 PATH，shim 不生效 | 用 `sudo /usr/local/bin/rm` |
| `/bin/rm` | 完整路径绕过 shim | 这是有意的，真删时用这个 |
| `find . -delete` | 不走 rm，走 unlink 系统调用 | shim 无法拦截 |
| `xargs rm` | 取决于 shell 是否加载 PATH | 大多数情况生效 |
| 回收站占空间 | trash 不释放磁盘 | 定期 `gtrash empty` |

---

## 推荐分层防护

```
┌─────────────────────────────────────┐
│  第 1 层：PATH shim + gtrash        │  ← 拦截 rm，进回收站
├─────────────────────────────────────┤
│  第 2 层：safe-rm                   │  ← 保护 /、/etc 等系统路径
├─────────────────────────────────────┤
│  第 3 层：OpenCode permission       │  ← 工具级权限控制
├─────────────────────────────────────┤
│  第 4 层：Git 版本控制               │  ← 最后防线，代码可恢复
├─────────────────────────────────────┤
│  第 5 层：定期备份                   │  ← 终极保障
└─────────────────────────────────────┘
```

**我们的方案覆盖第 1 层，是最重要的一层。**

---

## 参考链接

- [gtrash - Go 回收站工具](https://github.com/umlx5h/gtrash)
- [ai-trash - AI Agent 专用防护](https://github.com/forethought-studio/ai-trash)
- [rm-airbag - macOS PATH shim](https://github.com/gy-0/rm-airbag)
- [trash-cli - Python 回收站](https://github.com/andreafrancia/trash-cli)
- [OpenCode 插件文档](https://opencode.ai/docs/plugins/)
- [OpenCode 权限文档](https://opencode.ai/docs/permissions/)
- [FreeDesktop Trash 规范](https://specifications.freedesktop.org/trash-spec/latest/)
- [Claude Code 安全最佳实践](https://ofox.ai/blog/claude-code-safety-prevent-accidental-file-deletion/)
