#!/usr/bin/env bash
set -euo pipefail

: "${ZJUMP_CONFIG:=/etc/zjump/config.yaml}"

echo "[start] Launching zjump-api (HTTP=${ZJUMP_ADDR_HTTP:-:8080}, SSH=${ZJUMP_ADDR_SSH:-:2222})"
(
  /usr/local/bin/zjump-api \
    --config "${ZJUMP_CONFIG}" \
    --http "${ZJUMP_ADDR_HTTP:-:8080}" \
    --ssh "${ZJUMP_ADDR_SSH:-:2222}" \
    2>&1 | sed -e 's/^/[zjump-api] /'
) &

echo "[start] Launching nginx"
exec nginx -g 'daemon off;'


