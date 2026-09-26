---
title: 'mybilibili-live-desktop OBS 端启动问题交接文档'
date: 2026-06-12
---

# mybilibili-live-desktop OBS 端启动问题交接文档

生成时间：2026-06-12
项目目录：`D:\files\mybilibili-next\mybilibili-cloud\mybilibili-live-desktop`
用户数据/日志目录：`C:\Users\a1\AppData\Roaming\mybilibili-live-desktop`

## 1. 当前结论

目前能查到明确断点：**Electron 主进程已经启动，窗口已经创建，`slbundle://` 协议能命中并返回 `bundles/vendors~renderer.js` 和 `bundles/renderer.js`，但 renderer bundle 没有真正执行到 webpack/app 启动逻辑**。

这不是简单的“缺 real OBS”问题。证据是：

- OBS native 层以前确实初始化成功过，`node-obs/logs/2026-06-03 16-10-28.txt` 里能看到 OBS API、D3D11、插件、编码器、canvas 初始化。
- 当前失败点发生在更早阶段：Vue/React/store/obs 都没有挂到 window 上，`#app` 为空。
- 也就是说：**现在卡在 Electron renderer JS 执行/入口启动层，而不是卡在 OBS native 初始化层**。

最可疑根因排序：

1. **CSP 阻止脚本执行或阻止 webpack runtime 需要的 eval/new Function/inline 逻辑**。
2. **`slbundle://` 协议返回的响应/URL 形态与 Chromium/Electron 29 对 module/runtime/script 执行要求不兼容**，导致文件“请求成功”但脚本没有运行。
3. **index.html 中 CSP hash 与当前 inline script 内容不匹配**，已经在日志中出现明确 CSP 报错；虽然后续可能调整过，但这类问题仍是当前链路中最高风险点。
4. **Electron 29 console-message 事件签名改了，当前日志里 renderer 错误被打印成 undefined，导致真正异常被吞掉/看不到**。
5. `webpack.base.config.js` 的 `output.publicPath: ''` 配合自定义协议可能导致 runtime/chunk/global 初始化异常；不过当前只有主 bundle 和 vendors，仍需进一步验证。

## 2. 关键证据

### 2.1 app.log 证明主进程正常启动，slbundle 协议命中 bundle

文件：`C:\Users\a1\AppData\Roaming\mybilibili-live-desktop\app.log`

关键日志：

```text
[2026-06-12T05:05:44.981Z] [info] [electron-main] - [ok] slbundle:// 协议已注册 (handle)
[2026-06-12T05:05:45.233Z] [info] [electron-main] - [slbundle] 请求: slbundle://bundles/vendors~renderer.js -> 解析路径: D:\files\mybilibili-next\mybilibili-cloud\mybilibili-live-desktop\bundles\vendors~renderer.js
[2026-06-12T05:05:45.245Z] [info] [electron-main] - [slbundle] 请求: slbundle://bundles/renderer.js -> 解析路径: D:\files\mybilibili-next\mybilibili-cloud\mybilibili-live-desktop\bundles\renderer.js
```

说明：协议 handler 和文件读取不是完全失败，bundle 文件路径存在并被请求。

### 2.2 renderer 没有真正跑起来

同一个日志文件：

```text
[2026-06-12T05:05:46.057Z] [info] [electron-main] - [DIAG-M1] {"t":1,"w":"?windowId=main","d":""}
[2026-06-12T05:05:46.058Z] [info] [electron-main] - [DIAG-W1] {"t":1,"w":"?windowId=worker","d":""}
[2026-06-12T05:05:48.056Z] [info] [electron-main] - [DIAG-WORKER] {"win":"?windowId=worker","hasObs":false,"hasStore":false,"hasChunks":true,"chunksLen":1,"hasVue":false,"hasReact":false,"hasApp":true,"appHTML":"","OBS_API_result":"not_set","title":"","keys":234,"sampleKeys":"__filename,__dirname,webpackChunkmybilibili_live_desktop,__SENTRY__"}
[2026-06-12T05:05:49.052Z] [info] [electron-main] - [DIAG-MAIN] {"win":"?windowId=main","hasStore":false,"bulkLoadFinished":"no_store","i18nReady":"no_store","title":"","appHTML":"","registeredStores":"no_store","keys":234}
```

解释：

- `hasChunks:true` 表示至少 webpack chunk 全局数组出现过，说明部分 JS 或 chunk bootstrap 相关逻辑可能触达。
- 但 `hasVue:false`、`hasReact:false`、`hasStore:false`、`hasObs:false`、`appHTML:""` 表示 `app/app.ts` 的实际应用初始化没有完成。
- `OBS_API_result:"not_set"` 表示还没进入 OBS API 初始化诊断，失败发生在 OBS init 前。

