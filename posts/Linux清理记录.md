---
title: 'Linux 清理记录 — 血的教训'
date: 2026-07-18
---

# Linux 清理记录 — 血的教训

## 背景

刚接触 Linux，以为删软件就像 Windows 一样，点卸载就完事了。
结果上次把 Firefox 和整个 KDE 桌面都删炸了 —— 明明没动它们，只是删了几个"看着没用"的东西。

## 教训：Linux 的依赖是链式的

在 Linux 里，一个包可能被另一个包**硬依赖（Depends）**。
删掉它，依赖它的所有东西都会被一起删掉，哪怕你根本没想删那些。

例如：
- `ibus-data` → `plasma-desktop` 硬依赖 → 删 ibus 会把桌面一起带走
- `pocketsphinx` → `libavfilter10` → `plasma-widgets-addons` → `plasma-desktop` → 删语音识别库会带走桌面
- `adwaita-icon-theme` → 会级联删掉 Firefox、fcitx5 输入法、GNOME 密钥环、最后整个桌面

## 关键工具：`apt-get --dry-run`

在动手之前，永远先模拟一遍：

```bash
apt-get --dry-run purge <包名>
```

这会告诉你**到底会删掉什么**，而不会真的执行。
如果看到 `plasma-desktop`、`firefox-esr` 这些出现在列表里，立刻停手。

## 什么是安全的？

只有**推荐依赖（Recommends）** 的包删了才安全。
可以用 `apt-cache depends <包名>` 查看依赖类型：
- `Depends` = 硬依赖，删它会连带删掉依赖它的东西
- `Recommends` = 推荐依赖，可以安全删除
- `Suggests` = 建议，更安全

## 本次清理记录

系统：Debian 13 (trixie) + KDE Plasma

### 安全删掉的（仅删自己，不影响系统）

| 项目 | 大小 | 说明 |
|------|------|------|
| 旧内核 | 111MB | 当前运行的是新版，旧版无用 |
| LibreOffice | ~350MB | 办公套件 |
| GIMP | 106MB | 图像处理 |
| Orca | 16MB | 屏幕朗读器（盲人用） |
| speech-dispatcher | 28MB | 语音合成（Orca 用的） |
| Cryfs / plasma-vault | 58MB | 加密文件夹 |
| KMail / KOrganizer | 65MB | 邮件/日历 |
| khelpcenter / docbook | 15MB | 帮助中心 / XML 文档格式 |
| Kate | 27MB | KDE 文本编辑器 |
| Konqueror | 12MB | 上古浏览器 |
| CUPS 打印机系统 | ~400MB | 没有打印机就没用 |
| Intel 显卡驱动 | 20MB | AMD 显卡用不上 |
| 杂项 | ~50MB | reportbug、nodejs-doc、字典、eject、akregator 等 |
| **合计** | **~1.2GB** | 8.7G → 7.5G |

### 看起来能删但不能动的（会炸）

| 包名 | 为什么不能删 |
|------|------------|
| ibus-data / libibus-1.0-5 | plasma-desktop 硬依赖 |
| pocketsphinx | 通过 ffmpeg 链到桌面 |
| orca | 之前以为不能删，后来发现只是 Recommends，已安全删除 |
| adwaita-icon-theme | 会连带 Firefox、fcitx5、桌面 |
| breeze-wallpaper | 会连带桌面 |
| wacom 数位板驱动 | 被 libinput → plasma-desktop 硬依赖 |
| desktop-base | 会删 metapackage，但用户担心主题 |
| gcc/g++/git/nodejs | 开发工具，需要保留 |

### 安全验证命令

```bash
# 模拟删除，看会连带什么
apt-get --dry-run purge <包名>

# 查看谁依赖这个包
apt-cache rdepends --installed <包名>

# 查看依赖类型（Depends/Recommends/Suggests）
apt-cache depends <包名>
```

## 总结

1. **永远先 `--dry-run`**，再动手
2. **`apt-cache rdepends`** 看反向依赖，确认没人用这个包
3. 只有 **Recommends（推荐）** 级别的可以安全删除
4. **Depends（硬依赖）** 的删了就连锁反应
5. 不确定就别动，Linux 的依赖树比想象中深得多
