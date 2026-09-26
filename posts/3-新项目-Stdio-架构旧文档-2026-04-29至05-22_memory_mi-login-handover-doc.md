---
title: '3 新项目 Stdio 架构旧文档 2026 04 29至05 22 memory mi login handover doc'
date: 2026-04-29
---

---
name: mi-login-handover-doc
description: 米家登录交接文档位置与核心结论
type: reference
---

小米登录交接文档位于: `D:\files\HomeSense Stdio\docs\MI-LOGIN-HANDOVER-2026-05-17.md`

核心结论:
- 当前主线: `mi-cli` (已取代 HA / hami-cli)
- 已修过: verify_ticket 链路、ssecurity 持久化、cli-bridge QR 动作注册
- 真实卡点: (1) 登录后设备云 HTTP 401 (2) 二维码实现未完全照搬成功参考
- 成功参考: bilibili-music 的二维码实现、hass-xiaomi-miot 的云请求实现
- 下一任不应再: 归咎前端、混回旧 auth.py、自己发明二维码流程、假设 serviceToken 存在即可 discover