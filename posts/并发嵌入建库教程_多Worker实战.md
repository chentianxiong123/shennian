---
title: '并发嵌入建库教程 —— 多 Worker 实战'
date: 2026-07-10
---

# 并发嵌入建库教程 —— 多 Worker 实战

本文档记录如何用 1 个本地 GPU worker + 3 个云端 API worker 并发跑嵌入，快速构建 SQLite-vec 向量库。
基于 2026-07-10 实测数据，17,846 条聊天记录全部嵌入完成。

---

## 最终成果

```text
总 chunk:    17,846 条
已嵌入:      17,846 条 (100%)
数据库:      qwen_persona_rag.sqlite (172MB)
总耗时:      约 30-40 分钟（并发跑）
```

---

## 用了哪些平台

| 平台 | 角色 | batch | 速度 | 贡献 |
|------|------|-------|------|------|
| **RX590 独显** (llama-server) | 主力 | 32 | ~1.4 items/s | 68% |
| **Cloudflare Workers AI** | 补充 | 1 | ~0.5 items/s | 6% |
| **Pie-Xian API** | 补充 | 1 | ~0.5 items/s | 10% |
| **FuturePPO API** | 补充 | 1 | ~0.5 items/s | 12% |
| **Intel 核显** (之前跑的) | 额外 | - | 较慢 | 2% |
| **Gitee AI** | 额度用完 | - | - | <1% |

**结论**: 本地独显是绝对主力，三个云端 API 加起来才补了 28%。

---

## 环境要求

### 硬件

- AMD RX590 GME 4GB（或其他支持 ROCm/Vulkan 的 AMD 卡）
- Intel 核显（可选，用于额外并发）
- 16GB+ 系统内存（llama-server 会吃 9GB+）

### 软件

```text
Python 3.10+     (带 venv)
llama.cpp        (编译好的 llama-server.exe)
sqlite-vec       (Python 包，向量扩展)
openai           (Python 包，API 客户端)
```

### 模型

```text
D:\models\qwen3-embedding-0.6b-q8_0.gguf   (610MB, Q8_0 量化)
```

---

## 第一步：启动本地嵌入服务器

```powershell
D:\llama-lora-embed\build\bin\Release\llama-server.exe `
  --model "D:\models\qwen3-embedding-0.6b-q8_0.gguf" `
  --host 127.0.0.1 --port 8081 `
  --embedding --pooling last --embd-normalize 2 `
  --main-gpu 0 --n-gpu-layers 9999 `
  --batch-size 512 --ctx-size 8192
```

等窗口输出 `listening on http://127.0.0.1:8081` 就绪。

验证：
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8081/health" -Method Get
# 应返回 {"status": "ok"}
```

---

## 第二步：启动 4 个并发 Worker

所有 worker 共用同一个脚本 `embed_worker_sqlite_vec.py`，只是参数不同。
每个 worker 是独立进程，通过 SQLite claim 机制互不冲突。

```powershell
$venv = "D:\files\qwen-chat\.venv\Scripts\python.exe"
$script = "D:\files\qwen-chat\scripts\embed_worker_sqlite_vec.py"
$db = "D:\files\qwen-chat\workspace\07_rag_embedding\stores\qwen_persona_rag.sqlite"
$common = @("--db", $db, "--model", "qwen3-embedding-0.6b", "--claim-any-provider", "--claim-any-model")

# Worker 1: 本地 RX590 GPU (batch=32, 最快)
Start-Process $venv -ArgumentList @($script) + $common + @(
    "--provider", "local",
    "--endpoint", "http://127.0.0.1:8081/v1/embeddings",
    "--batch-size", "32", "--limit", "5000")

# Worker 2: Cloudflare Workers AI
Start-Process $venv -ArgumentList @($script) + $common + @(
    "--provider", "cloudflare",
    "--endpoint", "https://qwen3-embedding.2036680567.workers.dev/v1/embeddings",
    "--batch-size", "1", "--limit", "500")

# Worker 3: Pie-Xian API
Start-Process $venv -ArgumentList @($script) + $common + @(
    "--provider", "pie-xian",
    "--endpoint", "https://api.pie-xian.com/v1/embeddings",
    "--api-key", "sk-Srh2wKelJD3T8XpgCcC95OwYDKkILsT2egWs5tyTyk1MrmFx",
    "--batch-size", "1", "--limit", "200")

# Worker 4: FuturePPO API
Start-Process $venv -ArgumentList @($script) + $common + @(
    "--provider", "futureppo",
    "--endpoint", "https://api.futureppo.top/v1/embeddings",
    "--api-key", "sk-EC3TPAMBM8BZ3daVrMZAIAZ2OtGOQcdJT7Ryq1q7UAIyNeic",
    "--batch-size", "1", "--limit", "200")

Write-Host "4 workers launched"
```

---

## 第三步：监控进度

```powershell
python -c "
import sqlite3
conn = sqlite3.connect(r'D:\files\qwen-chat\workspace\07_rag_embedding\stores\qwen_persona_rag.sqlite')
c = conn.cursor()
c.execute('SELECT status, COUNT(*) FROM embedding_jobs GROUP BY status')
for s, cnt in c.fetchall(): print(f'{s}: {cnt}')
conn.close()
"
```

看到 `pending: 0` + `done: 17846` 就全部完成了。

---

## 第四步：清理内存

```powershell
# 杀掉 llama-server (释放 9GB+ 内存)
Get-Process -Name "llama-server" | Stop-Process -Force

# 杀掉所有 python worker
Get-Process -Name "python" | Stop-Process -Force
```

---

## 踩坑记录

### 1. 必须用 venv python

系统 python 没有 sqlite_vec 模块，直接跑会报错。
正确路径：`D:\files\qwen-chat\.venv\Scripts\python.exe`

### 2. 参数名别搞混

```text
正确: --batch-size (不是 --n-batch)
正确: --limit      (不是 --max-jobs)
```

### 3. llama-server 参数名

```text
正确: --batch-size  (不是 --n-batch)
正确: --n-gpu-layers (不是 --gpu-layers)
```

### 4. RX590 显存 vs 内存

驱动报告 RX590 GME 为 4GB 显存，但 llama-server 启动后实际内存占用可达 9GB+。
这是 llama.cpp 的已知行为：KV cache 和中间状态放在系统内存中。
不影响使用，但要注意系统内存要够。

### 5. claimed 卡住

如果 worker 被强杀，部分任务会卡在 claimed 状态，不会被其他 worker 抢。
解决方法：手动把 claimed 重置为 pending。

### 6. 内存泄漏

llama-server 长时间运行内存持续增长。建议跑完立刻 kill，不要挂着。
Python worker 相对稳定，每个约 30-40MB。

---

## 嵌入参数对齐

所有平台必须保持一致，否则检索时向量空间不对齐：

```text
模型:     Qwen3-Embedding-0.6B
Pooling:  last
Normalize: 2 (L2 归一化)
输入格式:  纯文本，无系统提示词，无 instruction
文本格式:  "用户: <内容>" / "助手: <回复>"
```

Q8_0 量化版与云端 API 有极微小误差，如果需要完全一致可以用 f16 版本。

---

## 文件位置

```text
脚本:     D:\files\qwen-chat\scripts\embed_worker_sqlite_vec.py
数据库:   D:\files\qwen-chat\workspace\07_rag_embedding\stores\qwen_persona_rag.sqlite
模型:     D:\models\qwen3-embedding-0.6b-q8_0.gguf
llama:    D:\llama-lora-embed\build\bin\Release\llama-server.exe
venv:     D:\files\qwen-chat\.venv\Scripts\python.exe
```
