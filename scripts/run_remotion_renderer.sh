#!/usr/bin/env bash
set -euo pipefail

cd /Users/warrn/study/N8N/remotion-video
export DATA_DIR=/Users/warrn/study/N8N/data
export REMOTION_RENDERER_PORT=3001
npm run dev
