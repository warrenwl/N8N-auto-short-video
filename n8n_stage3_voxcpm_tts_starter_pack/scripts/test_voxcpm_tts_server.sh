#!/usr/bin/env bash
set -euo pipefail
curl http://localhost:8010/health
curl -X POST http://localhost:8010/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"你好，这是 VoxCPM 本地语音生成测试。","task_id":"tts_test","cfg_value":2.0,"inference_timesteps":10}' \
  --output /tmp/voxcpm_test.wav
printf '\nSaved: /tmp/voxcpm_test.wav\n'
