---
title: 'One API Android APK 方案完整文档'
date: 2026-06-29
---

# One API Android APK 方案完整文档

## 架构

```
┌──────────────────────────────────────────────────┐
│  OneAPI Runner (Android APK)                      │
│                                                    │
│  ┌───────────────┐   SharedPrefs    ┌────────────┐ │
│  │ MainActivity   │ ───存/读配置───▶ │ OneApiSvc  │ │
│  │ (原生配置界面)  │ ◀──状态/日志───  │ (前台服务)  │ │
│  │                │                  │            │ │
│  │ · 端口输入      │                  │ 1. 写resolv│ │
│  │ · DNS输入       │                  │ 2. LD_PRE  │ │
│  │ · 启停按钮      │                  │ 3. spawn   │ │
│  │ · 日志滚动      │                  │ 4. destroy │ │
│  │ · 管理后台按钮  │                  │            │ │
│  └───────────────┘                  └─────┬──────┘ │
│                                          │        │
│  ┌───────────────┐                  ┌────▼──────┐ │
│  │ WebViewActiv. │◀───http───      │liboneapi.so│ │
│  │ (管理后台)     │   127.0.0.1:3k  │(Go二进制)   │ │
│  │ :3000         │                  │+LD_PRELOAD │ │
│  └───────────────┘                  └───────────┘ │
└──────────────────────────────────────────────────┘
```

## 核心技术问题与解决方案

### 问题：Android 子进程无法解析 DNS

Android 原生二进制（通过 `ProcessBuilder` 启动）的 DNS 问题：
- Android DNS 走 Binder → netd，子进程没有正确的 Binder context
- Go 内置解析器读 `/etc/resolv.conf` → Android 上没有 / 指向 `[::1]:53`（不可达）

#### 解决方案：LD_PRELOAD + CUSTOM_RESOLV_CONF

1. **Java 层写自定义 resolv.conf** 到 `filesDir/resolv.conf`
2. **NDK 编译 libdns_hook.so** 拦截 `open("/etc/resolv.conf")` → 重定向到自定义文件
3. **Go 用内置解析器**（`GODEBUG=netdns=go=1`），读到的就是自定义 DNS

### 问题：Go 交叉编译到 Android

关键参数：
- `CC=aarch64-linux-android31-clang` (NDK r27c)
- `CGO_ENABLED=1` (需要 SQLite, 不能用纯 Go SQLite stub)
- `GOOS=android GOARCH=arm64`
- `-tags 'osusergo'` (不用 `netgo`，否则 DNS 无法切换)
- `-buildmode=pie` (Android 5.0+ 必须 PIE)
- `-ldflags '-s -w -extldflags "-Wl,-z,max-page-size=4096"'` (去符号 + 优化对齐)

TLS alignment bug: ARM64 Bionic 要求 p_align=64，Go 编译出来的可能是 8，需用 `align_fix.py` 修补。

## 文件清单

### Android 项目 (`oneapi-apk/`)

| 文件 | 作用 |
|------|------|
| `build.gradle` | 项目级 AGP 8.9.1 配置 |
| `app/build.gradle` | 模块级构建 + NDK CMake 配置 |
| `app/src/main/AndroidManifest.xml` | 权限 + Activity/Service 声明 |
| `app/src/main/java/.../MainActivity.java` | 原生配置界面 (端口, DNS, 启停, 日志) |
| `app/src/main/java/.../OneApiService.java` | 前台服务, 管理 Go 进程生命周期 |
| `app/src/main/java/.../WebViewActivity.java` | WebView 加载管理后台 127.0.0.1:3000 |
| `app/src/main/res/layout/activity_main.xml` | 主界面布局 |
| `app/src/main/res/layout/activity_webview.xml` | WebView 布局 |
| `app/src/main/res/values/themes.xml` | AppTheme (AppCompat.Light.NoActionBar) |
| `app/src/main/cpp/dns_hook.c` | LD_PRELOAD 库: 拦截 /etc/resolv.conf |
| `app/src/main/cpp/CMakeLists.txt` | NDK CMake 构建配置 |
| `app/src/main/jniLibs/arm64-v8a/liboneapi.so` | 交叉编译的 One API 二进制 |
| `app/src/main/assets/cl100k_base.tiktoken` | tiktoken tokenizer 缓存文件 |
| `align_fix.py` | 修补 ELF PT_TLS alignment 8→64 |

