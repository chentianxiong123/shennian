---
title: 'Windows 幽灵端口占用：HNS 如何无声地偷走你的端口'
date: 2026-06-27
---

# Windows 幽灵端口占用：HNS 如何无声地偷走你的端口

## 起因

事情发生在调试一个本地 Python 代理服务（deepseek-web-agent）时。用 `uvicorn` 启动 FastAPI 服务，绑定 `127.0.0.1:48391`，结果报错：

```
OSError: [WinError 10048] 通常每个套接字地址(协议/网络地址/端口)只允许使用一次。
```

第一反应：端口被占了。于是：

```bash
netstat -ano | grep 48391
```

**空的。** 没有任何进程在用这个端口。

换了个思路，用 Python 直接试：

```python
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind(('127.0.0.1', 48391))
```

报错变成了：

```
OSError: [WinError 10013] 以一种访问权限不允许的方式做了一个访问套接字的尝试。
```

**10013，不是 10048。** 这不是"端口被占用"，而是"权限拒绝"。端口没人用，但系统不让你绑。

## 第一嫌疑人：防火墙

查看 Windows 防火墙规则：

```powershell
Get-NetFirewallRule | Where-Object {
    ($_.DisplayName -like '*python*') -and $_.Action -eq 'Block'
}
```

果然找到了两条 **Block 规则**：

| DisplayName | Direction | Action | Program |
|---|---|---|---|
| Python | Inbound | **Block** | `cpython-3.11.15\python.exe` |
| Python | Inbound | **Block** | `cpython-3.11.15\python.exe` |

这是 Windows 防火墙的"查询用户"规则 — 当程序首次尝试联网时弹窗询问，如果用户选了"不允许"或弹窗超时，Windows 就自动生成一条 Block 规则。而且 **Block 规则优先级高于 Allow 规则**。

在管理员 PowerShell 里删掉：

```powershell
Get-NetFirewallRule | Where-Object {
    ($_.DisplayName -like '*python*') -and $_.Action -eq 'Block'
} | Remove-NetFirewallRule
```

满怀信心再试……**还是 10013。**

## 第二嫌疑人：端口排除范围

Windows 有端口排除机制，某些系统服务会预留端口范围：

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

```
Protocol tcp Port Exclusion Ranges

Start Port    End Port
----------    --------
      5357        5357
     50000       50059     *
     55778       55778       *
```

48391 不在任何排除范围内。排除嫌疑。

动态端口范围也不覆盖这个区间：

```powershell
netsh int ipv4 show dynamicport tcp
# Start Port: 49152, Number of Ports: 16384
```

## 关键发现：大范围端口扫描

到这里常规排查已经穷尽了。于是做了一件该早点做的事 — **全端口扫描**：

```python
import socket
for port in range(47000, 49153):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(('127.0.0.1', port))
        s.close()
    except OSError:
        failed.append(port)
```

结果：

```
失败范围: 47000-48715
```

整整 **1716 个端口**，一整块，全部 10013。

再往其他范围扫：

```
8848:     FAIL
9000-9001: FAIL
9200:     FAIL
9848-9849: FAIL
9876:     FAIL
```

一些散落的知名端口也被拦了。但 8080、30000、40000、49000 全部畅通。

**这不是防火墙的行为模式。** 防火墙是按规则匹配的，不会"精确地只拦某个端口段"。这是一种更底层的、系统级的端口预占。

## 真凶：HNS（Host Network Service）

查看正在运行的服务：

```powershell
Get-Service | Where-Object {
    $_.Status -eq 'Running' -and (
        $_.Name -like '*hns*' -or
        $_.Name -like '*vm*' -or
        $_.Name -like '*wsl*'
    )
}
```

```
hns          主机网络服务      Running
vmcompute    Hyper-V 主机计算服务  Running
WSLService   WSL Service      Running
```

**三个全在跑。**

HNS（Host Network Service）是 Windows 为 Hyper-V 和 WSL2 提供虚拟网络的核心服务。它会在启动时动态预留一大块端口范围用于 NAT、端口转发和虚拟交换机通信。

关键问题是：**HNS 的端口预留不会出现在 `netsh show excludedportrange` 里。** 这是 Windows 的已知行为 — HNS 通过 WFP (Windows Filtering Platform) 直接在内核层面锁定端口，绕过了传统的端口排除机制。

所以你用 `netstat` 看不到、用 `netsh` 查不到、用 `Get-NetTCPConnection` 也查不到。端口表面上"空闲"，但实际上被内核级的网络过滤器锁住了。

## 为什么 8080 能用？

因为 HNS 预留的是 **47000-48715** 这个区间，以及一些散落的常用端口（用于内部服务通信）。8080 不在这个范围内，自然不受影响。

## 解决方案

### 方案 1：换个端口（推荐，零成本）

用 49152 以上的端口，这是 Windows 动态端口范围的起点，HNS 通常不会碰：

```python
PORT = 49152  # 在 HNS 管辖范围之外
```

### 方案 2：手动预留端口（需要重启）

在注册表中添加端口预留，让系统在 HNS 之前先占住这个端口：

```powershell
# 管理员 PowerShell
netsh int ipv4 add excludedportrange protocol=tcp startport=48391 numberofports=10 store=persistent
```

然后**重启电脑**。但问题是 HNS 可能在你重启后重新抢走这个范围。

### 方案 3：调整 HNS 配置（治本但有副作用）

可以限制 HNS 的动态端口范围，但这会影响 WSL2 和 Hyper-V 虚拟机的网络功能。除非你真的需要那些端口，否则不建议动。

## 教训

1. **`netstat` 看不到不代表端口没被占。** Windows 有内核级的网络过滤机制，不走传统的端口注册。

2. **WinError 10013 和 10048 的区别很重要。** 10048 是"端口被占用"（别人在用），10013 是"权限拒绝"（系统不让你用）。排查方向完全不同。

3. **开了 WSL2/Hyper-V 就等于让 HNS 接管了一部分端口空间。** 这个在任何文档里都不会告诉你。

4. **大范围端口扫描是最有效的排查手段。** 当 `netstat` 和 `netsh` 都说"没问题"的时候，直接上 Python 扫一遍，几分钟就能画出完整的端口地图。

5. **Windows 的网络栈比你想象的复杂得多。** 防火墙、HNS、WFP、http.sys、动态端口……每一层都可能在你不知情的情况下拦截你的连接。

---

*写于 2026 年 6 月 26 日深夜，在被 Windows 折磨了两个小时之后。*
