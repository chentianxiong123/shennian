---
title: 'ZTE UZ901 热点 + ADB 探索总结'
date: 2026-07-02
---

# ZTE UZ901 热点 + ADB 探索总结

## 一、硬件信息

| 项 | 值 |
|---|---|
| 型号 | ZTE UZ901 |
| SoC | Spreadtrum ZX297520V3 |
| CPU | ARMv7 rev 4 (v7l), 1241 BogoMIPS |
| 特性 | swp half thumb fastmult edsp tls (无 VFP/NEON) |
| RAM | 22112 KB total, ~2080 KB free |
| Flash | 8MB SPI-NOR, 6 MTD 分区 |
| USB 控制器 | zx29_hsotg.0 (DWC OTG, 0x01500000-0x0153ffff) |
| USB 模式 | Gadget/Peripheral 模式, 无 USB Host 支持 |
| Kernel | Linux 3.4.110-rt, monolitic (无模块) |
| libc | uclibc 0.9.33.2 |
| Cross-compiler | arm-linux-musleabihf-gcc 11.2.1 |

### CPU 架构关键点
- ARM EABI (r7 传 syscall 号)
- 无 VFP/NEON → 编译必须加 `-mfloat-abi=soft` 否则 SIGILL
- 栈 128KB, RAM 紧张 → 只能 `-nostdlib` 纯 syscall, libc 链接的二进制 (154KB+) 被 OOM-kill

### Flash 分区

| 分区 | 大小 | 文件系统 | 读写 |
|---|---|---|---|
| rootfs | 3.0 MB | squashfs | 只读, 100% 满 |
| imagefs | 4.1 MB | JFFS2 | 只读, 64KB 空闲 |
| userdata | 384 KB | JFFS2 | **读写**, 244KB 空闲 |
| /tmp | ~10 MB | tmpfs | 读写, RAM 中 |

二进制只能放 /tmp (RAM) 或 userdata (JFFS2, 244KB 空闲)

---

## 二、ADB 协议分析 (AOSP 源码研究)

来源: https://android.googlesource.com/platform/packages/modules/adb/

### 2.1 架构分层

```
ADB Client (adb 命令行) -- TCP:5037 --> ADB Server (pc 后台进程) -- USB/TCP --> ADBD (手机端)
```

- PC 端编译: `ADB_HOST=1` (adb + adb server)
- 设备端编译: `ADB_HOST=0` (adbd 守护进程)
- 两者共享同一套协议和消息格式

### 2.2 消息格式 (24 字节定长头 + 变长负载)

```c
struct amessage {
    unsigned command;     // A_CNXN / A_AUTH / A_OPEN / A_OKAY / A_WRTE / A_CLSE
    unsigned arg0;        // 参数 0
    unsigned arg1;        // 参数 1
    unsigned data_length; // 负载长度
    unsigned data_check;  // 校验和 (高版本可跳过)
    unsigned magic;       // command ^ 0xffffffff
};
// 小端序
```

### 2.3 协议常量

```
A_CNXN = 0x4e584e43  ("CNXN")
A_AUTH = 0x48545541  ("AUTH")
A_OPEN = 0x4e45504f  ("OPEN")
A_OKAY = 0x59414b4f  ("OKAY")
A_CLSE = 0x45534c43  ("CLSE")
A_WRTE = 0x45545257  ("WRTE")
A_STLS = 0x534c5453  ("STLS", TLS 升级)
```

### 2.4 认证握手流程

```
Host (ADB Server)                        Device (adbd)
  |                                           |
  |--- A_CNXN(version, maxdata, banner) ----> |
  |                                           |
  |<--- A_AUTH(TOKEN=1, 0, 20字节随机数) ---- |
  |                                           |
  |  (用私钥签名 token)                       |
  |                                           |
  |--- A_AUTH(SIGNATURE=2, 0, RSA签名) ---->  |
  |                                           |
  |  (用已存公钥验证签名)                     |
  |                                           |
  |  若签名通过: <--- A_CNXN(...) ----------- |
  |  若失败: <--- A_AUTH(TOKEN, 新随机数) --- |
  |                                           |
  |  (尝试下一个私钥, 全部失败后:)             |
  |--- A_AUTH(RSAPUBLICKEY=3, 0, 公钥) ---->  |
  |                                           |
  |  手机弹出认证对话框, 用户确认后:          |
  |  <--- A_CNXN(...) ----------------------- |
```

