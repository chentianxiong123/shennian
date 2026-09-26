---
title: 'YL_MF601SL_D / UFI103_CT 移动物联网卡（IMSI 46024）4G 数据调试总结'
date: 2026-08-30
---

# YL_MF601SL_D / UFI103_CT 移动物联网卡（IMSI 46024）4G 数据调试总结

---

## 设备信息
| 项目 | 值 |
|------|-----|
| 型号 | YL_MF601SL_D / UFI103_CT（电信定制） |
| SoC | Qualcomm MSM8916 (Snapdragon 410) |
| Android | 4.4.4 (KitKat) |
| Baseband | UFI103_CT 20220801 |
| 固件版本 | MF601SL_D_V03_QRZL_QB_DD_N_230504 |
| RAM | 393 MB |
| 屏幕 | 128×128 LCD（投屏查看） |
| Root | Magisk (adb shell su) |
| 分区 | 标准 MSM8916：boot/recovery/system/userdata/cache/modem/fsg/fsc/persist/rpm/tz/sbl1/hyp |

---

## 问题背景

| 场景 | 表现 |
|------|------|
| **电信卡 (IMSI 46011)** | ✅ LTE 正常，rsrp -88，rmnet0 UP，可上网 |
| **移动物联网卡 (IMSI 460240428463362)** | ❌ LTE 注册成功 (operator=46000/CMCC)，但 **无数据连接**，rmnet0 永远 DOWN，gsm.data.state=DISCONNECTED |

---

## 核心根因链路

### 1. 早期误区：飞行模式
- `persist.radio.airplane_mode_on=1` 导致 4G 彻底断流
- 改为 `0` 后电信卡恢复正常 → **非基带/云控问题**

### 2. 真实瓶颈：APN 查询 PLMN 不匹配
- SIM 卡上报 `operator_numeric = 46024` (MCC=460, MNC=24，**非标准移动 MNC**)
- 但 `telephony.db` 内置 APN 表只有 `46000/46002/46004/46007/46008/46013` 等标准 PLMN，**无 46024**
- 框架执行：
  ```java
  createAllApnList: selection = "numeric = '46024' AND carrier_enabled = 1"
  → 结果：No APN found for carrier: 46024
  → mAllDps = []
  → buildWaitingApns: X apnList=[]
  → trySetupData: X No APN found retValue=false
  ```

---

## 关键修复动作

| 步骤 | 操作 | 结果 |
|------|------|------|
| 1 | `sqlite3 telephony.db` 插入 `_id=3550`：`46024/cmnet/default,net,supl` | ✅ 写入成功 |
| 2 | 发现所有原生 APN 的 `carrier_enabled` 为 **NULL**，改为 `1` | ✅ 修正查询条件匹配 |
| 3 | WAL checkpoint + 重启 `com.android.phone` / `com.qualcomm.telephony` | ✅ DB 变更生效 |
| 4 | 再次触发 `createAllApnList` | ✅ **不再报错 "No APN found"**，框架读到记录 |

---

## 最终卡点：网络侧拒绝数据注册

修复 APN 后，日志出现：
```
reasonDataDenied=15
EmergOnly=true
mDataConnectionPossible=false
```

**含义**：运营商核心网对该 IMSI（46024 物联网卡）的 **数据承载注册直接拒绝**。这是 SIM 订阅/网络策略层面的限制，**非 Android telephony 框架可解决**。

| 指标 | 含义 |
|------|------|
| `reasonDataDenied=15` | 3GPP TS 24.008 Cause #15 "No Suitable Cells In Location Area" 或运营商自定义拒绝 |
| `EmergOnly=true` | 仅允许紧急呼叫，数据业务被阻断 |

---

## 其它发现

| 项目 | 现状 |
|------|------|
| `persist.ufi.ft.only_sn` | 已改为 `0`（关闭仅 SN 认证） |
| `persist.ufi.nosignal.reboot` | 已为 `no`（无信号不重启） |
| 云控参数 | `persist.ufi.sn.auth.service=1`, `persist.ufi.ft.server=svr_qirui_lienni` |
| `com.android.phone` | 反复 kill -9 后会闪退重启，影响数据拨号流程稳定性 |
| `gsm.operator.numeric` | 网络注册后显示 `46000` (CMCC)，非 SIM 原始 `46024` |

---

## 结论

| 维度 | 判断 |
|------|------|
| **APN 缺失** | ✅ **已修复** — DB 现有 46024/cmnet，框架能读到 |
| **数据注册** | ❌ **网络层拒绝** — reasonDataDenied=15，SIM/运营商策略限制 |
| **可通过系统修改解决** | ❌ **不可** — 非框架/配置层面问题 |
| **换普通移动卡** | ✅ 可行 — 标准 PLMN (46000/46002/46004...) 在 DB 中均有 APN |
| **刷 OpenWrt/Debian** | ⚠️ 绕过云控可行，但 **SIM 数据注册限制依然存在** |

---

## 现场遗留状态（收手时刻）

- `telephony.db` 保留两条 `46024` 记录 (`_id=2605, 3550`)，**不影响电信卡**，可留作备查
- `build.prop`：`persist.ufi.ft.only_sn=0` 已持久化
- 设备静置/重启后网络注册会自动恢复到 LTE (46000/CMCC)
- 电信卡 (46011) 功能完全正常

---

## 后续可选方向（若继续）

