---
title: 'fnOS + k3s 第二发：containerd 生成 resolv.conf 权限 700 导致全站 Go 服务 DNS 崩溃'
date: 2026-09-01
---

# fnOS + k3s 第二发：containerd 生成 resolv.conf 权限 700 导致全站 Go 服务 DNS 崩溃

> 文档日期：2026-09-01
> 涉及设备：fnos（192.168.31.182，k3s v1.36.4+k3s1，containerd v1.7.29）
> 关联文档：`fnOS-vol1-权限000问题记录.md`

---

## 一、前情回顾

上一篇记录了 fnOS 已知内核 Bug——`/vol1` 目录权限被系统内核锁死为 `000`，导致 k3s 节点 NotReady、14 个服务全部 Pending。官方确认是内核层面的 umount 冲突问题，给出的"修复方案"是手动 chmod + 开机自检脚本。

我们照做了。问题暂时压下去了。

**但这只是 fnOS 内核 Bug 的第一层皮。**

---

## 二、新问题：Go 服务全线 CrashLoopBackOff

部署 fnos 节点后，所有 Go 后端服务（core、ai、bili、search、studio、work、msg-danmaku）启动即崩，日志清一色：

```
failed to ping database: dial tcp: lookup postgres on [::1]:53: read udp [::1]:56319->[::1]:53: read: connection refused
```

关键信息：**DNS 解析走了 `[::1]:53`（IPv6 本地回环）而不是集群 kube-dns（`192.168.104.10`）。**

同期 laptop 节点上完全相同的镜像、完全相同的 YAML，一切正常。

---

## 三、排查过程（省流版）

| 检查项 | 结果 |
|--------|------|
| kube-dns 是否运行 | 正常，192.168.104.10 响应正常 |
| Pod 的 resolv.conf 内容 | `nameserver 192.168.104.10`，内容正确 |
| busybox nslookup 能否解析 | 能（因为 busybox 跑在 root，绕过了问题） |
| containerd sandbox resolv.conf 权限 | **`-rwx------`（700），只有 root 能读** |
| Pod 内 app 用户（uid=100）能否读 resolv.conf | **不能。`cat /etc/resolv.conf` → Permission denied** |
| Go 二进制（CGO_ENABLED=0）的 DNS 行为 | 读不了 resolv.conf → 回退到 `[::1]:53` → 崩 |
| laptop 的 resolv.conf 权限 | **`-rw-r--r--`（644），所有人可读** |

**结论：containerd 在 fnos 上生成的 sandbox resolv.conf 权限是 700，非 root 用户无法读取。**

---

## 四、根因分析

### 4.1 为什么 laptop 正常，fnos 就炸？

containerd 创建 sandbox resolv.conf 时，文件权限取决于底层存储的行为。

- **laptop**：标准 Linux 文件系统，umask 0022 正常生效，文件权限 644
- **fnos**：fnOS 定制内核 + ext4 + 特殊 ACL/prjquota → 文件创建时权限位被异常设置为 700

这与 `/vol1` 权限锁死 000 是**同一棵毒树上的不同果实**——都是 fnOS 内核对文件/目录权限处理的 Bug。

### 4.2 为什么 busybox 能用，Go 二进制不行？

- busybox 默认以 **root（uid=0）** 运行 → 能读 700 权限的 resolv.conf
- Go 服务 Dockerfile 里写了 `USER app`（uid=100）→ **读不了** 700 的 resolv.conf

### 4.3 Go 二进制为什么走 [::1]:53？

Go 在 `CGO_ENABLED=0` 时使用内置 DNS 解析器：
1. 读 `/etc/resolv.conf` 获取 nameserver 列表
2. 如果读不到（Permission denied）→ 回退到系统默认 → `[::1]:53`
3. `[::1]:53` 没有 DNS 服务 → 连接拒绝 → 所有域名解析失败

这不是 Go 的 Bug，是 Go 的设计：**读不了就回退，不报错给上层。**

### 4.4 为什么 admin 和 web 没崩？

