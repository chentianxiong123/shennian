---
title: 'HomeSense-Studio v2 交接文档 — 2026-06-06'
date: 2026-06-06
---

# HomeSense-Studio v2 交接文档 — 2026-06-06

## 0. 当前上下文

- 当前主仓库：`D:\files\HomeSense-Studio-v2`
- 旧仓库只做参考：`D:\files\HomeSense-Stdio`
- 当前目标不是继续堆页面，而是把“设备 / 授权 / 数字孪生”的职责边界重新理顺。
- 用户最新明确方向：
  - 数字孪生先做 2D，不做 3D。
  - 设备页要重新设计成 2D 房间 / 设备视图。
  - 绑定关系不要堆在 2D 图上，去详情页里看。
  - IP 保留，但不再叫 LAN 来源。
  - ADB 是能力来源 / 绑定来源，不叫 LAN。
  - ADB 授权页只管理 ADB 端点，不管理完整设备。

---

## 1. 服务与验证状态

当前开发服务已重启过：

- Server: `http://127.0.0.1:3000`
- Web: `http://127.0.0.1:5174`
- 授权页：`http://127.0.0.1:5174/authorizations`
- 设备页：`http://127.0.0.1:5174/devices`

最近验证：

- `pnpm --filter @hs/server typecheck` 通过。
- `pnpm --filter @hs/web exec vite build` 通过。
- `/api/auth/status` 返回 `source=local_auth_file`，不再默认启动 mi-cli。
- `/api/user-devices/cards?online=1` 的 `sources` 现在只会是 `mi` / `adb`，不会再因为有 IP 生成 `lan`。
- `/api/user-devices/mi-candidates`：
  - 优先读 mi-cli 磁盘缓存：`source=mi_cli_disk_cache`
  - 后续 5 分钟命中内存缓存：`source=memory_cache`

注意：

- `pnpm --filter @hs/web build` 仍会被旧测试文件卡住，因为缺 `vitest` / `@vue/test-utils`。当前不急着处理测试，先用 `vite build` 做页面编译验证。
- 当前 git 工作区本来就是大面积未跟踪 / 迁移状态，不要按普通干净仓库假设处理。

---

## 2. 授权中心现状

入口：

- 新入口：`/authorizations`
- 老入口 `/integrations` 已废弃并重定向到 `/authorizations`
- `/integrations/mi-cli` 重定向到 `/authorizations/mi-cli`

页面结构：

- 一级 tab：
  - 外部账号：`Mi` / `Bilibili`
  - 局域网账号：`ADB` / 串流 / SSH / FRP / SMB

用户已经纠正过命名：

- 这里的“局域网账号”是授权归类，不等于设备来源叫 LAN。
- 对设备能力来源来说，必须说 `ADB`，不是 `LAN`。

---

## 3. Mi 状态与候选设备缓存

### 3.1 登录状态

已改文件：

- `apps/server/src/auth/auth.controller.ts`
- `packages/mi-cli/src/mi_cli/api/auth.py`
- `apps/web/src/api/index.ts`

当前行为：

- `/api/auth/status` 默认直接读取本地 `auth.json`。
- 返回 `source=local_auth_file`。
- 不启动 mi-cli，不联网。
- 只有 `?refresh=1` 才强制走 mi-cli 的 `login_status`。
- mi-cli 内部也改成 cache-first：
  - 核心字段完整即可认作本地登录。
  - 老缓存没有 `expireTime` 时也不再为了“显示登录状态”去联网。

这个改动是为了解决：点 Mi / 打开授权页时卡住几百毫秒甚至更久。

### 3.2 Mi 候选设备

已改文件：

- `apps/server/src/devices/device.service.ts`
- `apps/server/src/devices/device.controller.ts`
- `apps/web/src/views/DevicesView.vue`
- `apps/web/src/api/index.ts`

当前行为：

- 编辑设备弹窗不再等待 `miCandidates()` 才打开。
- 弹窗先显示已有字段，Mi 候选后台加载。
- 当前已绑定的 `mi_did` 会先作为 fallback option 显示，不会空白。
- 后端 `mi-candidates` 优先读：
  1. 5 分钟内存缓存
  2. mi-cli 磁盘缓存 `~/.cache/mi-cli/devices.json`
  3. 最后才启动 `mi-cli discover summary_only=true`

用户观察到的卡顿原因：

- 原来 `openEdit()` 每次都会 await `api.userDevices.miCandidates()`。
- 后端每次都会启动 `mi-cli discover`。
- 即使命中 mi-cli 自己的设备缓存，启动 Python / uv 本身也慢。

---

## 4. ADB 当前边界

这是本轮最重要的边界调整之一。

用户最终确认：

- ADB 授权页不是设备管理页。
- ADB 授权页只保留一个 ADB 端点列表。
- 最多能自己填一个名字，改名，改 IP:端口。
- 具体映射绑定到哪个设备，去设备页做。

当前 `/authorizations` 的 ADB 区：

- 列表只显示：
  - 名称
  - 地址
  - 编辑 / 删除
- 新增 / 编辑弹窗只保留：
  - 名称
  - IP:端口
- 不再显示：
  - 房间
  - 类型
  - 单独 IP
  - 在线状态
  - 验证按钮
  - 应用按钮
  - 设备详情跳转

当前实现仍暂时复用 `user_devices` 表承载 ADB 端点：

- 新增端点时默认：
  - `device_type=other`
  - `room_id=null`
  - `adb_ip=IP:端口`
  - `ip_address` 自动从端点拆 host

这只是临时承载。后续更干净的模型应该是拆出 `adb_endpoints` 或 `device_bindings`。

---

## 5. 设备管理当前边界

