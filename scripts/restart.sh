#!/usr/bin/env bash
# 게임 서버를 저장하고 끈 뒤 다시 띄운다. 터널(scripts/pilot.mjs)은 건드리지 않는다.
#   bash scripts/restart.sh [로그 파일]             등불지기 (GAME이 없으면)
#   GAME=sample bash scripts/restart.sh [로그 파일]  다른 게임
# 포트와 저장 파일은 그 게임의 games/<게임>/deploy.json에서 읽는다(PORT, DB, BOTS 환경 변수가 있으면 그것이 이긴다).
# 서버는 저장 파일 옆의 stop.flag를 보면 저장하고 끈다. 10초 안에 꺼지지 않을 때만 강제로 끈다.
# DRY=1이면 무엇을 할지 찍기만 한다.
cd "$(dirname "$0")/.."
GAME="${GAME:-deungbul}"
cfg() { node scripts/deploy.mjs "$1" "$GAME" || exit 1; }
PORT="${PORT:-$(cfg port)}"
DBF="${DB:-$(cfg db)}"
BOTS="${BOTS:-$(cfg bots)}"
LOG="${1:-$(cfg log)}"
if [ -n "$DRY" ]; then
  echo "게임 $GAME · 포트 $PORT · 저장 $DBF · 봇 $BOTS · 로그 $LOG · 깃발 $(cfg stop)"
  echo "시작: PORT=$PORT DB=$DBF BOTS=$BOTS node scripts/game.mjs start $GAME"
  exit 0
fi
listening() { netstat -ano | grep ":$PORT " | grep -q LISTENING; }
if listening; then
  node scripts/deploy.mjs flag on "$GAME"
  for i in $(seq 1 20); do sleep 0.5; listening || break; done
  if listening; then
    echo "저장하고 끄지 못해 강제로 끕니다"
    pid=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
    [ -n "$pid" ] && taskkill //PID "$pid" //F > /dev/null
    sleep 1
  fi
  node scripts/deploy.mjs flag off "$GAME"
fi
(PORT="$PORT" DB="$DBF" BOTS="$BOTS" node scripts/game.mjs start "$GAME" > "$LOG" 2>&1 &)
for i in $(seq 1 30); do sleep 0.5; listening && break; done
listening && echo "서버가 떴습니다 ($GAME, 포트 $PORT)" || { echo "서버가 뜨지 않았습니다"; tail -5 "$LOG"; exit 1; }