### 2.3 曾经有明确 CSP 报错

文件：`C:\Users\a1\AppData\Roaming\mybilibili-live-desktop\app.log`

```text
Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'unsafe-hashes' slbundle: 'sha256-wLcQqK3hC0mVyCtHmjyXOGmZGEWzdtE8WVZ8QazbBCI=' 'sha256-LvV9X60R0/ujDMWZrGm2zH4upC7BKHNh2a60+Ne3Xrc='". Either the 'unsafe-inline' keyword, a hash ('sha256-N0Xj0iMVoxyVcg6Sp5Xhq//DYYKZfJMCPajHfv06ZUY='), or a nonce ('nonce-...') is required to enable inline execution.
```

说明：`index.html` 当前存在 CSP，并且至少之前 inline script hash 不匹配。当前 `index.html`：

```html
<meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-hashes' slbundle: 'sha256-wLcQqK3hC0mVyCtHmjyXOGmZGEWzdtE8WVZ8QazbBCI=' 'sha256-LvV9X60R0/ujDMWZrGm2zH4upC7BKHNh2a60+Ne3Xrc='">
<script>
  global = globalThis;
  ... startupErrorHandler ...
</script>
<script defer src="slbundle://bundles/vendors~renderer.js" ...></script>
<script defer src="slbundle://bundles/renderer.js" ...></script>
```

建议优先临时放宽 CSP 验证是否恢复：

```html
<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline' 'unsafe-eval' file: slbundle:; worker-src 'self' blob: file: slbundle:; connect-src *; img-src * data: file: slbundle:; style-src 'self' 'unsafe-inline' file: slbundle:; font-src * data: file: slbundle:">
```

如果这样能启动，再收紧策略，而不是一开始就靠 hash。

### 2.4 OBS native 以前能启动，不能把问题归咎为没有 OBS

文件：`C:\Users\a1\AppData\Roaming\mybilibili-live-desktop\node-obs\logs\2026-06-03 16-10-28.txt`

关键日志：

```text
OBS API version 31.1.3
Initializing D3D11...
D3D11 loaded successfully
Loaded Modules:
  win-wasapi.dll
  win-spout.dll
  win-openvr.dll
  win-dshow.dll
  win-capture.dll
  rtmp-services.dll
  obs-x264.dll
  obs-outputs.dll
  obs-filters.dll
  obs-ffmpeg.dll
  obs-browser.dll
...
Set streaming encoder. name: simple_streaming_h264_main for service Main
Set streaming encoder. name: simple_streaming_h264_second for service Second
```

说明 OBS 二进制/插件链路不是完全缺失，至少 2026-06-03 这次运行进入过 OBS 初始化与 encoder 设置。

## 3. 关键文件

### `main.js`

重要片段：

- `protocol.registerSchemesAsPrivileged` 在 ready 前注册 `slbundle`
- `app.on('ready')` 中 `protocol.handle('slbundle', ...)`
- `startApp()` 创建 `workerWindow/mainWindow/childWindow`
- 三个窗口都加载：

```js
file://${__dirname}/index.html?windowId=worker/main/child
```

- 目前诊断日志在 `main.js` 约 383-436 行附近。

### `index.html`

当前脚本：

```html
<script defer src="slbundle://bundles/vendors~renderer.js"></script>
<script defer src="slbundle://bundles/renderer.js"></script>
```

CSP 是首要怀疑点。

### `webpack.base.config.js`

入口：

```js
entry: {
  renderer: './app/app.ts',
},
output: {
  path: OUTPUT_DIR,
  filename: '[name].js',
  publicPath: '',
},
target: 'electron-renderer',
```

externals 包含：

```js
'obs-studio-node': 'require("obs-studio-node")'
```

说明 OBS native 是运行期 require，不会被 bundle 内联。

### `app/app.ts`

真正 renderer/app 入口。当前还没证据表明执行到此文件的 OBS 初始化段。

## 4. 建议下一步修复方案

### 第一步：修复/放宽 CSP，确认 renderer 是否能跑起来

临时改 `index.html`，把 CSP 改成开发态宽松策略：

```html
<meta http-equiv="Content-Security-Policy" content="script-src 'self' 'unsafe-inline' 'unsafe-eval' file: slbundle:; worker-src 'self' blob: file: slbundle:; connect-src *; img-src * data: file: slbundle:; style-src 'self' 'unsafe-inline' file: slbundle:; font-src * data: file: slbundle:">
```

