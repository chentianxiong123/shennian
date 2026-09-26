---
title: '联想小新 Fn+Q 野兽模式无法开启 - 解决方案'
date: 2026-07-04
---

# 联想小新 Fn+Q 野兽模式无法开启 - 解决方案

## 问题现象
按 Fn+Q 组合键无反应，无法切换野兽模式。

## 根本原因
Lenovo Notebook ITS Service 服务未运行或未设置为自动启动。

## 成功解决方案

### 第一步：启用 ITS 服务
1. 按 `Win+R`，输入 `services.msc`，回车
2. 找到 `Lenovo Notebook ITS Service`
3. 右键 → 属性
4. 启动类型改为 `自动`
5. 点击 `启动` 按钮
6. 点击 `确定`

### 第二步：验证
- 按 Fn+Q，屏幕应显示模式切换图标
- 野兽模式：开机键亮红灯
- 安静模式：开机键亮蓝灯
- 均衡模式：开机键亮白灯

## 不需要的操作
| 操作 | 是否必要 | 说明 |
|------|----------|------|
| 安装 Lenovo Hotkeys | 不必要 | 核心功能不依赖此软件 |
| 禁用 LenovoHotkeyService | 可选 | 与ITS服务独立 |
| 禁用 LenovoFnAndFunctionKeys | 不要禁用 | Fn+Q核心服务 |

## 保留的关键服务
- `LenovoFnAndFunctionKeys` - Fn+Q功能核心服务
- `LITSSVC` (Lenovo Notebook ITS Service) - 本问题的关键修复点

## 卸载 Lenovo Hotkeys（可选）
1. 设置 → 应用 → 已安装的应用
2. 搜索"Lenovo Hotkeys"，卸载
3. 服务中禁用 `LenovoHotkeyService`

---
记录时间：2026年7月4日