1. **换卡测试** — 用标准移动卡 (46000/46002/46004...) 验证 APN 流程完整性
2. **抓 modem 日志** — `diag` / `qcril` 侧看具体 NAS 拒绝原因
3. **刷机 OpenWrt** — 找 UFI103_CT/MF601SL_D 适配固件，备份 `modem.img/fsg.img/fsc.img/factory.img` 后尝试
4. **联系运营商** — 确认 46024 物联网卡是否开通了数据业务、APN 是否为 `cmnet`、是否有设备锁/IMEI 绑定

---

## 关键命令速查

```bash
# 查看当前网络状态
getprop gsm.operator.numeric; getprop gsm.network.type; getprop gsm.data.state; ip addr show rmnet0

# 查看 telephony DB
sqlite3 /data/data/com.android.providers.telephony/databases/telephony.db \
  "SELECT _id,numeric,mcc,mnc,apn,type,carrier_enabled FROM carriers WHERE numeric LIKE '460%';"

# 重启 telephony（慎用，会导致闪退）
kill -9 $(pgrep -f com.android.phone) $(pgrep -f com.qualcomm.telephony)

# 抓 radio log 关键流程
logcat -b radio -d | grep -iE "createAllApnList|buildWaiting|trySetup|No APN|DataCall|rmnet"

# 挂载 system 可写
mount -o rw,remount /system
```

---

---

## 另一台设备：ZTE Linux（中兴定制嵌入式）能拨通的真相

> 用户在调试期间接入了**另一台设备**进行对比，证明同一张移动物联网卡在别的设备上可以正常上网。

### 设备信息
| 项目 | 值 |
|------|-----|
| 型号 | 中兴 ZTE（非 MF601SL_D，另一台随身 WiFi）|
| SoC | （未知，非 MSM8916）|
| 系统 | Buildroot 2015.08 + 中兴自定义用户态（非 Android、非 OpenWrt）|
| 内核 | Linux 3.4.110-rt140 (ZTE SCM) |
| IP 分配 | wan1 获得 `10.183.164.117`（移动核心网私网 IP）|
| 拨号状态 | `ppp_status=ppp_connected`, `modem_main_state=modem_init_complete` |

### 拨号栈构成
```
zte_ufi (PID 628) ──┐
qrzl_app (PID 757) ─┘ → 发 AT 命令 → modem → pppd 建 ppp0
```
- 拨号触发：`/sbin/auto_dial.sh` → `/sbin/pppd_up.sh` → `pppd`（选项来自 `/etc_ro/options.{auth,noauth}`）
- AT 初始话：`/etc_ro/initchat` 含 `ATD*99# CONNECT`
- 配置存储：中兴私有 `nv`（NVRAM），可通过 `nv get/show` 读写
- APN 配置：`APN_configtmp0=Default($)Default($)manual($)($)($)($)($)IPv4v6($)auto($)$`（当前为空 APN，让网络侧自动分配）

### 关键日志 / 状态
```
nv get ppp_status          → ppp_connected
nv get modem_main_state    → modem_init_complete
nv get apn_index           → 0
nv get auto_apn_index      → 0
ip addr show wan1          → inet 10.183.164.117/24  UP BROADCAST RUNNING NOARP MTU:1400
ip route                   → default dev wan1 scope link
```
数据流量正常：`/proc/net/conn_datainfo` 有大量 TCP 443/80 双向包记录。

---

## 为什么这张卡在这台 ZTE 上能用、在 MF601SL_D 上不行？

### 根本差异：拨号栈的 "门" 不一样

| 层级 | MF601SL_D (Android 4.4.4) | ZTE Linux (中兴自定义) |
|------|---------------------------|----------------------|
| **拨号发起方** | `GsmDCT`（Java 框架） | `zte_ufi`（C 程序） |
| **APN 来源** | `telephony.db` SQLite，按 **SIM IMSI PLMN** 过滤 | `nv` NVRAM，手动填或空（让网络侧自动） |
| **PLMN 白名单** | ✅ 有关卡——按 `operator_numeric=46024` 查 DB，查不到就放弃 | ❌ 无此关卡——不依赖 SIM 的 PLMN |
| **注册校验** | RIL 层在拨号前校验 `reasonDataDenied`，被拒则放弃 | 直接 `AT+CGDCONT` → `ATD*99#`，modem 自己处理 |
| **PDP 建立** | Android → RIL → modem，中间多一层封装 | 裸 AT 命令 → modem，最短路径 |
| **拒绝结果** | `reasonDataDenied=15` → `trySetupData: X No APN found` | 网络侧接受 PDP 请求 → 拿到 10.x IP |

### 一句话解释
**这张移动物联网卡的 IMSI 是 `46024`（非标准 MNC=24），Android telephony 框架用这个 PLMN 去查 `telephony.db`，查不到 → 框架拒绝发起数据请求 → 卡在 `reasonDataDenied=15`。中兴这台用裸 AT 直接拨，根本没有那一道 PLMN 白名单关卡，所以能通。**

> APN 是移动网标准（`cmnet`），Linux 的 pppd/AT 比 Android telephony 框架少一层"运营商 PLMN 白名单"的关卡，这张卡在新系统上就能通过。

---

> **最终结论**：MF601SL_D 上 APN 修对了，但被 Android 框架的 PLMN 白名单 + 网络侧 `reasonDataDenied=15` 双重拦截，软件层面无法突破。同一张卡在没有这道关卡的设备（如中兴这台）上是可以正常使用的。建议保留 MF601SL_D 现状、换卡使用，或走完整刷机路线（刷入无该框架的固件）。