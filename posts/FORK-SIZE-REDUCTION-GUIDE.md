---
title: 'Fork 仓库瘦身指南：从 90MB 到 11MB'
date: 2026-08-12
---

# Fork 仓库瘦身指南：从 90MB 到 11MB

> 基于 `chentianxiong123/ccswitch-pi`（fork of `farion1231/cc-switch`）的实战经验

---

## 背景

- 上游仓库：`farion1231/cc-switch`（126k stars, 8622 forks）
- Fork 后的仓库：`chentianxiong123/ccswitch-pi`
- 问题：Fork 继承了上游全部历史（2800+ commits），导致 `.git` pack 高达 **90.5 MB**
- 目标：保留 fork 关系（蹭热度）+ 保留所有自有提交 + 最大限度压缩体积

---

## 最终成果

| 指标 | 清理前 | 清理后 |
|------|--------|--------|
| Git pack | 90.5 MB | **11.2 MB** |
| Web 分支 | 2176 commits | **51 commits** |
| CLI 分支 | 1373 commits | **13 commits** |
| TUI 分支 | 1363 commits | **3 commits** |
| GUI 分支 | 12 commits | 12 commits |
| 分支数 | 115 | 4 |
| Tags | 65 | 0 |
| Fork 关系 | ✅ | ✅ 保留 |
| 用户提交 | 62 | 62 全部保留 |

---

## 方法论：三阶段瘦身法

### 阶段一：删除无用文件（commit 层面）

**目标**：从当前 tree 中移除不需要的文件

**操作**：
- 通过 GitHub API 创建新 tree（排除目标文件），生成新 commit，force push
- 删除内容：
  - `docs/`（6.5MB 用户手册、发布说明、指南）
  - `assets/partners/`（6.3MB 合作伙伴 logo/banners）
  - `CHANGELOG.md`（116KB）
  - `package-lock.json`（128KB）
  - `deplink.html`（104KB）
  - `cc-switch-linux-x86`（20.5MB 预编译二进制，仅 CLI 分支）
  - `*.gif`（10MB 动图）

**效果**：~17MB 文件从当前 tree 中移除，但**历史中的 blob 仍在**

**关键代码**：
```bash
# 通过 GitHub API 创建新 tree（排除指定文件）
gh api repos/{owner}/{repo}/git/trees -X POST \
  --input /tmp/tree-payload.json \
  -f message="Remove marketing assets"

# 创建 commit
gh api repos/{owner}/{repo}/git/commits -X POST \
  -d "{\"message\":\"...\",\"tree\":\"$TREE_SHA\",\"parents\":[\"$HEAD_SHA\"]}"

# 更新分支 ref
gh api repos/{owner}/{repo}/git/refs/heads/$BRANCH -X PATCH \
  -d "{\"sha\":\"$COMMIT_SHA\",\"force\":true}
```

**注意**：GitHub tree API 中，如果保留目录的 tree SHA，其子内容不变。需要**重建目录 tree** 才能真正删除子文件。

---

### 阶段二：清理分支和 Tag

**目标**：减少引用数量，为后续历史重写做准备

**操作**：
```bash
# 删除所有不需要的分支（保留 web/cli/tui/gui）
gh api repos/{owner}/{repo}/git/refs/heads/$BRANCH -X DELETE

# 删除所有 tag
gh api repos/{owner}/{repo}/git/refs/tags/$TAG -X DELETE
```

**效果**：
- 分支：115 → 4
- Tags：65 → 0
- 删除了包含 20.5MB 二进制和 10MB GIF 的 tag 引用

---

### 阶段三：重写历史（核心步骤）

**目标**：物理删除上游 commit 对象，仅保留自有提交

**方法**：`git replace --graft` + `git filter-repo`

#### 3.1 克隆完整仓库

```bash
# 关键：git 的 libcurl 可能不走系统代理
# 需要通过 Python 设置环境变量来强制代理
python3 -c "
import subprocess, os
env = os.environ.copy()
env['http_proxy'] = 'http://PROXY_IP:PORT'
env['https_proxy'] = 'http://PROXY_IP:PORT'
env['GIT_CONFIG_COUNT'] = '2'
env['GIT_CONFIG_KEY_0'] = 'http.proxy'
env['GIT_CONFIG_VALUE_0'] = 'http://PROXY_IP:PORT'
env['GIT_CONFIG_KEY_1'] = 'https.proxy'
env['GIT_CONFIG_VALUE_1'] = 'http://PROXY_IP:PORT'
subprocess.run(['git', 'clone', 'URL', 'LOCAL_PATH'], env=env)
"
```

**问题排查**：
- git clone 超时但 curl 走代理正常 → git 的 libcurl 不读 `http.proxy` 配置
- 解决方案：通过 Python subprocess 设置 `http_proxy`/`https_proxy` 环境变量 + `GIT_CONFIG_*` 变量

