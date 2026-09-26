---
title: 'Extract WeChat & QQ Chat Records (Windows)'
date: 2026-05-03
---

---
name: extract-wechat-records
description: Extract WeChat PC 3.x and QQ PC (old version) chat records to JSONL. Covers key extraction, database decryption, and message export for model distillation.
user-invocable: true
allowed-tools:
  - Bash(python *)
  - Bash(uv *)
  - Bash(Get-Process *)
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# Extract WeChat & QQ Chat Records (Windows)

## Overview

Two extraction workflows:
1. **WeChat 3.x** (legacy) — SQLCipher 3 encrypted, key from process memory
2. **QQ PC** (old version 9.x) — TEA encrypted Msg3.0.db, key via Frida hook

## Final Results

| 数据 | 文件 | 大小 | 消息数 |
|------|------|------|--------|
| 微信 | `liao_wxid_ibhm6rb434r522.jsonl` | 83.8MB | 357,548 |
| QQ | `qq_1026044893_final.jsonl` | 45.6MB | 379,300 |
| **合计** | | | **736,848** |

---

# WeChat 3.x Extraction

## When to use

- WeChat 3.x (legacy) running on Windows
- Need to export chat history for backup or model training

Do NOT use for WeChat 4.x — different approach required.

## Requirements

- WeChat 3.x process running
- Python 3.10+ with `uv`
- Admin access for memory reading

## Tooling

| Tool | Path | Purpose |
|------|------|---------|
| search_wechat_key | `D:\Program Files (x86)\github\search_wechat_key\` | Extract DB key from WeChat memory |
| pywxdump | installed in `D:\Program Files (x86)\github\wechat-decrypt\.venv\` | Decrypt SQLCipher 3 databases |

## Procedure

### Step 1 — Find WeChat process

```powershell
Get-Process -Name WeChat -ErrorAction SilentlyContinue | Format-Table Id, Path -AutoSize
```

### Step 2 — Extract database key

```powershell
cd "D:\Program Files (x86)\github\search_wechat_key\search_wechat_key-main"
uv run python search_wecaht_key.py
```

Output: 64-hex-char key.

### Step 3 — Decrypt databases

```powershell
cd "D:\Program Files (x86)\github\wechat-decrypt\wechat-decrypt-main"
uv run wxdump decrypt -k <key> -i "C:\Users\...\WeChat Files\<wxid>" -o "D:\wechat_decrypted"
```

### Step 4 — Find contact

```python
import sqlite3
conn = sqlite3.connect(r"D:\wechat_decrypted\de_MicroMsg.db")
cur = conn.cursor()
rows = cur.execute(
    "SELECT UserName, NickName, Remark, Alias FROM Contact WHERE NickName LIKE ? OR Remark LIKE ?",
    ('%keyword%', '%keyword%')
).fetchall()
```

### Step 5 — Export messages

Messages are sharded across `MSG0.db`–`MSG7.db` in `Msg\Multi\`. Key field is `StrTalker`.

```python
from pywxdump.wx_core.decryption import decrypt

KEY = "64-char-hex-key"
for i in range(8):
    src = f"Msg\\Multi\\MSG{i}.db"
    dst = f"D:\\wechat_decrypted\\de_MSG{i}.db"
    ok, _ = decrypt(KEY, src, dst)
    # ... query MSG WHERE StrTalker=wxid, write to JSONL
```

Output format:
```json
{"db":7, "localId":12345, "type":1, "isSender":0, "createTime":1776543210,
 "datetime":"2026-05-03 14:30:00", "content":"message text", "displayContent":null}
