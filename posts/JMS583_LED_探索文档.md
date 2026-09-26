---
title: 'JMS583 USB-NVMe 桥接芯片 LED 控制探索文档'
date: 2026-07-29
---

# JMS583 USB-NVMe 桥接芯片 LED 控制探索文档

## 1. 背景

本文档记录了对 ITGZ 品牌 JMS583 USB-NVMe 硬盘盒固件的分析过程，目标是实现：
- **不休眠** (StandbyTimer=0)
- **熄灯** (关闭 LED 指示灯)

---

## 2. 文件信息

### 2.1 输入文件

| 文件 | 类型 | 大小 | 说明 |
|------|------|------|------|
| `itgz583-0.exe` | PE32 自解压 RAR | 1.2M | ITGZ 品牌固件工具包 |
| `JMS583-fw_02.01.03(station-drivers.com).zip` | ZIP | 879K | 官方固件包 |

### 2.2 解压后的关键文件

**ITGZ 工具包:**
```
ITGZ/
├── ITGZ.exe          (3.7M) - MassProd 批量生产工具
├── ITGZWXBF.bin      (66K)  - 固件 (2022-09-22, 较新)
├── ITGZXBF.bin       (66K)  - 固件 (2019-11-18, 旧版)
├── JMMassProd.ini           - 配置文件
├── test.bin           (416K) - 测试文件
└── log/                     - 日志目录
```

**官方固件包:**
```
├── BIN-00000037 JMS583-STD-Release-v00.02.01.03-20220422_Bus Power.bin (66K)
├── FwUpdateTool.exe   (2.5M) - 官方刷写工具
├── FwUpdateTool.ini         - 配置文件
└── Update Setp.txt          - 说明
```

---

## 3. 芯片确认

**两个工具都针对同一芯片：JMS583**

| 参数 | 值 |
|------|-----|
| 厂商 | JMicron (智微科技) |
| 型号 | JMS583 |
| VID | 0x152D |
| PID | 0x0583 |
| 功能 | USB 3.1 Gen 2 to PCIe Gen3x2 桥接控制器 |
| 核心 | 8051 单片机 |
| 封装 | QFN64 (8x8mm) |

---

## 4. 固件结构分析

### 4.1 基本信息

```
固件大小: 67072 bytes (0x10600)
格式: 8051 机器码
EEPROM 区域: 0x10400 - 0x105FF (末尾 512 字节)
```

### 4.2 固件头部

```
0x0000-0x000F: 头部信息
  0x00-0x01: 01 00 (版本/类型)
  0x02-0x03: 15 2D (VID)
  0x04-0x05: 05 83 (PID)
  0x06-0x09: 03 03 05 05 (版本信息)
  0x0A-0x0F: "JMicro" (标识)
```

### 4.3 EEPROM 布局 (0x10400 起始)

```
偏移    大小   说明
0x00    2     VID (0x152D, 小端序)
0x02    2     PID (0x0583, 小端序)
0x06    1     配置字节 1
0x07    1     配置字节 2
0x08    1     配置字节 3
0x09    1     配置字节 4
0x0A    1     配置字节 5
0x0C    1     配置字节 6
0x0D    1     配置字节 7
0x0E-0x0F  2  "JM" 标识
0x10-0x2F  32  制造商字符串 (USB String Descriptor 1)
0x30-0x53  36  产品字符串 (USB String Descriptor 2)
0x54-0x77  36  序列号字符串 (USB String Descriptor 3)
0xC0-0xC3  4   某种配置
0xC8-0xCF  8   SCSI 厂商字符串 "JMicron"
0xD0-0xDF  16  SCSI 产品名 "Generic"
0xE0-0xE1  2   "HD" 标识
0xE7      1   功能位图 1
  - bit7: USB Mass Storage / BOT
  - bit6: UASP
  - bit5: 4K 扇区模拟
0xF2      1   功能位图 2
  - bit3: 节能模式使能
0xF6-0xF7 2   节能超时 (秒, 大端序)
0xFE-0xFF 2   "JM" EEPROM 标识
```