#### 3.2 识别自有提交

```python
USER_PATTERNS = ["chentianxiong", "opencode", "dllm", "a1@localhost", "2036680567"]

def is_user_commit(email, name):
    return any(p in email.lower() or p in name.lower() for p in USER_PATTERNS)

# 获取所有提交，找出第一个自有提交
result = git log --reverse --format="%H|%ae|%an", branch)
for sha, email, name in result:
    if is_user_commit(email, name):
        first_user_sha = sha
        break
```

**注意**：必须同时检查 `email` 和 `name`，因为不同提交可能用不同身份（如 `2036680567@qq.com` + `chentianxiong123`）

#### 3.3 创建 Graft

```bash
# 获取 root commit
ROOT_SHA=$(git rev-list --max-parents=0 HEAD)

# 创建 graft：将第一个自有提交的 parent 指向 root
git replace --graft $FIRST_USER_COMMIT $ROOT_SHA
```

**原理**：`git replace --graft` 改写 commit 的 parent 指针，使第一个自有提交直接指向 root commit，跳过所有上游提交。但这**不删除**旧对象，只改变引用关系。

#### 3.4 用 filter-repo 物理删除

```bash
git filter-repo --force \
  --prune-empty always \
  --replace-refs delete-no-add
```

**参数说明**：
- `--prune-empty always`：删除空 commit（因 graft 产生的）
- `--replace-refs delete-no-add`：删除 replace ref，不创建 backup
- `--force`：强制执行（因非 fresh clone）

**效果**：
```
清理前: 36,495 对象, 52.79 MB
清理后:  2,415 对象, 11.17 MB
减少:   34,080 对象, 41.62 MB (79%)
```

#### 3.5 垃圾回收

```bash
git reflog expire --expire=now --all
git gc --aggressive --prune=now
```

#### 3.6 Force Push

```bash
# 需要重新添加 remote（filter-repo 会删除 origin）
git remote add origin https://github.com/{owner}/{repo}.git

# 逐分支 force push
for branch in web cli tui gui; do
    git push origin --force $branch:$branch
done
```

---

## 常见陷阱

### 1. Git 不走代理

**现象**：`git clone` 超时，但 `curl --proxy` 正常

**原因**：Ubuntu 20.04 的 git 2.47.3 内置 libcurl 不读 `http.proxy` git config

**解决**：
```python
# 必须同时设置环境变量和 GIT_CONFIG 变量
env["http_proxy"] = "http://proxy:port"
env["https_proxy"] = "http://proxy:port"
env["GIT_CONFIG_COUNT"] = "2"
env["GIT_CONFIG_KEY_0"] = "http.proxy"
env["GIT_CONFIG_VALUE_0"] = "http://proxy:port"
env["GIT_CONFIG_KEY_1"] = "https.proxy"
env["GIT_CONFIG_VALUE_1"] = "http://proxy:port"
```

### 2. GitHub Tree API 的 subtree 引用

**现象**：删除文件后 tree SHA 不变

**原因**：API 中保留目录的 tree SHA 时，GitHub 使用原始 subtree

**解决**：需要**重建整个 subtree**，不能只引用父目录 SHA

### 3. git replace --graft 不删除对象

**现象**：graft 后 pack 大小不变

**原因**：graft 只改 commit parent 指针，不删除旧对象

**解决**：必须配合 `git filter-repo` 物理重写

### 4. git gc 不清理不可达对象

**现象**：`git gc --aggressive --prune=now` 后 pack 大小不变

**原因**：delta chain 依赖使 gc 不愿拆分 pack

**解决**：用 `git filter-repo` 重新生成 pack

### 5. Cherry-pick 跨 unrelated history 失败

**现象**：orphan 分支上 cherry-pick 全部 conflict

**原因**：orphan 分支没有共同祖先，diff 无法应用

**解决**：不要用 cherry-pick，用 graft + filter-repo

---

## 工具链

| 工具 | 用途 |
|------|------|
| `gh api` | GitHub REST API 操作（分支/tag/tree/commit） |
| `git replace --graft` | 重写 commit parent 指针 |
| `git filter-repo` | 物理删除历史对象 |
| `git gc --aggressive --prune=now` | 垃圾回收 |
| Python `subprocess` | 强制 git 走代理 |

---

## 适用场景

- Fork 热门仓库后独立开发
- 不需要同步上游更新
- 想保留 fork 关系（蹭 stars/forks 计数）
- 历史中包含大文件（二进制、图片、lock 文件）

## 不适用场景

- 需要持续同步上游更新
- 需要保留完整 git blame 追溯
- 需要保留上游 commit 作者信息

---

*文档生成时间：2026-08-12*
*仓库：chentianxiong123/ccswitch-pi*