### 2.5 AUTH 类型 (arg0)

| 值 | 宏 | 含义 |
|---|---|---|
| 1 | ADB_AUTH_TOKEN | 挑战: 20 字节随机数 |
| 2 | ADB_AUTH_SIGNATURE | 响应: RSA-2048 签名 |
| 3 | ADB_AUTH_RSAPUBLICKEY | 响应: 公钥 (触发弹窗) |

### 2.6 OPEN 服务流程

```
Host                              Device
  |-- A_OPEN(local_id, 0, "tcpip:5555") -->|
  |                                         |
  |<-- A_OKAY(remote_id, local_id, "") -----|
  |                                         |
  |  设备端 restart_tcp_service():          |
  |  写 "restarting in TCP mode port: 5555" |
  |  设 service.adb.tcp.port=5555           |
  |  init 重启 adbd, adbd 开始 TCP 监听     |
```

### 2.7 CNXN BANNER

- Host: `"host::"` 开头
- Device: `"device::"` 开头 + 属性 (ro.product.name, 等)

### 2.8 传输层抽象

ADB 使用 `atransport` 结构体抽象传输层:

| 传输类型 | 实现文件 | 说明 |
|---|---|---|
| USB Transport | transport_usb.cpp | 主机侧 libusb, 设备侧 FunctionFS |
| TCP Transport | transport_fd.cpp | 标准 socket, 支持断线重连 |
| Local Transport | transport_local.cpp | 模拟器连接 |

认证握手在 `adb_auth.cpp` 中完成, 传输层无关。

---

## 三、RSA-2048 + SHA-1 签名实现

### 3.1 SHA-1 实现

标准 SHA-1 (FIPS 180-4), 3 个函数:
- `sha1_init()`: 初始化 5 个状态字 + 计数器
- `sha1_update()`: 增量更新, 64 字节分块
- `sha1_final()`: 填充 + 输出 20 字节摘要

### 3.2 大整数运算库 (2048-bit)

`bn` 结构体: 64 × u32 limbs (共 256 字节)

实现的操作:
- `bn_zero` / `bn_is_zero`
- `bn_is_bit_set`
- `bn_cmp` (大小比较)
- `bn_copy`
- `bn_add` / `bn_sub`
- `bn_from_bytes` / `bn_to_bytes` (大端 ↔ 小端 limbs)
- `bn_mul` (128 limbs 临时缓冲区)
- `mont_mul` (Montgomery 模乘, 含 np0 预计算)
- `mod_pow` (从左到右平方-乘 Montgomery 模幂)

### 3.3 Montgomery 模幂算法

```
输入: m (消息), e (私钥 d), n (模数)
输出: m^e mod n

1. 计算 np0 = -n0^(-1) mod 2^32  (Newton 迭代 5 次)
2. 计算 R = 2^2048 mod n (2048 次加倍减 n)
3. 转换到 Montgomery 域: mr = mont_mul(m, R, n)
4. 平方-乘:
   rr = R  (Montgomery 域中的 1)
   从最高位到最低位:
     rr = mont_mul(rr, rr, n)       // 平方
     若位为 1: rr = mont_mul(rr, mr, n) // 乘
5. 转回: rr = mont_mul(rr, 1, n)  (Montgomery 归约)
```

### 3.4 RSA 签名

1. SHA-1(token) → 20 字节 hash
2. PKCS1.5 v1.5 填充:
   `00 01 FF..FF 00 [SHA-1 DigestInfo DER] [20字节 hash]`
   DigistInfo DER = 15 字节 (06 05 2B 0E 03 02 1A 05 00 04 14)
   总长: 256 字节
