---
title: '全套B站视频流获取方案 — 经验总结'
date: 2026-08-16
---

# 全套B站视频流获取方案 — 经验总结

> 更新时间: 2026-08-16
> 场景: 在自己的网站/App里引用B站视频流，实现播放
> 结论先行: **浏览器端做不到零带宽，必须后端代理。**

---

## 目录

1. 最终结论（先看这个）
2. 为什么浏览器端做不到（三个不可绕过限制）
3. 完整可行方案（后端代理 + WBI签名）
4. 可运行的完整代码
5. 踩坑记录
6. 备选方案对比
7. 给AI的提示词模板

---

## 一、最终结论

```
想做的事:  在自己的页面里播放B站视频（复用B站CDN，省自己的带宽）
现实:      浏览器端 100% 做不到，因为防盗链在浏览器内核层+HTTP协议层双重锁死
可行:      后端代理，用 Python/Node 在服务器端请求B站，再转发给浏览器
代价:      代理消耗自己服务器的带宽（可以Range流式 + 缓存降低）
```

---

## 二、三个不可绕过限制

### 限制1: CORS跨域

```
浏览器调用 api.bilibili.com  →  被 CORS 拦截
原因: api.bilibili.com 没有返回 Access-Control-Allow-Origin
性质: HTTP协议层，浏览器强制，JS无法绕
```

### 限制2: Referer防盗链（核心）

```
拿到CDN直链后请求 → 必须带 Referer: bilibili.com → 否则403
浏览器JS里设 Referer → 被浏览器内核丢弃，收到的是页面URL

已实测验证的无效方法:
  fetch() headers        ❌
  XHR setRequestHeader   ❌
  new Image()            ❌
  navigator.sendBeacon   ❌
  Service Worker拦截     ❌

原因: Referer是浏览器内核网络层的导航来源，URLLoader强制覆盖，
      JS/CDP(渲染进程)都无法操作网络层。
```

### 限制3: DASH非标准格式

```
B站返回的 m4s 是完整MP4（moov在末尾），不是标准fMP4分片
→ dashjs/MSE 无法流式解析，只能 <video> 直接播放完整MP4
```

---

## 三、可行方案：后端代理（全流程）

```
浏览器 → 你的后端 → B站API → 拿CDN直链
              ↓
         后端带 Referer 请求 CDN（服务器端不受浏览器限制）
              ↓
         Range 流式转发给浏览器
              ↓
         206 Partial Content 播放
```

### 完整实现步骤

#### Step1: 获取Cookie（SESSDATA）

```python
import requests

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.bilibili.com/",
})
session.get("https://www.bilibili.com/")  # Cookie里有SESSDATA
```

#### Step2: 获取WBI密钥（nav接口）

```python
nav = session.get("https://api.bilibili.com/x/web-interface/nav").json()
wbi_img = nav["data"]["wbi_img"]

# 两条图片URL，文件名(去掉.png)拼起来就是 raw_key
import re
def extract_key(url):
    return re.search(r'/([^/]+\.png)$', url).group(1).replace('.png', '')

raw_key = extract_key(wbi_img["img_url"]) + extract_key(wbi_img["sub_url"])
# raw_key 是32位，由两个16位图片文件名拼成
```

#### Step3: WBI签名

```python
import hashlib, time, urllib.parse

MIXIN_KEY_ENC_TAB = [
    46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,
    33,9,42,19,29,28,14,39,12,38,41,13,37,48,24,20,55,40,17,
    8,26,16,0,21,1,11,34,7,36,57,56,4,44,30,54,25,52,22,6
]

def mixin_key(raw):
    return ''.join(raw[MIXIN_KEY_ENC_TAB[i]] for i in range(len(MIXIN_KEY_ENC_TAB)))

def wbi_sign(params, raw_key):
    params["wts"] = int(time.time())
    query = urllib.parse.urlencode(sorted(params.items()))
    key = mixin_key(raw_key)
    sig = hashlib.sha256((query + key).encode()).hexdigest()
    params["w_rid"] = sig
    return urllib.parse.urlencode(sorted(params.items()))
```

#### Step4: 获取播放地址

```python
def get_play_url(avid, cid, qn=16, fnval=1):
    """
    avid: 视频ID (av号)
    cid:  分P的ID
    qn:   16=720p 32=1080p 64=1080p高码率
    fnval: 1=FLV 4=MP4(HLS)
    """
    params = {"avid": avid, "cid": cid, "qn": qn, "fnval": fnval, "fnver": 0}
    query = wbi_sign(params, raw_key)
    url = f"https://api.bilibili.com/x/web-interface/wbi/video/playurl?{query}"
    data = session.get(url).json()["data"]
    if "durl" in data:
        return data["durl"][0]["url"]   # FLV/MP4
    elif "dash" in data:
        return {
            "video": data["dash"]["video"][0]["base_url"],
            "audio": data["dash"]["audio"][0]["base_url"],
        }
```

#### Step5: Range代理（FastAPI完整实现）