- **admin**：前端 nginx 静态页面，不连数据库，启动不触发 DNS 查询
- **web**：同上，纯前端

它们不是"DNS 没问题"，而是"还没走到 DNS 那一步"。

---

## 五、fnOS 的锅有多大？

### 这不是"偶发"

fnOS 官方把 `/vol1` 权限 000 定性为"偶发"，给个修复脚本就完事。现在 resolv.conf 权限 700 再次证明：**fnOS 内核的权限处理存在系统性缺陷，不是修一个目录就能解决的。**

### 这不是用户的问题

- 我们没有手动 umount 任何系统路径
- 我们没有修改任何系统权限设置
- 所有操作都是标准的 k3s + containerd 工作流

**fnOS 内核在处理容器存储挂载时，对文件权限的管理有根本性缺陷。**

### 这不是 k3s 的问题

- k3s 在 laptop（标准 Linux）上完全正常
- 同版本 k3s（v1.36.4+k3s1）
- 同版本 containerd（v1.7.29）

**同样的软件栈，fnOS 内核就是跑不正常。**

### 这不是第一次了

| 事件 | fnOS 内核 Bug | 影响 |
|------|---------------|------|
| 2026-08-30 | `/vol1` 权限锁死 000 | k3s 节点 NotReady，14 服务全挂 |
| 2026-09-01 | containerd resolv.conf 权限 700 | Go 服务 DNS 崩溃，全站后端不可用 |

两次，两种表现，同一个根源：**fnOS 内核对文件/目录权限的处理有 Bug。**

---

## 六、fnOS 官方的态度

1. `/vol1` 000 问题：确认是 Bug，给个修复脚本，说"后续系统更新中会修复"
2. resolv.conf 700 问题：**目前未知，因为根本没人报过——普通用户不会去检查 containerd sandbox 的 resolv.conf 权限**

fnOS 官方论坛上关于权限问题的帖子一堆又一堆，官方的标准回复模板：

> "已知问题，后续更新修复，请耐心等待。"

**用户花钱买的是 NAS 系统，不是内核 Bug 实验田。**

---

## 七、我们的临时修复

### 方案：修复 containerd 的 umask

```bash
# /etc/systemd/system/k3s.service.d/override.conf
[Service]
UMask=0022
```

让 k3s 进程及其子进程（containerd、shim）以 umask 0022 运行，新生成的 resolv.conf 就会是 644。

### 验证步骤

1. 重启 k3s
2. 检查新 sandbox 的 resolv.conf 权限
3. 拉起一个 Go 服务，确认 DNS 正常

---

## 八、给飞牛的一封信

飞牛技术团队：

你们好。

2026 年 8 月 30 日，你们的 fnOS 内核把 `/vol1` 权限锁成 000，我们写了修复脚本顶上去。

2026 年 9 月 1 日，同一个内核又把 containerd 生成的 resolv.conf 权限设成 700，导致所有 Go 服务 DNS 解析失败。

两次事故，两种表现，同一个根源：**你们的内核在处理文件权限时有系统性 Bug。**

给一个修复脚本不叫"解决"，叫"糊弄"。用户重启一次能接受，重启两次还出问题，第三次谁还信？

我们是开发者，能查日志、能翻源码、能写 workaround。普通用户呢？他们只会看到"服务连不上"，然后找你们，然后得到一句"已知问题，后续修复"。

**请认真对待你们的内核权限管理 Bug。**

此致

一个被 fnOS 内核 Bug 折磨了两天的用户

---

## 九、后续建议

1. 评估是否值得继续用 fnOS 跑 k3s（内核 Bug 随时可能再爆）
2. 考虑迁移到标准 Linux 发行版（Ubuntu Server / Debian）跑 k3s
3. 关注 fnOS 内核更新，确认权限 Bug 修复后才敢升级
4. 所有 Go 服务的 Dockerfile 加一个兜底：entrypoint 里 `chmod 644 /etc/resolv.conf || true`
