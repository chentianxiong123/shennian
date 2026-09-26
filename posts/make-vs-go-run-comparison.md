---
title: 'Makefile vs `go run`：Go 构建通配符的对比'
date: 2026-08-16
---

# Makefile vs `go run`：Go 构建通配符的对比

## 一句话结论

**用 Makefile。** 它是 Go 行业的既定标准——Kubernetes、Docker、Prometheus、Hugo、etcd 等主流项目全部使用，而 `go run` 仅适合临时、一次性运行。

---

## 三种做法一览

| 做法 | 命令示例 | 二进制落点 | 复用性 | 可扩展性 |
|------|----------|------------|--------|----------|
| `go run` | `go run ./cmd/core` | 临时目录，跑完即丢 | 无法单独运行、无法复用 | 无，参数/env 每次手打 |
| `go build -o` | `go build -o /tmp/core ./cmd/core && /tmp/core` | `/tmp/core`，可控 | 可单独运行 | 一长串，每次手打 |
| `make` | `make run` | `/tmp/mybilibili-core` | 可单独运行、可复用 | 统一入口，一次定义全项目共享 |

---

## 本质区别

- **`go run`**：编译到随机临时目录后立即执行。省事，但二进制"查无此物"，无法单独启动、无法复用、无法做部署。
- **`go build -o`**：手工指定输出路径。路径可控，但每次要敲一长串命令。
- **`make run`**：把 `go build -o <路径> && ./<路径>` 封装成一个短目标。编译速度与 `go run` 完全一致（本质都是 `go build`），但二进制路径可控、命令可扩展。

> 重要澄清：`make run` ≠ `go run` 的高配版，`go build` 才是编译本体，Makefile 只是给编译/运行两个动作起了一个稳定的短名。

---

## 为什么要选 Makefile（企业理由）

1. **行业标准**：Kubernetes（2750 行 Makefile）、Docker/Moby、Prometheus、Hugo、etcd、Traefik、Caddy、Syncthing 全用 Makefile。招聘、协作、迁移成本最低。
2. **统一入口**：新人 `make run` / `make build` / `make clean` 三秒上手，无需查 README 记命令。
3. **可扩展**：将来加环境变量、linter、测试、Docker 打包，只需在 Makefile 加目标，全项目共享。
4. **杜绝散落二进制**：`go run` 把编译产物丢进临时目录，无法控制；Makefile 把构建产物统一固定到 `/tmp/`，不污染源码树，也方便清理。
5. **与 CI/CD 对接**：流水线只需 `make build`，与本地开发完全一致。

---

## 本项目用法

```makefile
BIN := /tmp   # 编译产物固定放内存盘/tmp，减少磁盘写入
GO  := go

.PHONY: run build clean

run:
	$(GO) build -o $(BIN)/mybilibili-core ./cmd/core
	$(BIN)/mybilibili-core

build:
	$(GO) build -o $(BIN)/mybilibili-core ./cmd/core
	$(GO) build -o $(BIN)/mybilibili-media ./cmd/media

clean:
	rm -f $(BIN)/mybilibili-core $(BIN)/mybilibili-media
```

| 目标 | 作用 |
|------|------|
| `make run` | 编译并启动主服务（core，HTTP :8080） |
| `make build` | 编译两个二进制：core + media（媒体处理） |
| `make clean` | 删除 `/tmp/` 下的编译产物 |

后台启动（替代旧的 `go run` 写法）：

```bash
cd /mnt/shared/mybilibili/mybilibili-go
setsid nohup make run > /tmp/core.log 2>&1 < /dev/null &
```

---

## 为什么不推荐替代方案

- **shell alias**（`alias core='go build -o /tmp/...'`）：换机器即失效，团队不共享，Alias 是个人偷懒，不是工程规范。
- **Bazel**：Google 内部标准，但配置极重（BUILD 文件、规则），小项目得不偿失。
- **Taskfile（go-task）**：较新的 YAML 风格 runner，社区仍在普及中，不如 Makefile 普适。

---

## 结论

单个一次性实验可用 `go run`；任何要反复启动、构建、交付的项目，用 Makefile——不是"规范更好看"，而是它就是企业级 Go 仓库的行业事实标准。