#!/usr/bin/env bash
# 게임 서버를 저장하고 끈다 (다시 띄우지 않는다). 다시 띄우려면 scripts/restart.sh.
#   bash scripts/stop.sh                등불지기 (GAME이 없으면)
#   GAME=sample bash scripts/stop.sh    다른 게임
# 저장 파일 옆에 stop.flag를 세우면 서버가 저장하고 끈다. 10초 안에 꺼지지 않으면 알리기만 한다(강제로 끄지 않는다).
cd "$(dirname "$0")/.."
GAME="${GAME:-deungbul}"
PORT="${PORT:-$(node scripts/deploy.mjs port "$GAME" || exit 1)}"
listening() { netstat -ano | grep ":$PORT " | grep -q LISTENING; }
if ! listening; then echo "포트 $PORT에 떠 있는 서버가 없습니다 ($GAME)"; exit 0; fi
node scripts/deploy.mjs flag on "$GAME"
for i in $(seq 1 20); do sleep 0.5; listening || break; done
if listening; then echo "10초 안에 꺼지지 않았습니다. 서버의 로그를 보세요 (깃발: $(node scripts/deploy.mjs stop "$GAME"))"; exit 1; fi
node scripts/deploy.mjs flag off "$GAME"
echo "저장하고 껐습니다 ($GAME, 포트 $PORT)"
