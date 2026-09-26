---
title: '华为 WAS-AL00 微信数据库提取失败总结'
date: 2026-08-12
---

# 华为 WAS-AL00 微信数据库提取失败总结

## 设备信息
- 型号：Huawei WAS-AL00 (Nova 3e / P20 Lite)
- 系统：Android 8.0.0, build 356(C00)
- 内核：Linux 4.4.23+ (2019-03-05), aarch64
- 安全补丁：2019-03-01
- Bootloader：锁状态 (verifiedbootstate=GREEN)
- Root：未解锁 BL

## 目标
通过临时 root (temproot) 提取微信聊天数据库 `EnMicroMsg.db`，规避解锁 BL 清数据的风险。

## 技术路线

### 第一阶段：获得临时 root（成功 ✅）
**利用 CVE-2019-2215**（binder UAF 漏洞）获得内核读写能力 + uid=0 + 所有 capabilities。

**参考项目：**
- `willboka/CVE-2019-2215-HuaweiP20Lite` — 专为华为 P20 Lite (Android 8.0.0, kernel 4.4.23) 编译的 exploit
- 通过 binder epoll + pipe + writev 的 UAF 利用链，覆盖 `addr_limit` 实现任意内核读写

**结果：稳定获得 uid=0 + 所有 capabilities，seccomp 已禁用，不会崩溃。**

### 第二阶段：绕过 SELinux（失败 ❌）
获得 root 后无法访问 `/data/data/com.tencent.mm/`，因华为 SELinux 策略将 `shell` 域锁死。

#### 尝试的绕过方法

**方法 1：写 `selinux_enforcing` 为 0**
- 原理：`avc_denied()` 检查 `selinux_state->enforcing`，为 0 时允许所有操作
- 结果：**不可用**。`CONFIG_SECURITY_SELINUX_DEVELOP` 未设置，`selinux_enforcing` 是宏 `#define selinux_enforcing 1`，不是变量，无内存地址可写

**方法 2：AVC cache 覆盖**
- 原理：遍历 `avc_cache` 的 512 个 slot，修改所有 `avc_node->ae.avd.allowed = 0xFFFFFFFF`
- 参考：chompie1337 (Samsung S8), willboka (P20 Lite)
- 结果：**失败**。`avc_cache` 的运行时地址通过 kallsyms 获取，但 `avc_node` 所在页面被华为 hypervisor (HKIP) 保护为只读，`kernel_write` 写入失败

**方法 3：修改 `cred->security` SID**
- 原理：将当前进程的 SELinux SID 改为 kernel (1) 或 init 的 SID
- 结果：**失败**。`security` 结构中的 SID 字段所在的页面也是只读的，写入卡住

**方法 4：security 指针替换**
- 原理：读 `init_task` 的 `cred->security` 指针，替换到当前进程的 `cred` 中
- 结果：**失败**。`init_task` 地址通过 kallsyms 获取，但地址表有偏移，读到的数据错误

**方法 5：Overwrite mapping（映射覆盖）** ← 理论上可行的方案
- 原理：设置 `policydb->allow_unknown = true`，清零 `current_mapping` 的 `perms` 数组，使 `map_decision()` 允许所有权限
- 参考：Klecko Blog 确认**在华为设备上可行**，内存不被 hypervisor 保护
- 实现：`policydb` + `current_mapping` + `current_mapping_size` 三个符号通过 kallsyms 获取
- 结果：**失败**。kallsyms 地址表有偏移问题，`current_mapping_size` 读到的值错误（61440），无法定位正确映射

**方法 6：移除 `security_hook_heads` 钩子**
- 原理：清空 `security_hook_heads.capable` 列表，使权限检查失效
- 参考：通过 GPU DMA 写入可绕过华为 CPU 页表保护
- 结果：**未实现**。需要 Mali GPU 驱动编程，过于复杂

## 核心卡点

### 1. KASLR 地址随机化
每次重启内核基址变化，无法硬编码符号地址。

### 2. kallsyms 地址表偏移
`find_kallsyms_addresses()` 找到的地址表起始位置不精确，导致所有符号地址偏移若干字节，后续读取 `current_mapping_size` 等变量时值错误。

### 3. 华为 HKIP 超管理器保护
- `avc_node` 页面只读（AVC cache 覆盖不可写）
- `selinux_pool` 只读（`permissive_map` 不可写）
- `ss_initialized` 只读
- `cred->security` 结构只读

### 4. 无 `CONFIG_SECURITY_SELINUX_DEVELOP`
`selinux_enforcing` 是宏定义，不是变量。

## 参考项目

| 项目 | 用途 | 适用性 |
|------|------|--------|
| `willboka/CVE-2019-2215-HuaweiP20Lite` | CVE-2019-2215 exploit (P20 Lite) | 能稳定获得 root，但 SELinux 绕过地址不匹配 |
| `R0rt1z2/huawei-unlock` | 华为 EMUI 8 自动 kallsyms 解析 + SELinux 绕过 | 能正确找到符号地址，但 kallsyms 解析部分卡死 |
| `llccd/TempRoot-Huawei` | P20 Pro 专用，硬编码符号地址 | 方法对（Bypass 5），但地址需针对每台设备调整 |
| `grant-h/qu1ckr00t` | Pixel 2 通用 exploit | 写 `selinux_enforcing` 的方法对我们不适用 |
| Klecko Blog | SELinux 绕过 6 种方法详解 | 关键参考，确认 Bypass 5 在华为设备上可行 |

## 关键发现

### 对 WAS-AL00 有效的操作
- ❌ `selinux_enforcing` 写 0 — 宏定义，无变量
- ❌ AVC cache 覆盖 — 节点只读
- ❌ SID 修改 — security 结构只读
- ❌ `security_hook_heads` 修改 — 需 GPU DMA，太复杂
- ❌ `init_user_ns` 计算 KASLR — 编译时地址未知
- ❌ `fair_sched_class` 计算 KASLR — 符号地址偏移未知
- ⚠️ Bypass 5 (overwrite mapping) — 理论上可行，但地址表偏移问题未解决
- ✅ 临时 root (uid=0 + caps) — 已稳定实现

### 对 WAS-AL00 无效的防御
- `selinux_enforcing` 写保护 ✅（宏定义）
- `avc_node` 只读保护 ✅（HKIP）
- `cred->security` 只读保护 ✅（HKIP）
- `selinux_pool` 只读保护 ✅（HKIP）
- `ss_initialized` 只读保护 ✅（HKIP）

## 最终结论

**华为 WAS-AL00 (Android 8.0.0, kernel 4.4.23) 的 SELinux 保护机制非常完善，结合了宏定义硬编码、HKIP 超管理器内存保护和 kallsyms 地址随机化。通过纯软件 temproot 路径提取微信数据库的尝试，在已有公开资料和技术条件下，未能成功。**

Klecko 提出的 Bypass 5（overwrite mapping）理论上可行，但需要精确的 kallsyms 地址表定位，而这台设备的 kallsyms 表解析存在偏移问题，反复尝试可能导致设备崩溃，风险不可控。

## 致谢
- Klecko (SELinux bypasses 博客)
- 8kSec (Android SELinux Internals 系列)
- willboka, R0rt1z2, llccd, grant-h, chompie1337 (开源项目)
- Google Project Zero (CVE-2019-2215 发现)

---

*文档编写日期：2026-08-12*
*设备：Huawei WAS-AL00*
*最终状态：设备安全，数据完整，bootloader 未解锁*