```

## SQLCipher 3 Parameters

- Page size: 4096
- KDF: PBKDF2-HMAC-SHA1, 64000 iterations
- Reserve per page: 48 bytes (16 IV + 20 HMAC + 12 pad)
- Salt: 16 bytes at file start

## Known Issues (WeChat)

- **pywxdump decrypt bug**: prepends `SQLite format 3\0` corrupting header. Use `pywxdump.wx_core.decryption.decrypt` instead.
- **WeChat 4.x incompatible**: do NOT attempt
- **Key changes on restart**: re-run Step 2 after reboot
- **pywxdump v3.1.46**: last available version (DMCA'd repo)

---

# QQ PC (Old Version 9.x) Extraction

## When to use

- QQ 9.x (old QQ, NOT NT QQ) installed
- Need to extract private/group chat from Msg3.0.db

## Requirements

- QQ 9.x installed (logged in at least once)
- Python 3.10+ with `uv`
- Frida (`pip install frida-tools frida`) — already installed in wechat-decrypt venv
- Admin access for memory reading

## Tooling

| File | Purpose |
|------|---------|
| `D:\Program Files (x86)\github\qq-win-db-key\pcqq_get_key.py` | Frida hook to extract TEA key |
| `D:\Program Files (x86)\github\qq-win-db-key\pcqq_dump.py` | Decrypt Msg3.0.db using Frida hook |

## Procedure

### Step 1 — QQ must be running

### Step 2 — Extract TEA key via Frida

```powershell
cd "D:\Program Files (x86)\github\qq-win-db-key"
& "D:\Program Files (x86)\github\wechat-decrypt\wechat-decrypt-main\.venv\Scripts\python.exe" pcqq_get_key.py
```

Output: 16-byte hex key, e.g. `7d e7 63 7a fc 02 8a 33 85 61 92 92 f2 c4 ac 11`

### Step 3 — Decrypt Msg3.0.db

```powershell
& "D:\Program Files (x86)\github\wechat-decrypt\wechat-decrypt-main\.venv\Scripts\python.exe" pcqq_dump.py --db "C:\Users\...\Msg3.0.db" --key "7d e7 63 7a fc 02 8a 33 85 61 92 92 f2 c4 ac 11"
```

Output: `Msg3.0.db_0_<timestamp>.db` (decrypted copy, ~1.4GB)

**IMPORTANT**: Do NOT use sqlcipher3 directly — the TEA key is NOT the sqlcipher key. QQ's internal `sqlite3_key` processes the key. Only the Frida hook method works.

### Step 4 — Find contact's table

```python
import sqlite3
db = r'C:\Users\a1\Msg3.0.db_0_<timestamp>.db'
conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
cur = conn.cursor()

# List buddy tables
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'buddy_%'")
tables = [t[0] for t in cur.fetchall()]

# Check message count
friend_qq = '1026044893'
cnt = cur.execute(f"SELECT COUNT(*) FROM [buddy_{friend_qq}]").fetchone()[0]
```

### Step 5 — Export messages

**CRITICAL**: QQ MsgContent uses **double-layer TLV** structure (NOT protobuf).

```
Outer TLV: type(1B) + length(2B LE) + data(NB)
When outer type=1 → data contains inner TLV
Inner TLV: type(1B) + length(2B LE) + data(NB)
Inner type=1 → data decoded as UTF-16 = message text
```

Correct extraction code:

```python
import sqlite3, json, struct
from datetime import datetime

DB_PATH = r"C:\Users\a1\Msg3.0.db_0_<timestamp>.db"
MY_UIN = 2036680567
FRIEND_UIN = 1026044893

def parse_msg_content(buf):
    if not buf or len(buf) < 30:
        return "", "unknown"
    
    off = 8  # skip "MSG\0" + 4B padding
    try:
        off += 12  # time + rand + color
        off += 4   # fontsize + fontstyle + charset + fontfamily
        fn_len = struct.unpack_from('<H', buf, off)[0]; off += 2
        if fn_len > 100 or fn_len % 2 != 0:
            return "", "unknown"
        off += fn_len + 2  # fontname + skip
    except:
        return "", "unknown"
    
    texts = []
    msg_type = "unknown"
    
    while off + 3 <= len(buf):
        try:
            t = buf[off]; off += 1
            l = struct.unpack_from('<H', buf, off)[0]; off += 2
            if l > len(buf) - off or l > 2000:
                break
            v = buf[off:off+l]
            off += l
            
            if t == 1:  # Text
                msg_type = "text"
                inner_off = 0
                while inner_off + 3 <= len(v):
                    it = v[inner_off]; inner_off += 1
                    il = struct.unpack_from('<H', v, inner_off)[0]; inner_off += 2
                    if il > len(v) - inner_off or il > 500:
                        break
                    iv = v[inner_off:inner_off+il]
                    inner_off += il
                    if it == 1:
                        try:
                            text = iv.decode('utf-16')
                            if text.strip():
                                texts.append(text)
                        except:
                            pass
            elif t in (3, 6):
                msg_type = "image"
            elif t == 2 or t == 13:
                msg_type = "emoji"
            elif t == 7:
                msg_type = "voice"
            elif t == 26:
                msg_type = "video"
        except:
            break
    
    return " ".join(texts), msg_type

