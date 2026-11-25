#!/usr/bin/env bash
# 터널을 끊지 않고 화면만 다시 올린다 (scripts/pilot.mjs가 켜져 있는 동안 쓴다). server.json은 그대로 둔다.
#   bash scripts/publish.sh               등불지기 (먼저 npm run build)
#   GAME=sample bash scripts/publish.sh   다른 게임 (먼저 node scripts/game.mjs build sample)
# 빌드 결과와 공개용 저장소의 폴더는 그 게임의 games/<게임>/deploy.json에서 읽는다(pages가 없는 게임은 올리지 않는다).
set -e
cd "$(dirname "$0")/.."
GAME="${GAME:-deungbul}"
DIST="$(cygpath -u "$(node scripts/deploy.mjs dist "$GAME")")"
PAGES="$(node scripts/deploy.mjs pagesDir "$GAME")"; [ -n "$PAGES" ] && PAGES="$(cygpath -u "$PAGES")"
if [ -z "$PAGES" ]; then echo "$GAME은 GitHub Pages 설정(deploy.json의 pages)이 없어 올리지 않습니다"; exit 1; fi
if [ ! -d "$PAGES/.git" ]; then echo "공개용 저장소가 없습니다: 먼저 node scripts/pilot.mjs를 한 번 돌린다"; exit 1; fi
keep="$(mktemp)"
cp "$PAGES/server.json" "$keep"
find "$PAGES" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r "$DIST/." "$PAGES/"
cp "$keep" "$PAGES/server.json"
touch "$PAGES/.nojekyll"
git -C "$PAGES" add -A 2>/dev/null
if [ -n "$(git -C "$PAGES" status --porcelain)" ]; then
  git -C "$PAGES" commit -q -m "화면 갱신"
  git -C "$PAGES" push -q origin HEAD:main
  echo "올렸습니다 (1~2분 뒤 반영)"
else
  echo "바뀐 것이 없습니다"
fi
