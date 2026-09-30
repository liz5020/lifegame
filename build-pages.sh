#!/bin/sh
# Cloudflare Pages建置指令：只把玩家需要的三個檔案放進dist/，其餘（設計文件、測試、worker等）不會被公開
set -e
rm -rf dist
mkdir dist
cp index.html og.png lunar.min.js dist/
echo "dist/ 已備好："; ls dist