3. `m^d mod n` (mod_pow)
4. 输出 256 字节签名

---

## 四、PKCS#8 PEM/DER 解析器

### 4.1 PEM 解析
- 定位 `-----BEGIN PRIVATE KEY-----`
- 提取 base64 字符
- 解码为 DER 二进制

### 4.2 DER 解析
- 递归 SEQUENCE/INTEGER/OCTET STRING 遍历
- PKCS#8 结构树:

```
SEQUENCE
├── INTEGER (version=0)
├── SEQUENCE (AlgorithmIdentifier)
│   ├── OID (rsaEncryption = 1.2.840.113549.1.1.1)
│   └── NULL
└── OCTET STRING
    └── SEQUENCE (RSAPrivateKey)
        ├── INTEGER (version=0)
        ├── INTEGER (n, 2048-bit)
        ├── INTEGER (e)
        ├── INTEGER (d, 私钥指数)
        ├── ... (p, q, dp, dq, qinv)
```

### 4.3 大端 DER → bn

逐字节左移 8 位, 累加:
```c
for (i = 0; i < len; i++) {
    // bn <<= 8
    for (j = 0; j < BN_LIMBS; j++) {
        u64 sum = ((u64)val->d[j] << 8) | carry;
        val->d[j] = (u32)sum;
        carry = sum >> 32;
    }
    val->d[0] += p[i];
}
```

---

## 五、热点 USB 子系统分析

### 5.1 USB Gadget (设备模式)

当前配置 (激活中): `rndis,diag,adb,serial,mass_storage`

可用 function:
- `f_adb` → `/dev/android_adb`
- `f_acm` → CDC ACM 串口
- `f_serial` → 串口
- `f_rndis` → RNDIS 虚拟网卡
- `f_ecm` → ECM 网卡
- `f_mbim` → MBIM
- `f_mass_storage` → 存储
- `f_diag` → 诊断

uevent 确认: `DEVTYPE=gadget`, `USB_UDC_NAME=dwc_otg_pcd`

### 5.2 USB Host 状态

- `/sys/bus/usb/` — **不存在**
- `/dev/bus/usb/` — **不存在**
- `/dev/usb-ffs/` — **不存在**
- `/dev/mem` — **不存在**
- 无 USB 内核模块 (`lsmod` 空)
- 仅有 platform/clock source/i2c/mmc/sdio/serio 总线

结论: **内核无 USB Host 栈, 用户态无法访问 USB 控制器寄存器.**

### 5.3 OTG 可能性

zx29_hsotg 支持 OTG, 但当前驱动只绑定为 gadget:
```
USB_UDC_DRIVER=android_usb
```

无 EHCI/OHCI 或 dwc2 host 模式驱动。即使 ID pin 接地, 内核无法处理 Host 会话。

---

## 六、编译环境与限制

### 6.1 工具链

```
/opt/arm-linux-musleabihf-cross/bin/arm-linux-musleabihf-gcc
GCC 11.2.1, musl 1.2.2
Target: arm-linux-musleabihf
```

### 6.2 编译参数 (已验证)

```
arm-linux-musleabihf-gcc \
    -Os \
    -ffreestanding \
    -nostdlib \
    -static \
    -no-pie \
    -mfloat-abi=soft \
    -Wl,-z,max-page-size=0x10000 \
    -Wl,-z,norelro \
    -lgcc \
    -o binary source.c
```

关键:
- `-mfloat-abi=soft`: 必须, 否则 VFP 指令导致 SIGILL
- `-nostdlib`: 必须, 否则 musl libc 导致 OOM (154KB+)
- `-Wl,-z,max-page-size=0x10000`: 对齐 64KB, 减小 ELF 段
- `-lgcc`: 提供 `__aeabi_uidiv` 等整数除法辅助

### 6.3 ARM EABI Syscall 约定

