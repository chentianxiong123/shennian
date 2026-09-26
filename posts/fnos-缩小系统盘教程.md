---
title: 'FnOS 缩小系统盘教程'
date: 2026-08-24
---

# FnOS 缩小系统盘教程

> 目标：将已安装的 FnOS 系统盘 sda2 从 55.8G 缩小到 10G，空出的空间并入数据分区 sda3。
> 适用场景：FnOS (Trim) NAS + Windows 11 双系统共用同一硬盘（双 boot，IP 192.168.31.225）。

---

## 目录

1. [准备工作](#1-准备工作)
2. [禁用不必要的服务](#2-禁用不必要的服务)
3. [禁用 swap](#3-禁用-swap)
4. [tmpfs 挂载日志和 apt 缓存](#4-tmpfs-挂载日志和-apt-缓存)
5. [SSH key 部署](#5-ssh-key-部署)
6. [分区表查看工具](#6-分区表查看工具)
7. [外部缩盘（核心步骤）](#7-外部缩盘核心步骤)
8. [最终验证清单](#8-最终验证清单)
9. [踩坑记录](#9-踩坑记录)

---

## 前置条件

- 硬盘：sda 120G SSD，sda1(94M EFI) + sda2(55.8G 系统) + sda3(55.9G 数据，无文件系统)
- FnOS 当前根分区实际占用：**6.9G**
- 系统盘目标：10G（剩余 ~3G 含保留块）
- 数据盘扩容：55.9G → **102G**
- 操作环境：Ubuntu 本机，通过 USB 外部挂载 FnOS 硬盘（设备 `/dev/sda`）

---

## 1. 准备工作

### 1.1 SSH 配置（双 boot 同 IP 场景）

Win11 和 FnOS 共用 IP `192.168.31.225`，必须用 `HostKeyAlias` 区分主机密钥，避免 known_hosts 冲突。

`~/.ssh/config` 关键段落：

```
Host fnos
    HostName 192.168.31.225
    Port 22
    User root
    HostKeyAlias fnos-home
    IdentityFile ~/.ssh/id_ed25519

Host win11
    HostName 192.168.31.225
    Port 22
    User root
    HostKeyAlias win11-home
    IdentityFile ~/.ssh/id_ed25519
```

清理旧记录：

```bash
ssh-keygen -R 192.168.31.225
```

---

## 2. 禁用不必要的服务

### 2.1 查看服务依赖关系（只读）

```bash
ssh fnos '
sudo systemctl list-dependencies eventlogger_service
sudo systemctl list-dependencies ai_manager
sudo systemctl list-dependencies backup_service
'
```

### 2.2 停止并禁用（永久）

```bash
ssh fnos '
for svc in eventlogger_service ai_manager backup_service; do
  sudo systemctl stop $svc
  sudo systemctl disable $svc
  echo "$svc: 状态=$(sudo systemctl is-active $svc) 自启=$(sudo systemctl is-enabled $svc)"
done
'
```

验证：

```bash
# 三个都应该是 inactive / disabled
for svc in eventlogger_service ai_manager backup_service; do
  sudo systemctl is-active $svc
  sudo systemctl is-enabled $svc
done
# 确认开机目录无残留
ls /etc/systemd/system/multi-user.target.wants/eventlogger_service.service 2>/dev/null || echo "✅ 已禁用"
ls /etc/systemd/system/multi-user.target.wants/ai_manager.service 2>/dev/null || echo "✅ 已禁用"
ls /etc/systemd/system/multi-user.target.wants/backup_service.service 2>/dev/null || echo "✅ 已禁用"
```

> **重要**：eventlogger_service 依赖 `trim_main.service`，但禁用它不影响 NAS 核心功能，只是 UI 日志停止更新。如需临时清理日志可以 `sudo systemctl start eventlogger_service`，清完再禁用。

---

## 3. 禁用 swap

```bash
ssh fnos '
# 禁用并删除 swapfile
sudo swapoff -a
sudo rm -f /swapfile
# 从 fstab 中删除 swap 条目
sudo sed -i "/swap/d" /etc/fstab
echo "swap: $(swapon --show)"
grep swap /etc/fstab || echo "fstab 无 swap ✅"
'
```

---

## 4. tmpfs 挂载日志和 apt 缓存

目的：将日志和 apt 缓存放到内存，避免系统盘空间被日志/cache 撑满。

```bash
ssh fnos '
# 先创建目录
sudo mkdir -p /var/cache/apt

# 添加到 fstab
cat >> /etc/fstab << "EOF"
tmpfs   /var/log        tmpfs   defaults,noatime,mode=1777,size=100M  0  0
tmpfs   /var/cache/apt  tmpfs   defaults,noatime,mode=1777,size=200M  0  0
EOF

# 立即挂载
sudo mount -a

# 验证
mount | grep -E "/var/(log|cache/apt)"
'
```

最终 fstab 应该是：

```
UUID=b5935370-067e-47fa-ba90-ae6ead41e7b7 / ext4 errors=remount-ro 0 1
UUID=731E-3973 /boot/efi vfat umask=0077 0 1
tmpfs   /var/log        tmpfs   defaults,noatime,mode=1777,size=100M  0  0
tmpfs   /var/cache/apt  tmpfs   defaults,noatime,mode=1777,size=200M  0  0
```

---

## 5. SSH key 部署

### 5.1 设置 root 密码

```bash
ssh fnos 'sudo usermod -p "$(openssl passwd -6 rootpass2024)" root'
```

### 5.2 部署 root SSH key

```bash
ssh fnos '
sudo mkdir -p /root/.ssh
sudo chmod 700 /root/.ssh
sudo sh -c "echo '\''ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINbBL4tUyAXV2h07J9X+1Ut9grF9bp1PBPz/TYyaKBZg a1@ryzen5-5500u'\'' > /root/.ssh/authorized_keys"
sudo chmod 600 /root/.ssh/authorized_keys
sudo chown -R root:root /root/.ssh
'
```

### 5.3 启用 root SSH 登录

编辑 `/etc/ssh/sshd_config`：

```
PermitRootLogin yes
PasswordAuthentication yes
```

重启 sshd：

```bash
ssh fnos 'sudo systemctl restart sshd'
```

---

## 6. 分区表查看工具

操作前确认分区布局：

```bash
# 精确扇区布局（用于缩盘计算）
sudo parted /dev/sda unit s print free

# 快速概览
sudo sgdisk -p /dev/sda
sudo lsblk -f -o NAME,SIZE,FSTYPE,LABEL,UUID,MOUNTPOINT

# 分区对齐检查
sudo parted /dev/sda align-check optimal 1
sudo parted /dev/sda align-check optimal 2
sudo parted /dev/sda align-check optimal 3
```

原始布局（本次操作）：

```
Number  Start        End          Size        FSTYPE    Label
 1      2048s       194559s      192512s     fat32     BOOT
 2      194560s    117186559s   116992000s   ext4      SYSTEM
 3     117186560s   234440703s  117254144s            TRIM
```

---

## 7. 外部缩盘（核心步骤）

> 将 FnOS 硬盘从 NAS 中取出，通过 USB 接上 Ubuntu 电脑操作。

### 7.1 记录原分区信息

```bash
sudo sgdisk -i 2 /dev/sda | grep -E "Partition GUID code|Partition name"
sudo sgdisk -i 3 /dev/sda | grep -E "Partition GUID code|Partition name"
```

需要保留：
- sda2: 类型 `0FC63DAF-8483-4772-8E79-3D69D8477DE4`（Linux filesystem），标签 `SYSTEM`
- sda3: 类型同上，标签 `TRIM`

### 7.2 卸载分区

```bash
sudo umount /dev/sda2
sudo umount /dev/sda1   # 如果挂载了也卸载
mount | grep sda && echo "还有挂载！" || echo "✅ 已卸载"
```

### 7.3 fsck 检查

```bash
sudo e2fsck -y -f /dev/sda2
```

必须显示 `FILE SYSTEM WAS MODIFIED` 之后以 clean 状态结束。

### 7.4 resize2fs 缩文件系统

```bash
sudo resize2fs /dev/sda2 10G
```

输出：`The filesystem on /dev/sda2 is now 2621440 (4k) blocks long.`

实际大小 = 2621440 × 4096 = 10GiB。

### 7.5 缩分区 + 重建 sda3（关键一步）

**推荐做法：一次 sgdisk 搞定缩分区 + 重建 sda3**

> ⚠️ 不要分两步做！先单独缩 sda2 再重建 sda3 会因 parted 警告弹窗导致顺序错乱。

```bash
sudo sgdisk -d 2 -n 2:194560:21170175 \
            -n 3:21170176:234440703 \
            -t 2:0FC63DAF -t 3:0FC63DAF \
            -c 2:"SYSTEM" -c 3:"TRIM" \
            /dev/sda
```

参数说明：
- `-d 2`：删除原 sda2（55.8G）
- `-n 2:194560:21170175`：重建 sda2，start 不变，end = 10G 末尾扇区 + 1MiB 余量
- `-n 3:21170176:234440703`：重建 sda3，从 sda2 后面到盘尾
- `-t 2:0FC63DAF -t 3:0FC63DAF`：Linux filesystem 类型
- `-c 2:"SYSTEM" -c 3:"TRIM"`：保留原始标签

计算 `10G` 的 end sector：

```
start sector: 194560
block count:  2621440 (resize2fs 输出)
block size:   4096 = 8 个 512B 扇区
end sector:   194560 + 2621440 × 8 - 1 = 21170159
加 1MiB 余量: 21170159 + 2048 = 21172207
（本次实际用 21170175，保守留余量 ~2MiB）
```

### 7.6 通知内核重读分区表

```bash
sudo partprobe /dev/sda
sleep 1
```

### 7.7 验证

```bash
sudo sgdisk -p /dev/sda
sudo parted /dev/sda unit GiB print
```

预期输出：

```
Number  Start    End      Size     File system  Name    Flags
 1      0.00GiB  0.09GiB  0.09GiB  fat32        BOOT    boot, esp
 2      0.09GiB  10.1GiB  10.0GiB  ext4         SYSTEM
 3      10.1GiB  112GiB   102GiB                TRIM
```

---

## 8. 最终验证清单

逐项确认再装回 NAS：

```bash
# 1. UUID 不变（fstab 兼容性）
sudo blkid /dev/sda2
# 必须输出 UUID="b5935370-067e-47fa-ba90-ae6ead41e7b7"

# 2. fsck 完整检查
sudo e2fsck -y -f /dev/sda2
# 必须 clean

# 3. 挂载验证关键配置
sudo mount -o ro /dev/sda2 /mnt/verify

# fstab
cat /mnt/verify/etc/fstab
# 应该有 2 条 tmpfs，0 条 swap

# sshd_config
grep -i "PermitRootLogin\|PasswordAuthentication" /mnt/verify/etc/ssh/sshd_config
# 应该都是 yes

# SSH key 存在
sudo ls -la /mnt/verify/root/.ssh/authorized_keys   # 应该有
sudo ls -la /mnt/verify/home/admin/.ssh/authorized_keys  # 应该有

# 服务禁用
for s in eventlogger_service ai_manager backup_service; do
  [ -f "/mnt/verify/etc/systemd/system/multi-user.target.wants/$s.service" ] && echo "❌ $s 还在！" || echo "✅ $s"
done

# swap 残留
ls -la /mnt/verify/swapfile 2>/dev/null || echo "✅ swapfile 已删除"

sudo umount /mnt/verify
```

---

## 9. 踩坑记录

### 坑 1：parted resizepart 不执行

```bash
sudo parted -s /dev/sda resizepart 2 21170175s
```
虽然 `-s` 模式，但依然弹出交互警告然后**静默失败**（返回 0 但没执行）。

**正确做法**：用 `sgdisk -d 2 -n 2:...` 一步缩 + 重建，不弹警告。

### 坑 2：sgdisk `-g` 不是缩分区参数

```bash
sgdisk -g 2:21170175 /dev/sda  # 报错 "Problem opening 2:21170175 for reading!"
```

sgdisk 没有 `-g` 参数来 shrink。必须先 `-d 2` 再 `-n 2:`。

### 坑 3：分两步做导致 sda3 重建失败

```bash
# 先缩 sda2
sgdisk -d 2 -n 2:... /dev/sda

# 再建 sda3 → 失败
sgdisk -n 3:... /dev/sda
```

**必须在同一条 sgdisk 命令里同时处理 -d 2 和 -n 3**，否则分区表状态不一致。

### 坑 4：cat 不加 sudo 看到空文件

```bash
cat /mnt/verify/root/.ssh/authorized_keys   # 空（没权限）
sudo cat /mnt/verify/root/.ssh/authorized_keys  # ✅ 正确
```

### 坑 5：sgdisk 的 end sector 超出 last usable sector

```
last usable sector: 234441614
```

原 sda3 end = 234440703 合法，但 sgdisk 在某种上下文会拒绝。最安全：用 `-n 3:21170176:234440703` 或 `-n 3:21170176:-0`（盘尾自动对齐）。

---

## 回滚方案

如果装回 NAS 后不能启动：

1. 将硬盘 USB 接回电脑
2. 恢复原分区表：
   ```bash
   sudo sgdisk -d 2 -d 3 \
     -n 2:194560:117186559 \
     -n 3:117186560:234440703 \
     -t 2:0FC63DAF -t 3:0FC63DAF \
     -c 2:"SYSTEM" -c 3:"TRIM" \
     /dev/sda
   ```
3. `sudo e2fsck -y -f /dev/sda2`
4. 装回 NAS

> 注意：回滚后 sda2 又变回 55.8G，但文件系统只用了 10G，剩下 45G 浪费，不会丢数据。