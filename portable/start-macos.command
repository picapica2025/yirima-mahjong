#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "请先安装 Node.js 24 LTS：https://nodejs.org/en/download"
  read -r answer
  exit 1
fi
node server.mjs --lan