```python
from fastapi import FastAPI, Response, Request
import httpx, re, hashlib, time, urllib.parse

app = FastAPI()
session = requests.Session()
session.headers.update({"User-Agent": "Mozilla/5.0", "Referer": "https://www.bilibili.com/"})

# 全局缓存 raw_key
raw_key_cache = {"key": None, "ts": 0}

def get_raw_key():
    if raw_key_cache["key"] and time.time() - raw_key_cache["ts"] < 3600:
        return raw_key_cache["key"]
    nav = session.get("https://api.bilibili.com/x/web-interface/nav").json()
    img = nav["data"]["wbi_img"]
    rk = re.search(r'/([^/]+)\.png$', img["img_url"]).group(1) \
         + re.search(r'/([^/]+)\.png$', img["sub_url"]).group(1)
    raw_key_cache["key"] = rk
    raw_key_cache["ts"] = time.time()
    return rk

@app.get("/proxy/{bvid}")
async def proxy(bvid: str, request: Request):
    # 1. 从 bvid 解析 avid + cid
    view = session.get(f"https://api.bilibili.com/x/web-interface/view?bvid={bvid}").json()
    avid = view["data"]["aid"]
    cid = view["data"]["cid"]
    
    # 2. 拿CDN直链
    params = {"avid": avid, "cid": cid, "qn": 16, "fnval": 1, "fnver": 0}
    q = wbi_sign(params, get_raw_key())
    url = session.get(
        f"https://api.bilibili.com/x/web-interface/wbi/video/playurl?{q}"
    ).json()["data"]["durl"][0]["url"]
    
    # 3. 转发Range请求
    range_header = request.headers.get("Range", "bytes=0-")
    async with httpx.AsyncClient() as client:
        r = await client.get(url, headers={
            "Range": range_header,
            "Referer": "https://www.bilibili.com/",
            "User-Agent": "Mozilla/5.0",
        })
    return Response(content=r.content, status_code=r.status_code,
                    media_type=r.headers.get("content-type", "video/mp4"),
                    headers={"Content-Range": r.headers.get("Content-Range", ""),
                             "Accept-Ranges": "bytes"})
```

---

## 四、踩坑记录

| 坑 | 现象 | 解法 |
|----|------|------|
| WBI密钥失效 | 请求返回 -403 / 签名错误 | 每次启动/定期重取nav接口的key |
| CDN直链过期 | 播放中途403 | 每次播放前重新获取直链 |
| 直链包含防盗链参数 | 直接浏览器打开403 | 必须带Referer请求 |
| dashjs无法解析 | m4s播放黑屏 | 用 `<video>` 原生播放完整MP4 |
| 无登录Cookie | 部分视频不可看 | 注入SESSDATA |
| 防盗链的Referer前缀 | 个别CDN校验精确来源 | Referer用 www.bilibili.com 或 bilibili.com |

---

## 五、备选方案对比

| 方案 | 服务器带宽 | 实现复杂度 | 版权风险 | 可行性 |
|------|-----------|-----------|---------|--------|
| 前端直连（零带宽） | 0 | 低 | 高 | ❌ 被防盗链锁死 |
| 后端全量代理 | 大 | 中 | 中 | ✅ |
| 后端Range流式 | 中（随播放） | 中 | 中 | ✅ 推荐 |
| 后端代理+缓存 | 低（首次下载） | 高 | 中 | ✅ 推荐 |
| 自己转码存MinIO | 高 | 高 | 无 | ✅ 但非"直链" |

**重要提示:** 商业使用B站视频流存在版权风险。本方案适用于个人学习/技术验证，生产环境请使用有授权的内容源。

---

## 六、给AI的提示词模板

如果你要用AI生成这个方案，把下面这段提示词直接发给它：

```
我在做一个视频平台，想在自己网站里播放B站视频（复用B站CDN直链）。
请帮我实现一个后端代理服务，技术栈：Python FastAPI。

需求：
1. 从B站获取视频CDN直链（注意WBI签名：从 /x/web-interface/nav 接口获取
   wbi_img 里的 raw_key，按 MIXIN_KEY_ENC_TAB 映射表做 mixin_key，
   用 HMAC-SHA256 对参数签名，生成 w_rid）
2. 请求播放地址：/x/web-interface/wbi/video/playurl?avid=&cid=&qn=16&fnval=1
3. 做 Range 流式代理：浏览器传 Range 头，后端带 Referer: https://www.bilibili.com/
   向 CDN 请求对应字节范围，返回 206 Partial Content
4. 处理：直链过期重新获取、WBI key缓存与续期、SESSDATA Cookie注入

注意事项：
- 浏览器端无法伪造 Referer（内核层丢弃），必须后端代理
- B站返回的 m4s 是完整MP4，前端用 <video> 播放，不要用 dashjs/MSE
- 输出完整可运行的代码
```

---

## 七、经验一句话总结

> **B站防盗链是"浏览器内核 + HTTP协议"双重锁死，前端零带宽是伪命题。**
> **要拿B站视频流，唯一办法是后端代理带Referer请求，再Range转发。**
> **WBI签名是2025年5月起的硬性要求，nav接口拿key + HMAC-SHA256签名。**
