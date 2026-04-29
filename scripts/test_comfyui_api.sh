#!/usr/bin/env bash
set -euo pipefail

curl -s http://127.0.0.1:8000/system_stats | python3 -m json.tool || {
  echo "ComfyUI not reachable at http://127.0.0.1:8000"
  echo "Make sure your local ComfyUI is running with API enabled."
  exit 1
}

echo "ComfyUI API is reachable."