### 4.4 当前 EEPROM 值

```
0xE7 = 0x41 (01000001b) → UASP 已启用
0xF2 = 0x28 (00101000b) → 节能模式已启用
0xF7 = 0x1E → 超时 30 秒
```

---

## 5. LED 控制探索

### 5.1 官方文档信息

来自 JMicron 官方 Datasheet (PDS-17001):

> **GPIO[4] 是默认的 LED 指示灯引脚**
> - QFN64 封装, Pin 8
> - 可通过客户固件配置
> - 共 13 个 GPIO (GPIO[0] 到 GPIO[12])

官方说明:
> "GPIO[4] is used as LED indicator by default. If the user has a different application for LED function, please contact JMicron's AE before PCB layout."

### 5.2 固件反汇编分析

#### 5.2.1 外设寄存器访问 (MOVX 指令)

搜索固件中所有 `MOVX` 指令 (访问外部寄存器):

```
总 MOVX 指令数: 5275
涉及不同地址数: 814

最常访问的地址:
0x4802: 178次 (读106 写72)
0x4807: 112次
0x70B6: 97次
0x4803: 83次
...
```

#### 5.2.2 GPIO 范围寄存器 (0x00A8-0x00AF)

仅找到 **0x00AB** 被访问:

```
0x952D: MOV DPTR, #00ABh; MOV A, #FFh; MOVX @DPTR, A
0x9668: MOV DPTR, #00ABh; MOV A, #25h; MOVX @DPTR, A
```

参考 JMB58x 寄存器文档:
- 0x00A8-0x00AB: GPIO_DATA (GPIO[15:11])
- 0x00AC-0x00AF: GPIO_CFG

**问题**: JMS583 只有 GPIO[0:12], GPIO[4] 不在 0x00AB 范围

#### 5.2.3 bit4 操作搜索

搜索所有对 bit4 (0x10) 的 SET/CLEAR 操作:

```
找到 34 个 bit4 操作
涉及 19 个不同寄存器地址

有 toggle 行为的寄存器 (可能是 LED 控制):
0x5064: 2次 (1 set, 1 clear)
0x7058: 2次 (1 set, 1 clear)
0x72D0: 3次 (1 set, 2 clear)
```

**0x7058 寄存器分析** (最有嫌疑):

```
SET bit4 at 0x253D:
  MOV DPTR, #4531h    ; 检查 0x4531
  MOVX A, @DPTR
  JZ +8               ; 如果为 0 则跳过
  MOV DPTR, #7058h    ; 否则设置 bit4
  MOVX A, @DPTR
  ORL A, #10h         ; bit4 = 1
  MOVX @DPTR, A

CLEAR bit4 at 0x25AD:
  MOV DPTR, #7058h    ; 无条件清除 bit4
  MOVX A, @DPTR
  ANL A, #EFh         ; bit4 = 0
  MOVX @DPTR, A
```

**注意**: 无法确认 0x7058 是否就是 GPIO 控制寄存器

### 5.3 开源项目参考

#### 5.3.1 jms567ctl (GitHub)

- URL: https://github.com/projectgus/jms567ctl
- 支持 JMS567/JMS583
- SCSI 命令:
  - 0xE0: 读芯片信息
  - 0xDF: Flash 读写
  - 0xFF: 复位
- **没有 GPIO 寄存器读写功能**

#### 5.3.2 JMS579 Firmware Customizer (GitHub)

- URL: https://github.com/Zibri/JMS579
- 在线工具: https://zibri.github.io/JMS579/
- 功能:
  - Enable USB/SCSI (UASP)
  - MultiSec
  - Enable 4K block size
  - **Invert LED** (UI 存在但代码未实现!)
  - Emulate device name/serial
  - Enable energy saving

**关键发现**: "Invert LED" 选项在 HTML 中定义但 JavaScript 代码中未处理

