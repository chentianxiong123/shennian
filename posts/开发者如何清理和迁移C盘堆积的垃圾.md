---
title: '开发者如何清理和迁移 C 盘堆积的垃圾：一次回收 30GB+ 的实战记录'
date: 2026-06-03
---

# 开发者如何清理和迁移 C 盘堆积的垃圾：一次回收 30GB+ 的实战记录

很多开发者都会遇到一个问题：电脑用着用着，C 盘突然爆红。

明明项目都放在 D 盘，为什么 C 盘还是越来越小？原因很简单：大量开发工具默认把缓存、运行时、全局包、浏览器内核、索引文件都塞进 C 盘用户目录。

常见路径包括：

```text
C:\Users\用户名\AppData\Local
C:\Users\用户名\AppData\Roaming
C:\Users\用户名\.gradle
C:\Users\用户名\.vscode
C:\Users\用户名\go
```

本文记录一次开发环境清理和迁移过程，重点不是单纯删文件，而是建立一套长期可维护的方案：

> **缓存能删就删，工具能迁移就迁移，环境能隔离就隔离。**

---

## 一、先定位：C 盘到底被谁吃了？

不要盲目删除，先扫描几个开发者常见的大目录。

### 1. 扫描用户目录大文件夹

```powershell
$paths = @(
  "$env:USERPROFILE\AppData\Local\uv",
  "$env:USERPROFILE\AppData\Local\pip",
  "$env:USERPROFILE\AppData\Local\JetBrains",
  "$env:USERPROFILE\AppData\Local\ms-playwright",
  "$env:USERPROFILE\AppData\Local\Temp",
  "$env:USERPROFILE\.gradle",
  "$env:USERPROFILE\.vscode",
  "$env:USERPROFILE\go",
  "$env:USERPROFILE\AppData\Roaming\npm"
)

foreach ($p in $paths) {
  if (Test-Path $p) {
    $size = (Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue |
      Measure-Object Length -Sum).Sum
    "{0,8:N0} MB  {1}" -f ([math]::Round($size / 1MB, 1)), $p
  }
}
```

### 2. 扫描已安装程序大小

```powershell
Get-ItemProperty `
  HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*, `
  HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*, `
  HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\* `
  -ErrorAction SilentlyContinue |
Where-Object { $_.DisplayName -and $_.EstimatedSize } |
Select-Object DisplayName, @{N='SizeMB';E={[math]::Round($_.EstimatedSize / 1024, 1)}} |
Sort-Object SizeMB -Descending |
Select-Object -First 30
```

---

## 二、第一类：可以直接删除的缓存

这些目录本质上都是缓存，删了最多下次重新下载或重新构建，不影响源码。

### 1. UV cache

UV 的缓存可能非常大，我这里达到 8GB+。

```powershell
uv cache clean
```

如果命令不可用，也可以直接删除：

```powershell
Remove-Item "$env:USERPROFILE\AppData\Local\uv\cache" -Recurse -Force
```

后续建议把 UV 缓存迁移到 D 盘：

```powershell
[Environment]::SetEnvironmentVariable('UV_CACHE_DIR', 'D:\uv\cache', 'User')
[Environment]::SetEnvironmentVariable('UV_PYTHON_INSTALL_DIR', 'D:\uv\python', 'User')
[Environment]::SetEnvironmentVariable('UV_TOOL_DIR', 'D:\uv\tools', 'User')
```

### 2. pip cache

如果已经不用 pip 或者已经迁移到 UV，pip 缓存可以清理。

```powershell
Remove-Item "$env:USERPROFILE\AppData\Local\pip" -Recurse -Force
```

### 3. Gradle cache

Java / Android 项目的 Gradle 缓存经常有 1GB 以上。

```powershell
Remove-Item "$env:USERPROFILE\.gradle" -Recurse -Force
```

下次构建时 Gradle 会重新下载依赖。

### 4. Go 模块缓存

如果暂时不写 Go，可以清理：

```powershell
Remove-Item "$env:USERPROFILE\go" -Recurse -Force
```

### 5. Temp 临时文件

```powershell
Remove-Item "$env:USERPROFILE\AppData\Local\Temp\*" -Recurse -Force -ErrorAction SilentlyContinue
```

