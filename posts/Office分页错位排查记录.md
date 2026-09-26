---
title: 'Office 分页错位问题排查与解决记录'
date: 2026-08-09
---

# Office 分页错位问题排查与解决记录

日期：2026-08-09
环境：Debian GNU/Linux 13 (trixie)，OnlyOffice 9.4.0
问题文件：`2026届工作证明（模板）.doc`（WPS Office 12.1 生成）

## 一、问题现象

标准 MS Office / WPS 中该文档为 **2 页**：

- 第 1 页：标题"工作证明"到"学校毕业生就业中心审定签名、公章："
- 第 2 页："注意：此材料不需等到答辩当天..."等注意事项

但在 OnlyOffice 中打开，**"注意"内容跑到了第 1 页底部**，分页错位。

## 二、排查过程

### 1. 排除字体缺失因素

先用 catdoc / antiword 提取文档内容，再用 Python 解析 .doc 的 OLE 结构、字体表（STTBF）和文本流，确认文档使用的字体：

- Times New Roman（英文）
- 宋体（正文）
- 华文行楷（标题）
- 仿宋
- 微软雅黑

补齐缺失字体后，文字显示正常，但**分页依旧错位**——证明问题不在字体，而在分页机制。

### 2. 分析文档分页结构

用 Python 解析 piece table 提取完整文本流，确认：

- 文档文本中**没有显式分页符（0x0C）**
- "注意"段前只有若干空行（`\r`），无任何分页标记
- 全文档 30 段，第 23 段是"注意"开头

即：**原文档靠"第一页恰好排满 → 自然溢出分页"**，没有强制分页指令。

### 3. 定位根因

分页位置 = 内容总行高 ÷ 每页可容纳高度。不同渲染器对字体行高、行距的浮点计算存在微小差异，累积后导致分页点偏移：

- WPS/MS Office：第一页恰好排到"学校毕业生就业中心审定签名、公章"
- OnlyOffice：行高计算略有差异，第一页多容纳了几行，"注意"被挤进第一页

## 三、解决方案

给"注意"段添加**强制分页属性**（`pageBreakBefore`），让分页不依赖自然排版，任何软件打开都稳定两页。

### 具体操作

用 OnlyOffice 自带的转换器 `x2t` 把 .doc 转成 .docx：

```bash
/opt/onlyoffice/desktopeditors/converter/x2t /tmp/workcert.doc /tmp/workcert.docx
```

然后解压 docx，在 `word/document.xml` 中定位"注意"所在段落的 `<w:pPr>`，在开头插入：

```xml
<w:pageBreakBefore/>
```

效果：

```xml
<w:p>
  <w:pPr>
    <w:pageBreakBefore/>          <!-- 强制此段从新页开始 -->
    <w:pStyle w:val="Normal"/>
    ...
  </w:pPr>
  <w:r>...注意：此材料不需等到答辩当天...</w:r>
</w:p>
```

重新打包为 docx 即可。

## 四、经验总结

1. **"自然分页"在不同渲染器间不可靠**。同一文档在 WPS 排满一页，在 OnlyOffice 可能少几行或多几行，导致分页点偏移。
2. 若文档需要稳定的分页位置，应使用**显式分页符**（Word 里 Ctrl+Enter / 段落属性"段前分页"），而不是依赖内容排满。
3. 排查思路：先排除字体因素（`fc-match` 验证匹配、清除 OnlyOffice 缓存），再检查分页结构（有无显式分页符）。
4. .doc 二进制格式可通过 Python + `olefile` 解析 piece table 提取文本流，定位分页符（0x0C）位置；或直接用 x2t 转成 docx 后按 XML 处理。
