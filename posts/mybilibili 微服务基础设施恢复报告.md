---
title: 'mybilibili 微服务基础设施恢复报告'
date: 2026-06-26
---

# mybilibili 微服务基础设施恢复报告

## 恢复时间

2026-06-26

## 背景

因 Docker 目录迁移操作失误，导致 Docker 程序、WSL 虚拟磁盘（52GB）、Minio 视频数据全部丢失。本次工作完成 Docker 重装、目录迁移、镜像拉取、基础设施部署、数据恢复。

## 一、Docker Desktop 迁移

### 目录结构

```
D:\devtools\Docker\
├── App\              (Docker Desktop 程序本体)
├── Images\           (WSL 虚拟磁盘)
└── Volumes\          (持久化数据)
```

### 迁移方式

1. 正常安装 Docker Desktop 到 C 盘
2. 停止所有 Docker 进程和 WSL
3. 将 C:\Program Files\Docker 移动到 D:\devtools\Docker\App
4. 创建 Junction 符号链接：C:\Program Files\Docker → D:\devtools\Docker\App
5. 配置 settings-store.json 的 CustomWslDistroDir 指向 D:\devtools\Docker\Images

### 关键教训

**绝对不能在符号链接内部执行文件操作。** Junction 是透明的，你以为在操作 D 盘，实际通过链接操作的是 C 盘。正确流程：先断开链接 → 创建目录 → 复制文件 → 删除原目录 → 重建链接。

## 二、镜像拉取

| 镜像 | 大小 | 用途 |
|------|------|------|
| mysql:5.7 | 700MB | 数据库 |
| redis:7.2-alpine | 56.9MB | 缓存 |
| mongo:6.0 | 1.1GB | MongoDB |
| minio/minio:latest | 241MB | 对象存储 |
| nacos/nacos-server:v2.3.2 | 1.27GB | 服务注册中心 |
| apache/rocketmq:4.9.7 | - | 消息队列 |
| elasticsearch:7.17.18 | 1.02GB | 搜索引擎 |
| mybilibili-elasticsearch-ik:7.17.18 | 1.04GB | ES + IK 分词插件（自定义构建） |
| registry.cn-hangzhou.aliyuncs.com/ossrs/srs:5 | 224MB | 流媒体服务器 |

### 镜像拉取问题

Docker Desktop 跑在 WSL 里，WSL 是独立网络命名空间，Windows 系统代理对它无效。必须在 Docker Desktop GUI 里手动配置代理（Settings → Resources → Proxies → Manual configuration）。

## 三、基础设施部署

使用 `docker-compose-infra.yml` 部署 9 个服务：

| 服务 | 容器名 | 端口 | 状态 |
|------|--------|------|------|
| MySQL 5.7 | mybilibili-mysql | 3306 | healthy |
| Redis 7.2 | mybilibili-redis | 6379 | healthy |
| MongoDB 6.0 | mybilibili-mongodb | 27017 | healthy |
| Minio | mybilibili-minio | 9000/9001 | healthy |
| Nacos | mybilibili-nacos | 8848 | healthy |
| Elasticsearch | mybilibili-elasticsearch | 9200 | healthy |
| RocketMQ Namesrv | mybilibili-rocketmq-namesrv | 9876 | running |
| RocketMQ Broker | mybilibili-rocketmq-broker | 10911 | running |
| SRS | mybilibili-srs | 1935 | running |

### 部署前准备

1. 创建 .env 文件（MYSQL_ROOT_PASSWORD、MINIO_ROOT_USER、MINIO_ROOT_PASSWORD）
2. 创建 Docker 网络 mybilibili-net
3. 创建 Volumes 目录结构
4. 更新 compose 文件中的卷路径（D:/DockerFiles/ → D:/devtools/Docker/Volumes/）

## 四、数据恢复

### MySQL

- 备份文件：`D:\files\mybilibili-next\mybilibili-cloud\init\mybilibili-mysql.sql`（96.4KB）
- 备份时间：2026-05-31
- 恢复方式：`docker exec -i mybilibili-mysql mysql -uroot -p<password> mybilibili < mybilibili-mysql.sql`
- 恢复结果：39 张表，完整数据

### MongoDB

- 备份文件：`D:\files\mybilibili-next\mybilibili-cloud\init\mybilibili-mongodb.sql`（188.9KB）
- 备份时间：2026-05-24
- 恢复方式：`docker exec mybilibili-mongodb mongosh mybilibili /tmp/restore.sql`
- 恢复结果：2 个集合（danmakus: 15 docs, subtitles: 15 docs）

### Minio

- 数据来源：`D:\files\mybilibili\uploads\`（本地残留目录）
- 上传方式：docker cp → mc cp --recursive
- 恢复结果：625 个文件
  - avatars: 2 个头像
  - covers: 1 个封面
  - images: 13 张图片
  - manuscripts: 609 个文件（源视频、转码片段、字幕、音频等）

### 数据路径修正

数据库中有 6 条视频记录的 source_video_url 和 play_url_hd 路径错误（manuscript_id 不匹配），已修正：

| video_id | 修正前 manuscript | 修正后 manuscript |
|----------|-------------------|-------------------|
| 26 | 10 | 11 |
| 27 | 10 | 11 |
| 28 | 10 | 11 |
| 29 | 10 | 12 |
| 30 | 10 | 13 |
| 31 | 10 | 14 |

## 五、最终对齐检查

| 检查项 | 总数 | OK | 缺失 |
|--------|------|-----|------|
| 用户头像 | 2（本地） | 2 | 0 |
| 稿件封面 | 9 | 9 | 0 |
| 视频源文件 | 11 | 11 | 0 |
| 转码播放地址 | 9 | 9 | 0 |
| MongoDB danmakus | 15 | 15 | 0 |
| MongoDB subtitles | 15 | 15 | 0 |

**结论：100% 对齐，零丢失。**

## 六、损失与恢复对比

| 项目 | 丢失 | 恢复 |
|------|------|------|
| Docker Desktop 程序 | ✗ 删除 | ✓ 重装 |
| WSL 虚拟磁盘（52GB） | ✗ 删除 | ✓ 重建 |
| 容器镜像（9个） | ✗ 删除 | ✓ 重新拉取 |
| MySQL 数据库 | ✗ 删除 | ✓ 从备份恢复 |
| MongoDB 数据库 | ✗ 删除 | ✓ 从备份恢复 |
| Minio 视频数据 | ✗ 删除 | ✓ 从本地 uploads 恢复 |
| n8n/dify/one-api 配置 | ✗ 删除 | - 不恢复 |

## 七、文件清单

| 文件 | 路径 |
|------|------|
| Docker 配置 | C:\Users\a1\AppData\Roaming\Docker\settings-store.json |
| Docker daemon | C:\Users\a1\.docker\daemon.json |
| Compose 文件 | D:\files\mybilibili-next\mybilibili-cloud\scripts\docker-compose-infra.yml |
| 环境变量 | D:\files\mybilibili-next\mybilibili-cloud\scripts\.env |
| MySQL 备份 | D:\files\mybilibili-next\mybilibili-cloud\init\mybilibili-mysql.sql |
| MongoDB 备份 | D:\files\mybilibili-next\mybilibili-cloud\init\mybilibili-mongodb.sql |
| 本地 uploads | D:\files\mybilibili\uploads\ |
| Docker Volumes | D:\devtools\Docker\Volumes\mybilibili\ |
