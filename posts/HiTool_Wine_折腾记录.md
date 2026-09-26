---
title: 'Wine 运行 HiTool 完全指南：从安装到中文字体修复'
date: 2026-07-20
---

# Wine 运行 HiTool 完全指南：从安装到中文字体修复

> 环境：Debian 13 (Trixie) / Wine 10.0 / HiTool（华为海思烧录工具）
> 
> 最后更新：2026-07-20

---

## 一、背景

HiTool 是华为海思（Hisilicon）提供的 SoC 烧录/调试工具，仅支持 Windows。我们需要在 Linux 上通过 Wine 运行它，用于烧录 HI3798MV100 机顶盒。

本文记录了从 Wine 安装 HiTool 到解决两个核心问题（Java 崩溃 + 中文字体方框）的完整折腾链路。

---

## 二、HiTool 在 Wine 中的安装

### 2.1 前置条件

```bash
# 安装 Wine（Debian 13 自带 10.0）
sudo apt install wine

# HiTool 是绿色版，不需要安装程序，直接解压即可
# 假设解压到 /home/a1/HiTool/
```

### 2.2 HiTool 目录结构

```
HiTool/
├── HiTool.exe          # 主程序（Eclipse RCP 应用）
├── HiTool.ini          # JVM 启动配置（关键文件）
├── jre/                # 内置 JRE 8u212（32-bit，已恢复原始版本）
├── jre.adoptium/       # 备用：Adoptium JRE 8u472（曾用于排查）
├── plugins/            # Eclipse 插件
└── ExternalTools/      # 外部工具（可选）
```

### 2.3 启动 HiTool

```bash
cd /home/a1/HiTool
wine ./HiTool.exe
```

**首次启动会遇到两个问题**，下面逐一解决。

---

## 三、问题一：Java.lang.Error — GetAdaptersAddresses 崩溃

### 3.1 现象

HiTool 启动后立刻崩溃，报错：

```
java.lang.Error
    at java.net.NetworkInterface.getAll(Native Method)
    ...
```

Java 在调用 `GetAdaptersAddresses(AF_UNSPEC, ...)` 时收到错误码 13（`ERROR_INVALID_DATA`），Java 8 将此视为致命错误直接抛出 `Error`。

### 3.2 根因分析

通过交叉编译 C 程序在 Wine 中测试：

```c
// 测试 GetAdaptersAddresses 在 Wine 中的行为
ret = fn(AF_UNSPEC, flags, NULL, buf, &bufSize);
printf("AF_UNSPEC: ret=%lu (0x%08lX)\n", ret, ret);  // → 13 (ERROR_INVALID_DATA)

ret = fn(AF_INET, flags, NULL, buf, &bufSize);
printf("AF_INET:   ret=%lu (0x%08lX)\n", ret, ret);  // → 0 (SUCCESS)
```

**结论：Wine 10.0 的 `GetAdaptersAddresses` 在 `AF_UNSPEC`（同时查询 IPv4+IPv6）模式下有 bug，返回 `ERROR_INVALID_DATA`。`AF_INET`（仅 IPv4）模式正常。**

### 3.3 解决方案

在 HiTool.ini 的 `-vmargs` 末尾添加 JVM 参数，强制 Java 走 IPv4-only 代码路径：

```ini
# HiTool.ini
-vmargs
...（原有参数保持不变）
-Djava.net.preferIPv4Stack=true
```

这会让 Java 使用 `NetworkInterface.c`（IPv4 专用路径，调用 `GetIpAddrTable`）而非 `NetworkInterface_winXP.c`（调用 `GetAdaptersAddresses`），绕过 Wine 的 bug。

### 3.4 验证

修改后 HiTool 正常启动，不再报 `java.lang.Error`。仅剩一个无害的 `FileNotFoundException: ExternalTools\tools.xml`（缺少可选外部工具配置，不影响功能）。

---

## 四、问题二：中文字体显示为方框（□□□□）

### 4.1 现象

HiTool 启动后 UI 中的中文全部显示为方框，记事本等 Wine 自带程序同样如此。

### 4.2 根因分析

Wine 的中文渲染链路：

```
应用请求渲染 "你好"
  → 找到字体 Tahoma（Wine 默认系统字体）
  → Tahoma 只有拉丁字母，没有中文字形
  → 需要 glyph fallback（字形回退）去找中文字体
  → Wine 10.0 的 FontLink 回退机制不工作
  → 结果：□□
```

关键发现：**Wine 10.0 的 FontLink 字形回退机制存在缺陷**。即使在注册表中正确配置了 FontLink/SystemLink 条目，当主字体缺少字形时，Wine 不会去回退字体中查找。

### 4.3 我们尝试过的方案（均失败）

| 方案 | 做法 | 结果 |
|------|------|------|
| 复制 Noto CJK 字体到 Fonts 目录 | `cp NotoSansCJK-Regular.ttc MSYH.TTC` | ❌ Wine 注册为内部名 "Noto Sans CJK SC"，非 "Microsoft YaHei" |
| Windows FontSubstitutes 注册表 | `SimSun → Noto Serif CJK SC` | ❌ Wine 不读这个键做字形回退 |
| Wine 自己的 Replacements 键 | `HKCU\Software\Wine\Fonts\Replacements` | ❌ 可能是编码问题（需 UTF-16LE） |
| FontLink 控制值 | `FontLinkControl=0x4000` | ❌ Wine 10 的 FontLink 实现有缺陷 |
| 修正 FontLink/SystemLink 面名 | 匹配 Noto 的真实面名 | ❌ 回退机制本身不工作 |

### 4.4 最终解决方案：winetricks cjkfonts

`winetricks cjkfonts` 的思路完全不同——**它不修复字形回退，而是直接替换系统字体本身**：

