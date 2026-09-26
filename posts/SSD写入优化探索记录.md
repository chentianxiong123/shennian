---
title: 'SSD 写入优化探索记录'
date: 2026-07-08
---

# SSD 写入优化探索记录

> 日期：2026-07-08
> 系统：Windows 11 / 笔记本（核显 + 外接 AMD 显卡）

---

## 起因

使用 Codex 6 个月后发现 SSD 写入量异常，半年写入量相当于之前 3.5 年的总写入量，怀疑软件有严重的日志/缓存写入 Bug。

---

## 使用工具

### DiskSleuth（文件事件监控）
- 下载：https://github.com/Swatto86/DiskSleuth/releases
- Rust 写的单文件绿色版，4.7 MB
- 功能：实时监控文件系统变更事件（读/写/打开/关闭）
- 原理：`ReadDirectoryChangesW` API 钩子
- **局限**：只能看写入次数，不能看写入字节量
- **盲区**：SQLite WAL 模式的长连接写入、mmap 内存映射文件不会触发事件

### Process Explorer（进程 IO 监控）
- 下载：https://live.sysinternals.com/procexp64.exe
- 功能：按进程显示累计写入字节数（`Write Bytes` 列）
- 用法：右键列头 → Select Columns → Process I/O → 勾 Write Bytes
- **优势**：补全 DiskSleuth 的盲区，看真实写入量
- **局限**：只能看进程级别，不能看具体文件

### CrystalDiskInfo（SSD 健康度）
- 下载：https://crystalmark.info/en/software/crystaldiskinfo/
- 功能：读取 S.M.A.R.T. 数据，查看 SSD 剩余寿命和总写入量

---

## 关键概念

### Write Amplification（写入放大 / WAF）
SSD 最小擦除单位是块（256KB-4MB），写几个字节也要读整块→改→擦除→重写。小文件随机写入的 WAF 可达 10-100x。

### Micro-write（微写入）
每次写几个字节的高频写入模式。浏览器缓存、SQLite WAL、配置文件都属于此类。对 SSD 伤害比看上去大。

### WAL（Write-Ahead Log）
SQLite 的事务日志模式。先追加到 WAL 文件，checkpoint 时合并回主库。Codex 的 `logs_2.sqlite-wal` 就是典型。

---

## 排查过程

### DiskSleuth 抓到的写入次数排行

| # | 项目 | 10分钟次数 | 性质 |
|---|------|-----------|------|
| 🥇 | AMD EeuDumps（双 GPU） | ~15,800 | 驱动 Bug |
| 🥇 | 微信 aconfig.dat | ~6,200 | 正常但频率高 |
| 🥇 | 联想 devicecenter | ~2,100 | OEM 垃圾日志 |
| 🥇 | Chrome 缓存 | ~1,500 | 浏览器正常 |
| 🥈 | Windows Search | ~200 | 索引 |
| 🥉 | OpenCode / Codex | <100 | 极少 |

### Process Explorer 抓到的写入字节排行

| # | 进程 | 写入量 | 性质 |
|---|------|--------|------|
| 🥇 | OpenCode | ~312 MB | prompt-history 持续追加 |
| 🥈 | 讯飞输入法 | ~56 MB | 词库同步 |
| 🥉 | Edge/Chrome | ~60 MB | 浏览器缓存 |
| 4 | WeChat | ~48 MB | 正常使用 |
| 5 | 联想 | ~10 MB | 已被阻断 |

**对比发现**：AMD 和微信是次数之王，OpenCode 是字节之王。DiskSleuth 和 Process Explorer 必须交叉使用才能看到全貌。

---

## 已执行的操作

### ✅ 1. AMD EeuDumps 日志风暴
- **问题**：AMD External Events Utility 在每次移动/调整窗口时写入 GPU 诊断日志
- **原因**：AMD 驱动 Bug，自 2025 年 11 月被 Reddit 用户 Takia_Gecko 发现，Tom's Hardware 等多家媒体报道
- **涉及文件**：
  - `C:\Windows\System32\DriverStore\FileRepository\amdfendr.inf_amd64_*\AMD\EeuDumps\R-gpu-*.log`
  - `C:\Windows\System32\AMD\EEUDumps\R-gpu-*.log`
- **存档大小**：DriverStore 路径下 207 个文件共 114 MB
- **解决方案**：
  ```
  sc.exe stop "AMD External Events Utility"
  sc.exe config "AMD External Events Utility" start=disabled
  ```
- **效果**：写入归零。FreeSync 等显卡功能不受影响。
- **参考**：https://www.tomshardware.com/software/windows/amd-users-flag-heavy-ssd-write-activity-tied-to-chipset-driver-incessant-log-file-writes-observed-every-time-a-window-is-moved-or-resized

### ✅ 2. 联想 devicecenter 日志
- **问题**：Lenovo Vantage / Lenovo PCManager 预装软件疯狂写日志
- **涉及文件**：`C:\ProgramData\Lenovo\devicecenter\logs\` 下 66 个日志文件
- **解决方案**：
  ```
  Remove-Item "C:\ProgramData\Lenovo\devicecenter\logs\*" -Force
  icacls "C:\ProgramData\Lenovo\devicecenter\logs" /deny "Everyone:(W)"
  icacls "$env:LOCALAPPDATA\Lenovo" /deny "Everyone:(W)"
  icacls "$env:APPDATA\Lenovo" /deny "Everyone:(W)"
  ```
- **注意**：保留 `LenovoFnAndFunctionKeys`、`LenovoHotkeyService` 服务
- **效果**：写入大幅减少（从 700+ 降到 ~10 次）

### ✅ 3. Office ClickToRun 残留
- **问题**：Office 卸载后残留 ClickToRun 安装器 146 MB
- **已清理**：`C:\Program Files\Common Files\microsoft shared\ClickToRun`

---

## 待处理的

| 项目 | 状态 | 计划 |
|------|------|------|
| OpenCode prompt-history | 待处理 | 关掉历史记录或限制写入频率 |
| Windows Search | 待处理 | 不用 Win+S 就关掉 |
| 微信 WeChat Files 迁移 | 不处理 | 数据重要，写入量不大可以接受 |
| 傲腾外接盘管理 | 待评估 | 把可丢弃的缓存重定向到外接傲腾 |
| Chrome/Edge 缓存迁移 | 待评估 | 可以 mklink 到其他盘 |
| Codex logs_2.sqlite 定时清理 | 待处理 | 每周 VACUUM |

---

## 结论

1. **AMD 驱动日志 Bug 是最大的写入元凶**，好在已被社区发现并有成熟解决方案
2. **频次和字节是两个维度**，DiskSleuth + Process Explorer 缺一不可
3. **微信虽然写入频次高但字节少**，不值得为了节省写入量去动重要数据
4. **OpenCode（本工具）反而是按字节算最大的写入者**，prompt-history.jsonl 持续累积
5. **SSD 的真实杀手是 WAF 而非写入次数**，小文件随机写入的物理磨损比看起来大得多
6. **Windows 定位磁盘写入的工具没有完美的**，需要交叉验证
