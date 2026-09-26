---
title: 'NewAPI Go Binary 性能测试汇总'
date: 2026-06-30
---

# NewAPI Go Binary 性能测试汇总

**测试环境:** hi3798mv100 | 4×Cortex A53 @1.5GHz | 723MB RAM | Ubuntu 20.04
**测试工具:** JMeter 5.6.3 | JDK 8 Corretto-1.8.0_472
**测试接口:** GET /api/status (Gin + GORM + SQLite, 限流关闭)

---

## 有前端 vs 无前端

| 并发 | 版本 | 体积 | RPS | 平均 | 中位 | P95 | P99 | 错误率 |
|------|------|------|-----|------|-----|-----|-----|--------|
| 10 | 有前端 | 127MB | 340 | 27ms | 23ms | 51ms | 76ms | 0% |
| 50 | 有前端 | 127MB | **566** | 74ms | 71ms | 126ms | 158ms | 0% |
| 50 | **无前端** | **52MB** | **585** | **70ms** | **68ms** | **118ms** | **143ms** | 0% |
| 100 | 有前端 | 127MB | 384 | 201ms | 218ms | 357ms | 399ms | 0% |
| 100 | **无前端** | **52MB** | **436** | **168ms** | **175ms** | **315ms** | **366ms** | 0% |
| 200 | 有前端 | 127MB | 275 | 495ms | 487ms | 942ms | 1.1s | 0% |

**去前端收益:**
- 二进制体积: 127MB → 52MB (**-59%**)
- 50并发吞吐: 566 → 585 req/s (**+3%**)
- 100并发吞吐: 384 → 436 req/s (**+14%**)

---

## 瓶颈分析

| 指标 | 空闲 | 50并发峰值 | 瓶颈? |
|------|------|-----------|-------|
| CPU 用户态 | 1% | 60% | 🔴 应用代码 |
| CPU 内核态 | 1% | 40% | ⚠️ 上下文切换 |
| CPU 空闲 | 99% | 4-8% | 🔴 CPU耗尽 |
| IO等待 | 0% | 0% | ✅ |
| 磁盘IO | 0 | 0 | ✅ |
| 上下文切换 | 635/s | 14,263/s | ⚠️ |
| 网络 | 空闲 | ~5MB/s | ✅ |

**结论:** 纯CPU瓶颈, 拐点约42并发, 最优50并发566req/s

---

## 编译参数速查

```go
// 有前端 (默认)
GOOS=linux GOARCH=arm GOARM=7 CGO_ENABLED=0 go build -ldflags="-s -w"

// 无前端 (体积优化)
GOOS=linux GOARCH=arm GOARM=7 CGO_ENABLED=0 go build -tags no_web -ldflags="-s -w"

// R3路由器 (mipsle)
GOOS=linux GOARCH=mipsle GOMIPS=softfloat CGO_ENABLED=0 go build -tags no_web -ldflags="-s -w"
```
