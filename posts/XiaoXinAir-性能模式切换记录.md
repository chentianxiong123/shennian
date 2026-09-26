---
title: 'Lenovo XiaoXinAir 14 — 性能模式切换记录'
date: 2026-09-01
---

# Lenovo XiaoXinAir 14 — 性能模式切换记录

## 硬件信息

| 项目 | 内容 |
|---|---|
| 型号 | XiaoxinAir 14ALC 2021 (82LM) |
| CPU | AMD Ryzen |
| 原系统 | Windows → 刷成 Linux |
| 当前系统 | Debian 13 (trixie) / kernel 6.12.95 |
| 桌面环境 | KDE Plasma |

## 功能说明

支持三种性能模式切换，通过 ACPI platform_profile 控制：

| 模式 | sysfs 值 | 场景 | 图标 |
|---|---|---|---|
| 节能/安静 | `low-power` | 静音、省电、图书馆 | 🔋 |
| 均衡/智能散热 | `balanced` | 日常办公、网页浏览 | ⚖️ |
| 野兽/性能 | `performance` | 游戏、编译、渲染 | 🚀 |

## 使用方式

### 桌面快捷方式（推荐）

双击桌面上的 **性能模式** 图标即可切换，无终端窗口弹出，切换后桌面通知提示当前模式。

### 命令行

```bash
~/bin/xiaoai-profile              # 循环切换（节能 → 均衡 → 野兽）
~/bin/xiaoai-profile status       # 查看当前模式
~/bin/xiaoai-profile performance  # 直接指定模式
~/bin/xiaoai-profile balanced
~/bin/xiaoai-profile low-power
```

### 手动修改

```bash
echo performance | sudo tee /sys/firmware/acpi/platform_profile
echo balanced    | sudo tee /sys/firmware/acpi/platform_profile
echo low-power   | sudo tee /sys/firmware/acpi/platform_profile
```

## 文件位置

```
~/bin/xiaoai-profile           # 主脚本（可执行）
~/桌面/xiaoai-profile.desktop  # 桌面快捷方式
```

## 参考资料

- 内核 module：`ideapad_laptop`（已加载，支持 platform_profile）
- sysfs 路径：`/sys/firmware/acpi/platform_profile`
- 可用 profile：`cat /sys/firmware/acpi/platform_profile_choices`
- ArchWiki：Lenovo IdeaPad 5 Pro 14ACN6

---
*记录时间：2025-09-01*