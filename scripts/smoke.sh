#!/usr/bin/env bash
# Smoke test for a running stack (docker compose up -d --build --wait, SCRAPER_MODE=fake):
# health of every service, then the main flow through the web proxy: add a watch -> first check -> drop flagged.
set -euo pipefail

WEB=${WEB_URL:-http://localhost:8085}
API=${API_URL:-http://localhost:3000}

say() { printf '== %s\n' "$*"; }

say "health"
curl -fsS "$API/health/ready"; echo
docker compose exec -T checker wget -qO- http://127.0.0.1:3001/health/ready; echo
docker compose exec -T scraper wget -qO- http://127.0.0.1:3002/health/ready; echo
curl -fsS "$WEB/healthz"

say "socket.io handshake through nginx"
curl -fsS "$WEB/socket.io/?EIO=4&transport=polling" | grep -q '"sid"' && echo "socket.io ok"

say "add a watch with a target above the fake price"
created=$(curl -fsS -X POST "$WEB/api/watches" -H 'Content-Type: application/json' \
  -d '{"query":"Logitech G102","targetEgp":5000}')
echo "$created"
id=$(printf '%s' "$created" | sed -E 's/.*"id":"([^"]+)".*/\1/')

say "wait for the first check (bounded)"
for _ in $(seq 1 60); do
  history=$(curl -fsS "$WEB/api/watches/$id/history")
  if printf '%s' "$history" | grep -q '"dropped":true'; then
    echo "$history" | head -c 600; echo
    say "SMOKE PASS: observation stored and drop flagged"
    exit 0
  fi
  sleep 1
done
echo "history: $history"
say "SMOKE FAIL: no flagged observation after 60 s"
exit 1
