---
title: 'Cloudflare Workers AI 服务记录'
date: 2026-09-01
---

# Cloudflare Workers AI 服务记录

> 创建时间: 2026-09-01  
> 账户: 2036680567@qq.com (Cloudflare OAuth 登录)

---

## 账户信息

| 项目 | 值 |
|------|-----|
| **Account ID** | `2df28c644e95fb80bd2ca785ce683492` |
| **登录方式** | OAuth (QQ: 2036680567@qq.com) |
| **认证 Token** | `~/.config/.wrangler/config/default.toml` |
| **wrangler 路径** | `~/.local/bin/wrangler` |
| **Free Tier** | 10,000 Neurons/天 (~45 分钟音频) |

---

## 已部署的 Worker

### 1. cf-whisper-worker (Whisper 语音转文字)

| 项目 | 值 |
|------|-----|
| **URL** | `https://cf-whisper-worker.2036680567.workers.dev` |
| **部署时间** | 2026-09-01 16:28 |
| **最后修改** | 2026-09-01 |
| **来源** | wrangler 部署 |

**项目路径**: `~/cf-whisper-worker/`

**支持的 API**:
- `POST /v1/audio/transcriptions` — OpenAI 兼容转录接口
- `POST /` — 简单测试接口

**使用示例**:
```bash
# 转录音频文件
curl -X POST https://cf-whisper-worker.2036680567.workers.dev/v1/audio/transcriptions \
  -F "file=@audio.wav" \
  -F "model=@cf/openai/whisper" \
  -F "language=zh" \
  -F "response_format=json"
```

**可用模型**:
- `@cf/openai/whisper` — 基础模型 (推荐)
- `@cf/openai/whisper-tiny-en` — 超快小模型 (英文)
- `@cf/openai/whisper-large-v3-turbo` — 高质量模型

**返回格式**: `json`, `text`, `vtt`, `srt`, `verbose_json`

---

### 2. qwen3-embedding (文本嵌入)

| 项目 | 值 |
|------|-----|
| **URL** | `https://qwen3-embedding.2036680567.workers.dev` |
| **部署时间** | 2026-07-10 10:46 |
| **最后修改** | 2026-07-10 11:39 |
| **来源** | Web Editor (quick_editor) |

**支持的 API**:
- `POST /v1/embeddings` — OpenAI 兼容嵌入接口
- `GET /` — 测试页面

**使用示例**:
```bash
# 生成单条文本嵌入
curl -X POST https://qwen3-embedding.2036680567.workers.dev/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "@cf/qwen/qwen3-embedding-0.6b", "input": "你好世界"}'

# 批量嵌入
curl -X POST https://qwen3-embedding.2036680567.workers.dev/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "@cf/qwen/qwen3-embedding-0.6b", "input": ["文本1", "文本2"]}'
```

**可用模型**:
- `@cf/qwen/qwen3-embedding-0.6b` — 768维向量，中英文通用

**返回示例**:
```json
{
  "object": "list",
  "data": [
    {"object": "embedding", "index": 0, "embedding": [0.012, -0.034, ...]}
  ],
  "model": "qwen3-embedding-0.6b"
}
```

---

## 可用 Cloudflare AI 模型

```bash
# 查看所有可用模型
~/.local/bin/wrangler ai model list

# 查看特定模型信息
~/.local/bin/wrangler ai model get <model-name>
```

**常用模型**:
| 类别 | 模型 | 用途 |
|------|------|------|
| **音频** | `@cf/openai/whisper` | 语音转文字 |
| **音频** | `@cf/openai/whisper-large-v3-turbo` | 高质量转录 |
| **嵌入** | `@cf/qwen/qwen3-embedding-0.6b` | 文本向量 |
| **嵌入** | `@cf/baai/bge-m3` | 多语言嵌入 |
| **LLM** | `@cf/qwen/qwen2.5-1.5b-instruct` | 中文对话 |
| **LLM** | `@cf/meta/llama-3.2-3b-instruct` | 通用对话 |

---

## 常用命令

```bash
# 设置 PATH (添加到 ~/.bashrc)
export PATH="$HOME/.local/bin:$PATH"

# 查看已部署的 Worker
~/.local/bin/wrangler list

# 获取账号信息
TOKEN=$(cat ~/.config/.wrangler/config/default.toml | grep 'oauth_token' | sed 's/.*= "\(.*\)".*/\1/')
curl -s "https://api.cloudflare.com/client/v4/accounts/2df28c644e95fb80bd2ca785ce683492/workers/scripts" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

---

## 状态总结

| Worker | URL | 状态 | 已测试 |
|--------|-----|------|--------|
| cf-whisper-worker | `*.workers.dev` | ✅ 运行中 | ✅ 连接正常 |
| qwen3-embedding | `*.workers.dev` | ✅ 运行中 | ✅ 返回向量 |

---

*最后更新: 2026-09-01*
