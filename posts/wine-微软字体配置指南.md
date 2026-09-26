---
title: 'Wine 使用原生微软字体配置指南'
date: 2026-08-10
---

# Wine 使用原生微软字体配置指南

> 目标：让 Wine 中的 Windows 程序（请求 SimSun、微软雅黑、Arial 等字体名时）直接使用**真正的微软字体文件**，而不是 Wine 内置仿品或 Linux 的 Noto 等替代字体。

---

## 一、原理（必读）

Wine 解析 Windows 字体名时按以下优先级：

1. **注册表 `Fonts` 键**：`HKLM\Software\Microsoft\Windows NT\CurrentVersion\Fonts`
   按字体名（如 `SimSun (TrueType)`）查表，命中则加载对应文件。
2. **FontSubstitutes 替换表**：处理别名（如 `MS Shell Dlg` → `SimSun`）。
3. **fontconfig 兜底**：仍未命中才走 Linux 字体匹配（这就是默认会显示 Noto 的原因）。

关键结论：

- 手动删注册表里 `Z:\usr\share\fonts\...` 的条目**没有用**——Wine 每次启动会
  通过 fontconfig 自动把系统字体重新注册回注册表。
- 正确做法：把真实字体文件放进 `C:\windows\Fonts`，然后在注册表 `Fonts` 键
  里把字体名显式映射到这些文件。注册表条目优先级最高，且 Wine 启动后不会被覆盖。

---

## 二、准备工作

1. 已安装真正的微软字体（两种来源）：

   - **MS Core Fonts**（Arial / Courier New / Georgia / Impact / Tahoma / Comic Sans / Andale Mono）：
     `sudo apt install ttf-mscorefonts-installer`
     字体落在 `/usr/share/fonts/truetype/msttcorefonts/`
   - **微软中文字体**（SimSun / 微软雅黑 / 黑体 / 楷体 / 仿宋 / 华文行楷）：
     通常手动拷入，如 `/usr/share/fonts/truetype/windows-cn/`

2. 关闭所有 Wine 进程：

   ```bash
   pkill -f MoGuRomZhuShou; pkill wineserver
   ```

---

## 三、操作步骤

### 1. 备份注册表（重要）

```bash
cp ~/.wine/system.reg ~/.wine/system.reg.bak
cp ~/.wine/user.reg   ~/.wine/user.reg.bak
```

### 2. 复制字体进 Wine 的 Fonts 目录

```bash
cp /usr/share/fonts/truetype/msttcorefonts/* ~/.wine/drive_c/windows/Fonts/
cp /usr/share/fonts/truetype/windows-cn/*    ~/.wine/drive_c/windows/Fonts/
```

### 3. 写注册表文件（关键步骤）

创建 `msfonts.reg`，把字体名映射到 `C:\Windows\Fonts` 下的相对文件名：

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\Software\Microsoft\Windows NT\CurrentVersion\Fonts]
"Andale Mono (TrueType)"="AndaleMo.TTF"
"Arial (TrueType)"="Arial.TTF"
"Arial Black (TrueType)"="AriBlk.TTF"
"Arial Bold (TrueType)"="Arialbd.TTF"
"Arial Bold Italic (TrueType)"="Arialbi.TTF"
"Arial Italic (TrueType)"="Ariali.TTF"
"Comic Sans MS (TrueType)"="Comic.TTF"
"Comic Sans MS Bold (TrueType)"="Comicbd.TTF"
"Courier New (TrueType)"="cour.ttf"
"Courier New Bold (TrueType)"="courbd.ttf"
"Courier New Bold Italic (TrueType)"="courbi.ttf"
"Courier New Italic (TrueType)"="couri.ttf"
"Georgia (TrueType)"="Georgia.TTF"
"Georgia Bold (TrueType)"="Georgiab.TTF"
"Georgia Bold Italic (TrueType)"="Georgiaz.TTF"
"Georgia Italic (TrueType)"="Georgiai.TTF"
"Impact (TrueType)"="Impact.TTF"
"Tahoma (TrueType)"="tahoma.ttf"
"SimSun (TrueType)"="simsun.ttc"
"NSimSun (TrueType)"="simsun.ttc"
"SimHei (TrueType)"="simhei.ttf"
"SimKai (TrueType)"="simkai.ttf"
"SimFang (TrueType)"="simfang.ttf"
"Microsoft YaHei (TrueType)"="msyh.ttc"
"Microsoft YaHei Bold (TrueType)"="msyhbd.ttc"
"STXingkai (TrueType)"="STXINGKA.ttf"

