#!/usr/bin/env bash
# VM uptime watcher for ZARU.
# This script freezes when the VM pauses, same as the bot. When the machine
# wakes, the clock gap is longer than Discord's heartbeat window (~41s), so
# the Discord session is already dead. Restart ZARU so it logs in again.
set -u
cd "$(dirname "$0")/.."
exec 9>/tmp/zaru-uptime-bot.lock
flock -n 9 || exit 0

PORT="${BOT_HEALTH_PORT:-3080}"
URL="http://127.0.0.1:${PORT}/healthz"
INTERVAL=20
NEED=3
# a pause longer than this means Discord has dropped the session
PAUSE_SEC=70
fails=0
last=$(date +%s)

echo "uptime bot watching ${URL}; VM pause limit ${PAUSE_SEC}s"
sleep 45

bot_pid() {
  ps -eo pid,cmd | awk '/tsx\/dist\/loader|apps\/bot\/dist\/index.js/ && !/awk/ {print $1; exit}'
}

restart_bot() {
  local why="$1"
  local pid age
  pid="$(bot_pid)"
  age="$(ps -o etimes= -p "${pid:-0}" 2>/dev/null | tr -d ' ' || true)"
  if [ -n "${pid}" ] && [ -n "${age}" ] && [ "${age}" -ge 90 ]; then
    echo "uptime bot: ${why}; restarting ZARU pid ${pid} after ${age}s"
    kill -TERM "$pid" || true
  elif [ -n "${pid}" ]; then
    echo "uptime bot: ${why}; ZARU pid ${pid} is only ${age:-0}s old, leaving it"
  else
    echo "uptime bot: ${why}; ZARU process is not running"
  fi
  fails=0
  sleep 45
  last=$(date +%s)
}

while true; do
  sleep "$INTERVAL"
  now=$(date +%s)
  gap=$((now - last))
  last=$now
  if [ "$gap" -ge "$PAUSE_SEC" ]; then
    restart_bot "VM was paused for ${gap}s"
    continue
  fi

  body="$(curl -sf -m 3 "$URL" || true)"
  if printf '%s' "$body" | grep -q '"discord":true'; then
    fails=0
  else
    fails=$((fails + 1))
    echo "uptime bot: discord not ready (${fails}/${NEED})"
    if [ "$fails" -ge "$NEED" ]; then
      restart_bot "discord stayed down"
    fi
  fi
done
