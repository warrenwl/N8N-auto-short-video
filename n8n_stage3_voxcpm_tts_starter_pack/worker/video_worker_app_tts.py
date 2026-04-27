"""
video-worker v0.3.0
Multi-shot renderer with optional local VoxCPM TTS audio.

n8n calls POST /render. This service:
  1. Receives title/script/shots.
  2. Calls local VoxCPM TTS server when enable_tts=true.
  3. Generates shot images and clip_XXX.mp4 files.
  4. Concats clips into a silent base video.
  5. Burns subtitles and muxes voice.wav into final.mp4.
  6. Writes manifest.json and returns paths to n8n.
"""

from __future__ import annotations

import json
import math
import os
import re
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from fastapi import FastAPI, HTTPException
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
OUTPUT_DIR = DATA_DIR / "output"
TTS_BASE_URL = os.getenv("TTS_BASE_URL", "http://host.docker.internal:8010")
DEFAULT_WIDTH = int(os.getenv("VIDEO_WIDTH", "1080"))
DEFAULT_HEIGHT = int(os.getenv("VIDEO_HEIGHT", "1920"))
DEFAULT_FPS = int(os.getenv("VIDEO_FPS", "30"))
FONT_PATH = os.getenv("FONT_PATH", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")

app = FastAPI(title="video-worker", version="0.3.0")


class Shot(BaseModel):
    shot_id: int | str
    duration: float = 5
    subtitle: str = ""
    visual_prompt_cn: Optional[str] = None
    visual_prompt_en: Optional[str] = None


class TTSOptions(BaseModel):
    cfg_value: float = 2.0
    inference_timesteps: int = 10
    max_chars: int = 120
    reference_wav_path: Optional[str] = None
    prompt_wav_path: Optional[str] = None
    prompt_text: Optional[str] = None


class RenderRequest(BaseModel):
    task_id: str
    title: str
    script: str = ""
    cover_text: str = ""
    shots: List[Shot] = Field(default_factory=list)
    width: int = DEFAULT_WIDTH
    height: int = DEFAULT_HEIGHT
    fps: int = DEFAULT_FPS
    enable_tts: bool = True
    tts_base_url: str = TTS_BASE_URL
    tts_options: TTSOptions = Field(default_factory=TTSOptions)


def run_cmd(cmd: List[str]) -> None:
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        raise RuntimeError("Command failed:\n" + " ".join(cmd) + "\n\nSTDERR:\n" + proc.stderr[-4000:])


def ffprobe_duration(path: Path) -> float:
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path)
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        return 0.0
    try:
        return float(proc.stdout.strip())
    except Exception:
        return 0.0


def safe_text(text: str, max_len: int = 80) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text[:max_len]


def wrap_text(text: str, max_chars: int = 18) -> str:
    text = safe_text(text, 180)
    if not text:
        return ""
    lines = []
    current = ""
    for ch in text:
        current += ch
        if len(current) >= max_chars or ch in "，。！？；,!?;":
            lines.append(current.strip())
            current = ""
    if current.strip():
        lines.append(current.strip())
    return "\n".join(lines[:5])


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.truetype(FONT_PATH, size=size)
    except Exception:
        return ImageFont.load_default()


def draw_centered(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font, fill=(255, 255, 255), spacing=12):
    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=spacing, align="center")
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = xy[0] - w // 2
    y = xy[1] - h // 2
    draw.multiline_text((x, y), text, font=font, fill=fill, spacing=spacing, align="center")


