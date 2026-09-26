---
title: 'CC-Switch + Claude/Codex 折腾教训记录'
date: 2026-08-15
---

# CC-Switch + Claude/Codex 折腾教训记录

## 2026-08-15 大翻车总结

### 1. 数据备份的致命教训
- **`mv A A.bak` 之后再 `mv A.bak A`，A.bak 就没了，不是双份**
- 还原 ≠ 备份，改名不是复制
- `rm -rf` 前必须确认 **有没有独立的、不重叠的备份**
- NFS 上删除的文件在客户端无法用 extundelete 恢复，只有服务器端才有机会

### 2. 代理端口跨机器陷阱
- cc-switch 写 `settings.json` 时，代理地址写的是 `127.0.0.1:15721`（它假设工具和代理在同一台机器）
- 实际场景：工具跑在 a1，代理跑在 hi-box (192.168.31.82)，`127.0.0.1` 指 a1 本机 → 连不上
- 每次切 provider，cc-switch 会 **覆盖** `settings.json`，手改的地址被重置回 `127.0.0.1`
- 解决思路：**本地 socat 转发 `127.0.0.1:15721 → 192.168.31.82:15721`**，让 Claude 以为自己连的是本机代理

### 3. socat TCP 转发的 systemd 服务
```ini
[Unit]
Description=Forward 127.0.0.1:15721 -> 192.168.31.82:15721
After=network.target
[Service]
Type=simple
ExecStart=/usr/bin/socat TCP-LISTEN:15721,bind=127.0.0.1,fork,reuseaddr,keepalive TCP:192.168.31.82:15721
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
```
放在 `/etc/systemd/system/claude-proxy-forward.service`。`fork` 是关键参数（每个连接开子进程，互不阻塞）。

### 4. cc-switch-web 代理 15721 启动机制不明
- `systemctl restart cc-switch-web` 只起 Web UI (17666)，**不起代理 (15721)**
- 代理需要用户手动在 Web 界面点某个按钮/开关，具体入口没找到
- cc-switch-web 是单个二进制，无日志（`StandardOutput=null`），journalctl 查不到
- 17666 和 15721 是同一个进程的不同端口，但 15721 不是启动时自动开的

### 5. cc-switch-web v0.1.0 二进制有 bug — 代理模块必死
- **根因**：代理模块（15721）处理到某种请求时调用 `abort()` 自杀，`dmesg` 看到 `status=6/ABRT`
- 第一次崩得很快（49秒），第二次撑了16分钟，说明不是启动时必然崩，而是**处理请求时触发 bug**
- `NRestarts=0` — systemd 没设 `Restart=always`，崩了不会自动重启
- Web UI（17666）模块没问题，只有代理模块有问题
- **结论**：v0.1.0 二进制本身有问题，不是配置/网络/地址问题

### 6. cc-switch 配置优先级（从高到低）
1. `~/.claude/settings.json` → `env.ANTHROPIC_BASE_URL`（**cc-switch 写的地方，最高优先级**）
2. `~/.claude.json` → `anthropic_base_url`（手改的地方，但被 settings.json 覆盖）
3. 环境变量 / 系统默认

- cc-switch 每次切 provider **只覆盖 settings.json**，所以改 .claude.json 没用
- `.claude.json` 是全局配置，`settings.json` 是项目级配置

### 7. 僵尸进程坑
- 之前跑 `/opt/cc-switch-web/cc-switch-web version` 命令，pid 7523 没退出，占了 17666 端口
- 真服务启动不了，`systemctl restart` 也没用，需要 `kill -9` 清掉
- 类似的 `--help` 命令也可能留下僵尸进程（pid 5233）
- **经验**：不要在服务器上跑会启动完整二进制再退出的命令

### 8. CC-Switch 接管工具的机制

### 8. CC-Switch 接管工具的机制
- 数据库 (`/mnt/shared/.cc-switch/cc-switch.db`) 存所有 provider 配置
- 切 provider 时把 `settings_config` 表里的配置拼合后**写入工具实际配置文件**
- Claude: 写 `settings.json` 的 `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`
- Codex: 拼合 `config.toml` + `OPENAI_API_KEY`
- 可选代理层（15721）做统计/日志/故障切换，`proxy_config.enabled` 控制

### 9. 当前最终状态（2026-08-15）
- `/mnt/shared/.claude` — 已还原，清理后 756K（嵌套 `.claude/` Windows 残留已删）
- `/mnt/shared/.codex` — 已还原，历史已清理（416M → 21M）
- cc-switch-web — 17666 起，15721 未开（代理模块有 bug，开了就崩）
- 本机 socat 转发 — 已卸载（最终弃用代理方案）
- 最终方案：**放弃代理，走直连**
- 本机 `.claude.json` 仍有 `192.168.31.82:15721`（不影响，优先级低于 settings.json）

### 10. 如果重来的话
- 数据备份用 `cp -a` 到独立路径，不是 `mv`
- `rm -rf` 前先问：这份数据有没有独立副本？
- 代理跨机器场景，先确认端口绑定地址和工具运行机器的关系
- 查日志时先看 `StandardOutput` 和 `ExecStart`，很多服务不写日志
- 查进程崩溃先看 `dmesg -T | tail`，比 journalctl 更可靠（很多服务不吃 journal）
- `status=6/ABRT` = 程序主动调用 abort() 自杀，不是 OOM 不是 segfault，代码 bug
- 代理跨机器之前，先确认 `listen_address` 绑定的是不是工具所在机器的网卡 IP
