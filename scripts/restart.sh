#!/usr/bin/env bash
# 게임 서버(3001)를 저장하고 끈 뒤 다시 띄운다. 터널(scripts/pilot.mjs)은 건드리지 않는다.
#   bash scripts/restart.sh [로그 파일]
# 서버는 data/stop.flag 파일을 보면 저장하고 끈다. 10초 안에 꺼지지 않을 때만 강제로 끈다.
cd "$(dirname "$0")/.."
PORT="${PORT:-3001}"
LOG="${1:-data/server.log}"
listening() { netstat -ano | grep ":$PORT " | grep -q LISTENING; }
if listening; then
  mkdir -p data && touch data/stop.flag
  for i in $(seq 1 20); do sleep 0.5; listening || break; done
  if listening; then
    echo "저장하고 끄지 못해 강제로 끕니다"
    pid=$(netstat -ano | grep ":$PORT " | grep LISTENING | awk '{print $5}' | head -1)
    [ -n "$pid" ] && taskkill //PID "$pid" //F > /dev/null
    sleep 1
  fi
  rm -f data/stop.flag
fi
(BOTS="${BOTS:-6}" npm start > "$LOG" 2>&1 &)
for i in $(seq 1 30); do sleep 0.5; listening && break; done
listening && echo "서버가 떴습니다 (포트 $PORT)" || { echo "서버가 뜨지 않았습니다"; tail -5 "$LOG"; exit 1; }
