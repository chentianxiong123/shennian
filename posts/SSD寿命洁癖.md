---
title: 'SSD 寿命洁癖(折腾原则与操作)'
date: 2026-08-02
---

# SSD 寿命洁癖(折腾原则与操作)

> 核心原则:**可复用/持久缓存 → SSD;一次性构建垃圾 → 内存盘;SSD 只留最终成品。**
> 背景:对 SSD 写寿命敏感(怕磨损)。

---

## 一、思路

- 源码、依赖、编译过程会产生**大量一次性写入(垃圾)**,不许落 SSD → 放**内存盘(tmpfs)**。
- 能被反复再用、值得保留的(**可复用缓存**),可以留 SSD。
- **SDD 只放"最终结果"**(编译好的命令/可执行文件)。

## 二、这套机器的关键前提(已确认)

- `tmp` 天然就是 **tmpfs 内存盘**:7.5G、仅用 119M —— 编译放这里 = **零 SSD 写**。
- 内存 14G,够扛构建。
- SDD 是 `/dev/nvme0n1p2`(根分区),`~/.npm`、`~/.bun` 缓存所在。

## 三、落点总表

| 内容 | 位置 | 介质 | 性质(保留/扔) |
|---|---|---|---|
| bun 安装缓存 | `~/.bun/install/cache` | **SSD** | 可复用缓存 → 保留 |
| npm 缓存 | `~/.npm`(~12G) | **SSD** | 可复用缓存 → 保留 |
| 源码 + node_modules | `/tmp/minicl` | 内存盘 | 一次性 → 用完删 |
| 编译临时 | `TMPDIR=/tmp`、`BUN_INSTALL_CACHE_DIR=/tmp` | 内存盘 | 0SSD写 |
| **最终成品** | `~/.local/bin/claude`(176M) | **SSD** | **SDD 只放这个结果** |

## 四、构建命令(全程内存盘,SSD 0 垃圾写)

```bash
cd /tmp
git clone --depth 1 https://github.com/txl16095/MiniClaude.git minicl
cd /tmp/minicl
export TMPDIR=/tmp
export BUN_INSTALL_CACHE_DIR=/tmp   # 临时写 RAM
bun install                          # 330 packages
bun run build --compile              # 产物 ./dist/cli(含所有依赖, --packages bundle)

# 只把最终成品落到 SSD
mkdir -p ~/.local/bin
cp dist/cli ~/.local/bin/claude
chmod +x ~/.local/bin/claude
claude --version   # -> 1.0.0 (Claude Code)
```

## 五、成品命令

- 位置:`~/.local/bin/claude`(已在 PATH)。
- 名字:沿用官方习惯 `claude`。别命令 `miniclaude` 副本已删除。
- 体积:176M(字节码、自包含单文件)。

## 六、SSD 清理清单(已执行)

| 清理项 | 位置 | 原因 |
|---|---|---|
| ~/.bun(官方脚本残留) | `home/a1/.bun` | 脚本下载残留 |
| bun 失败 zip | `tmp/bun-linux-x64.zip` | 下载中断残留 |
| CCB 源码 | `tmp/ccb`(136M) | 无用 |
| MiniClaude 重复副本 | `tmp/minic`(49M) | 重复 |
| 构建完源码 | `tmp/minicl`(284M) | 已出成品 |
| miniclaude 副本 | `~/.local/bin/miniclaude` | 只需 claude |

**未动(可复用缓存,遵规)**:`~/.bun/install/cache`、`~/.npm`、`/home/a1/tools/*`(原有工具)。

## 六、踩茬(SSD 视角)

1. 曾误把源码装 `cd /home/a1/tools/miniclaude`(SSD)编译 → **285M 垃圾落盘**,应了系统不要。
2. 想用 bun 官方脚本装 → 下载慢/易断,改用 `sudo npm i -g bun`(Win立缓冲)。
3. 成品 `claude` 曾短时显示"缺失",最终确认 `~/.local/bin/claude` 正常可跑。

## 7. 一句话结论

**所有会反复写、写没意义的东西都进内存盘;只有最终能用的命令进 SDD;可复用的大缓存留在 SDD 不碰** —— 这是把 SDD 磨损降到最低的那套折腾法。