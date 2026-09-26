---
title: 'P2P 组记录'
date: 2026-06-26
---

# P2P 组记录

## 1. 核心需求
- 几个朋友之间组建纯 P2P 隔离网络
- 像“开房间”一样简单（无复杂邀请/账号绑定）
- 暴露本机端口互通服务（真局域网体验）免费、轻量、安全隔离（防朋友误操作）无公网 IP、无服务器预算

## 2. 方案对比

| 维度 | Tailscale | ZeroTier | n2n / Yggdrasil |
|------|-----------|----------|------------------|
| 心智模型 | 企业级零信任网络 | 游戏开房/宿舍网 | 纯技术向 P2P |
| 加入方式 | 账号绑定 + 邮件邀请 | 输入 Network ID 即 | 命令行配置 supernode/community |
注册门槛 | GitHub/Google OAuth | 邮箱+密码（仅房主） | 无需注册 |
| 网络层级 | 三层（IP路由） | 二层（虚拟以太网）/三层可选 |\局域网协议支持 |受限（无广播/mDNS） | 完整（ARP/广播/NetBIOS） | 完整但需手动配置 |
| 开源程度 | 客户端开源，协调服务器闭源，Planet 闭源 | 全栈开源自建服务器 | 不支持（官方 SaaS） |可自建 Moon 加速 | 必须自建 supernode |
| 上手难度 | 低但逻辑重）极低 | 高适合场景 | 企业办公、长期稳定组网 | 朋友临时联机、轻量服务互通 | 极客、隐私洁癖 |

## 3. 最终选择：ZeroTier

### 选择理由 “开房间”模式完美契合直觉：创建 Network → 拿到 ID → 朋友输入即入
- 真二层虚拟以太网，暴露零限制，体验等同于物理局域网
- 个人免费，50 设备上限足够
- 开源，协议透明，安全性可审计
- 安装包仅 ~10MB，资源占用极低

### 已知局限
-  Planet 服务器闭源（与 Tailscale 同类问题）
- 房间内默认全通，无内置细粒度 ACL
- NAT 穿透成功率略低于 Tailscale 4. 部署步骤

### 第一步：建房（仅房主）
1. 访问 https://my.zerotier.com 注册账号（邮箱+密码）
2. 点击 Create A Network，获取 16 位 Network ID
3. 在 Members 页面勾选 Authorize 允许新成员自动加入（或手动审批）### 第二步：进房（所有成员）
1. 下载安装 ZeroTier One 客户端（Windows/Mac/Android/i 打开客户端 → Join Network →  → 点击 Join等待房主授权（若开启自动授权则即时生效）

### 第三步：验证连通
1. 控制台确认设备在线且分配虚拟 IP（如 192.168.191.x）\互相 ping 虚拟 IP 验证连通性
3 开启本机服务绑定 0..0.0），对方用 `虚拟IP:` 访问

## 5. 安全加固建议

由于 ZeroTier 无内置 ACL，需自行补防护层：\ **Windows 防火墙**：将 ZeroTier 网卡设为专用网络
  ```powershell
  Get-NetConnectionProfile -InterfaceAlias "ZeroTier One" | Set-NetConnectionProfile -NetworkCategory Private
  ```
- **应用层认证**FileBrowser 设强密码、API 加 Token、数据库不暴露远程端口最小暴露原则**：仅开放必要端口，敏感服务绑定 localhost + SSH 隧道
- **定期审计**：检查控制台 Members 列表，移除未知设备6. 踩坑记录

不适配原因
-级 IAM 逻辑与“朋友临时组网”心智模型严重冲突
邀请制流程繁琐，朋友需注册账号并等待邮件确认
- 三层不支持广播/mDNS，部分局域网功能缺失
- 控制台是基础设施管理面板，非服务导航页，初次使用感“差味道”

### ZeroTier 注意事项
- 首次安装后务必设置防火墙为专用网络否则入站连接被拦截
- 随身 WiFi / 对称 NAT 环境可能导致直连失败，走中继时速度下降明显Network ID）等同于凭证，切勿泄露给非信任人员

## 7. 后续优化方向若直连率低，可自建 Moon 节点加速（公网 VPS）若服务增多，可部署 Homer/Heimdall 作为静态导航页（挂Tier 网络内 若对闭源 Planet 无法接受，可迁移至 n2n（自建 supernode）或 Yggdrasil（纯 P2P）

---
*文档生成时间：2026-06-26*
*适用版本Tier One 114.x /1.98.x*