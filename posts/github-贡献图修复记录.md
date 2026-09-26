---
title: 'GitHub 贡献图"只有一格"问题排查与邮箱绑定全记录'
date: 2026-08-20
---

# GitHub 贡献图"只有一格"问题排查与邮箱绑定全记录

> 日期:2026-08-20
> 背景:重启电脑后启动 mybilibili 项目,用户发现 GitHub 贡献图上 8 月 19 日只显示一个绿格子,怀疑提交身份有问题,要求彻查并补救。

---

## 一、问题现象

1. 8 月 19 日一共做了 **23 次提交**(全部推送到 `chentianxiong123/mybilibili`),但 GitHub 贡献图只显示 **1 个绿格子**。
2. 用户怀疑"漏推了提交"或"提交身份不对",要求核查。

---

## 二、排查过程

### 1. 确认提交与推送状态

```bash
git log --since="2026-08-19 00:00" --until="2026-08-20 00:00" --oneline | wc -l   # = 23
git rev-parse --short HEAD        # 522950c
git rev-parse --short origin/main # 522950c  (本地=远程,无未推送)
```

结论:昨天 23 个提交全部已推送,没有漏推。

### 2. 检查 git 提交身份

```bash
git config user.name   # a1
git config user.email  # a1@localhost
```

**根因出现:提交身份是 `a1 <a1@localhost>`,这是一个本机假邮箱,未关联 GitHub 账号。**

### 3. 统计全部仓库的提交邮箱分布

扫描本机所有 git 仓库,发现 3 个用户仓库 + 1 个上游开源 clone:

| 仓库 | 远程 | 提交数 |
|---|---|---|
| `/mnt/shared/mybilibili` | chentianxiong123/mybilibili | 192 |
| `/mnt/shared/mybilibili-cloud` | chentianxiong123/mybilibili-cloud | 181 |
| `/mnt/shared/qwen-chat` | chentianxiong123/chat-clone | 14 |
| mstar-bin-tool | dipcore/mstar-bin-tool(非用户仓库,排除) | 58 |

全部仓库提交总数 **387 次**,邮箱分布(作者+提交者去重):

| 邮箱 | 次数 |
|---|---|
| `2036680567@qq.com` | 386 |
| `a1@localhost` | 226 |
| `chentianxiong123@users.noreply.github.com` | 112 |
| `dev@mybilibili.com` | 26 |
| `dllm@users.noreply.github.com` | 10 |
| `codex@local` | 8 |
| `a1@mybilibili.dev` | 6 |

GitHub 侧检索 `author-email:2036680567@qq.com` 共 **419 个提交**,全部归在 chentianxiong123 名下 → 确认 `2036680567@qq.com` 是主力邮箱,已关联账号。

---

## 三、原因分析

### GitHub 贡献图的判定规则

1. **按天计数,一天最多 1 格** —— 23 个提交集中在同一天,最多只能显示 1 格(这是正常现象,不是丢贡献)。
2. **提交邮箱必须已关联并"可识别"到账号** —— 邮箱必须是:账号已验证的邮箱、可添加的未验证邮箱、或账号的 `noreply` 邮箱。
3. **只统计最近 12 个月**,且需在默认分支 / gh-pages / tag 上,非 fork 仓库。
4. 格子深浅 = 当天提交量,提交越多颜色越深。

### 本案例根因

- `a1@localhost`(226 次)是本地假邮箱,GitHub **明确禁止绑定**此类 `*.localhost` / `*.local` 保留域名:
  > *"Generic email addresses—such as `jane@computer.local`—cannot be added to GitHub accounts. The commits will not be linked and will not show up in the contributions graph."*
- `codex@local`(8 次)同理。
- 其余邮箱都是可绑定或自动关联的。

---

## 四、解决方案与执行记录

### 第 1 步:解锁 `user` scope

原有 token 缺少 `user` 权限,无法查询/添加邮箱:

```bash
gh auth refresh -h github.com -s user   # 浏览器授权(一次性)
```

### 第 2 步:盘点账号当前邮箱

```bash
gh api user/emails --jq '.[] | "\(.email) | verified=\(.verified) | primary=\(.primary)"'
# 只有 2036680567@qq.com (verified=true, primary=true)
```

### 第 3 步:批量添加历史邮箱(核心动作)

逐个尝试 `POST /user/emails`:

| 邮箱 | 结果 |
|---|---|
| `dev@mybilibili.com` | ✅ 绑定成功(unverified 也能统计) |
| `a1@mybilibili.dev` | ✅ 绑定成功 |
| `a1@localhost` | ❌ 422,保留域名 .localhost 无 DNS,GitHub 拒绝 |
| `codex@local` | ❌ 422,同上 |
| `dllm@users.noreply.github.com` | ❌ 422,GitHub 保留域,且属于其他账号 |
| `chentianxiong123@users.noreply.github.com` | ❌ 不可手动添加,但它是本账号 noreply,**自动关联** |

### 第 4 步:验证绑定已生效

用仓库内各邮箱的提交 SHA 查 GitHub API,确认已归属账号:

```bash
gh api repos/chentianxiong123/mybilibili/commits/<sha> --jq '.author.login'
# dev@mybilibili.com      → chentianxiong123 ✅
# a1@mybilibili.dev       → chentianxiong123 ✅
# chentianxiong123 noreply → chentianxiong123 ✅
```

### 第 5 步:统一 git 提交身份(防止未来再犯)

三个用户仓库统一为:

```bash
git config user.name  "chentianxiong123"
git config user.email "2036680567@qq.com"
```

---

## 五、最终结果与遗留限制

### 已解决

- 昨天 23 个提交没有漏推(本地 = 远程)。
- "只有一个格子"一半是"按天计 1 格"的正常现象。
- `dev@mybilibili.com`、`a1@mybilibili.dev`、noreply 提交已全部归属账号,贡献图会在 ≤24h 内自动重建,格子深浅按提交量恢复。
- 未来所有提交都会用 `2036680567@qq.com`,稳定计入。

### 遗留限制(无法用"加邮箱"方式解决)

`a1@localhost`(226 次)+ `codex@local`(8 次)= **234 次提交永远无法通过绑定邮箱计入贡献图**,这是 GitHub 平台硬性规则。

### 唯一可行的补救方式:改写历史(可选,未执行)

用 `git filter-repo` 只改 email 字段(保留内容、作者名、时间戳),再 force-push:

```bash
git filter-repo --mailmap "a1@localhost <2036680567@qq.com>" --force
git push --force origin
```

- 代价:所有提交哈希改变,远程需 force-push(单作品集仓库风险可控)。
- 当前**未执行**,由用户决定是否采纳。

---

## 六、经验与教训(下次避免)

1. **新机器 / 新环境第一件事**:`git config --global user.name` 和 `user.email`,用 GitHub 已关联邮箱或 noreply 邮箱。
2. **GitHub 贡献图判定靠邮箱**,不是用户名;本地假邮箱(`@localhost` / `@local` / `@computer.local` 等)永远无法关联。
3. 提交密集在同一天时,贡献图只显示 1 格——这正常,别误判为丢提交。
4. 检查提交是否计入:用 `gh api repos/<owner>/<repo>/commits/<sha> --jq '.author.login'`,为空则未关联。
5. 账号邮箱管理:`gh auth refresh -h github.com -s user` → `gh api user/emails`。