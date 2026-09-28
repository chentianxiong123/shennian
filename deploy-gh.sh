#!/usr/bin/env bash
# 深念博客一键部署到 GitHub Pages
# 与 deploy-cf.sh (Cloudflare Pages) 区分：
#   deploy-cf.sh      →  Cloudflare Pages (shennian.pages.dev)  base=/
#   deploy-gh.sh    →  GitHub Pages (chentianxiong123.github.io/shennian/)  base=/shennian/
# 用法: ./deploy-gh.sh
#
# 前置要求:
#   1. GitHub 仓库开启 Pages: Settings → Pages → Source 选 "Deploy from a branch" → gh-pages
#   2. gh 已登录 (gh auth login) 或 git 已配置凭据
set -e
cd "$(dirname "$0")"

REPO="chentianxiong123/shennian"
BASE_PATH="/shennian"

echo "🔨 构建中 (base=${BASE_PATH}/)..."
VITEPRESS_BASE="${BASE_PATH}/" npx vitepress build

echo "🚀 推送到 GitHub Pages (gh-pages 分支)..."
TMP_DIR=$(mktemp -d)
cp -r .vitepress/dist/* "$TMP_DIR"/

cd "$TMP_DIR"
git init -q
git checkout -q -b gh-pages
git add -A
git commit -qm "Deploy $(date +'%Y-%m-%d %H:%M')"
git push -q -f "https://github.com/${REPO}.git" gh-pages
cd / && rm -rf "$TMP_DIR"

echo "✅ 完成: https://${REPO%%/*}.github.io${BASE_PATH}/"