| syscall | 编号 | r0 | r1 | r2 | r7 |
|---|---|---|---|---|---|
| exit | 1 | exit_code | - | - | 1 |
| read | 3 | fd | buf | len | 3 |
| write | 4 | fd | buf | len | 4 |
| close | 6 | fd | - | - | 6 |
| socket | 281 | domain | type | protocol | 281 |
| connect | 283 | fd | &sa | addrlen | 283 |

### 6.4 GCC register asm 陷阱

`register long rX asm("rX")` 在 `-Os` 下跨函数调用不可靠。
GCC 11.2.1 arm-linux-musleabihf 可能在函数调用后丢失寄存器绑定值。

**结论**: 全部 syscall 使用纯 inline asm + `"r"` 约束。
推荐模式:
```c
int ret, nr = SYS_xxx;
asm volatile(
    "mov r0, %1\n\t"
    "mov r7, %2\n\t"
    "svc #0\n\t"
    "mov %0, r0"
    : "=r"(ret)
    : "r"(arg0), "r"(nr)
    : "r0", "r7", "cc"
);
```

---

## 七、minihtc 工程状态

### 7.1 功能清单

| 功能 | 实现 | 验证 |
|---|---|---|
| ARM EABI syscall (read/write/close/exit) | inline asm | 通过 |
| TCP socket + connect | inline asm | 通过 (tcptest 验证) |
| SHA-1 | 纯 C 实现 | 未独立验证 |
| bn 2048-bit 大数库 | 64 limbs + Montgomery | 未独立验证 |
| mod_pow (模幂) | Montgomery 平方-乘 | 未独立验证 |
| rsa_sign | SHA-1 + PKCS1.5 + mod_pow | 未独立验证 |
| PEM/DER 解析 | base64 + DER 递归遍历 | 部分验证 (key parse failed) |
| ADB CNXN/AUTH/OPEN | 完整协议 | 部分验证 (TCP connected) |
| 内嵌 adbkey | xxd 数组 | 可用 |

### 7.2 当前文件

- `minihtc.c` — 主程序 (898 行, ~9KB)
- `adbkey_all.h` — 内嵌 adbkey.pem + adbkey.pub
- `build-minihtc.sh` — 编译脚本

### 7.3 已知问题

1. **VFP 指令**: 早期版本含 `vmov s15, r7`, 加 `-mfloat-abi=soft` 修复
2. **tcp_connect 内联**: 被编译器内联到 mini_main, 栈帧膨胀
3. **tcp_connect debug 残留**: 含 `write("CONN\n")`, `write("FAIL\n")`, `write("OK\n")`
4. **help 命令被 argc<3 拦截**: help 需要 2 个参数, 但 argc<3 提前 exit
5. **栈使用**: rsa_sign 中 bn 256 字节 × 多个 + u32 t[128] (512 字节), 总 ~2KB
6. **连接挂起**: 推送到热点后 `Connecting to 192.168.100.101...` 后挂起 ~15s
7. **大数无边界检查**: DER 解析/base64/bn 运算无溢出保护

### 7.4 与 tcptest 关键对比

tcptest (972 bytes, nostdlib) 在热点上 connect 成功, minihtc 挂起。
差异: tcptest 在 main 函数内完成所有操作, minihtc 有函数调用层次。

### 7.5 minihtc.c 源码结构

| 段落 | 行号 | 功能 |
|---|---|---|
| 系统层 | 1-68 | type defines, memset/memcpy, syscall inline asm |
| 打印函数 | 70-88 | prints / print_e |
| SHA-1 | 90-175 | sha1_init/update/final |
| 大数库 | 177-371 | bn 64 limbs, mont_mul, mod_pow |
| DER 解析 | 373-548 | base64 + DER 递归, parse_pkcs8_pem |
| ADB 协议 | 550-698 | tcp_connect, send_msg, recv_msg, rsa_sign |
| 主程序 | 700-898 | _start → mini_main: 参数解析→TCP→AUTH→OPEN |

### 7.6 已知 Bug 明细

