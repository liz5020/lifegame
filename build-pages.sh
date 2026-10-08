#!/bin/sh
# Cloudflare Pages建置指令：只把玩家需要的檔案放進dist/（遊戲本體、分享預覽圖、農曆套件，以及2026-10-08起的三個說明頁：terms.html、privacy.html、pricing.html），其餘（設計文件、測試、worker等）不會被公開
set -e
rm -rf dist
mkdir dist
cp index.html og.png lunar.min.js terms.html privacy.html pricing.html dist/
echo "dist/ 已備好："; ls dist
