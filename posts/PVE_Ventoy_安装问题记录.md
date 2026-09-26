---
title: 'PVE 通过 Ventoy 安装失败问题记录'
date: 2026-09-02
---

# PVE 通过 Ventoy 安装失败问题记录

## 问题现象

在 FNOS 系统上使用 Ventoy 尝试从 ISO 启动安装 Proxmox VE (PVE) 时，安装失败或无法启动。

## 根本原因

**Ventoy 版本过旧**。

旧版 Ventoy 对新版 PVE ISO 的引导支持不完整，导致：
- 无法从 Ventoy 启动 PVE ISO
- 启动后卡住或报错
- 反复重试多次均失败

## 解决方案

### 方案一：升级 Ventoy（推荐）

1. **下载最新版 Ventoy**（当前最新版 1.1.17）
   ```bash
   wget https://github.com/ventoy/Ventoy/releases/download/v1.1.17/ventoy-1.1.17-linux.tar.gz
   ```

2. **升级 Ventoy U 盘**（保留原有 ISO 文件）
   ```bash
   tar xzf ventoy-1.1.17-linux.tar.gz
   cd ventoy-1.1.17
   sudo ./Ventoy2Disk.sh -u /dev/sdX
   ```
   - `-u` 是更新模式，**不会清空** U 盘里的 ISO 文件
   - 如果用 GUI：选择 U 盘设备，点击 **Update** 按钮

3. **重新尝试从 PVE ISO 启动**
   - 插入 U 盘，开机选择 Ventoy 菜单
   - 选择 PVE ISO，正常启动安装

### 方案二：使用其他启动工具

如果升级 Ventoy 后仍有问题，可尝试：
- **Rufus**（Windows 下制作启动盘）
- **balenaEtcher**（跨平台）
- 直接使用 ISO 写入 U 盘（`dd` 命令）

### 方案三：通过 PVE Web UI 安装

如果当前 FNOS 机器已安装 PVE，可直接通过 Web UI 上传 ISO 安装：
1. 登录 PVE Web UI：`https://192.168.31.182:8006`
2. 创建新 VM，选择"光盘镜像"
3. 上传 PVE ISO 文件
4. 从光盘启动安装

## 反复重试的意义

安装 PVE 时如果遇到启动失败：
- **不要立即放弃**，尝试多次重启
- 可能是 Ventoy 引导加载时序问题
- 升级 Ventoy 后，反复重试通常能解决问题

## 结论

| 问题 | 原因 | 解决 |
|------|------|------|
| Ventoy 无法启动 PVE ISO | Ventoy 版本过旧 | 升级到最新版 1.1.17 |
| 安装反复失败 | 旧版 Ventoy 引导问题 | 升级后重试即可 |

**核心：升级 Ventoy 到最新版，反复重试，问题即可解决。**

---

## PVE 9.2.11 优化配置记录

### 一、PVE 个人模式确认

**当前状态：** ✅ 个人模式（单节点，非集群）

| 项目 | 状态 |
|------|------|
| Corosync | ❌ inactive (dead) |
| 集群配置 | ❌ 不存在 |
| PMXCFS | ✅ 本地模式运行 |
| 节点数 | 1 |

### 二、MAX_WORKERS 配置（PVE 9.2.11 支持）

**问题：** 默认 3 个 worker，内存占用过高（~1.2G）

**解决方案：** PVE 9.2.11 支持 MAX_WORKERS 环境变量

```bash
# 创建配置文件
echo "MAX_WORKERS=1" > /etc/default/pveproxy
echo "MAX_WORKERS=1" > /etc/default/pvedaemon

# 重启服务
systemctl restart pveproxy pvedaemon
```

**效果：**
| 服务 | 调整前 | 调整后 | 节省 |
|------|--------|--------|------|
| pveproxy | 4 进程 / 648M | 2 进程 / 311M | ~337M |
| pvedaemon | 4 进程 / 615M | 2 进程 / 302M | ~313M |
| **总计** | ~1.2G | **~613M** | **~650M** |

**适用版本：** PVE 9.2+（2025年8月发布）

### 三、Swap 关闭

```bash
swapoff -a
sed -i '/swap/d' /etc/fstab
# 释放空间给数据池
lvremove -f /dev/pve/swap
pvresize /dev/sdb3
lvextend -l +100%FREE -r /dev/pve/data
```

### 四、国内镜像源（USTC 中科大）

```bash
cat > /etc/apt/sources.list.d/debian.sources << 'EOF'
Types: deb
URIs: http://mirrors.ustc.edu.cn/debian/
Suites: trixie trixie-updates
Components: main contrib non-free-firmware
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg
EOF

cat > /etc/apt/sources.list.d/pve-install.sources << 'EOF'
Types: deb
URIs: http://mirrors.ustc.edu.cn/proxmox/debian/pve
Suites: trixie
Components: pve-no-subscription
Signed-By: /usr/share/keyrings/proxmox-archive-keyring.gpg
EOF
```

### 五、SSH 配置

```bash
echo "Port 225" >> /etc/ssh/sshd_config
systemctl restart sshd
```

### 六、磁盘收缩（待执行）

当前 root 分区 37.5G，实际使用 5.4G，计划缩至 16G。

需重启进入恢复模式执行：
```bash
resize2fs /dev/mapper/pve-root 16G
lvreduce -f -L 16G /dev/pve/root
lvextend -l +100%FREE -r /dev/pve/data
```

### 七、k3s 部署建议

**推荐方案：VM + k3s（官方推荐）**
- 内存：2G-4G
- CPU：2核
- 磁盘：20G