1. 下载 **Source Han Sans**（思源黑体，Adobe 开源 CJK 字体）
2. 注册到 `C:\Windows\Fonts\` 和注册表
3. 通过 `HKCU\Software\Wine\Fonts\Replacements` 将**所有** Windows CJK 字体名映射到思源黑体

```bash
# 安装依赖
sudo apt install cabextract

# 下载 winetricks
wget https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks
chmod +x winetricks

# 一键安装 CJK 字体（下载约 91MB Source Han Sans + 12MB GNU Unifont）
./winetricks -q cjkfonts
```

**为什么这个方案有效：**

- 思源黑体包含完整的中日韩字形
- 所有 Windows 字体名（SimSun、Microsoft YaHei、MS Gothic 等）都被替换为思源黑体
- 应用永远不会有"找不到中文字形"的问题——因为任何字体请求都会得到一个有 CJK 支持的字体
- winetricks 使用 **UTF-16LE 编码**的 .reg 文件导入注册表（中文字符必须用 UTF-16LE）
- 这些配置写入 Wine prefix，**永久生效**（只要不删除 prefix）

### 4.5 验证

运行 `winetricks cjkfonts` 后，HiTool 和记事本的中文均正常显示。

---

## 五、JRE 版本排查（额外发现）

在排查 Java 崩溃过程中，曾怀疑是 HiTool 内置 JRE 8u212 版本太旧导致。

### 5.1 操作

- 将 HiTool 内置 JRE 8u212 备份为 `jre.bak`
- 下载 Adoptium JRE 8u472 放入 `jre/` 目录
- 测试后发现：**两个 JRE 表现完全一致**，都会在 `GetAdaptersAddresses(AF_UNSPEC)` 上崩溃

### 5.2 结论

- 崩溃与 JRE 版本无关，是 Wine 10 的 `GetAdaptersAddresses` 实现问题
- 修复方法是 HiTool.ini 中加 `-Djava.net.preferIPv4Stack=true`，与 JRE 版本无关
- 最终恢复原始 JRE 8u212（`jre.bak` → `jre`），Adoptium 8u472 保留在 `jre.adoptium/` 备用

---

## 六、折腾链路总结

```
HiTool.exe 在 Wine 中启动
  │
  ├─ 问题 1: java.lang.Error (GetAdaptersAddresses)
  │   ├─ 交叉编译 C 程序测试 → 发现 AF_UNSPEC 返回 ERROR_INVALID_DATA
  │   ├─ 阅读 JDK 源码 → 发现 Java 8 对错误码处理过于严格
  │   └─ 修复: -Djava.net.preferIPv4Stack=true ✅
  │
  └─ 问题 2: 中文方框
      ├─ 复制 Noto CJK 字体 → Wine 内部名不匹配 → 失败
      ├─ Windows FontSubstitutes → Wine 不用于字形回退 → 失败
      ├─ Wine Replacements → 编码或回退机制问题 → 失败
      ├─ FontLink 控制值 → Wine 10 实现有缺陷 → 失败
      └─ winetricks cjkfonts → 直接替换字体本身 → 成功 ✅
```

### 核心教训

1. **Wine 10 的 `GetAdaptersAddresses(AF_UNSPEC)` 有 bug**，用 `preferIPv4Stack=true` 绕过
2. **Wine 10 的 FontLink 字形回退机制不完整**，不要依赖它
3. **Wine 中文字体的正确解法是 `winetricks cjkfonts`**——用思源黑体替换所有 CJK 字体名
4. **`HKCU\Software\Wine\Fonts\Replacements` 的 .reg 文件必须用 UTF-16LE 编码**，否则中文键名无法导入
5. **HiTool.ini 中的 `-Djava.net.preferIPv4Stack=true` 是必须的**，与字体无关

---

## 七、最终 HiTool.ini

```ini
-startup
plugins/org.eclipse.equinox.launcher_1.3.0.v20130327-1440.jar
--launcher.library
plugins/org.eclipse.equinox.launcher.win32.win32.x86_1.1.200.v20140116-2212
-vm
jre\bin\javaw.exe
-vmargs
-Xverify:none
-Xms40m
-Xmx128m
-Xnoclassgc
-XX:CMSInitiatingOccupancyFraction=85
-XX:DefaultMaxRAMFraction=1
-XX:+UseParallelGC
-XX:NewRatio=8
-XX:SurvivorRatio=8
-XX:TargetSurvivorRatio=90
-XX:MaxTenuringThreshold=15
-XX:+UseBiasedLocking
-XX:CompileCommand=quiet
-XX:CompileCommand=exclude,org/eclipse/core/internal/dtree/DataTreeNode,forwardDeltaWith
-XX:CompileCommand=exclude,java/text/SimpleDateFormat,subParseZoneString
-XX:CompileCommand=exclude,org/eclipse/jdt/internal/compiler/lookup/ParameterizedMethodBinding,<init>
-Djava.net.preferIPv4Stack=true
```

---

## 八、快速复现步骤

```bash
# 1. 安装依赖
sudo apt install wine cabextract

# 2. 初始化 Wine prefix
wineboot

# 3. 安装 CJK 字体（一次性，约 100MB 下载）
wget https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks
chmod +x winetricks
./winetricks -q cjkfonts

# 4. 解压 HiTool 到 ~/HiTool/

# 5. 修改 HiTool.ini，在 -vmargs 末尾添加：
#    -Djava.net.preferIPv4Stack=true

# 6. 启动
cd ~/HiTool && wine ./HiTool.exe
```

---

*本文记录了 2026-07-20 在 Debian 13 + Wine 10.0 上折腾 HiTool 的完整过程。*
