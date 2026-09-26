---
title: '小米路由器 R3 (PandoraBox) 无线中继 + 双频合一 配置全流程'
date: 2026-09-10
---

# 小米路由器 R3 (PandoraBox) 无线中继 + 双频合一 配置全流程

> 操作日期：2026-09-10
> 固件：PandoraBox (基于 OpenWrt/LEDE 18.12)，Linux 3.14.79, MIPS
> 设备：小米路由器 R3 (xiaomi-r3)

---

## 目录

1. [设备信息](#1-设备信息)
2. [SSH 登录](#2-ssh-登录)
3. [查看运行中的服务](#3-查看运行中的服务)
4. [恢复出厂设置](#4-恢复出厂设置)
5. [恢复被关闭的 Web 管理服务](#5-恢复被关闭的-web-管理服务)
6. [修改网段](#6-修改网段)
7. [双频合一（同名 WiFi）](#7-双频合一同名-wifi)
8. [无线中继（同名无缝切换）](#8-无线中继同名无缝切换)
9. [验证方法](#9-验证方法)
10. [重要问题与坑](#10-重要问题与坑)
11. [恢复出厂配置（回滚）](#11-恢复出厂配置回滚)

---

## 1. 设备信息

```
Linux PandoraBox_39EF 3.14.79 #0 Mon Dec 31 13:03:10 2018 mips
```

- 主机名：PandoraBox_39EF
- 型号：Xiaomi R3 (xiaomi-r3)
- 存储分区 `/proc/mtd`：u-boot, u-boot-env, Bdata, Factory, crash, firmware, kernel, ubi ...

基本网络信息（恢复出厂后默认）：
- 管理地址：`192.168.1.1`
- LAN 网段：`192.168.1.0/24`
- 管理账号：`root`
- 默认密码：通常在 Web 界面初次设置，或为空
- 本教程环境密码：`admin`

---

## 2. SSH 登录

### 2.1 命令行登录

本机（操作电脑）需安装 `sshpass`：

```bash
# Ubuntu/Debian
apt install sshpass

# 连接路由器
sshpass -p 'admin' ssh -o StrictHostKeyChecking=no \
  -o HostKeyAlgorithms=+ssh-rsa \
  -o PubkeyAcceptedAlgorithms=+ssh-rsa \
  root@192.168.1.1
```

> 注意：老设备只支持 `ssh-rsa`，新版 OpenSSH 默认禁用了它，必须加 `-o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa`。

### 2.2 关键环境变量

PandoraBox 的精简系统 PATH 只有 `/usr/bin:/bin`，**缺少 `/sbin` 和 `/usr/sbin`**。登录后第一件事：

```bash
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
```

否则 `uci`、`brctl`、`ifconfig`、`iwpriv` 等都会提示 not found（即使文件存在）。

### 2.3 改密码

```bash
passwd
```

---

## 3. 查看运行中的服务

```bash
# 查看监听端口
netstat -tlnp

# 查看进程
ps w

# 查看可用服务脚本
ls /etc/init.d/
```

恢复出厂后默认服务：

| 服务 | 端口 | 作用 |
|------|------|------|
| dropbear | 22 | SSH |
| dnsmasq | 53 | DNS / DHCP |
| smbd / nmbd | 139/445 | Samba 文件共享 |
| uhttpd | 80/443 | Web 管理界面 (LuCI) |
| apcli | - | 无线客户端（中继用） |
| crond | - | 定时任务 |
| ntpd | - | 时间同步 |
| vsftpd / miniupnpd / ddns | - | FTP / UPnP / 动态DNS |

---

## 4. 恢复出厂设置

PandoraBox 没有 OpenWrt 常见的 `firstboot` 命令（`/sbin/firstboot` 存在但不可用）。

三种方式：

### 方式一：Web 界面（推荐）
浏览器访问 `http://192.168.1.1`，在「系统」菜单下找「恢复出厂设置」。

### 方式二：物理 Reset 按键
1. 断电
2. 按住 Reset 键不放
3. 通电，保持按住 5~10 秒后松开
4. 等待重启即可（会清除 overlay 配置分区）

### 方式三：命令行擦除配置分区（等同出厂）
```bash
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
umount /overlay
mtd -r erase rootfs_data
# 设备会自动重启，恢复出厂
```

> 分区结构见 `/proc/mtd`：配置存在 `ubi`/`rootfs_data`（overlay）中。

---

## 5. 恢复被关闭的 Web 管理服务

如果之前手动关掉了 uhttpd：

```bash
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
/etc/init.d/uhttpd restart    # 启动 Web 服务
/etc/init.d/uhttpd enable     # 设置开机自启
```

验证：
```bash
netstat -tlnp | grep :80
```
看到 `tcp 0 0 0.0.0.0:80 ... LISTEN uhttpd` 即成功。

---

## 6. 修改网段

### Web 方式
「网络 → LAN → 修改 IP 地址/子网掩码」，例如改 `192.168.2.1`：

### 命令行方式
```bash
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
/sbin/uci set network.lan.ipaddr='192.168.2.1'
/sbin/uci set network.lan.netmask='255.255.255.0'
/sbin/uci commit network
/etc/init.d/network restart
```
改完 LAN IP 会变，重新用新 IP 登录。

---

## 7. 双频合一（同名 WiFi）

本机无线芯片为 MediaTek RTWiFi，支持 `smart`（频段引导）与 `bndstrg` 特性。双频合一 = 2.4G 和 5G 用**相同的 SSID 和密码**，设备自动选择信号更好的频段。

### 7.1 查看当前无线配置

```bash
/sbin/uci show wireless
major sections:
  wireless.ra       # 2.4G 设备
  wireless.default_ra
  wireless.rai      # 5G 设备
  wireless.default_rai
```

### 7.2 配置双频合一

```bash
export PATH=/usr/sbin:/usr/bin:/sbin:/bin

# 统一 SSID
/sbin/uci set wireless.default_ra.ssid='Xiaomi_F5A3'
/sbin/uci set wireless.default_rai.ssid='Xiaomi_F5A3'

# 统一密码（WPA2）
/sbin/uci set wireless.default_ra.encryption='psk2'
/sbin/uci set wireless.default_ra.key='123456789'
/sbin/uci set wireless.default_rai.encryption='psk2'
/sbin/uci set wireless.default_rai.key='123456789'

# 开启频段引导（smart），2.4G/5G 都开
/sbin/uci set wireless.ra.smart='1'
/sbin/uci set wireless.rai.smart='1'

# 5G 额外开启 bndstrg（频段引导守护）
/sbin/uci set wireless.rai.bndstrg='1'

/sbin/uci commit wireless
```

### 7.3 让无线配置生效（关键！）

> **只改 uci 配置不会立刻生效**，需要重启无线模块。直接 `wifi reload` 有时不会把新 SSID 应用到驱动（RT2860 驱动只在加载/重建时读 profile），必须完整 `wifi down; wifi up`。

执行前先做好中继重连准备（见第 8 节），因为重启无线会断开 apcli0 中继连接。

```bash
# 不进行中继的纯 AP 场景：
wifi down
wifi up

# 如果做了中继，用一个后台任务整体执行（参考第 8 节）：
( sleep 3; wifi down; sleep 2; wifi up; sleep 8; /etc/repeater.sh ) >/var/log/wifi-fix.log 2>&1 &
```

驱动读取的配置文件在：
```
/tmp/profiles/rt2860v2_2g.dat    # 2.4G
/tmp/profiles/rt2860v2_5g.dat    # 5G
```
重启后确认里面的 `SSID1=Xiaomi_F5A3`、`WPAPSK1=123456789`。

---

## 8. 无线中继（同名无缝切换）

目标：R3 通过无线连接上级路由 `Xiaomi_F5A3`（密码 `123456789`），并广播同名 WiFi，所有设备在同一网段无缝漫游。

> 硬件上 R3 用 `apcli0`（2.4G 无线客户端接口）连上级，采用**透明桥接**方式，桥进 br-lan，同网段统一 DHCP。

### 8.1 连接中继（一次命令）

```bash
export PATH=/usr/sbin:/usr/bin:/sbin:/bin

# 扫描上级（可选）
/sbin/apcli_2g ra0   # 会列出可连接的AP；找到目标 BSSID

# 连接（BSSID 固定更稳）
/sbin/apcli_2g ra0 connect -s Xiaomi_F5A3 -b CC:D8:43:77:D6:8E -k 123456789
# 成功会输出: apcli0:Associated CC:D8:43:77:D6:8E.
```

如果找不到 BSSID，用 ESSID 方式连接：
```bash
/sbin/apcli_2g ra0 connect -s Xiaomi_F5A3 -k 123456789
```

连接后马上：
```bash
/sbin/ifconfig apcli0 up
/sbin/brctl addif br-lan apcli0   # 网桥成员已由 netifd 自动管理的话可省略
```

验证桥接：
```bash
brctl show br-lan
# 应看到 eth0.1 / ra0 / rai0 / apcli0
```

### 8.2 改 LAN 为 DHCP（同网段无缝）

关键：把 R3 从一台路由变成「透明 AP」，LAN 桥整体从上级获取 IP。

```bash
export PATH=/usr/sbin:/usr/bin:/sbin:/bin

# 备份
cp /etc/config/network /etc/config/network.bak
cp /etc/config/dhcp /etc/config/dhcp.bak
cp /etc/rc.local /etc/rc.local.bak

# LAN 改为 DHCP，并把 apcli0 纳入 LAN 桥
/sbin/uci set network.lan.proto='dhcp'
/sbin/uci set network.lan.ifname='eth0.1 apcli0'
/sbin/uci delete network.lan.ipaddr
/sbin/uci delete network.lan.netmask
/sbin/uci delete network.lan.ip6assign

# 关闭本机 WAN（避免和 apcli0 抢 DHCP）
/sbin/uci set network.wan.proto='none'
/sbin/uci delete network.wan6

# 关闭本机 DHCP 服务器，避免和上级冲突
/sbin/uci set dhcp.lan.ignore='1'

/sbin/uci commit network
/sbin/uci commit dhcp
```

### 8.3 开机自动重连脚本

> 注意：此精简系统**没有 `nohup`**，背景脚本直接 `&` 即可（SSH 断开后进程会成为孤儿继续运行）。

```bash
export PATH=/usr/sbin:/usr/bin:/sbin:/bin

# 中继重连脚本
cat > /etc/repeater.sh << 'EOF'
#!/bin/sh
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
sleep 5
/sbin/apcli_2g ra0 connect -s Xiaomi_F5A3 -b CC:D8:43:77:D6:8E -k 123456789
sleep 4
/sbin/ifconfig apcli0 up
sleep 2
/sbin/brctl addif br-lan apcli0
EOF
chmod +x /etc/repeater.sh

# rc.local 开机调用
cat > /etc/rc.local << 'EOF'
# PandoraBox Repeater autostart
/etc/repeater.sh >/var/log/repeater.log 2>&1 &
exit 0
EOF
```

### 8.4 完整重启无线（应用双频合一 + 重连中继）

```bash
# 一次性后台执行，防止 SSH 因无线重启而中断导致任务被杀
( sleep 3; /sbin/wifi down; sleep 2; /sbin/wifi up; sleep 8; /etc/repeater.sh ) >/var/log/wifi-fix.log 2>&1 &
```

### 8.5 重启网络

```bash
/etc/init.d/network restart
```

重启后 IP 会变成上级网段（如 `192.168.31.x`），原来的 `192.168.1.1` 不可用，需重新找地址（见下）。

---

## 9. 验证方法

### 9.1 找到 R3 新 IP

从操作电脑扫描上级网段：

```bash
# 并行 ping 扫描
for i in $(seq 2 254); do (ping -c 1 -W 1 192.168.31.$i >/dev/null 2>&1 && echo "192.168.31.$i") & done; wait

# 确认是 R3：先记下 R3 的 LAN MAC（恢复前 netstat/brctl 可见，如 28:6c:07:59:39:ef）
ip neigh | grep -i "28:6c:07:59:39:ef"
```

### 9.2 扫描确认同名 WiFi

```bash
iwlist wlo1 scan | grep -E "Cell|ESSID"
# 应看到：
#   CC:D8:43:77:D6:8E / CC:D8:43:77:D6:8F  -> Xiaomi_F5A3（上级）
#   28:6C:07:59:39:F0 / 28:6C:07:59:39:F1  -> Xiaomi_F5A3（R3，同名！）
```

### 9.3 验证中继与外网

```bash
sshpass -p 'admin' ssh root@新IP 'export PATH=/usr/sbin:/usr/bin:/sbin:/bin
brctl show br-lan            # 应含 apcli0/ra0/rai0/eth0.1
ping -c 2 -W 2 223.5.5.5     # 外网通 = 中继转发正常
'
```

---

## 10. 重要问题与坑（本机实测）

### 10.1 只改配置不重启无线，SSID 不生效
- 现象：uci 里 SSID 已是新名，但扫描仍是旧名 `PandoraBox-2.4G-5939F0`。
- 原因：RT2860 驱动只在接口重建/加载时读取 profile。
- 解决：必须 `wifi down; wifi up`，不能只 `wifi reload`。

### 10.2 系统没有 `nohup`
- 现象：`nohup: not found`，后台任务直接失败。
- 解决：直接 `cmd &` 后台执行即可，SSH 断开后孤儿进程继续跑。

### 10.3 `wifi reload` / `network restart` 后 dropbear 端口失效
- 现象：设备能 ping 通、web(80) 能开，但 SSH(22) Connection refused。
- 原因：dropbear 绑定到了旧 IP。
- 解决：走 telnet（默认 23 端口开启）重启 dropbear：
  ```bash
  (sleep 2; echo root; sleep 1; echo admin; sleep 2;
   echo "/etc/init.d/dropbear restart"; sleep 3; echo exit) | telnet 192.168.31.159
  ```

### 10.4 apcli 状态命令打印 stop!
- `/sbin/apcli_2g ra0 status` 输出 `stop!` 不代表失败，属工具显示问题。
- 以日志 `apcli0:Associated xxx` 和桥接/联网为准。

### 10.5 PATH 环境
- 登录后用 `export PATH=/usr/sbin:/usr/bin:/sbin:/bin`，否则 uci/brctl/ifconfig 全 not found。

### 10.6 恢复出厂后 host key 变化
- 路由器恢复出厂后 SSH host key 变化，本机需清除旧记录：
  ```bash
  ssh-keygen -f /root/.ssh/known_hosts -R 192.168.1.1
  ```

---

## 11. 恢复出厂配置（回滚）

### 11.1 有备份文件时（本教程已备份）

```bash
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
/sbin/uci import network < /etc/config/network.bak
/sbin/uci import dhcp < /etc/config/dhcp.bak
# wireless 配置手动恢复：/etc/config/wireless.bak（如存在）
/etc/init.d/network restart
# 恢复默认 rc.local
cat /etc/rc.local.bak > /etc/rc.local 2>/dev/null
```

### 11.2 无备份时直接恢复出厂

见第 4 节（Web / 物理 Reset / mtd 擦除）。

---

## 附：本机最终验证结果（2026-09-10）

```
R3 管理地址：192.168.31.159 (root / admin)
2.4G：channel 1, ESSID Xiaomi_F5A3, WPA2 (28:6C:07:59:39:F0)
5G  ：channel 149, ESSID Xiaomi_F5A3, WPA2 (28:6C:07:59:39:F1)
中继：apcli0 -> CC:D8:43:77:D6:8E (上级, 信号 -45dBm, 质量 100%)
桥接：br-lan = eth0.1 + ra0 + rai0 + apcli0
外网：ping 223.5.5.5 0% 丢包
持久化：/etc/rc.local -> /etc/repeater.sh 开机自动中继
```

## 附：关键命令速查表

| 操作 | 命令 |
|------|------|
| 登录 SSH | `sshpass -p 'admin' ssh -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa root@IP` |
| 补全 PATH | `export PATH=/usr/sbin:/usr/bin:/sbin:/bin` |
| 看服务 | `netstat -tlnp`、`ps w`、`ls /etc/init.d/` |
| 开 Web | `/etc/init.d/uhttpd restart` |
| 改网段 | `/sbin/uci set network.lan.ipaddr=...` + commit + network restart |
| 看无线配置 | `/sbin/uci show wireless` |
| 重启无线 | `wifi down; wifi up` |
| 连中继 | `/sbin/apcli_2g ra0 connect -s X -b MAC -k 密码` |
| 看桥接 | `brctl show br-lan` |