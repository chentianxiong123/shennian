---
title: 'mybilibili 数据库层设计取舍'
date: 2026-08-14
---

# mybilibili 数据库层设计取舍

> 对比 Java 微服务版（MyBatis-Plus + MySQL）vs Go 单体版（`database/sql` + PostgreSQL）

## 核心差异

| 维度 | Java 版 | Go 版 |
|------|---------|-------|
| 数据库 | MySQL 5.7 | PostgreSQL 16 |
| 数据访问层 | MyBatis-Plus (ORM) | `database/sql` (手写 SQL) |
| 查询方式 | 自动生成 CRUD + 手写 XML | 全部手写 `$1` 参数化查询 |
| 迁移工具 | Flyway | 无（手动跑 SQL） |
| 类型安全 | 弱（`${}` 字符串拼接） | 强（只有 `$N` 参数化） |

---

## 安全性对比

### Go 胜出

Go 的 `database/sql` 只提供 `$1`、`$2` 参数化查询这一种传参方式，**没有 `${}` 拼接的逃生门**。开发者不可能写出 SQL 注入代码。

### Java 的隐患

MyBatis 提供两种参数绑定：
- `#{}` — 安全，参数化
- `${}` — 危险，裸字符串拼接，用于动态表名/ORDER BY

Java 版代码里确实存在 `${userIds}` 拼接写法，虽然量少，但证明了**框架给了刀，就有人会用来砍人**。

### 结论

**Go 安全是因为没给你不安全的选项，不是因为它设计得更好。** 就像没钥匙的房子不会遭贼——安全是靠限制换来的，不是靠设计。

---

## 工程效率对比

### MyBatis-Plus 的优势

1. **自动生成 CRUD**：`insert(T)`、`updateById(T)`、`selectList(Wrapper)` 零代码
2. **Lambda 查询构造器**：`lambdaQuery().eq(User::getName, "test").list()`
3. **分页插件**：一行代码搞定分页
4. **代码生成器**：表结构 → Entity/Mapper/Service/Controller 全自动
5. **XML 集中管理**：复杂 SQL 统一在 XML 里，DBA 友好

### Go `database/sql` 的代价

1. **模板代码多**：每个查询都要写 `rows.Scan(&a, &b, &c)`
2. **无自动映射**：struct 字段和 SQL 列必须手动对应
3. **无迁移工具**：当前 SQL 文件需要手动执行
4. **分页手写**：`LIMIT $1 OFFSET $2` 每页都要写

### 量化对比（估算）

对一个典型的 CRUD 业务（5 张表，每表 10 个查询）：

| 活动 | MyBatis-Plus | Go `database/sql` |
|------|-------------|-------------------|
| 建表 → 跑起来 | 30 分钟（代码生成器） | 2 小时（手写全部） |
| 加一个字段 | 5 分钟（改 Entity + XML） | 5 分钟（改 SQL + Scan） |
| 排查线上 SQL 问题 | 快（XML 集中管理） | 中（SQL 散在 repository） |
| 新人上手 | 慢（要学 MyBatis 概念） | 快（就是 SQL） |

---

## 为什么 Java 版用 MyBatis-Plus？

**不是技术选择，是生态选择。**

1. **国内 Java 后端标配**：MyBatis-Plus 在国内 Java 圈的普及率接近 100%，招人成本最低
2. **微服务架构需要**：8 个服务，每个服务独立数据库，用 ORM 统一 CRUD 写法
3. **历史惯性**：项目从单体到微服务一路用 MyBatis，没有理由换
4. **`${}` 是少数场景的逃生口**：MyBatis 设计者没预料到开发者会在用户输入上用它

---

## 对 Go 版的建议

### 必需

| 项 | 建议 | 理由 |
|----|------|------|
| 迁移工具 | 加 `golang-migrate` | 启动时自动跑未执行的 SQL，避免手动操作 |
| 健康检查 | 已有 | 确认 DB 连通性 |

### 可选（暂不建议）

| 项 | 不建议的理由 |
|----|-------------|
| 换 ORM（GORM） | 项目 27K 行，全部手写 SQL，换 ORM 等于重写。收益不大 |
| 加 sqlx | 薄封装，省 `rows.Scan` 模板代码。可加，但非必需 |
| 加 query builder | 手写 SQL 就是最好的 DSL，多一层抽象多一层认知负担 |

### 一句话

**加个迁移工具就够，其他不动。** 手写 SQL + 参数化查询 = 安全 + 清晰，当前架构没有换的理由。