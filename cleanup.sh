#!/bin/bash
# SeekMeal App - 清理腳本
# 刪除 .next、node_modules、.vercel；保留 .env.local 及所有源代碼

set -e
cd "$(dirname "$0")"

echo "🧹 SeekMeal App 清理中..."

[ -d ".next" ]       && rm -rf .next       && echo "  已刪除 .next/"
[ -d "node_modules" ] && rm -rf node_modules && echo "  已刪除 node_modules/"
[ -d ".vercel" ]     && rm -rf .vercel     && echo "  已刪除 .vercel/"

echo "✅ 清理完成。（.env.local 與源代碼已保留）"
