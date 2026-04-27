#!/usr/bin/env bash
set -euo pipefail

# Run this on your Mac host, not inside Docker.
export VOXCPM_DIR="${VOXCPM_DIR:-/Users/warrn/study/语音生成/VoxCPM}"
export VOXCPM_MODEL="${VOXCPM_MODEL:-openbmb/VoxCPM2}"
export VOXCPM_DEVICE="${VOXCPM_DEVICE:-mps}"
export VOXCPM_OPTIMIZE="${VOXCPM_OPTIMIZE:-false}"
export VOXCPM_LOAD_DENOISER="${VOXCPM_LOAD_DENOISER:-false}"
export VOXCPM_MAX_CHARS="${VOXCPM_MAX_CHARS:-120}"

cd "$(dirname "$0")/.."

python3 -m venv .venv-voxcpm-tts
source .venv-voxcpm-tts/bin/activate
python -m pip install --upgrade pip
python -m pip install -r tts/requirements.txt

# Prefer your local source checkout. If it fails, the script falls back to pip voxcpm.
if [ -d "$VOXCPM_DIR" ]; then
  python -m pip install -e "$VOXCPM_DIR" || python -m pip install voxcpm
else
  python -m pip install voxcpm
fi

uvicorn tts.voxcpm_tts_server:app --host 0.0.0.0 --port 8010
