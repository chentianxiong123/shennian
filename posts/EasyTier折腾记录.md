---
title: 'EasyTier 组网折腾记录'
date: 2026-06-28
---

# EasyTier 组网折腾记录

## 背景

想用 EasyTier 做异地组网，电脑和手机之间互相访问，跑 Moonlight 串流。之前折腾了好几个竞品，最后才选了 EasyTier。

## 之前折腾过的竞品

### ZeroTier

**优点：** 免费 25 台设备，社区活跃，有自建 Planet 控制器的方案。

**放弃原因：** 权限管理太拉胯。没有细粒度的端口级 ACL，要么全开要么全关。Free 版 Flow Rules 在新版 Central 被砍了（要付费），Legacy Central 能用但界面古老。设备授权要手动去网页打勾，朋友多了管理麻烦。

### Tailscale

**优点：** ACL 权限管理做得最好，deny-by-default，按人/设备/端口控制。MagicDNS 自动给设备分配域名。`tailscale serve` 一条命令暴露服务。基于 WireGuard，性能好。

**放弃原因：**
1. 免费版只有 3 个用户，朋友超过 3 个就得付费或自建 Headscale
2. 协调服务器在国外， DERP 中继服务器也大多在国外，国内延迟高
3. 自建 DERP 需要国内 VPS + 域名备案，嫌麻烦
4. 登录要用 Google/GitHub 账号，朋友不愿意给账号密码（后来发现可以邀请，但已经放弃研究了）

### WireGuard（原生）

**优点：** 内核级 VPN，性能最强，延迟最低。完全自主可控。

**放弃原因：** 配置太复杂。每台设备都要手动生成密钥、写配置文件、配 IP 地址。异地组网还要自己搞公网 IP 或者端口映射。不适合小白和朋友组网场景。

### 花生壳 / cpolar / ngrok

**优点：** 国内服务商，中文界面，注册就能用。

**放弃原因：** 免费版限速严重（花生壳 1Mbps），端口数限制，不适合需要稳定高速的场景。本质是中心化中转，延迟不可控。

## 最终选择 EasyTier 的理由

1. **免费无设备限制** — 不像 Tailscale 限制 3 用户
2. **去中心化** — 不依赖单一服务器，节点之间 P2P 直连
3. **国内公共节点多** — 社区维护，大部分是国内服务器
4. **GUI 操作** — 不像 WireGuard 那样要手写配置文件
5. **UDP+TCP 双通道** — NAT 穿透率 98%，比 ZeroTier 的 UDP 单通道强

## 踩过的坑

### 1. EasyTier GUI 连不上任何公共服务器

**症状：** 打开 EasyTier GUI，添加公共节点后一直转圈，连不上。

**原因：** Clash Verge 后台服务没关干净。虽然界面退出了，但 `clash_verge_service`（PID 4624）还在 Windows 服务里跑着，TUN 模式残留路由干扰了 EasyTier 的出站连接。

**解决：** `Stop-Service -Name "clash_verge_service" -Force` 强制停掉服务。

**教训：** 退出 Clash Verge 界面 ≠ 关掉服务，要去 Windows 服务管理器里确认。

### 2. 公共服务器地址填错

**症状：** 按官方 README 填 `tcp://public.easytier.top:11010`，DNS 解析失败。

**原因：** `public.easytier.top` 这个域名已经不存在了。国内能用的公共节点是社区用户自发部署的，不在官方文档里。

**怎么找到可用节点：**
- AstralGame 服务器列表：https://astral.fan/server-config/server-list
- 手动 TCP 连接测试：用 PowerShell 脚本逐个测试端口连通性

**实测可用的国内节点：**
| 服务器 | 地址 |
|--------|------|
| 十堰/未知 | `tcp://easytier.weiai.org.cn:11010` |
| 杭州/家宽 | `tcp://ros.scpsl.com.cn:11010` |
| 张家口/阿里云 | `tcp://boi.de5.net:11010` |

### 3. LevelDB 配置删不掉

**症状：** 在 GUI 里删了旧的公共节点，但 LevelDB 里还存着历史记录，进程重启后又加载旧配置。

**原因：** EasyTier GUI 用 WebView2 的 LevelDB 存配置，是 append-only 日志，旧条目不会被删除，只会追加新条目。

**解决：** 关掉 EasyTier → 删除整个 leveldb 文件夹 → 重启自动重建。
```
C:\Users\a1\AppData\Local\com.kkrainbow.easytier\EBWebView\Default\Local Storage\leveldb
```

### 4. 跨网段延迟太高，Moonlight 没法用

**症状：** 电脑在 `192.168.31.x`，手机在 `192.168.100.x`（随身 WiFi），EasyTier 虚拟网络 ping 延迟 120ms。

**原因：** 两个设备不在同一个局域网，流量走公网中转服务器。而且手机用的 4G 随身 WiFi 有运营商级 NAT（CGNAT），P2P 打洞根本打不通。

**Moonlight 串流要求：** 延迟 <30ms，带宽 >15Mbps。走公网中转的 120ms 完全不可用。

**解决：** 把电脑和手机连到同一个 WiFi，延迟立刻降到 8ms。

### 5. 随身 WiFi 是一坨

手机用的 UFI-5123 随身 WiFi，4G 网络 + CGNAT，P2P 打不通，带宽也拉胯。最后还是得靠家里路由器的 WiFi。

## 最终可用配置

```
网络名称：daqingda
密码：daqingda
虚拟 IP：192.168.123.1（电脑）/ 192.168.123.2（手机，DHCP 自动分配）
初始节点：tcp://easytier.weiai.org.cn:11010
DHCP：关闭
```

## 总结

| 场景 | 能不能用 |
|------|---------|
| 同局域网串流 | ✅ 8ms 延迟，完美 |
| 跨网串流（走中转） | ❌ 120ms，没法用 |
| 跨网 P2P 打洞 | ⚠️ 取决于 NAT 类型，CGNAT 打不通 |
| 文件传输 | ✅ 能用，速度取决于带宽 |

**结论：** EasyTier 适合同局域网或者能成功 P2P 打洞的场景。如果两个设备都在 CGNAT 后面（比如随身 WiFi、校园网），基本只能走中转，延迟高。Moonlight 串流这种对延迟敏感的应用，必须同局域网。