#### 5.3.3 jmb58x-re (GitHub)

- URL: https://github.com/cyrozap/jmb58x-re
- JMB582/JMB585 寄存器逆向文档
- GPIO 寄存器:
  - 0x00A8-0x00AB: GPIO_DATA
  - 0x00AC-0x00AF: GPIO_CFG
- JMS583 寄存器布局可能不同

---

## 6. JMMassProd.ini 配置分析

### 6.1 关键配置项

```ini
[JMEEPROM]
StandbyTimer=0          # 不休眠 (已配置)
VenderID=152D
ProductID=0583
StringA=ITGZ    NVME    # 制造商
StringB=ITGZ External   # 产品名
StringC=ITGZ            # 品牌
String3=DD564198838A4   # 序列号

[JMEXECUTE]
EnEEPROMUpdate=1        # 写入 EEPROM
EnFWUpdate=1            # 刷写固件
FwFileName=C:\ITGZ\ITGZWXBF.bin  # 固件文件
```

### 6.2 没有找到的配置

- LED 开关
- LED 亮度
- LED 闪烁模式
- GPIO 配置

---

## 7. 当前状态

### 7.1 已确认

| 项目 | 状态 | 说明 |
|------|------|------|
| 芯片型号 | ✅ 确认 | JMS583 (VID:152D, PID:0583) |
| LED 引脚 | ✅ 确认 | GPIO[4], QFN64 Pin 8 |
| EEPROM 位置 | ✅ 确认 | 0x10400 - 0x105FF |
| 不休眠 | ✅ 已配置 | StandbyTimer=0 |

### 7.2 未解决

| 项目 | 状态 | 说明 |
|------|------|------|
| GPIO[4] 寄存器地址 | ❌ 未知 | 可能不在标准 GPIO 范围 |
| LED EEPROM 配置位 | ❌ 未找到 | 可能不存在 |
| SCSI 寄存器读写命令 | ❌ 未知 | 需要抓包或文档 |
| 固件 LED 控制代码 | ❌ 未定位 | 找到 bit4 操作但无法确认 |

---

## 8. 结论与建议

### 8.1 结论

1. **JMS583 的 LED 控制可能没有简单的 EEPROM 配置**
2. LED 行为大概率写死在固件代码中
3. 官方文档建议联系 JMicron 工程师定制
4. 目前没有公开的 LED 关闭方法

### 8.2 可行方案

| 方案 | 难度 | 风险 | 效果 |
|------|------|------|------|
| 黑色电工胶带 | ⭐ | 无 | 遮光 |
| 拆壳剪 LED 走线 | ⭐⭐ | 低 | 永久熄灯 |
| 逆向固件改代码 | ⭐⭐⭐⭐⭐ | 高 (变砖) | 永久熄灯 |
| 联系 JMicron | ⭐⭐ | 无 | 官方支持 |

### 8.3 建议

如果 LED 真的困扰:
1. **首选**: 物理遮挡 (胶带)
2. **次选**: 拆壳剪线
3. **不建议**: 盲目改固件

---

## 9. 参考资料

1. JMicron JMS583 Datasheet (PDS-17001 Rev 1.0)
2. jms567ctl - https://github.com/projectgus/jms567ctl
3. JMS579 Firmware Customizer - https://github.com/Zibri/JMS579
4. jmb58x-re - https://github.com/cyrozap/jmb58x-re
5. Station-Drivers JMS583 Firmware - https://www.station-drivers.com

---

## 10. 附录: 固件文件校验

```
ITGZWXBF.bin:
  大小: 67072 bytes

ITGZXBF.bin:
  大小: 67072 bytes

官方固件:
  文件名: BIN-00000037 JMS583-STD-Release-v00.02.01.03-20220422_Bus Power.bin
  大小: 67072 bytes
```

---

*文档生成时间: 2026-07-29*
*分析工具: Python, strings, od, websearch*
