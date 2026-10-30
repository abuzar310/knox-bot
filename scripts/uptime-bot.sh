#!/usr/bin/env bash
# Local uptime watcher. Polls ZARU's /healthz. If Discord stays disconnected,
# stop the bot process so scripts/supervise.sh logs in again.
set -u
cd "$(dirname "$0")/.."
exec 9>/tmp/zaru-uptime-bot.lock
flock -n 9 || exit 0

PORT="${BOT_HEALTH_PORT:-3080}"
URL="http://127.0.0.1:${PORT}/healthz"
INTERVAL=20
NEED=3
fails=0

echo "uptime bot watching ${URL}"
# a fresh login is allowed to miss a few checks
sleep 45

while true; do
  body="$(curl -sf -m 3 "$URL" || true)"
  if printf '%s' "$body" | grep -q '"discord":true'; then
    fails=0
  else
    fails=$((fails + 1))
    echo "uptime bot: discord not ready (${fails}/${NEED})"
    if [ "$fails" -ge "$NEED" ]; then
      pid="$(ps -eo pid,cmd | awk '/tsx\/dist\/loader|apps\/bot\/dist\/index.js/ && !/awk/ {print $1; exit}')"
      age="$(ps -o etimes= -p "${pid:-0}" 2>/dev/null | tr -d ' ' || true)"
      # a process still logging in reports discord:false; killing it leaves the database lock behind
      if [ -n "${pid}" ] && [ -n "${age}" ] && [ "${age}" -ge 90 ]; then
        echo "uptime bot: restarting ZARU pid ${pid} after ${age}s"
        kill -TERM "$pid" || true
      elif [ -n "${pid}" ]; then
        echo "uptime bot: ZARU pid ${pid} is only ${age:-0}s old, leaving it"
      else
        echo "uptime bot: ZARU process is not running"
      fi
      fails=0
      sleep 45
    fi
  fi
  sleep "$INTERVAL"
done
