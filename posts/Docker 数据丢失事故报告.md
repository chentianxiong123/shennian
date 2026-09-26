---
title: 'Docker 数据丢失事故报告'
date: 2026-06-26
---

# Docker 数据丢失事故报告

## 事故时间

2026-06-26

## 事故原因

在将 Docker Desktop 从 C 盘迁移到 D:\devtools\Docker 的过程中，因误操作符号链接（Junction），导致 `rmdir /s /q` 通过链接删除了真实数据。

## 损失清单

### 一、Docker Desktop 程序

| 项目 | 说明 |
|------|------|
| Docker Desktop | 已重装，无损失 |

### 二、容器镜像（需重新 pull）

| 镜像 | 用途 | 来源 |
|------|------|------|
| mysql:5.7 | 数据库 | Docker Hub |
| redis:7.2-alpine | 缓存 | Docker Hub |
| mongo:6.0 | MongoDB | Docker Hub |
| minio/minio:latest | 对象存储 | Docker Hub |
| nacos/nacos-server:v2.3.2 | 服务注册中心 | Docker Hub |
| apache/rocketmq:4.9.7 | 消息队列 | Docker Hub |
| mybilibili-elasticsearch-ik:7.17.18 | ES 搜索（自定义 IK 分词） | 需重新构建 |
| registry.cn-hangzhou.aliyuncs.com/ossrs/srs:5 | 流媒体服务器 | 阿里云镜像 |

### 三、Minio 对象存储数据（不可恢复）

Minio 存储的视频文件全部丢失。包括：
- 用户上传的视频文件
- 转码后的视频片段
- 封面图等静态资源

**影响：** 所有视频内容需要重新上传。

### 四、MySQL 数据库（可恢复）

| 项目 | 状态 |
|------|------|
| 表结构 | ✅ 有备份 |
| 业务数据 | ✅ 有备份（357 条 INSERT） |
| 备份位置 | D:\files\mybilibili-next\mybilibili-cloud\init\mybilibili-mysql.sql |
| 备份时间 | 2026-05-31 |
| 备份大小 | 96.4 KB |

### 五、MongoDB 数据库（可恢复）

| 项目 | 状态 |
|------|------|
| 集合结构 | ✅ 有备份 |
| 文档数据 | ✅ 有备份（34 条 insert） |
| 备份位置 | D:\files\mybilibili-next\mybilibili-cloud\init\mybilibili-mongodb.sql |
| 备份时间 | 2026-05-24 |
| 备份大小 | 188.9 KB |

### 六、其他服务数据（不恢复）

| 服务 | 数据状态 | 说明 |
|------|----------|------|
| n8n | ❌ 丢失 | 工作流配置 |
| dify | ❌ 丢失 | AI 应用配置 |
| one-api | ❌ 丢失 | API Key 管理（one-api.db） |
| Dha_config | ❌ 丢失 | 配置文件 |

## 恢复计划

### 第一步：重装 Docker Desktop

### 第二步：创建目录结构

```
D:\devtools\Docker\
├── App\              (程序本体)
├── Images\           (WSL 虚拟磁盘)
└── Volumes\          (持久化数据)
```

### 第三步：拉取镜像

```bash
docker pull mysql:5.7
docker pull redis:7.2-alpine
docker pull mongo:6.0
docker pull minio/minio:latest
docker pull nacos/nacos-server:v2.3.2
docker pull apache/rocketmq:4.9.7
docker pull registry.cn-hangzhou.aliyuncs.com/ossrs/srs:5
# mybilibili-elasticsearch-ik 需要重新构建
```

### 第四步：启动基础设施

使用 `D:\files\mybilibili-next\mybilibili-cloud\scripts\docker-compose-infra.yml`

### 第五步：恢复数据库

```bash
# MySQL
docker exec -i mybilibili-mysql mysql -uroot -p<password> mybilibili < D:\files\mybilibili-next\mybilibili-cloud\init\mybilibili-mysql.sql

# MongoDB
docker exec -i mybilibili-mongo mongosh < D:\files\mybilibili-next\mybilibili-cloud\init\mybilibili-mongodb.sql
```

### 第六步：Minio 数据

需要重新上传所有视频文件。无法恢复。

## 总结

| 类别 | 状态 |
|------|------|
| Docker 程序 | ✅ 可重装 |
| 容器镜像 | ✅ 可重新 pull |
| MySQL 数据 | ✅ 有备份，可恢复 |
| MongoDB 数据 | ✅ 有备份，可恢复 |
| Minio 视频 | ❌ 不可恢复，需重新上传 |
| n8n/dify/one-api | ❌ 不恢复 |

**核心损失：Minio 中的视频文件。**
