---
title: 'tcpfwd — TCP 端口转发 (nostdlib ARM)'
date: 2026-07-02
---

# tcpfwd — TCP 端口转发 (nostdlib ARM)

## 基本信息

| 项目 | 值 |
|---|---|
| 源文件 | `tcpfwd.c` (248 行) |
| 编译产物 | `tcpfwd` (1864 bytes) |
| 目标平台 | ZTE UZ901 热点 (ARMv7, Linux 3.4.110) |
| 工具链 | `arm-linux-gnueabihf-gcc -static -nostdlib -Os -s` |
| 工作目录 | `/tmp/` (RAM) 或 `/mnt/userdata/` (JFFS2) |

## 架构

```
 ┌──────────┐     TCP     ┌──────────┐     TCP     ┌──────────┐
 │  Client  │ ←────────→ │  tcpfwd  │ ←────────→ │  Target   │
 │ (browser)│   listen    │  (hotspot)│   connect  │ (server)  │
 └──────────┘    port     └──────────┘    ip:port  └──────────┘
```

单线程、同步阻塞 poll 模型。每个连接串行处理（接受 → 转发 → 关闭 → 下一个）。

## 源码结构

### 1. 数据类型 (17-28行)

```c
struct sockaddr_in { short sin_family; ushort sin_port; uint sin_addr; char pad[8]; };
struct pollfd { int fd; short events; short revents; };
```

### 2. Syscall 包装层 (30-56行)

ARM EABI 纯内联汇编，`r7` 传 syscall 号，`r0-r4` 传参数。

```c
static long s5(long n, long a0, long a1, long a2, long a3, long a4) {
    register long r0 asm("r0") = a0;
    register long r1 asm("r1") = a1;
    register long r2 asm("r2") = a2;
    register long r3 asm("r3") = a3;
    register long r4 asm("r4") = a4;
    register long r7 asm("r7") = n;
    asm volatile("svc #0" : "+r"(r0) : "r"(r1), "r"(r2), "r"(r3), "r"(r4), "r"(r7) : "memory", "cc");
    return r0;
}
```

简化宏：
- `s3(n,a0,a1,a2)` → 3 参数 syscall
- `s2(n,a0,a1)` → 2 参数 syscall  
- `s1(n,a0)` → 1 参数 syscall

**Syscall 映射**

| 宏 | 编号 | 说明 |
|---|---|---|
| `exit(n)` | 1 | 退出 |
| `read(f,b,l)` | 3 | 读文件/套接字 |
| `write(f,b,l)` | 4 | 写文件/套接字 |
| `open(p,f,m)` | 5 | 打开文件 |
| `close(fd)` | 6 | 关闭 fd |
| `poll(f,n,t)` | 168 | IO 多路复用 |
| `socket(d,t,p)` | 281 | 创建套接字 |
| `bind(f,a,l)` | 282 | 绑定端口 |
| `connect(f,a,l)` | 283 | 连接目标 |
| `listen(f,b)` | 284 | 监听 |
| `accept(f,a,l)` | 285 | 接受连接 |
| `setsockopt(f,l,o,v,s)` | 294 | 设置选项 |

### 3. 工具函数 (58-93行)

- `writestr(fd, s)` — 写字符串到 fd（自动计算长度）
- `htons(x)` — 主机序转网络序（大小端交换）
- `parse_ip(out, pp)` — 解析 IP 字符串 "1.2.3.4" → `u32`
- `parse_port(pp)` — 解析端口字符串 "8080" → `int`
- `skip_spaces(pp)` — 跳过空白字符

### 4. 转发核心 proxy_loop (95-142行)

```c
static void proxy_loop(int cfd, int tfd) {
    char buf[4096];
    while (1) {
        struct pollfd pfds[2];      // 监视两个 fd
        pfds[0] = {cfd, POLLIN};
        pfds[1] = {tfd, POLLIN};

        int r = poll(pfds, 2, -1); // 阻塞等待
        if (r <= 0) break;

        // 检查错误事件
        if (pfds[0].revents & (POLLERR|POLLHUP|POLLNVAL)) break;
        if (pfds[1].revents & (POLLERR|POLLHUP|POLLNVAL)) break;

        // client → target
        if (pfds[0].revents & POLLIN) {
            r = read(cfd, buf, sizeof(buf));
            if (r <= 0) break;
            // 全部写出（处理短写）
            char *bp = buf; int left = r;
            while (left > 0) {
                int w = write(tfd, bp, left);
                if (w <= 0) break;
                bp += w; left -= w;
            }
            if (left > 0) break;
        }

        // target → client (同上)
        if (pfds[1].revents & POLLIN) { ... }

        // 一方关闭后 break 并 close 两个 fd
    }
    close(cfd); close(tfd);
}
```

**关键设计：**
- 单 4KB 缓冲区，两个方向共用（串行 poll，不会同时读写）
- `while (left > 0)` 循环处理短写（write 可能未写完所有字节）
- 任何方向 read ≤ 0 或 write ≤ 0 都断开整个连接
- poll 超时 -1（无限等待）

### 5. 入口 _start (144-247行)

```
_start
 ├── open("/tmp/tcpfwd.conf", O_RDONLY)
 ├── read 配置 (最大 512 字节)
 ├── parse: 跳过 # 注释和空行
 │   └── listen_port target_ip target_port
 ├── socket → bind → listen
 ├── writestr("tcpfwd: running\n")
 └── loop:
     ├── accept → 新 client fd
     ├── socket → connect target
     ├── proxy_loop(cfd, tfd)
     └── 断开后回到 accept
```

## 配置格式

`/tmp/tcpfwd.conf`:

```
8080 192.168.1.100 3000
# 或带注释:
# 转发热点 8080 → 内网服务器 3000
```

- 只解析第一行有效规则
- 支持 `#` 行注释
- 支持空行

## 编译

```bash
arm-linux-gnueabihf-gcc -static -nostdlib -Os -s \
    -o tcpfwd tcpfwd.c
```

或使用 WSL:
```bash
/opt/arm-linux-musleabihf-cross/bin/arm-linux-musleabihf-gcc \
    -static -nostdlib -Os -s -mfloat-abi=soft \
    -o tcpfwd tcpfwd.c
```

## 部署

```bash
adb push tcpfwd /tmp/
adb shell chmod +x /tmp/tcpfwd
echo "8080 192.168.1.100 3000" | adb shell tee /tmp/tcpfwd.conf
adb shell "/tmp/tcpfwd &"
```

## 限制

| 限制 | 说明 |
|---|---|
| 单连接串行 | 一次只能转发一个连接，完成后才 accept 下一个 |
| 无 fork/线程 | 无法并发处理多个连接 |
| 无超时 | poll(-1) 永久阻塞，僵尸连接不回收 |
| 4KB 缓冲区 | 超过 4KB 报文需多次 poll 转发 |
| 单规则 | config 只读第一条规则 |
| config 512B | 文件最大 512 字节 |
| 硬编码路径 | config 只读 `/tmp/tcpfwd.conf` |

## 已知 Bug

1. **config 路径混淆**: 头注释写 `/mnt/userdata/tcpfwd.conf`，代码写 `/tmp/tcpfwd.conf`
2. **无 SO_REUSEADDR 效果**: 设置了 reuse 但连接断开后有 TIME_WAIT 问题
3. **accept 空地址**: 第二个参数传 0，无法知道客户端 IP
4. **gcc register asm**: `s5` 使用 `register asm("rX")` 在 `-Os` 下跨函数调用可能被优化出错（GCC 11 已知问题）

---

*文档日期: 2026-07-02*
*相关文件: 已删除*
