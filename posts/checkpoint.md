---
title: 'Checkpoint: 微信 & QQ 聊天记录提取'
date: 2026-07-04
---

# Checkpoint: 微信 & QQ 聊天记录提取

**创建时间：** 2026-07-04
**目标联系人：** 廖建军

---

## 微信

- **wxid**: `wxid_ibhm6rb434r522` (备注: 廖建军, 昵称: 网红doro, alias: g1026044893)
- **密钥**: `e8bdc7cc3c96456bbf9af483ed04d4434117779bed194626b44643eac97ee1a4` (重启后失效)
- **数据目录**: `C:\Users\a1\Documents\WeChat Files\wxid_gbxd54iv2sn422`
- **输出**: `D:\files\qwen-chat\chat_records\liao_wxid_ibhm6rb434r522.jsonl` (83.8MB, 357,548条文本)
- **时间范围**: 2022-11-06 ~ 2026-07-03

## QQ

- **你的QQ号**: `2036680567`
- **廖建军QQ**: `1026044893`
- **TEA密钥**: `7d e7 63 7a fc 02 8a 33 85 61 92 92 f2 c4 ac 11` (重启后失效)
- **数据目录**: `C:\Users\a1\Documents\Tencent Files\2036680567`
- **解密数据库**: `C:\Users\a1\Msg3.0.db_0_1783155434.db` (1.4GB, 只读)
- **输出**: `D:\files\qwen-chat\chat_records\qq_1026044893_final.jsonl` (45.6MB, 379,300条)
- **时间范围**: 2022-10-04 ~ 2025-12-13 (之后转微信)
- **文本覆盖率**: 98.4% (372,528/378,536 有文本)
- **非文本类型**: image 4,427 | unknown 492 | emoji 127 | video 2

---

## 最终合并数据

| 数据 | 文件 | 大小 | 消息数 |
|------|------|------|--------|
| 微信 | `liao_wxid_ibhm6rb434r522.jsonl` | 83.8MB | 357,548 |
| QQ | `qq_1026044893_final.jsonl` | 45.6MB | 379,300 |
| **合计** | | | **736,848** |

---

## QQ MsgContent 结构（关键技术发现）

QQ 9.7.x 的 MsgContent 使用**自定义二进制格式**（非 protobuf），结构如下：

```
Header: "MSG\0" (4B) + 保留 (4B)
Metadata: time(4B LE) + rand(4B LE) + color(4B LE) + fontsize(1B) + fontstyle(1B) + charset(1B) + fontfamily(1B) + fontname_len(2B LE) + fontname(NB UTF-16 LE) + skip(2B)
TLV Entries: type(1B) + length(2B LE) + data(NB)
```

### 文本消息 (type=1)

外层 TLV type=1 → 值包含内层 TLV → 内层 type=1 的值解码为 UTF-16 即为消息文本。

**双层 TLV 结构**是之前提取失败的根本原因——单层解析找不到文本。

### 非文本消息

| 外层 type | 含义 | 说明 |
|-----------|------|------|
| 1 | 文本 | 内层 type=1 解码为 UTF-16 文本 |
| 6 | 图片/富文本 | 包含图片标记，但无文件路径 |
| 13 | 表情 | 内层 type=1 解码为 emoji 字符 |
| 25 | 富文本样式 | 字体/颜色等元数据 |
| 0 | 容器 | 包含子 TLV 条目 |

### 图片路径问题

- MsgContent 中的 type=6 **不包含文件路径**，只有图片标记
- QQ 图片文件名随机化存储在 `Image\C2C\Image1\` 目录
- 映射关系存在加密数据库 (`Thumbnails.db`, `Msg3.0index.db`)
- 如需提取图片路径，需用 Frida hook 解密这些数据库

---

## 密钥提取

详见 `D:\files\qwen-chat\chat_records\docs\keys.txt`

---

## 原始数据库完整性

未被修改。所有原始 `.db` 文件 LastWriteTime 均在提取之前。

## 保留的工具

| 路径 | 用途 |
|------|------|
| `D:\Program Files (x86)\github\search_wechat_key\` | 微信内存密钥提取 |
| `D:\Program Files (x86)\github\wechat-decrypt\` | pywxdump venv (含 frida 17.15.3) |
| `D:\Program Files (x86)\github\qq-win-db-key\` | QQ TEA 密钥提取 + Frida hook 解密 |
| `D:\files\qwen-chat\` | 提取脚本 + 输出数据 |

## 已删除

- `wx-cli` — 不兼容微信 3.x
- `WeChatMsg` — 未使用的留痕工具
- `qq-chat-exporter` — 仅支持 NT QQ
