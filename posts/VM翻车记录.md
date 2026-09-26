---
title: 'KVM/QEMU 虚拟机翻车全记录'
date: 2026-07-20
---

# KVM/QEMU 虚拟机翻车全记录

## 硬件环境

- CPU: AMD Lucienne APU（笔记本核显）
- GPU: AMD Radeon Graphics (1002:164c) — 唯一显卡
- RAM: 单条 8GB
- 存储: Samsung PM981 NVMe 512GB（系统盘）
- 网卡: MediaTek MT7921 WiFi
- 读卡器: Realtek RTS522A

## IOMMU 分组（灾难级）

AMD APU 的 IOMMU 分组极其不合理，几乎所有重要设备都捆在一起：

| Group | 设备 | 备注 |
|-------|------|------|
| 0-1 | PCIe Dummy Host Bridge | 没用 |
| 2-4 | PCIe GPP Bridge | 桥接，不能单独直通 |
| **5** | **GPU + USB×2 + SATA×2 + 音频×3 + 加密 + 桥接×3** | **12个设备全绑一起** |
| 6 | SMBus + LPC Bridge | 宿主机必须保留 |
| 7 | 8个 Host Bridge | 没用 |
| 8 | NVMe SSD | 系统盘，不能动 |
| 9 | Realtek 读卡器 | 可以直通但没意义 |
| 10 | MediaTek WiFi | 可以直通但宿主机断网 |

**结论：想直通 GPU = 必须同时交出 USB、SATA、音频 = 宿主机变砖**

## 失败 1：USB 直通

**尝试：** 把 FT232 串口、USB 盘、USB 网卡直通给虚拟机

**结果：** 全部 Windows 错误 10（无法启动设备）

**排查过程：**
- `virsh attach-device` 报告成功，但 QEMU 实际没有接管设备
- xhci_hcd 驱动在宿主机重新认领设备
- `managed='yes'` 没有正确解绑宿主机驱动
- 尝试手动 `virsh nodedev-detach` + 重新绑定 vfio-pci → 无效
- 尝试改 USB 控制器型号（EHCI/OHCI/XHCI）→ 无效
- 根本原因不明，可能是 AMD USB 控制器 + libvirt 的兼容性问题

## 失败 2：GPU 直通

**尝试：** 直通 IOMMU Group 5 全部 12 个设备

**准备：**
1. GRUB 加 `amd_iommu=on iommu=pt` ✅
2. `/etc/modprobe.d/vfio.conf` 绑定 Group 5 全部设备 ID ✅
3. `/etc/initramfs-tools/modules` 加 vfio 模块 ✅
4. 重建 initramfs + update-grub ✅
5. win11.xml 已有全部 hostdev 配置 ✅

**结果：** 重启后内核卡死，需要强制断电

**原因分析：**
- IOMMU 分组太烂，12 个设备捆在一起
- 直通过程中某个设备（可能是 USB 控制器或加密控制器）导致内核 panic
- AMD APU 的 VFIO reset 存在已知 bug
- 宿主机只有一个 GPU，直通后本地显示也没了

## 失败 3：精简版 Windows

**使用的系统：** "不忘初心" Windows 11 精简版

**问题：**
- 无法安装 MSI 安装包 → virtio 驱动装不上、QXL 驱动装不上、OpenSSH 装不上
- USB xHCI 驱动栈不完整 → 直通设备全部错误 10
- 缺少大量基础组件，基本是废的

## 最终结论

| 方案 | 结论 |
|------|------|
| KVM GPU 直通 | ❌ AMD APU IOMMU 分组太烂，不可行 |
| KVM USB 直通 | ❌ 不明原因失败，可能 AMD 兼容性问题 |
| 精简版 Windows | ❌ 缺组件，什么都装不上 |
| 换 LTSC | ⚠️ 能解决驱动问题，但 USB 直通可能还是不行 |
| 换 Proxmox/Unraid | ❌ IOMMU 分组是硬件问题，换平台没用 |
| **买亮机卡 GT710** | ✅ **唯一解** — 分离 IOMMU，GPU 直通才能用 |

## 教训

1. **AMD APU 不适合玩虚拟化直通** — IOMMU 分组是硬件层面的，软件解决不了
2. **精简版 Windows 基本不能用** — 少了 MSI 安装能力，什么驱动都装不上
3. **USB 直通在 libvirt 上坑很多** — VMware 的 USB 直通兼容性好得多
4. **强制断电伤硬盘** — 这次折腾断了好几次电，以后要避免
5. **串口是最后的救命稻草** — 没有屏幕没有键盘的时候，只有串口能救你
