"""
Local VoxCPM TTS server for the n8n video agent pipeline.

Run this ON THE MAC HOST, not inside Docker, so it can access:
  /Users/warrn/study/语音生成/VoxCPM
and use MPS/Metal when available.

Endpoints:
  GET  /health
  POST /tts       -> returns WAV bytes
  POST /tts_file  -> writes WAV to a local path and returns JSON
"""

from __future__ import annotations

import io
import os
import re
import sys
import traceback
from pathlib import Path
from typing import Optional, List

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

VOXCPM_DIR = os.getenv("VOXCPM_DIR", "/Users/warrn/study/语音生成/VoxCPM")
VOXCPM_MODEL = os.getenv("VOXCPM_MODEL", "openbmb/VoxCPM2")
VOXCPM_DEVICE = os.getenv("VOXCPM_DEVICE", "auto")
VOXCPM_OPTIMIZE = os.getenv("VOXCPM_OPTIMIZE", "false").lower() in {"1", "true", "yes", "y"}
VOXCPM_LOAD_DENOISER = os.getenv("VOXCPM_LOAD_DENOISER", "false").lower() in {"1", "true", "yes", "y"}
DEFAULT_MAX_CHARS = int(os.getenv("VOXCPM_MAX_CHARS", "120"))

# Let a source checkout work even when the package is not globally installed.
if VOXCPM_DIR and Path(VOXCPM_DIR).exists():
    sys.path.insert(0, VOXCPM_DIR)

app = FastAPI(title="Local VoxCPM TTS Server", version="0.1.0")
_model = None


class TTSRequest(BaseModel):
    text: str = Field(..., description="Text to synthesize")
    task_id: Optional[str] = None
    cfg_value: float = 2.0
    inference_timesteps: int = 10
    max_chars: int = DEFAULT_MAX_CHARS
    reference_wav_path: Optional[str] = None
    prompt_wav_path: Optional[str] = None
    prompt_text: Optional[str] = None
    output_format: str = "wav"


class TTSFileRequest(TTSRequest):
    output_path: str


def _load_model():
    global _model
    if _model is not None:
        return _model

    try:
        from voxcpm import VoxCPM
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "Cannot import voxcpm. Activate the venv and run either:\n"
            f"  pip install -e '{VOXCPM_DIR}'\n"
            "or:\n"
            "  pip install voxcpm"
        ) from exc

    kwargs = {
        "load_denoiser": VOXCPM_LOAD_DENOISER,
    }
    if VOXCPM_DEVICE:
        kwargs["device"] = VOXCPM_DEVICE
    # optimize=False is safer on MPS/CPU if torch.compile has issues.
    kwargs["optimize"] = VOXCPM_OPTIMIZE

    _model = VoxCPM.from_pretrained(VOXCPM_MODEL, **kwargs)
    return _model


def _split_text(text: str, max_chars: int) -> List[str]:
    text = re.sub(r"\s+", " ", text or "").strip()
    if not text:
        return []

    # Split on Chinese and English sentence punctuation while keeping punctuation.
    parts = re.split(r"(?<=[。！？!?；;\.])\s*", text)
    chunks: List[str] = []
    current = ""
    for part in parts:
        if not part:
            continue
        if len(current) + len(part) <= max_chars:
            current += part
        else:
            if current:
                chunks.append(current.strip())
            # If one sentence is still too long, hard-split it.
            while len(part) > max_chars:
                chunks.append(part[:max_chars].strip())
                part = part[max_chars:]
            current = part
    if current:
        chunks.append(current.strip())
    return chunks


def _synthesize(req: TTSRequest) -> tuple[np.ndarray, int]:
    model = _load_model()
    chunks = _split_text(req.text, max(40, req.max_chars))
    if not chunks:
        raise ValueError("Text is empty")

    waves: List[np.ndarray] = []
    sample_rate = int(getattr(model.tts_model, "sample_rate", 48000))
    silence = np.zeros(int(sample_rate * 0.15), dtype=np.float32)

    for chunk in chunks:
        generate_kwargs = {
            "text": chunk,
            "cfg_value": req.cfg_value,
            "inference_timesteps": req.inference_timesteps,
        }
        if req.reference_wav_path:
            generate_kwargs["reference_wav_path"] = req.reference_wav_path
        if req.prompt_wav_path:
            generate_kwargs["prompt_wav_path"] = req.prompt_wav_path
        if req.prompt_text:
            generate_kwargs["prompt_text"] = req.prompt_text

        wav = model.generate(**generate_kwargs)
        wav = np.asarray(wav, dtype=np.float32)
        waves.append(wav)
        waves.append(silence)

    if waves and len(waves[-1]) == len(silence):
        waves.pop()
    return np.concatenate(waves), sample_rate


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "voxcpm-tts-server",
        "model": VOXCPM_MODEL,
        "device": VOXCPM_DEVICE,
        "voxcpm_dir": VOXCPM_DIR,
        "loaded": _model is not None,
    }


@app.post("/tts")
def tts(req: TTSRequest):
    try:
        wav, sample_rate = _synthesize(req)
        buf = io.BytesIO()
        sf.write(buf, wav, sample_rate, format="WAV")
        return Response(content=buf.getvalue(), media_type="audio/wav")
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/tts_file")
def tts_file(req: TTSFileRequest):
    try:
        wav, sample_rate = _synthesize(req)
        output_path = Path(req.output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(output_path), wav, sample_rate)
        return {
            "status": "ok",
            "output_path": str(output_path),
            "sample_rate": sample_rate,
            "samples": int(len(wav)),
            "duration": float(len(wav) / sample_rate),
        }
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
