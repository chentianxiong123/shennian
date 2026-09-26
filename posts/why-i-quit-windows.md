---
title: 'Windows 再见'
date: 2026-07-12
---

# Windows 再见

## 起因

一块 SSD、一个系统盘、一个只想好好写代码的人。

## 过程

想要保护 SSD 减少写入 → 装了 ImDisk RAM 盘 → 设了 TEMP 重定向 → Bun 打包的 opencode 炸了 → 排查半天发现是 ImDisk 兼容性问题 → 提了 issue → 改跑源码 → 发现 gradle 1.6G 缓存还在 C 盘 → yarn 1.2G 缓存在 C 盘 → bun 缓存 526M 在 C 盘 → npm 缓存 7.5G 刚迁走 → 噢还有一个 UTF-8 Beta 搞得老程序乱码 → 还有一个 C:\Windows\Temp junction 搞得系统组件异常 → 还有 Clash Verge 日志 symlink 断了直接崩溃 → 还有 EventLog、WMI、WaaSMedic 一堆后台日志在偷偷写 SSD → 还有……

每一个问题单独看都不大，但加起来就是一个下午接一个下午，一个文档接一个文档。

## 核心矛盾

我只是想写代码。但 Windows 让我变成了系统管理员、注册表医生、缓存规划师、symlink 管理员、兼容性测试员。

每一个工具，要在 Windows 上跑顺，都需要额外的一层配置，额外的一层心智负担。这不是「开箱即用」，这是「开箱即折腾」。

## 对比

- **TEMP 在内存盘上** — Linux: `TMPDIR=/tmp`，早就有了。Windows: 装 RAM 盘软件 → 改注册表 → 处理一堆兼容性问题
- **包管理器缓存** — Linux: `~/.cache` 统一在 home 下。Windows: 每个软件各玩各的，Local、Roaming、User Profile，NPM/YARN/BUN/PNPM 各占一个坑
- **编码** — Linux: UTF-8 从一开始。Windows: ACP=936 还是 65001，两边不讨好
- **DLL 加载** — Linux: `LD_LIBRARY_PATH`，简单直接。Windows: side-by-side、WinSxS、现在 Bun 还要从 TEMP 里 extract DLL，挑 RAM 盘
- **符号链接** — Linux: 从 1970 年代就有了，ln -s 完事。Windows: 得管理员权限、分 junction/symlink/hardlink，跨卷还有各种限制

## 结论

Windows 不是不能用，它只是把系统管理的成本转嫁给了用户。

每一个额外的配置项、每一个兼容性开关、每一个 symlink 的权限问题，都不是 bug，是 feature。每一个都有人在你之前遇到过，每一个都有 StackOverflow 答案，每一个都消耗你 15 分钟到 2 小时不等。

积少成多。

我不想再处理这些事情了。我想写代码。

## 后续

- 现有的 R: RAM 盘配置和缓存迁移方案已经写在文档里了
- 等这个项目忙完，换 Linux

## 最后

Windows 陪伴了很多年。谢谢，但到此为止了。
