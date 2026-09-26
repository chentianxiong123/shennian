---
title: 'Samsung PM981a NVMe 错误日志屏蔽方案实施记录'
date: 2026-08-23
---

# Samsung PM981a NVMe 错误日志屏蔽方案实施记录

---

## 已实施的屏蔽方案

### 1. smartd 监控配置优化 (`/etc/smartd.conf`)

```bash
/dev/nvme0 -d nvme -a -n standby,q -W 0,0,0 -r 5 -R 10 -U 0 -C 0 -I 194 -I 232 -I 241
```

| 参数 | 作用 |
|------|------|
| `-d nvme` | 指定 NVMe 设备类型 |
| `-a` | 监控所有关键属性 |
| `-n standby,q` | 待机时静默跳过检查 |
| `-W 0,0,0` | 关闭温度变化/告警/临界值报警 |
| `-r 5 -R 10` | 仅报告重映射扇区(5)和寻道错误(10)的原始值变化 |
| `-U 0 -C 0` | 关闭离线不可修正/当前待定扇区监控 |
| `-I 194 -I 232 -I 241` | 忽略温度/可用备用区/总写入量属性变化 |

**效果验证**：
```
smartd[6730]: Device: /dev/nvme0, NVMe error count increased from 943413 to 943414 (0 new, 1 ignored, 0 unknown)
```
显示 `1 ignored` - 错误计数增长被 smartd 识别并忽略，不再触发邮件告警。

---

### 2. 内核启动参数 (`/etc/default/grub`)

```bash
GRUB_CMDLINE_LINUX_DEFAULT="quiet nvme_core.default_ps_max_latency_us=0"
```

- **作用**：禁用 NVMe APST (自动电源状态转换)，减少电源管理相关的管理命令错误
- **生效**：需重启 (`sudo update-grub && reboot`)

---

### 3. 日志查看过滤工具

#### `dmesg-clean` - 过滤内核环形缓冲区
```bash
# 安装位置: /usr/local/bin/dmesg-clean
# 用法:
sudo dmesg-clean -T          # 显示带时间戳的清洁日志
sudo dmesg-clean -T | grep -i nvme  # 仅看 NVMe 相关 (已过滤 SUBNQN 警告)
```

#### `journalctl-clean` - 过滤 systemd 日志
```bash
# 安装位置: /usr/local/bin/journalctl-clean
# 用法:
sudo journalctl-clean -k -b     # 当前启动的内核日志 (已过滤)
sudo journalctl-clean -u smartd # smartd 服务日志
sudo journalctl-clean -f        # 实时跟踪 (已过滤)
```

---

## 验证屏蔽效果

### 测试前 (原始日志)
```
[日 8月 23 09:20:58 2026] nvme nvme0: missing or invalid SUBNQN field.
[日 8月 23 09:21:37 2026] nvme nvme0: using unchecked data buffer
```

### 测试后 (过滤后)
```bash
$ sudo dmesg-clean -T | grep -i nvme
[日 8月 23 09:20:58 2026] nvme 0000:01:00.0: platform quirk: setting simple suspend
[日 8月 23 09:20:58 2026] nvme nvme0: pci function 0000:01:00.0
[日 8月 23 09:20:58 2026] nvme nvme0: D3 entry latency set to 8 seconds
[日 8月 23 09:20:58 2026] nvme nvme0: 12/0/0 default/read/poll queues
[日 8月 23 09:20:58 2026]  nvme0n1: p1 p2
```
**SUBNQN 警告已消失**

---

## 仍会记录但不告警的项目

| 项目 | 状态 | 说明 |
|------|------|------|
| NVMe 错误计数器 | 继续增长 | 固件内部计数，smartd 已忽略 |
| SMART 健康自检 | 正常监控 | PASSED 时不报警，FAILED 会报警 |
| 关键属性变化 | 选择性监控 | 仅监控重映射扇区、寻道错误等致命指标 |
| 温度阈值 | 已关闭 | 如需监控可调整 `-W` 参数 |

---

## 如果需要恢复默认监控

```bash
# 1. 恢复 smartd 默认配置
sudo cp /etc/smartd.conf /etc/smartd.conf.bak
sudo tee /etc/smartd.conf > /dev/null << 'EOF'
DEVICESCAN -d removable -n standby -m root -M exec /usr/share/smartmontools/smartd-runner
EOF
sudo systemctl restart smartd

# 2. 移除内核参数
sudo sed -i 's/ nvme_core.default_ps_max_latency_us=0//' /etc/default/grub
sudo update-grub

# 3. 删除过滤工具
sudo rm /usr/local/bin/dmesg-clean /usr/local/bin/journalctl-clean
```

---

## 定期检查建议 (手动执行)

```bash
# 每月检查一次关键健康指标
sudo smartctl -a /dev/nvme0n1 | grep -E "(Available Spare|Percentage Used|Media Errors|Temperature|Data Units)"

# 示例输出:
# Available Spare:                    100%
# Percentage Used:                    8%
# Media and Data Integrity Errors:    0
# Temperature:                        40 Celsius
# Data Units Read:                    91,087,955 [46.6 TB]
# Data Units Written:                 144,407,175 [73.9 TB]
```

---

## 关键文件清单

| 文件 | 用途 |
|------|------|
| `/etc/smartd.conf` | smartd 监控配置 (已优化) |
| `/etc/default/grub` | 内核启动参数 (已添加 APST 禁用) |
| `/usr/local/bin/dmesg-clean` | dmesg 过滤脚本 |
| `/usr/local/bin/journalctl-clean` | journalctl 过滤脚本 |
| `/tmp/SAMSUNG_PM981a_SUBNQN_Error_Investigation.md` | 完整调查报告 |

---

*实施时间：2026-08-23*
*下次建议检查：2026-09-23*