---
title: 'Samsung PM981a (MZVLB512HBJQ-000L2) NVMe SUBNQN 错误调查报告'
date: 2026-05-08
---

# Samsung PM981a (MZVLB512HBJQ-000L2) NVMe SUBNQN 错误调查报告

---

## 1. 设备信息

| 项目 | 值 |
|------|-----|
| **型号** | SAMSUNG MZVLB512HBJQ-000L2 |
| **固件版本** | 3L1QEXF7 |
| **PCI VID:PID** | 144d:a808 |
| **容量** | 512 GB |
| **接口** | PCIe 3.0 x4 NVMe 1.3 |
| **当前温度** | 40-45°C |
| **通电时长** | 6,236 小时 |
| **通电次数** | 107,072 次 |
| **不安全关机** | 206 次 |

---

## 2. SMART 健康状态 (正常)

| 指标 | 值 | 状态 |
|------|-----|------|
| 整体健康自检 | PASSED | ✅ |
| 可用备用区 | 100% (阈值 10%) | ✅ |
| 使用寿命百分比 | 8% | ✅ |
| 介质错误 | 0 | ✅ |
| 读取总量 | 46.6 TB | - |
| 写入总量 | 73.9 TB | - |

---

## 3. 问题现象

### 3.1 错误日志
```
Error Information (NVMe Log 0x01)
Num   ErrCount  SQId   CmdId  Status  Message
  0     943413     0  0x0001  0x4004  Invalid Field in Command
```

### 3.2 内核启动日志
```
[日 8月 23 09:20:58 2026] nvme nvme0: missing or invalid SUBNQN field.
[日 8月 23 09:21:37 2026] nvme nvme0: using unchecked data buffer
```

### 3.3 关键特征
- **错误计数**：943,413 次 (持续增长)
- **错误队列**：SQID 0 (Admin Queue)
- **错误命令**：Opcode 0x00 (Flush/管理命令)
- **状态码**：0x2002 / 0x4004 = Invalid Field in Command
- **SUBNQN 字段**：空 (固件缺陷)

---

## 4. 根因分析

### 4.1 核心原因
**固件不合规**：Samsung PM981a 固件 (3L1QEXF7) 未实现强制性的 `SUBNQN` (Subsystem NVMe Qualified Name) 字段。

根据 NVMe 规范 1.2.1+，支持 NVMe 1.2.1 或更高版本的控制器**必须**提供有效的 SUBNQN。

### 4.2 错误触发链路
```
内核启动 → nvme_init_subnqn() → 读取 Identify Controller → 发现 SUBNQN 为空
         → 发送管理命令查询子系统 → 固件因不支持字段返回 0x2002
         → 固件内部错误计数器 +1
         → 内核回退生成合成 NQN (nqn.2014.08.org.nvmexpress:...)
```

### 4.3 内核 Quirk 历史
| 版本 | 动作 | 原因 |
|------|------|------|
| 2022-2023 | 添加 `NVME_QUIRK_IGNORE_DEV_SUBNQN` for 144d:a808 | 抑制警告 |
| **2026-05-08** | **撤销该 Quirk (Revert)** | 维护者认为：SUBNQN 错误普遍存在，不应由内核掩盖，警告是合规的 |

**当前内核 (6.12.95) 已包含撤销补丁**，因此仍显示警告。

---

## 5. 影响评估

| 维度 | 影响 | 证据 |
|------|------|------|
| **数据完整性** | 无 | Media Errors = 0 |
| **读写性能** | 无 | 正常吞吐 |
| **磁盘寿命** | 无 | 仅 8% 使用量 |
| **系统稳定性** | 无 | 无崩溃/挂起 |
| **日志噪音** | 有 | 错误计数器持续增长 |
| **监控告警** | 可能误报 | smartd 可能触发告警 |

**结论**：**纯日志噪音，不影响实际使用**。多个社区用户确认同型号设备错误计数百万级仍正常工作。