已改文件：

- `apps/web/src/views/DevicesView.vue`
- `apps/web/src/views/DeviceDetailView.vue`
- `apps/server/src/devices/device-card-projection.ts`

当前定义：

- `Mi` 是来源 / 能力绑定。
- `ADB` 是来源 / 能力绑定。
- `IP` 只是网络地址，用于在线检测，不是来源。
- 废除设备侧 `LAN` 说法。

具体变化：

- 设备列表 source tag：
  - 有 `mi_did` 显示 `Mi`
  - 有 `adb_ip` 显示 `ADB`
  - 只有 `ip_address` 不显示来源 tag
- 设备详情：
  - `LAN: xxx` 改成 `ADB: xxx`
  - `LAN · n` 能力分组改成 `ADB · n`
  - “LAN 控制来源”文案改成 “ADB 能力来源”
- 后端 `DeviceCardProjection.sources`：
  - 以前：有 `ip_address` 或 `adb_ip` 就加 `lan`
  - 现在：只有 `adb_ip` 才加 `adb`

---

## 6. 当前数据

v2 DB：

- `D:\files\HomeSense-Studio-v2\data\homesense-v2.db`

已从 legacy 恢复的数据：

- 房间：3
- 设备：6
- ADB 端点 / ADB 绑定字段：
  - `客厅机顶盒` — `192.168.31.91:5555`
  - `华为手机` — `192.168.31.253:5555`
  - `红米手机` — `192.168.31.124:5555`
- Mi 绑定：
  - 客厅电视
  - 客厅机顶盒
  - 两个小爱音箱

注意：

- 这 3 个 ADB 现在仍是 `user_devices` 里的记录。
- 用户希望后续“端点”和“设备绑定”分开，这块还没拆表。

---

## 7. 数字孪生方向

用户最新方向：

- 先造 2D 图。
- 不做 3D。
- 绑定关系去详情页看，不堆在图上。
- 2D 图第一版只表达：
  - 房间
  - 设备位置
  - 设备类型
  - 在线 / 离线
  - 当前选中设备

建议下一刀：

- 重做 `/devices`。
- 不再以卡片网格作为主视图。
- 改成：

```text
[ 房间筛选 / 状态筛选 / 搜索 ]

┌───────────────────────────────┬────────────────────┐
│                               │  选中设备摘要       │
│        2D 房间画布             │  名称 / 状态 / 入口 │
│                               │                    │
│  ┌──────── 客厅 ────────┐      │  详情页查看绑定     │
│  │ TV     STB    音箱   │      │  Mi / ADB / IP      │
│  └─────────────────────┘      │                    │
│                               │                    │
│  ┌──────── 餐厅 ────────┐      │                    │
│  │ 小爱音箱             │      │                    │
│  └─────────────────────┘      │                    │
└───────────────────────────────┴────────────────────┘
```

第一版不要做：

- 拖拽
- 精准户型
- GPS 定位
- 复杂连线
- 在图上塞绑定字段

第一版应该做：

- 按房间渲染区域。
- 每个设备是房间内一个节点。
- 节点显示图标 / 名称 / 在线状态。
- 点击节点选中，右侧显示摘要和“进入详情”。
- 详情页继续承接绑定查看和编辑。

---

## 8. GPS 问题结论

用户问过：GPS 能不能拿，拿到了有没有用。

结论：

- 手机 GPS 可以拿，但需要手机端配合：
  - 自研 Android App
  - Tasker / MacroDroid
  - Home Assistant Companion App
  - 生态接口，但通常不稳定
- 电视 / 盒子 / 音箱 / 路由器基本没有 GPS。
- GPS 对室内房间级数字孪生帮助不大，精度不够。
- GPS 更适合：
  - 判断人是否在家
  - 回家 / 离家自动化
  - 家庭成员大概位置

当前数字孪生不要依赖 GPS。

设备位置先手动放到房间里。

---

## 9. 测试态度

用户问过 `vitest / @vue/test-utils` 是否必要。

当前判断：

- 它们是测试框架，不是运行时依赖。
- 旧测试是否正确还不确定。
- v2 当前正在重排产品结构，不急着补测试依赖。
- 不建议为了让测试过而固定旧结构。
- 当前验证方式：
  - server: `pnpm --filter @hs/server typecheck`
  - web: `pnpm --filter @hs/web exec vite build`

后续如果要恢复测试：

- 加 devDependencies：
  - `vitest`
  - `@vue/test-utils`
  - `jsdom` 或 `happy-dom`
- 或拆 `tsconfig.app.json`，让生产 build 排除 `*.test.ts`。

---

## 10. 下一步建议

优先级按用户最新方向排序：

1. 重做 `/devices` 为 2D 房间画布。
2. 保留设备详情页作为绑定 / 能力查看入口。
3. 从 `user_devices` 里拆出 ADB 端点模型：
   - `adb_endpoints`
   - 或 `device_bindings`
4. 设备页中 ADB 绑定不要手填散落字段，应该从 ADB 端点列表里选择。
5. 数字孪生 2D 图先用 rooms + devices 的现有数据渲染，不做复杂编辑。
6. 等 UI 稳定后再考虑测试框架和 tsconfig 拆分。

---

## 11. 关键提醒

- 不要再把 `LAN` 当设备来源。
- `IP` 只是网络状态字段。
- `ADB` 才是能力来源。
- 授权中心 ADB 页只管端点，不管设备绑定。
- 设备绑定在详情页看。
- 2D 数字孪生是下一刀，先做房间和设备节点，不要先做复杂能力图。
- Mi 状态和 Mi 候选都已经做 cache-first，不要再把打开页面绑到 mi-cli 启动上。