有些文件被进程占用删不掉，属于正常现象。重启后再清一次即可。

---

## 三、第二类：不建议删，但适合迁移到 D 盘

有些缓存删掉会影响体验，比如 IDE 索引、Playwright 浏览器内核。更好的方式是：

> 把真实目录移动到 D 盘，再在原路径创建 Junction。

Junction 是 Windows 的目录链接，程序访问原路径时，系统会自动跳转到新路径。程序完全无感知。

### 通用迁移函数

```powershell
function Move-AndJunction($src, $dst) {
  if (-not (Test-Path $src)) {
    Write-Host "skip: $src not found"
    return
  }

  New-Item -ItemType Directory -Path (Split-Path $dst) -Force | Out-Null

  robocopy $src $dst /E /MOVE /MT:8 /NFL /NDL /NJH /NJS /NC /NS | Out-Null

  cmd /c mklink /J "$src" "$dst"
}
```

### 1. 迁移 Playwright 浏览器

Playwright 默认浏览器目录：

```text
C:\Users\用户名\AppData\Local\ms-playwright
```

迁移到 D 盘：

```powershell
Move-AndJunction `
  "$env:USERPROFILE\AppData\Local\ms-playwright" `
  "D:\ms-playwright"
```

同时建议设置环境变量，避免以后新浏览器又下载回 C 盘：

```powershell
[Environment]::SetEnvironmentVariable('PLAYWRIGHT_BROWSERS_PATH', 'D:\ms-playwright', 'User')
```

### 2. 迁移 JetBrains 缓存

JetBrains 系列 IDE 的索引和缓存很大，常见目录：

```text
C:\Users\用户名\AppData\Local\JetBrains\IntelliJIdea版本\index
C:\Users\用户名\AppData\Local\JetBrains\IntelliJIdea版本\splash
```

迁移示例：

```powershell
Move-AndJunction `
  "$env:USERPROFILE\AppData\Local\JetBrains\IntelliJIdea2023.2\index" `
  "D:\jetbrains-cache\index"

Move-AndJunction `
  "$env:USERPROFILE\AppData\Local\JetBrains\IntelliJIdea2023.2\splash" `
  "D:\jetbrains-cache\splash"
```

---

## 四、第三类：卸载不再需要的大型开发套件

### 1. Anaconda

如果你不做数据分析、科学计算、机器学习，Anaconda 很可能是不必要的。

它的问题是：

- 体积很大，动辄 5GB-10GB；
- 默认 base 环境容易被 pip/conda 混装污染；
- PATH 里经常插入多个 Anaconda 目录；
- 很多包实际根本用不上。

更轻量的替代方案是 UV。

#### 迁移前先备份 pip 包

```powershell
conda list | Select-String 'pypi_0' | ForEach-Object {
  $parts = $_ -split '\s+'
  "$($parts[0])==$($parts[1])"
} > "$env:USERPROFILE\anaconda-backup\keep-packages.txt"
```

#### 安装 UV

可以安装到 D 盘，例如：

```text
D:\uv\bin\uv.exe
D:\uv\python
D:\uv\cache
D:\uv\tools
```

配置环境变量：

```powershell
[Environment]::SetEnvironmentVariable('UV_CACHE_DIR', 'D:\uv\cache', 'User')
[Environment]::SetEnvironmentVariable('UV_PYTHON_INSTALL_DIR', 'D:\uv\python', 'User')
[Environment]::SetEnvironmentVariable('UV_TOOL_DIR', 'D:\uv\tools', 'User')
```

#### 用 UV 重建项目环境

```powershell
cd D:\py-automation
uv init
uv python pin 3.11
uv add playwright fastapi openai requests httpx pyautogui loguru
```

以后运行脚本：

```powershell
uv run python script.py
```

不要再依赖全局 `python` 或全局 `pip`。

---

## 五、Node.js / npm / pnpm 清理

### 1. 清理不用的 Node 版本

如果使用 nvm-windows，可以查看已安装版本：

```powershell
nvm list
```

卸载不用的旧版本：

```powershell
nvm uninstall 20.19.0
```

### 2. 清理 npm 全局孤儿包

npm 全局目录一般在：

```powershell
npm root -g
npm config get prefix
```

