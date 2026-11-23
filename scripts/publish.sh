#!/usr/bin/env bash
# 터널을 끊지 않고 화면만 다시 올린다 (scripts/pilot.mjs가 켜져 있는 동안 쓴다). server.json은 그대로 둔다.
#   bash scripts/publish.sh   (먼저 npm run build)
set -e
cd "$(dirname "$0")/.."
keep="$(mktemp)"
cp .pages/server.json "$keep"
find .pages -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r dist/. .pages/
cp "$keep" .pages/server.json
touch .pages/.nojekyll
git -C .pages add -A 2>/dev/null
if [ -n "$(git -C .pages status --porcelain)" ]; then
  git -C .pages commit -q -m "화면 갱신"
  git -C .pages push -q origin HEAD:main
  echo "올렸습니다 (1~2분 뒤 반영)"
else
  echo "바뀐 것이 없습니다"
fi