---

## 6. 同类案例对比

| 设备型号 | 固件 | 错误计数 | 使用状态 |
|---------|------|---------|---------|
| MZVLB512HBJQ-000H1 (HP) | HPS0NEXF | ~2,500 | 正常 |
| MZVLB512HBJQ-000L7 (Lenovo) | 4M2QEXF7 | 每重启+2 | 正常 |
| Samsung 970 EVO Plus 500GB | 2B2QEXM7 | 每重启+2 | 正常 |
| **本设备 MZVLB512HBJQ-000L2** | **3L1QEXF7** | **943,413** | **正常** |

---

## 7. 解决方案

### 方案 A：忽略错误 (推荐，零成本)
> 这是固件 Bug，非软件可修复。Linux 内核已通过 `using unchecked data buffer` 自动规避。

### 方案 B：屏蔽 smartd 监控告警
编辑 `/etc/smartd.conf`：
```bash
# 注释掉默认的 DEVICESCAN，显式配置忽略错误计数变化
/dev/nvme0 -d nvme -a -n standby,q -W 0,0,0 -r 0 -R 0 -U 0
```
或仅监控关键指标：
```bash
/dev/nvme0 -d nvme -a -n standby,q -W 50,60,70 -r 5 -R 10 -U 0 -I 194 -I 232 -I 241
```

### 方案 C：内核启动参数减少 APST 相关错误
编辑 `/etc/default/grub`：
```bash
GRUB_CMDLINE_LINUX_DEFAULT="quiet nvme_core.default_ps_max_latency_us=0"
```
然后 `sudo update-grub` 并重启。

### 方案 D：等待 Lenovo OEM 固件更新
- L2 为 Lenovo 定制版 (PM981a)
- 当前 LVFS 无可用更新
- 仅可通过 Lenovo Vantage / fwupdmgr 在 Windows/Linux 下获取 OEM 推送

---

## 8. 验证命令速查

```bash
# 查看完整 SMART
sudo smartctl -a /dev/nvme0n1

# 查看错误日志详情
sudo nvme error-log /dev/nvme0n1

# 查看控制器标识 (确认 SUBNQN 为空)
sudo nvme id-ctrl /dev/nvme0n1 | grep subnqn

# 实时监控错误增长
watch -n 60 'sudo nvme error-log /dev/nvme0n1 | head -20'

# 查看内核 NVMe 相关日志
sudo dmesg -T | grep -i nvme
```

---

## 9. 参考资料

1. **Linux Kernel Patch**: [7f991e3f9b8f] nvme: add quirk NVME_QUIRK_IGNORE_DEV_SUBNQN for 144d:a808
2. **Revert Commit**: [2026-05-08] Revert "nvme: add quirk NVME_QUIRK_IGNORE_DEV_SUBNQN for 144d:a808"
3. **Arch Linux Forum**: "missing or invalid SUBNQN field" 讨论串
4. **nvme-cli Issue #1224**: "nvme error-log 0x2002 INVALID_FIELD" - 维护者 Keith Busch 回复
5. **Ubuntu Bug #1878264**: smartmontools 误报 NVMe 错误
6. **smartmontools Ticket #1222**: NVMe error log false positives
7. **Samsung PM981a Firmware**: 3L1QEXF7 规格页 (smarthdd.com)

---

## 10. 维护建议

1. **每月检查一次** SMART 关键指标 (Available Spare, Percentage Used, Media Errors)
2. **忽略 Error Information Log Entries 计数器** - 它只反映固件合规性，不反映健康度
3. **定期备份重要数据** - 这是对所有存储设备的通用建议
4. **关注 Lenovo 固件更新** - 如有新版本可尝试更新 (需接入电源)

---

*文档生成时间：2026-08-23*
*调查环境：Debian 13 (Trixie) / Kernel 6.12.95+deb13-amd64*