[HKEY_LOCAL_MACHINE\Software\Wow6432Node\Microsoft\Windows NT\CurrentVersion\Fonts]
; 同上，32 位程序也读这份，内容照抄
```

> 值用**相对文件名**（不带 `C:\Windows\Fonts\` 前缀），和 Wine 自己的写法一致。

### 4. 导入注册表

```bash
export WINEPREFIX=~/.wine
wine reg import msfonts.reg
```

### 5. 重建并验证

```bash
wineboot -u          # 重新初始化，确认条目不被覆盖
wine reg query 'HKLM\Software\Microsoft\Windows NT\CurrentVersion\Fonts' /s \
  | grep 'SimSun (TrueType)\|Arial (TrueType)\|Microsoft YaHei (TrueType)'
# 应输出:
#   SimSun (TrueType)          REG_SZ    simsun.ttc
#   Arial (TrueType)           REG_SZ    Arial.TTF
#   Microsoft YaHei (TrueType) REG_SZ    msyh.ttc
```

---

## 四、验证字体是否真的生效

1. 运行 `wine notepad.exe`，打开「格式 → 字体」，选择 SimSun / 微软雅黑 / Arial，
   观察是否显示真正的微软字形（宋体、雅黑明显与 Noto 不同）。
2. 或用你自己的程序（如上面测试的 MoGu 助手），肉眼确认界面中文不再像 Noto。

---

## 五、回滚

```bash
pkill wineserver
cp ~/.wine/system.reg.bak ~/.wine/system.reg
cp ~/.wine/user.reg.bak    ~/.wine/user.reg
# 可选：移除拷入的字体文件
rm ~/.wine/drive_c/windows/Fonts/{AndaleMo.TTF,Arial*.TTF,Comic*.TTF,cour*.ttf,Georgia*.TTF,Impact.TTF,tahoma.ttf,simsun.ttc,simhei.ttf,simkai.ttf,simfang.ttf,msyh*.ttc,STXINGKA.ttf}
```

---

## 六、注意事项 / 已知问题

| 问题 | 说明 |
|---|---|
| **Wine 仍会注册 Linux 字体** | 每次启动 fontconfig 会把 Noto 等写进注册表，属正常行为，不影响微软字体名解析 |
| **Tahoma Bold 缺失** | msttcorefonts 不含 Tahoma 粗体，会退回 Wine 内置替代品 |
| **Times New Roman** | msttcorefonts 默认不含，若需要需另装（如 `winetricks corefonts` 或补 times32.exe） |
| **旧的大写路径条目** | 注册表里可能残留 `C:\Windows\Fonts\SIMSUN.TTC` 之类指向大写文件名的旧条目，Linux 大小写敏感会找不到；我们新增的小写条目优先级一致，可忽略，也可用 `reg delete` 清理 |
| **微软字体版权** | 专有字体，仅限个人使用，请勿随软件包/镜像公开发布 |
| **字体文件缺失时** | 若 `drive_c/windows/Fonts` 里缺文件，程序会回退到 fontconfig，显示 Noto |

---

## 七、本机实操记录（备忘）

- Wine 版本：`wine-11.14 (Staging)`，前缀 `~/.wine`
- 字体来源目录：
  - `/usr/share/fonts/truetype/msttcorefonts/`（MS Core Fonts，apt 安装）
  - `/usr/share/fonts/truetype/windows-cn/`（微软中文，手动拷贝）
- 已复制 26 个字体文件到 `~/.wine/drive_c/windows/Fonts/`
- 已注册 26 个字体名（普通 + Wow6432Node 两份）
- 注册表备份：`~/.wine/system.reg.bak`、`~/.wine/user.reg.bak`
- 测试程序：MoGu 助手 `MoGuRomZhuShou.exe`，界面正常、无组件对齐问题
