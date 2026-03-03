#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   sudo ./scripts/ensure_services.sh
#   sudo ./scripts/ensure_services.sh gptishka-bot
#   sudo ./scripts/ensure_services.sh gptishka-bot gptishka-admin

if [[ "$#" -eq 0 ]]; then
  services=("gptishka-bot" "gptishka-admin")
else
  services=("$@")
fi

for svc in "${services[@]}"; do
  if systemctl is-active --quiet "$svc"; then
    echo "[$svc] active"
  else
    echo "[$svc] inactive -> starting"
    systemctl start "$svc"
  fi
done

echo "Done."