### Go 项目 (`one-api/`)

| 文件/目录 | 作用 |
|-----------|------|
| `main.go` | 入口, `//go:embed web/build/*` 嵌入前端 |
| `router/web.go` | 前端静态文件路由 |
| `relay/adaptor/openai/token.go` | Token encoder 初始化 |
| `web/default/` | React 前端源码 |
| `web/build/default/` | React 构建产物 (Go embed 包含) |

## 构建步骤

### 1. 编译前端
```
cd <one-api>/web/default
npm install
$env:DISABLE_ESLINT_PLUGIN = "true"
npm run build
Move-Item build ../build/default
```

### 2. 交叉编译 Go 二进制
```
$env:CC = "<NDK>/toolchains/llvm/prebuilt/windows-x86_64/bin/aarch64-linux-android31-clang.cmd"
$env:CGO_ENABLED = "1"
$env:GOOS = "android"
$env:GOARCH = "arm64"
cd <one-api>
go build -tags 'osusergo' -buildmode=pie `
  -ldflags '-s -w -extldflags "-Wl,-z,max-page-size=4096"' `
  -o ../one-api-android
```

### 3. 修补 TLS alignment
```
python align_fix.py ../one-api-android
```

### 4. 复制到 APK 项目
```
Copy-Item ../one-api-android oneapi-apk/app/src/main/jniLibs/arm64-v8a/liboneapi.so -Force
```

### 5. 构建 APK
```
cd oneapi-apk
.\gradlew.bat assembleDebug
```

### 6. 安装
```
adb uninstall com.example.oneapi
adb install OneAPI.apk
```

## 关键环境变量 (传给 Go 进程)

| 变量 | 值 | 作用 |
|------|-----|------|
| `TIKTOKEN_CACHE_DIR` | `{workDir}/tiktoken` | Tokenizer 缓存目录 |
| `GODEBUG` | `netdns=go=1` | 强制 Go 内置 DNS 解析器 |
| `CUSTOM_RESOLV_CONF` | `{workDir}/resolv.conf` | 自定义 resolv.conf 路径 (给 LD_PRELOAD) |
| `LD_PRELOAD` | `{libDir}/libdns_hook.so` | 注入 DNS 重定向库 |

## Android 版本兼容性

| 层级 | 最低版本 | 说明 |
|------|----------|------|
| **APK (Java)** | Android 9 (API 28) | `minSdk 28`, Gradle 编译限制 |
| **Go 二进制** | Android 12 (API 31) | NDK 编译器 `aarch64-linux-android31-clang`, 链接 API 31+ Bionic |
| **ARM64** | Android 5.0+ (API 21+) | 仅支持 arm64-v8a |
| **PIE** | Android 5.0+ (API 21+) | `-buildmode=pie` 强制要求 |

### 实际支持: Android 12+ (API 31), arm64-v8a

如果想支持更低版本 (Android 9~11):
- 将编译器改为 `aarch64-linux-android28-clang`
- NDK 目录下有 `aarch64-linux-android{21,24,26,28,29,30,31,32,33,34,35}-clang`
- 数字越低, 兼容版本越老, 但可能缺失较新的 libc 符号

### 硬件要求
- CPU: ARM64 (arm64-v8a), 不支持 32 位 ARM
- RAM: 至少 256MB (One API 约占用 80~150MB)
- 存储: APK 约 35MB, 运行时额外 ~80MB (SQLite 数据库)

## 使用方式

1. 安装 APK, 打开 "OneAPI Runner"
2. 配置端口 (默认 3000) 和 DNS 服务器 (默认 8.8.8.8,8.8.4.4)
3. 点「启动」→ 等待状态变为「运行中」
4. 点「管理后台」→ WebView 加载 One API 登录页
5. 默认账号: `root` / `123456`
6. 局域网其他设备访问: `http://<手机IP>:3000`

## 停止

- App 内点「停止」
- 或杀掉 App 进程 (服务会自动停止并清理)
