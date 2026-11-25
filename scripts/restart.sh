#!/usr/bin/env bash
# 게임 서버를 저장하고 끈 뒤 다시 띄운다. 터널(scripts/pilot.mjs)은 건드리지 않는다.
#   bash scripts/restart.sh [로그 파일]             등불지기 (GAME이 없으면)
#   GAME=sample bash scripts/restart.sh [로그 파일]  다른 게임
# 포트와 저장 파일은 그 게임의 games/<게임>/deploy.json에서 읽는다(PORT, DB, BOTS 환경 변수가 있으면 그것이 이긴다).
# 로그의 기본 자리는 저장 파일 옆의 server.log다. 앞 서버의 로그는 server.log.prev로 남긴다(저장하고 꺼졌는지 볼 수 있게).
# 서버는 저장 파일 옆의 stop.flag를 보면 저장하고 끈다. 10초 안에 꺼지지 않을 때만 강제로 끈다. 끄기만 하려면 scripts/stop.sh.
# DRY=1이면 무엇을 할지 찍기만 한다.
cd "$(dirname "$0")/.."
GAME="${GAME:-deungbul}"
cfg() { node scripts/deploy.mjs "$1" "$GAME" || exit 1; }
PORT="${PORT:-$(cfg port)}"
DBF="${DB:-$(cfg db)}"
BOTS="${BOTS:-$(cfg bots)}"
LOG="${1:-$(cfg log)}"
listening() { netstat -ano | grep ":$PORT " | grep -q LISTENING; }
if [ -n "$DRY" ]; then
  echo "게임 $GAME · 포트 $PORT · 저장 $DBF · 봇 $BOTS · 로그 $LOG · 깃발 $(cfg stop)"
  if listening; then echo "먼저: 포트 $PORT에 떠 있는 서버를 깃발로 저장하고 끈다 (10초 안에 안 꺼지면 강제로)"; else echo "먼저: 포트 $PORT에 떠 있는 서버가 없다"; fi
  echo "시작: PORT=$PORT DB=$DBF BOTS=$BOTS node scripts/game.mjs start $GAME"
  exit 0
fi
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
# 처음 띄우는 게임은 저장 폴더(로그가 놓이는 곳)가 아직 없다
LOGU="$(cygpath -u "$LOG")"
mkdir -p "$(dirname "$LOGU")"
[ -f "$LOGU" ] && mv -f "$LOGU" "$LOGU.prev"
(PORT="$PORT" DB="$DBF" BOTS="$BOTS" node scripts/game.mjs start "$GAME" > "$LOGU" 2>&1 &)
for i in $(seq 1 30); do sleep 0.5; listening && break; done
listening && echo "서버가 떴습니다 ($GAME, 포트 $PORT)" || { echo "서버가 뜨지 않았습니다"; tail -5 "$LOGU"; exit 1; }
