---
title: '密钥与提取快速参考'
date: 2026-07-04
---

# 密钥与提取快速参考

> ⚠️ 密钥在软件重启后会变化，需要重新提取

## 提取成果

| 数据 | 文件 | 大小 | 消息数 |
|------|------|------|--------|
| 微信 | `D:\files\qwen-chat\chat_records\liao_wxid_ibhm6rb434r522.jsonl` | 83.8MB | 357,548 |
| QQ | `D:\files\qwen-chat\chat_records\qq_1026044893_final.jsonl` | 45.6MB | 379,300 |
| **合计** | | | **736,848** |

---

## 微信密钥

**上次提取**: 2026-07-04
**密钥**: `e8bdc7cc3c96456bbf9af483ed04d4434117779bed194626b44643eac97ee1a4`

**提取命令**:
```powershell
cd "D:\Program Files (x86)\github\search_wechat_key\search_wechat_key-main"
uv run python search_wecaht_key.py
```

**微信数据目录**: `C:\Users\a1\Documents\WeChat Files\wxid_gbxd54iv2sn422`

**联系人**: 廖建军 = `wxid_ibhm6rb434r522` (备注: 廖建军, 昵称: 网红doro)

**解密命令**:
```powershell
cd "D:\Program Files (x86)\github\wechat-decrypt\wechat-decrypt-main"
uv run wxdump decrypt -k <key> -i "C:\Users\a1\Documents\WeChat Files\wxid_gbxd54iv2sn422" -o "D:\wechat_decrypted"
```

---

## QQ 密钥

**上次提取**: 2026-07-04
**TEA密钥**: `7d e7 63 7a fc 02 8a 33 85 61 92 92 f2 c4 ac 11`

**注意**: 这是 TEA 密钥，不是 sqlcipher 密钥。不能直接用 sqlcipher3 解密，必须用 Frida hook 方法。

**提取命令** (需管理员权限, QQ 必须运行):
```powershell
cd "D:\Program Files (x86)\github\qq-win-db-key"
& "D:\Program Files (x86)\github\wechat-decrypt\wechat-decrypt-main\.venv\Scripts\python.exe" pcqq_get_key.py
```

**解密命令** (需QQ运行):
```powershell
cd "D:\Program Files (x86)\github\qq-win-db-key"
& "D:\Program Files (x86)\github\wechat-decrypt\wechat-decrypt-main\.venv\Scripts\python.exe" pcqq_dump.py --db "C:\Users\a1\Documents\Tencent Files\2036680567\Msg3.0.db" --key "7d e7 63 7a fc 02 8a 33 85 61 92 92 f2 c4 ac 11"
```

**QQ 数据目录**: `C:\Users\a1\Documents\Tencent Files\2036680567`

**解密后数据库**: `C:\Users\a1\Msg3.0.db_0_1783155434.db` (1.4GB, 只读)

**好友**: 廖建军 QQ = `1026044893`

---

## 快速重新提取

微信重启后:
```powershell
cd "D:\Program Files (x86)\github\search_wechat_key\search_wechat_key-main" && uv run python search_wecaht_key.py
```

QQ 重启后:
```powershell
cd "D:\Program Files (x86)\github\qq-win-db-key" && & "D:\Program Files (x86)\github\wechat-decrypt\wechat-decrypt-main\.venv\Scripts\python.exe" pcqq_get_key.py
```

---

## QQ MsgContent 结构

QQ 9.x 使用自定义二进制格式（非 protobuf）:

```
Header: "MSG\0" (4B) + reserved (4B)
Metadata: time(4B LE) + rand(4B LE) + color(4B LE)
Font: fontsize(1B) + fontstyle(1B) + charset(1B) + fontfamily(1B) + fontname_len(2B LE) + fontname(NB UTF-16 LE) + skip(2B)
TLV: type(1B) + length(2B LE) + data(NB)
```

**双层 TLV 结构**: 文本消息外层 type=1 → 内层 type=1 → UTF-16 解码为文本。

---

## 工具位置

| 工具 | 路径 | 用途 |
|------|------|------|
| search_wechat_key | `D:\Program Files (x86)\github\search_wechat_key\` | 微信密钥提取 |
| wechat-decrypt | `D:\Program Files (x86)\github\wechat-decrypt\` | pywxdump venv (含 frida) |
| qq-win-db-key | `D:\Program Files (x86)\github\qq-win-db-key\` | QQ TEA 密钥 + Frida hook 解密 |
| 提取脚本 | `D:\files\qwen-chat\` | extract_qq_final.py 等 |
