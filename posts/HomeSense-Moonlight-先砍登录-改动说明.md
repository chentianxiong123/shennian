---
title: 'HomeSense Moonlight 先砍登录 改动说明'
date: 2026-06-27
---

## 已按「先砍登录再说」做的改动

### 用户侧（浏览器）
- `/moonlight` 根路径 → **404**（不再 308 到 index）
- 禁止代理：`index.html/js`、`admin.html/js`、`/api/*` 等
- 仅放行：`stream.html`、`stream/*`、静态资源（js/css/wasm…）

### 服务端（过渡，用户看不见）
- Nest 仍用 `homesense-auth.json` + `/api/login` **仅给 web-server 内部 API**（列应用、起流）
- 启动时 **不再** `ensureRuntimeDefaultUserConfig` 写 default_user
- `config.json`：`first_login_create_admin/assign_global_hosts` = **false**

### HomeSense 入口
- `sessionEntry.viewer_url` 改为 **`/moonlight/stream.html?...`**，不再指向会 404 的根

### 还没砍（你说继续再说）
- `listHostApps` 仍调 web-server `/api/apps`（需内部 session）
- 整块 `web-server` 子进程（要薄 gateway 才能卸）