def make_shot_image(path: Path, title: str, shot: Shot, width: int, height: int) -> None:
    # Simple placeholder image. Later this can be replaced by ComfyUI-generated shot images.
    img = Image.new("RGB", (width, height), (18, 18, 22))
    draw = ImageDraw.Draw(img)
    title_font = load_font(58)
    body_font = load_font(46)
    small_font = load_font(28)

    # Top title
    draw_centered(draw, (width // 2, 210), wrap_text(title or "AI Video", 13), title_font, fill=(255, 255, 255), spacing=10)

    # Middle prompt/shot content
    prompt = shot.visual_prompt_cn or shot.visual_prompt_en or shot.subtitle or "AI generated shot"
    draw_centered(draw, (width // 2, height // 2), wrap_text(prompt, 16), body_font, fill=(230, 230, 230), spacing=14)

    # Shot number marker
    marker = f"SHOT {shot.shot_id}"
    draw.rounded_rectangle((60, height - 170, 260, height - 105), radius=20, outline=(180, 180, 180), width=3)
    draw.text((85, height - 158), marker, font=small_font, fill=(220, 220, 220))
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path)


def seconds_to_srt_time(seconds: float) -> str:
    ms_total = int(round(seconds * 1000))
    h = ms_total // 3_600_000
    ms_total %= 3_600_000
    m = ms_total // 60_000
    ms_total %= 60_000
    s = ms_total // 1000
    ms = ms_total % 1000
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def write_srt(path: Path, shots: List[Shot], durations: List[float]) -> None:
    t = 0.0
    blocks = []
    for idx, (shot, dur) in enumerate(zip(shots, durations), start=1):
        start = t
        end = t + max(0.5, float(dur))
        subtitle = shot.subtitle or shot.visual_prompt_cn or shot.visual_prompt_en or ""
        blocks.append(f"{idx}\n{seconds_to_srt_time(start)} --> {seconds_to_srt_time(end)}\n{subtitle}\n")
        t = end
    path.write_text("\n".join(blocks), encoding="utf-8")


def generate_voice(req: RenderRequest, task_dir: Path) -> tuple[Optional[Path], float]:
    if not req.enable_tts:
        return None, 0.0
    voice_path = task_dir / "voice.wav"
    tts_url = req.tts_base_url.rstrip("/") + "/tts"
    payload: Dict[str, Any] = {
        "task_id": req.task_id,
        "text": req.script or " ".join([s.subtitle for s in req.shots if s.subtitle]),
        "cfg_value": req.tts_options.cfg_value,
        "inference_timesteps": req.tts_options.inference_timesteps,
        "max_chars": req.tts_options.max_chars,
    }
    for key in ["reference_wav_path", "prompt_wav_path", "prompt_text"]:
        value = getattr(req.tts_options, key)
        if value:
            payload[key] = value

    resp = requests.post(tts_url, json=payload, timeout=60 * 30)
    if resp.status_code != 200:
        raise RuntimeError(f"TTS request failed: {resp.status_code} {resp.text[:1000]}")
    voice_path.write_bytes(resp.content)
    return voice_path, ffprobe_duration(voice_path)


def normalize_shots(req: RenderRequest, audio_duration: float) -> tuple[List[Shot], List[float]]:
    shots = req.shots or [Shot(shot_id=1, duration=8, subtitle=req.cover_text or req.title, visual_prompt_cn=req.cover_text or req.title)]
    base_durations = [max(1.0, float(s.duration or 5)) for s in shots]
    base_total = sum(base_durations)
    target_total = max(base_total, audio_duration + 0.5 if audio_duration else base_total)
    if target_total > base_total:
        ratio = target_total / base_total
        durations = [round(d * ratio, 3) for d in base_durations]
    else:
        durations = base_durations
    return shots, durations


def render_clip(image_path: Path, clip_path: Path, duration: float, fps: int, width: int, height: int) -> None:
    clip_path.parent.mkdir(parents=True, exist_ok=True)
    # Encode all clips with identical parameters so concat demuxer can copy safely.
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", str(image_path),
        "-t", str(duration),
        "-r", str(fps),
        "-vf", f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-an",
        str(clip_path)
    ]
    run_cmd(cmd)


def concat_clips(concat_file: Path, base_video_path: Path) -> None:
    cmd = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", str(concat_file),
        "-c", "copy",
        str(base_video_path)
    ]
    run_cmd(cmd)


def mux_audio_and_subtitles(base_video: Path, voice_path: Optional[Path], srt_path: Path, final_path: Path) -> None:
    # Escape path for subtitles filter.
    srt_escaped = str(srt_path).replace("'", "\\'").replace(":", "\\:")
    subtitle_filter = f"subtitles='{srt_escaped}':force_style='FontName=Noto Sans CJK SC,FontSize=16,Outline=2,Shadow=1,MarginV=80'"

    if voice_path and voice_path.exists():
        cmd = [
            "ffmpeg", "-y",
            "-i", str(base_video),
            "-i", str(voice_path),
            "-vf", subtitle_filter,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            str(final_path)
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(base_video),
            "-vf", subtitle_filter,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-pix_fmt", "yuv420p",
            str(final_path)
        ]
    run_cmd(cmd)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "video-worker",
        "version": "0.3.0",
        "tts_base_url": TTS_BASE_URL,
    }


@app.post("/render")
def render(req: RenderRequest):
    try:
        task_dir = OUTPUT_DIR / req.task_id
        images_dir = task_dir / "images"
        clips_dir = task_dir / "clips"
        task_dir.mkdir(parents=True, exist_ok=True)
        images_dir.mkdir(parents=True, exist_ok=True)
        clips_dir.mkdir(parents=True, exist_ok=True)

        voice_path, audio_duration = generate_voice(req, task_dir)
        shots, durations = normalize_shots(req, audio_duration)

        cover_path = task_dir / "cover.png"
        make_shot_image(cover_path, req.cover_text or req.title, shots[0], req.width, req.height)

        subtitle_path = task_dir / "subtitles.srt"
        write_srt(subtitle_path, shots, durations)

        image_paths: List[str] = []
        clip_paths: List[str] = []
        for idx, (shot, duration) in enumerate(zip(shots, durations), start=1):
            image_path = images_dir / f"shot_{idx:03}.png"
            clip_path = clips_dir / f"clip_{idx:03}.mp4"
            make_shot_image(image_path, req.title, shot, req.width, req.height)
            render_clip(image_path, clip_path, duration, req.fps, req.width, req.height)
            image_paths.append(str(image_path))
            clip_paths.append(str(clip_path))

        concat_path = task_dir / "concat.txt"
        concat_path.write_text("".join([f"file '{p}'\n" for p in clip_paths]), encoding="utf-8")

        base_video_path = task_dir / "base_no_audio.mp4"
        final_path = task_dir / "final.mp4"
        concat_clips(concat_path, base_video_path)
        mux_audio_and_subtitles(base_video_path, voice_path, subtitle_path, final_path)

        manifest = {
            "status": "ok",
            "task_id": req.task_id,
            "video_path": str(final_path),
            "base_video_path": str(base_video_path),
            "voice_path": str(voice_path) if voice_path else None,
            "audio_duration": audio_duration,
            "audio_engine": "VoxCPM",
            "cover_path": str(cover_path),
            "subtitle_path": str(subtitle_path),
            "images": image_paths,
            "clips": clip_paths,
            "durations": durations,
            "concat_path": str(concat_path),
            "width": req.width,
            "height": req.height,
            "fps": req.fps,
        }
        manifest_path = task_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        manifest["manifest_path"] = str(manifest_path)
        return manifest
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