然后启动：

```powershell
yarn start
```

预期如果命中根因，日志中应该出现：

- `hasVue:true` 或 Vue/store 相关状态
- `AppInitFinished 收到! worker 初始化完成`
- `hasObs:true` 或 OBS_API_result 不再是 `not_set`
- `#app` 不再为空

### 第二步：补全 renderer 错误捕获，解决 Electron 29 console-message 签名问题

目前日志出现：

```text
[renderer:[object Object]] undefined:undefined - undefined
```

这说明 `webContents.on('console-message')` 处理还按旧签名读参数，Electron 29 新签名会传 event/details 对象，导致真实错误没打出来。

建议在 `main.js` 里给三个窗口统一加：

```js
function attachWebContentsDiagnostics(name, win) {
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (typeof level === 'object') {
      const d = level;
      console.log(`[renderer:${name}] ${d.level || ''} ${d.sourceId || ''}:${d.lineNumber || ''} - ${d.message || JSON.stringify(d)}`);
    } else {
      console.log(`[renderer:${name}] ${sourceId}:${line} - ${message}`);
    }
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer:${name}] did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
  });

  win.webContents.on('render-process-gone', (event, details) => {
    console.error(`[renderer:${name}] render-process-gone ${JSON.stringify(details)}`);
  });

  win.webContents.on('did-finish-load', () => {
    console.log(`[renderer:${name}] did-finish-load ${win.webContents.getURL()}`);
  });
}
```

并在创建每个窗口后调用：

```js
attachWebContentsDiagnostics('worker', workerWindow);
attachWebContentsDiagnostics('main', mainWindow);
attachWebContentsDiagnostics('child', childWindow);
```

目的：把真正的 renderer exception / CSP / script blocked / MIME blocked 打出来。

### 第三步：验证 `slbundle://` 响应是否被 Chromium 当作可执行脚本

当前 `main.js` 里 `protocol.handle` 返回：

```js
return new Response(content, {
  status: 200,
  headers: { 'Content-Type': contentType }
});
```

可继续强化：

```js
headers: {
  'Content-Type': contentType + '; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store'
}
```

另外，若仍失败，可尝试不用 `slbundle://`，临时把 `index.html` 改成 file 相对路径：

```html
<script defer src="./bundles/vendors~renderer.js"></script>
<script defer src="./bundles/renderer.js"></script>
```

如果 file 相对路径能启动，说明问题集中在 `slbundle://` 自定义协议与 Electron 29/Chromium 的执行策略上。

### 第四步：如果 renderer 能进 app.ts 后再查 OBS API

一旦 `hasVue/hasStore` 开始变 true，但 OBS 仍失败，再查：

- `obs-api/index.js`
- `node_modules/obs-studio-node/package.json`
- `node_modules/obs-studio-node/obs-plugins/64bit`
- `node_modules/obs-studio-node/data/obs-plugins`
- `C:\Users\a1\AppData\Roaming\mybilibili-live-desktop\node-obs\logs\最新日志`

当前不应优先在 OBS native 上耗时间，因为现有日志显示还没进入那一步。

## 5. 已查但未找到/未完成

- 没有在项目目录中找到 `b3kyrn81b.output` 或 `*.output` 文件。
- 当前能看到的最新有效诊断来自 `app.log`。
- 尚未最终确认 CSP 放宽后是否恢复，因为用户要求立即写交接文档。

## 6. 推荐最小修复顺序

1. 改 `index.html` CSP 为开发态宽松版本。
2. 修 `main.js` 的 renderer console-message 诊断，兼容 Electron 29。
3. 启动 `yarn start`。
4. 看 `app.log`：
   - 如果 renderer 开始报具体异常，按异常修。
   - 如果 `hasVue/hasStore/AppInitFinished` 出现，说明 CSP/脚本执行问题解决。
   - 如果 renderer OK 但 OBS fail，再进入 OBS native 层。
5. 若 CSP 放宽无效，临时将 `<script src="slbundle://...">` 改成 `./bundles/...` 验证自定义协议是否为根因。

## 7. 一句话给接手人

别从“缺 OBS 二进制”开始查。这个 fork 的 OBS native 以前已经跑到 `OBS API version 31.1.3` 和 D3D11/encoder 初始化了；当前断点在 Electron renderer 启动层：bundle 被请求，但 app.ts 没真正启动，首查 CSP、自定义协议 `slbundle://`、Electron 29 console-message/脚本执行兼容性。
