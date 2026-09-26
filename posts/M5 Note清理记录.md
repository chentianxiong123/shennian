---
title: '魅族 M5 Note 深度清理 + 救砖记录'
date: 2026-06-30
---

# 魅族 M5 Note 深度清理 + 救砖记录

> 设备: M5 Note (Meizu) / MTK P20 / 2.8GB RAM  
> 系统: Flyme (MIUI 内核) / Android 6.0 / arm64-v8a  
> 日期: 2026-06-30

---

## 清理过程

### 第一批: 壁纸/屏保/垃圾 (15个)
```
com.android.wallpaper.holospiral  星系壁纸
com.android.wallpaper.livepicker  动态壁纸选择
com.android.noisefield            噪点壁纸
com.android.phasebeam             光束壁纸
com.android.galaxy4               星系壁纸4
com.android.dreams.basic          基本屏保
com.android.dreams.phototable     照片屏保
com.android.htmlviewer            HTML查看器
com.android.printspooler          打印服务
com.android.pacprocessor          PAC代理
com.android.providers.userdictionary 用户词典
com.android.keychain              密钥链
com.android.inputdevices          输入设备设置
com.android.wallpapercropper      壁纸裁剪
com.svox.pico                     TTS语音合成
```

### 第二批: MTK 工程/测试 (12个)
```
com.mediatek.engineermode         工程模式
com.mediatek.mtklogger            日志抓取
com.longcheertel.cit              工厂测试
com.goodix.gftest                 指纹测试
com.mediatek.thermalmanager       温控管理
com.mediatek.floatmenu            悬浮菜单
com.mediatek.hetcomm              通信测试
com.longcheertel.AutoTest         自动化测试
com.fingerprints.sensortesttool   指纹传感器测试
com.goodix.rawdata                指纹原始数据
com.lctautotest.camera            摄像头测试
com.mobiletools.systemhelper      系统助手
```

### 第三批: Flyme 非核心 (19个)
```
com.miui.compass                  指南针
com.miui.fm                       FM收音机
com.miui.screenrecorder           屏幕录制
com.miui.analytics                统计分析
com.miui.systemAdSolution         广告
com.miui.vsimcore                 虚拟SIM
com.miui.translation.kingsoft     翻译(金山)
com.miui.translation.xmcloud      翻译(云端)
com.miui.translation.youdao       翻译(有道)
com.miui.translationservice       翻译服务
com.miui.contentcatcher           内容抓取
com.miui.contentextension         内容扩展
com.miui.hybrid.accessory         混合配件
com.miui.smsextra                 短信增强
com.miui.cloudbackup              云备份
com.miui.micloudsync              云同步
com.miui.cloudservice             云服务
com.miui.cloudservice.sysbase     云服务基础
com.miui.greenguard               儿童模式
```

### 第四批: 桌面可见应用 (约40个)
```
com.miui.gallery                  图库
com.miui.player                   音乐
com.miui.weather2                 天气
com.miui.touchassistant           悬浮球
com.miui.cleanmaster              清理大师
com.miui.securitycenter           安全中心
com.miui.backup                   备份
com.miui.voiceassist              语音助手
com.miui.antispam                 骚扰拦截
com.miui.wmsvc                    无线显示
com.miui.vpnsdkmanager            VPN管理
com.miui.daemon                   MIUI守护
com.miui.guardprovider            防护提供
com.miui.sysopt                   系统优化
com.miui.catcherpatch             抓取补丁
com.miui.powerkeeper              电源管理
com.xiaomi.market                 应用商店
com.xiaomi.payment                小米支付
com.xiaomi.vipaccount             小米VIP
com.xiaomi.account                小米账号
com.xiaomi.finddevice             查找设备
com.xiaomi.micloud.sdk            小米云SDK
com.xiaomi.providers.appindex     App索引
com.xiaomi.powerchecker           电源检查
com.xiaomi.mircs                  小米RCS
com.xiaomi.ab                     小米AB
com.xiaomi.joyose                 小米游戏
com.xiaomi.upnp                   UPnP
com.xiaomi.simactivate.service    SIM激活
com.mmbox.browser                 浏览器
com.touchtype.swiftkey            输入法 (后恢复)
com.charge.limitedbatterycharge   充电限制
com.xiaomi.scanner                扫描
com.android.calendar              日历
com.android.camera                相机
com.android.deskclock             时钟
com.android.soundrecorder         录音
com.android.quicksearchbox        快速搜索
com.android.onetimeinitializer    一次性初始化
com.android.captiveportallogin    WiFi认证
com.android.providers.calendar    日历存储
```

---

## 死机事故分析

### 起因
一次性 `pm uninstall -k --user 0` 删除了 80+ 个 MIUI 系统包，包括 `com.miui.daemon`、`com.miui.securitycenter`、`com.miui.powerkeeper`、`com.miui.sysopt` 等核心组件。

### 现象
重启后卡在"正在优化应用启动"界面，无法进入桌面。

### 根因
1. PackageManager 检测到大量包状态变更（`inst="false"`）
2. 触发 `performBootDexOpt`（开机 dex2oat 编译）
3. dex2oat 逐个编译所有受影响的 APK，将 DEX 字节码转为机器码
4. MTK P20 (Cortex-A53) 性能极差，每个 APK 需 5-10 秒
5. 用户反复重启 → 编译每次都从头开始 → 永远跑不完

### 修复
直接修改 `/data/system/users/0/package-restrictions.xml`：
- 把所有 `inst="false"` 改为 `inst="true"`
- 让 PackageManager 认为所有包都正常安装
- 跳过 boot dexopt，直接进桌面

### 教训
- MIUI 系统包互相依赖，不能一次性大量卸载
- 安全做法：每次卸载 5-10 个，重启测试正常再继续
- 如果不需要 App 运行但想保留，用 `pm disable --user 0` 而非 `pm uninstall --user 0`
- `pm disable` 不触发 boot dexopt，`pm uninstall` 会触发

---

## 安全清理方案

**后续建议做法：**

```bash
# 安全卸载（不会触发开机编译）
pm disable --user 0 <package_name>

# 如需恢复
pm enable --user 0 <package_name>

# 卸载后触发后台编译（不阻塞开机）
cmd package bg-dexopt-job
```

---

## 当前状态

| 项目 | 状态 |
|---|---|
| **系统** | 正常运行，已进桌面 |
| **Magisk** | 保留 |
| **NewAPI** | 保留（APK 已安装） |
| **SwiftKey 输入法** | 已恢复 |
| **已清应用** | ~80+ 个 |
| **内存** | 2.8GB 总量，775MB 可用 |
