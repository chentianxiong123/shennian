---
title: 'ZTE UZ901 热点 NVRAM 经验总结'
date: 2026-07-01
---

# ZTE UZ901 热点 NVRAM 经验总结

## 事故经过

1. 删除了 `/mnt/userdata/etc_rw/psnv/rw_backup`（160KB，NVRAM 持久化运行数据）
2. 删除了 `/mnt/userdata/etc_rw/nv/backup/` 目录（内含 cfg + ro 校准状态文件）
3. 当时系统正常运行，未发现问题
4. 重启后 SIM 卡无法识别（"modem_sim_undetected"）

## 根因

### NVRAM 双缓冲机制

| 文件 | 路径 | 大小 | 作用 |
|------|------|------|------|
| `rw_work` | `.../psnv/` | 160KB | 运行时 NVRAM（modem 当前正在写的） |
| `rw_backup` | `.../psnv/` | 160KB | 持久备份（用于开机恢复） |
| `work_flag` | `.../psnv/` | 1B | 工作区标记 |
| `backup_flag` | `.../psnv/` | 1B | 备份区标记 |
| `cfg` | `.../nv/main/` | 17KB | 主要校准配置 |
| `cfg` | `.../nv/backup/` | 17KB | 备份校准配置 |
| `ro` | `.../nv/main/` | 144B | 只读配置 |
| `ro` | `.../nv/backup/` | 144B | 只读配置备份 |

`zte_ufi` 守护进程管理这套机制。开机流程：
1. 读取 `psnv/rw_backup` → 恢复 modem 状态（卡槽、射频、频段等）
2. 运行时写入 `psnv/rw_work`
3. 周期性同步 `rw_work` → `rw_backup`（双缓冲，带 flag 标记一致性）
4. `nv/main/cfg` 存增量校准，`nv/backup/cfg` 是对影

### 为什么删除后当时没事

删除的是 flash 上的文件。modem 和 `zte_ufi` 已经把数据加载到了内存中继续运行。系统重建的空文件不会影响运行中的进程。**但重启后，modem 初始化拿到的是一套默认空状态，卡槽/射频参数全错，SIM 检测失败。**

### 为什么系统自己重建不能用

系统重建的文件 MD5 与备份完全不同（`a86e7a92` vs `a19c65fd`），说明重建的内容是出厂初始化写入的默认值，不是运行时积累的有效数据。只有来自运行状态的备份才能正确恢复 modem。

## 恢复方法

1. 重启前做了完整 MTD 备份（`userdata.bin` = mtd5）
2. 用 `jefferson` 解压 JFFS2 镜像
3. `adb push` 覆盖以下文件：
   - `psnv/rw_backup`
   - `psnv/rw_work`
   - `nv/backup/cfg`
   - `nv/main/cfg`
4. 重启后 modem 读取正确 NVRAM，SIM 恢复正常

## 教训

- **NVRAM 文件看起来一样其实不一样**——`rw_backup` 和 `rw_work` 即使 MD5 相同，也比空文件重要得多
- **删除后当时没事 ≠ 安全**，双缓冲数据依赖状态一致性
- **做操作前备份整个 MTD 分区**——这次救命的正是备份
- **jffs2 上 rm 是真正的删除，没有回收站**。删除的文件如果被 GC 擦除就永久丢失
- **留 236KB 空闲 userdata ≠ 可以随便删**，关键文件删了重启就暴雷
- `psnv/rw_backup` + `nv/backup/` 是 **禁区**——生产环境绝不应该动