### 最终状态

```
PVE 版本: 9.2.11
内核: 7.0.14-14-pve
IP: 192.168.31.225
SSH: 端口 225
源: USTC 中科大
模式: 个人模式
Swap: 已关闭
MAX_WORKERS: 1
可用内存: 9.9G
可用磁盘: 30G
```

---

## 八、PVE 防火墙关闭（单节点模式）

### 原因
PVE HA（高可用）功能在单节点模式下无意义，pve-firewall 占用 109M 内存。

### 操作
```bash
systemctl stop pve-firewall
systemctl disable pve-firewall
systemctl stop pvefw-logger
systemctl disable pvefw-logger
```

### 效果
| 服务 | 内存 | 状态 |
|------|------|------|
| pve-firewall | 109M | ❌ 已关闭 |
| pvefw-logger | 5M | ❌ 已关闭 |

---

## 九、PVE HA 服务（可考虑关闭）

单节点不需要 HA，以下服务各占 ~120M：
- pve-ha-crm: 122M
- pve-ha-lrm: 121M

如需关闭：
```bash
systemctl stop pve-ha-crm pve-ha-lrm
systemctl disable pve-ha-crm pve-ha-lrm
```
可再节省 ~240M。


---

## 十、HA 服务关闭（单节点）

**HA（High Availability）= 高可用集群**
- 多台 PVE 互相监控
- 一台挂了自动切换
- 单节点无意义

### 已关闭

| 服务 | 内存 | 说明 |
|------|------|------|
| pve-ha-crm | 122M | 集群资源管理器 |
| pve-ha-lrm | 121M | 本地资源执行 |
| pvefw-logger | 5M | 防火墙日志 |
| pve-firewall | 109M | 防火墙 |
| corosync | - | HA 基础 |

### 命令

```bash
systemctl stop pve-ha-crm pve-ha-lrm pvefw-logger pve-firewall
systemctl disable pve-ha-crm pve-ha-lrm pvefw-logger pve-firewall
systemctl disable corosync
```

---

## 十一、优化总结

### 已完成的优化

| 优化项 | 节省 |
|--------|------|
| MAX_WORKERS=1 | ~650M |
| pve-firewall | ~114M |
| pve-ha-crm | ~122M |
| pve-ha-lrm | ~121M |
| pvefw-logger | ~5M |
| **总计** | **~1G+** |

### 当前内存状态

```
total:  11G
used:   ~1.5G
avail:  ~10G
swap:   0
```

---

## 十二、删除旧内核

```bash
# 删除旧内核 7.0.2-6-pve
apt remove --purge -y proxmox-kernel-7.0.2-6-pve-signed
apt autoremove -y
apt clean

# 清理后 /boot 释放约 244M
```

当前仅保留 7.0.14-14-pve。

---

## 十三、PVE 最终优化

### 已关闭服务

| 服务 | 节省 | 说明 |
|------|------|------|
| pve-ha-crm | 122M | 单节点不需要 |
| pve-ha-lrm | 121M | 单节点不需要 |
| pve-firewall | 109M | 单节点不需要 |
| pvefw-logger | 5M | 防火墙日志 |
| corosync | - | HA 基础 |
| MAX_WORKERS=1 | ~650M | pveproxy + pvedaemon |
| pvescheduler | 124M | 无定时任务 |
| **总计** | **~1.1G+** | |

### 最终保留服务

| 服务 | 内存 | 用途 |
|------|------|------|
| pveproxy | 325M | Web UI |
| pvedaemon | 308M | API |
| pvestatd | 116M | 状态监控 |
| spiceproxy | 110M | KVM 远程桌面 |
| pmxcfs | 27M | 集群文件系统 |
| **总计** | **~886M** | |

### 最终系统状态

```
内存: 11G
可用: 10G+
根分区: 37.5G (使用 4.2G)
计划收缩: 8G 或 16G
```

---

## 十四、根分区收缩完成

### 操作方式
PVE 硬盘拆下挂载到本地电脑，通过 LVM 命令收缩。

### 执行步骤

```bash
# 1. 卸载
sudo umount /dev/mapper/pve-root

# 2. 检查文件系统
sudo e2fsck -fy /dev/mapper/pve-root

# 3. 收缩文件系统到 8G
sudo resize2fs /dev/mapper/pve-root 8G

# 4. 收缩 LV（自动同步文件系统）
sudo lvreduce -f --resizefs -L 8G /dev/pve/root

# 5. 更新 PV
sudo pvresize /dev/sda3

# 6. 扩展 data 池
sudo lvextend -l +100%FREE -r /dev/pve/data
```

### 结果

| 分区 | 原大小 | 新大小 | 变化 |
|------|--------|--------|------|
| pve-root | 37.5G | **8G** | -29.5G |
| pve-data | 70.5G | **100G** | +29.5G |
| 总盘 | 110G | 110G | 不变 |

### 注意
- 需要卸载根分区后才能 resize
- 操作时 PVE 无法启动
- 建议先备份重要数据

---

## 十五、操作完成确认

### 收缩完成 ✅

- **pve-root**: 37.5G → 8G
- **pve-data**: 70.5G → 100G
- **内存优化**: 10G+ 可用
- **文档**: 已更新到 `/home/a1/Desktop/PVE_Ventoy_安装问题记录.md`

### 下次启动流程

1. 把 `/dev/sda` (XDEP SSD 120G) 装回 PVE 机器
2. 开机进入 PVE
3. 检查分区: `lsblk`
4. 创建 k3s VM
