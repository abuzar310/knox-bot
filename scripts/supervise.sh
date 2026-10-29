#!/usr/bin/env bash
# Restarts ZARU whenever the process exits, so a crash does not leave the bot offline.
set -u
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi
export KNOX_ALLOW_NO_AI="${KNOX_ALLOW_NO_AI:-1}"
while true; do
  if [ "${ZARU_DEV:-}" = "1" ] || [ ! -f apps/bot/dist/index.js ]; then
    pnpm --filter @knox/bot exec tsx src/index.ts || true
  else
    node --dns-result-order=ipv4first --no-network-family-autoselection apps/bot/dist/index.js || true
  fi
  echo "ZARU stopped. Starting again in 5 seconds."
  sleep 5
done
