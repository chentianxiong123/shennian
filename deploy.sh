#!/usr/bin/env bash
# 深念博客一键部署到 Cloudflare Pages
# 用法: ./deploy.sh
set -e
cd "$(dirname "$0")"

echo "🔨 构建中..."
npx vitepress build

echo "🚀 部署到 Cloudflare Pages (shennian)..."
wrangler pages deploy .vitepress/dist --project-name=shennian --branch=main --commit-dirty=true

echo "✅ 完成: https://shennian.pages.dev/"