有时 `C:\Users\用户名\AppData\Roaming\npm` 里会残留以前装过的全局包，例如：

- Vue CLI
- cnpm
- newman
- typescript

如果项目已经不依赖全局命令，可以清理：

```powershell
Remove-Item "$env:APPDATA\npm\node_modules\@vue" -Recurse -Force
Remove-Item "$env:APPDATA\npm\node_modules\cnpm" -Recurse -Force
Remove-Item "$env:APPDATA\npm\node_modules\newman" -Recurse -Force
Remove-Item "$env:APPDATA\npm\node_modules\typescript" -Recurse -Force

Remove-Item "$env:APPDATA\npm\cnpm*" -Force
Remove-Item "$env:APPDATA\npm\newman*" -Force
Remove-Item "$env:APPDATA\npm\vue*" -Force
Remove-Item "$env:APPDATA\npm\tsc*" -Force
Remove-Item "$env:APPDATA\npm\tsserver*" -Force
```

### 3. npm 项目是否可以迁移到 pnpm？

可以。

npm 项目只要有 `package.json`，就可以用 pnpm 重建：

```powershell
Remove-Item node_modules -Recurse -Force
Remove-Item package-lock.json -Force
pnpm install
```

如果是 yarn 项目，也可以迁移：

```powershell
Remove-Item node_modules -Recurse -Force
pnpm import
pnpm install
```

pnpm 的优势：

| 对比项 | npm | pnpm |
|---|---|---|
| 安装速度 | 普通 | 更快 |
| 磁盘占用 | 每个项目一份 node_modules | 全局 store 复用 |
| 依赖隔离 | 容易出现幽灵依赖 | 更严格 |
| monorepo | 一般 | 原生支持更好 |

---

## 六、清理 PATH

卸载软件后，PATH 里经常还残留旧路径，例如 Anaconda、PyCharm、旧 Node 等。

查看 PATH：

```powershell
$env:PATH -split ';'
```

清理用户 PATH 示例：

```powershell
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')

$cleaned = ($userPath -split ';' | Where-Object {
  $_ -ne '' -and
  $_ -notmatch 'anaconda' -and
  $_ -notmatch 'PyCharm'
}) -join ';'

[Environment]::SetEnvironmentVariable('Path', $cleaned, 'User')
```

---

## 七、最终回收效果

一次清理大概回收如下：

| 项目 | 回收空间 |
|---|---:|
| Anaconda | 约 11 GB |
| UV cache | 约 8 GB |
| Temp | 约 3 GB |
| Playwright 浏览器迁移 | 约 1.3 GB |
| JetBrains 缓存迁移 | 约 1.6 GB |
| pip cache | 约 900 MB |
| Gradle cache | 约 1.5 GB |
| VS Code 扩展 | 约 1.3 GB |
| Go 模块缓存 | 约 500 MB |
| npm 孤儿包 | 约 300 MB |

总计大约可以回收 **30GB+**。

---

## 八、建议的长期方案

### Python

用 UV：

```powershell
uv init
uv add requests
uv run python main.py
```

不要再把所有包装到全局 Python 或 Anaconda base。

### Node.js

用 nvm 管 Node 版本，用 pnpm 管依赖：

```powershell
nvm use 22.22.2
pnpm install
```

### 浏览器自动化

Playwright 浏览器放 D 盘：

```powershell
[Environment]::SetEnvironmentVariable('PLAYWRIGHT_BROWSERS_PATH', 'D:\ms-playwright', 'User')
```

### IDE 缓存

IDE 缓存可以用 Junction 挪走，不要直接堆在 C 盘。

---

## 总结

开发者 C 盘爆满不是因为系统太大，而是开发工具默认把大量缓存和运行时塞进了用户目录。

清理思路很简单：

1. **缓存直接删**：UV、pip、Temp、Gradle、Go；
2. **大缓存迁移**：Playwright、JetBrains；
3. **不用的软件卸载**：Anaconda、旧 Node、多余 IDE；
4. **环境变量统一指向 D 盘**；
5. **项目依赖用 UV / pnpm 重建，不依赖全局环境。**

这样清理后，C 盘不仅能立刻回收几十 GB，以后也不容易再次爆红。