# Export
conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
cur = conn.cursor()
cur.execute(f"SELECT Time, SenderUin, MsgContent FROM [buddy_{FRIEND_UIN}]")

with open(f'qq_{FRIEND_UIN}_final.jsonl', 'w', encoding='utf-8') as f:
    for ts, sender, content in cur.fetchall():
        if not content:
            continue
        buf = bytes(content)
        text, msg_type = parse_msg_content(buf)
        
        if msg_type != "text" and not text:
            text = f"[{msg_type}]"
        
        record = {
            'time': datetime.fromtimestamp(ts).strftime('%Y-%m-%d %H:%M:%S'),
            'timestamp': ts,
            'sender': sender,
            'type': msg_type,
            'text': text
        }
        f.write(json.dumps(record, ensure_ascii=False) + '\n')

conn.close()
```

## QQ MsgContent Structure (Custom Binary Format)

QQ 9.x MsgContent is NOT protobuf. It's a custom binary format:

```
Header: "MSG\0" (4B) + reserved (4B)
Metadata: time(4B LE) + rand(4B LE) + color(4B LE)
Font: fontsize(1B) + fontstyle(1B) + charset(1B) + fontfamily(1B) + fontname_len(2B LE) + fontname(NB UTF-16 LE) + skip(2B)
TLV Entries: type(1B) + length(2B LE) + data(NB)
```

### TLV Types

| Type | Name | Description |
|------|------|-------------|
| 1 | MsgText | Text content (double-layer TLV) |
| 2 | MsgFace | Emoji face |
| 3 | MsgGroupImage | Group image |
| 6 | MsgPrivateImage | Private image / rich text |
| 7 | MsgVoice | Voice message |
| 13 | Custom emoji | QQ custom emoji (e.g. 👴) |
| 18 | MsgNickName | Nickname element |
| 25 | Style | Font/color metadata |
| 26 | MsgVideo | Video message |
| 0 | Container | Contains sub-TLV entries |

### Why Previous Extraction Failed

The JSONL content field stored protobuf bytes via `bytes.decode('utf-16-be')` → Python string → `string.encode('utf-16-be')` round-trip. The bytes survived but the TLV structure was unreadable without proper double-layer parsing. Single-layer TLV search found nothing because text is nested inside outer type=1.

## QQ Image Storage

- Images stored in `C:\Users\<user>\Documents\Tencent Files\<qq>\Image\C2C\Image1\`
- Filenames are **randomized** (e.g. `_$FWC`_VIVC`UT@OS6Q~YN.png`)
- MsgContent type=6 only contains image **markers**, NOT file paths
- Mapping stored in encrypted databases (`Thumbnails.db`, `Msg3.0index.db`)
- To extract image paths: need Frida hook to decrypt these databases (same approach as Msg3.0.db)

## Known Issues (QQ)

- **TEA key ≠ sqlcipher key**: direct sqlcipher3 usage fails with all parameter combinations
- **Msg3.0.db can be 1.4GB+**: use read-only copy via `file:path?mode=ro`
- **Only works with old QQ (9.x)**: NT QQ uses different storage
- **Frida hooks QQ process**: QQ must be running during key extraction
- **Image paths not in MsgContent**: need separate database decryption
- **Non-text messages**: ~1.6% of messages are images/voice/video with no text

---

# Appendix: Key Values (This Session)

| Item | Value |
|------|-------|
| WeChat key | `e8bdc7cc3c96456bbf9af483ed04d4434117779bed194626b44643eac97ee1a4` |
| QQ TEA key | `7d e7 63 7a fc 02 8a 33 85 61 92 92 f2 c4 ac 11` |
| My QQ | `2036680567` |
| 廖建军 QQ | `1026044893` |
| 廖建军 wxid | `wxid_ibhm6rb434r522` |
| Decrypted QQ DB | `C:\Users\a1\Msg3.0.db_0_1783155434.db` |