1. **VFP 指令**: 早期编译无 `-mfloat-abi=soft`, 含 `vmov s15, r7`, 热点 CPU 无 VFP → SIGILL
2. **tcp_connect 内联**: -Os 下被编译器内联到 mini_main, 栈帧膨胀
3. **debug 残留**: tcp_connect 中含 `write("CONN\n")` / `write("FAIL\n")` / `write("OK\n")` asm 块
4. **help 命令拦截**: `if (argc < 3)` 在 cmd 检查前, help (argc=2) 被 exit(1) 拦截
5. **栈使用过高**: rsa_sign 中 bn 256 字节 × 多个 + u32 t[128] (512 字节), 总 ~2.5KB
6. **连接挂起**: 推送到热点后 `Connecting to 192.168.100.101...` 后挂起 ~15s（原因：VFP SIGILL 或 register asm 优化异常）
7. **大数无边界检查**: DER 解析/base64/bn 运算无溢出保护
8. **memcpy 符号可见性**: 早期 `static` 导致链接时 `-mfloat-abi=soft` 找不到 memcpy

### 7.7 相关工具链文件

| 文件 | 说明 |
|---|---|
| minihtc.c | 主程序 898 行, 已删除 |
| adbkey_all.h | 内嵌 adbkey.pem + adbkey.pub, 已重建 |
| build-minihtc.sh | 编译脚本, 已删除 |
| tcptest.c | TCP connect 验证程序 (972 bytes), 已删除 |

---

## 八、各方案可行性评估

| 方案 | 可行性 | 关键障碍 | 变通 |
|---|---|---|---|
| 热点 USB Host → 手机 | ❌ 不可行 | 内核无 USB Host 栈, /dev/mem 不可用 | 重编内核 (需源码) |
| 热点 ADB over TCP 连手机 | ⚠️ 条件可行 | 手机需先开 `tcpip:5555`, 重启后失效 | 手机 root + 开机自启 |
| 手机 OTG + 热点 Gadget | ⚠️ 条件可行 | 手机需 ADB Client 软件 | 需 APK 转发 |
| RNDIS 网桥 + ADB over TCP | ⚠️ 条件可行 | 手机侧需 adbd 在 TCP 模式 | 需 root 或工程模式 |
| ttyGS 串口 + ADB | ⚠️ 条件可行 | 手机侧需桥接软件 | 需 APK + 权限 |
| 手机 root + Magisk 模块 | ✅ 最简 | 需一次 USB 刷机 | 永久生效 |
| 用 RPi Zero / OpenWrt | ✅ 可行 | 硬件成本 | USB Host 原生支持 |

---

## 九、关键经验与教训

### GCC Cross-compiler
- arm-linux-musleabihf 是 **hard-float** 工具链, 编译嵌入设备必须加 `-mfloat-abi=soft`
- `-nostdlib` 时 libgcc 提供除法等辅助, 但 memcpy 需要自己实现 (非 static)
- 二进制大小: nostdlib C 程序 ~5-9KB; musl-dynamic ~154KB+ → OOM

### USB Gadget 模式与 Host 模式的对称性
- ADB 协议本身是对称的, host/device 共享消息格式
- 但 Linux USB 驱动栈分歧大: gadget 用 FunctionFS, host 用 libusb/EHCI
- 同一硬件不能同时当 host 和 gadget (除非 OTG 切换)

### ADB 认证的传输无关性
- AUTH TOKEN → SIGNATURE → RSAPUBLICKEY 流程独立于传输层
- TCP、USB、串口都能跑同一套认证
- 传输层只需提供可靠的双向字节流

### 嵌入设备的 Bufferbloat
- connect() 超时默认 20-30 秒 (TCP SYN 重试)
- 调试时需考虑输出缓冲, 写 syscall 是同步的但 adb shell 的管道有缓冲
- 嵌入式 Linux 无 /dev/mem 是常见安全配置, 不是此设备特例

---

*文档生成日期: 2026-07-02*
*相关代码: C:\Users\a1\AppData\Local\Temp\opencode\minihtc.c*
