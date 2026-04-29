"""
video-worker v0.4.0
Multi-shot renderer with optional local VoxCPM TTS audio and ComfyUI images.

n8n calls POST /render. This service:
  1. Receives title/script/shots.
  2. Calls local VoxCPM TTS server when enable_tts=true.
  3. Generates shot images and clip_XXX.mp4 files.
  4. Concats clips into a silent base video.
  5. Burns subtitles and muxes voice.wav into final.mp4.
  6. Writes manifest.json and returns paths to n8n.
"""

from __future__ import annotations

import copy
import json
import os
import random
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from fastapi import FastAPI, HTTPException
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel, Field

DATA_DIR = Path(os.getenv("DATA_DIR", "/data"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_ROOT", str(DATA_DIR / "output")))
TTS_CONFIG_PATH = Path(os.getenv("TTS_CONFIG_PATH", "/config/tts_voice_config.json"))
REMOTION_VISUAL_CONFIG_PATH = Path(os.getenv("REMOTION_VISUAL_CONFIG_PATH", "/config/remotion_visual_config.jsonc"))
ACCOUNT_CONFIG_PATH = Path(os.getenv("ACCOUNT_CONFIG_PATH", "/config/Account/mes.json"))
TTS_BASE_URL = os.getenv("TTS_BASE_URL", "http://host.docker.internal:8010")
COMFYUI_BASE_URL = os.getenv("COMFYUI_BASE_URL", "http://host.docker.internal:8000")
REMOTION_RENDERER_URL = os.getenv("REMOTION_RENDERER_URL", "http://host.docker.internal:3001")
DEFAULT_WIDTH = int(os.getenv("VIDEO_WIDTH", "1080"))
DEFAULT_HEIGHT = int(os.getenv("VIDEO_HEIGHT", "1920"))
DEFAULT_FPS = int(os.getenv("VIDEO_FPS", "30"))
FONT_PATH = os.getenv("FONT_PATH", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")

app = FastAPI(title="video-worker", version="0.4.0")


class Shot(BaseModel):
    shot_id: int | str
    duration: float = 5
    subtitle: str = ""
    headline: Optional[str] = None
    body: Optional[str] = None
    keywords: List[str] = Field(default_factory=list)
    layout_hint: Optional[str] = None
    visual_prompt_cn: Optional[str] = None
    visual_prompt_en: Optional[str] = None


class TTSOptions(BaseModel):
    voice_prompt: Optional[str] = None
    cfg_value: Optional[float] = None
    inference_timesteps: Optional[int] = None
    max_chars: Optional[int] = None
    use_reference_audio: Optional[bool] = None
    reference_wav_path: Optional[str] = None
    prompt_wav_path: Optional[str] = None
    prompt_text: Optional[str] = None


class ComfyUIOptions(BaseModel):
    base_url: str = COMFYUI_BASE_URL
    workflow_template_path: str = "/app/comfyui/zimage_text2image_api_template.json"
    prompt_node_id: str = "63"
    save_node_id: str = "9"
    sampler_node_id: str = "57:3"
    latent_node_id: str = "57:13"
    prompt_prefix: str = "竖屏短视频画面，真实摄影，电影感光影，构图干净，手机竖屏，高清细节"
    negative_prompt: str = "多个人，过度锐化，塑料质感，畸形手指，多余的手，畸形肢体，文字乱码，logo，水印，低清晰度，模糊"
    filename_prefix: str = "n8n-video"
    image_width: int = 720
    image_height: int = 1280
    timeout_seconds: int = 900
    poll_interval_seconds: float = 2.0
    fallback_to_placeholder: bool = True
    overlay_cover_text: bool = True


class RenderRequest(BaseModel):
    task_id: str
    title: str
    script: str = ""
    cover_text: str = ""
    platform: str = "default"
    cover_prompt: Optional[str] = None
    shots: List[Shot] = Field(default_factory=list)
    width: int = DEFAULT_WIDTH
    height: int = DEFAULT_HEIGHT
    fps: int = DEFAULT_FPS
    enable_tts: bool = True
    tts_base_url: str = TTS_BASE_URL
    tts_options: TTSOptions = Field(default_factory=TTSOptions)
    enable_comfyui: bool = False
    comfyui_mode: str = "all_shots"
    comfyui_options: ComfyUIOptions = Field(default_factory=ComfyUIOptions)
    render_engine: str = "ffmpeg"
    template_type: str = "knowledge"
    remotion_renderer_url: str = REMOTION_RENDERER_URL


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


def normalize_display_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def truncate_with_ellipsis(text: str, max_len: int) -> str:
    text = normalize_display_text(text)
    if len(text) <= max_len:
        return text
    trimmed = text[: max(1, max_len - 1)].rstrip("，。！？；、,!?;:： ")
    return (trimmed or text[: max(1, max_len - 1)]) + "…"


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


def overlay_cover_text(image_path: Path, output_path: Path, cover_text: str, width: int, height: int) -> None:
    img = Image.open(image_path).convert("RGB").resize((width, height))
    if not cover_text:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        img.save(output_path)
        return

    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    title_font = load_font(82)
    badge_font = load_font(36)
    draw.rounded_rectangle((60, 120, width - 60, 390), radius=40, fill=(0, 0, 0, 130))
    draw_centered(draw, (width // 2, 250), wrap_text(cover_text, 10), title_font, fill=(255, 255, 255), spacing=10)
    draw.text((90, 335), "AI VIDEO", font=badge_font, fill=(230, 230, 230, 190))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB").save(output_path)


def load_comfy_workflow(template_path: str) -> Dict[str, Any]:
    path = Path(template_path)
    if not path.exists():
        raise FileNotFoundError(f"ComfyUI workflow template not found: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def patch_comfy_workflow(template: Dict[str, Any], prompt_text: str, output_prefix: str, seed: int, options: ComfyUIOptions) -> Dict[str, Any]:
    workflow = copy.deepcopy(template)
    if options.prompt_node_id not in workflow:
        raise KeyError(f"Prompt node {options.prompt_node_id} not found in workflow")
    workflow[options.prompt_node_id].setdefault("inputs", {})["value"] = prompt_text

    if options.save_node_id in workflow:
        workflow[options.save_node_id].setdefault("inputs", {})["filename_prefix"] = output_prefix

    if options.sampler_node_id in workflow:
        sampler_inputs = workflow[options.sampler_node_id].setdefault("inputs", {})
        if "seed" in sampler_inputs:
            sampler_inputs["seed"] = seed

    if options.latent_node_id in workflow:
        latent_inputs = workflow[options.latent_node_id].setdefault("inputs", {})
        if "width" in latent_inputs:
            latent_inputs["width"] = options.image_width
        if "height" in latent_inputs:
            latent_inputs["height"] = options.image_height

    negative_node = workflow.get("61")
    if isinstance(negative_node, dict) and isinstance(negative_node.get("inputs"), dict) and "string_a" in negative_node["inputs"]:
        negative_node["inputs"]["string_a"] = options.negative_prompt

    return workflow


def queue_comfy_prompt(base_url: str, workflow: Dict[str, Any], client_id: str) -> str:
    resp = requests.post(base_url.rstrip("/") + "/prompt", json={"prompt": workflow, "client_id": client_id}, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"ComfyUI /prompt failed: {resp.status_code} {resp.text[:2000]}")
    data = resp.json()
    prompt_id = data.get("prompt_id")
    if not prompt_id:
        raise RuntimeError(f"ComfyUI did not return prompt_id: {data}")
    return str(prompt_id)


def wait_comfy_output(base_url: str, prompt_id: str, save_node_id: str, timeout_seconds: int, poll_interval: float) -> List[Dict[str, Any]]:
    deadline = time.time() + timeout_seconds
    history_url = base_url.rstrip("/") + f"/history/{prompt_id}"
    last_payload = None
    while time.time() < deadline:
        resp = requests.get(history_url, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            last_payload = data
            item = data.get(prompt_id)
            if item:
                status = item.get("status", {})
                if status.get("status_str") == "error":
                    raise RuntimeError(f"ComfyUI execution error: {json.dumps(status, ensure_ascii=False)[:2000]}")
                images = item.get("outputs", {}).get(save_node_id, {}).get("images") or []
                if images:
                    return images
        time.sleep(poll_interval)
    raise TimeoutError(f"ComfyUI output timeout for prompt_id={prompt_id}; last={str(last_payload)[:1000]}")


def download_comfy_image(base_url: str, image_meta: Dict[str, Any], output_path: Path) -> None:
    params = {
        "filename": image_meta.get("filename"),
        "subfolder": image_meta.get("subfolder", ""),
        "type": image_meta.get("type", "output"),
    }
    resp = requests.get(base_url.rstrip("/") + "/view", params=params, timeout=120)
    if resp.status_code != 200:
        raise RuntimeError(f"ComfyUI /view failed: {resp.status_code} {resp.text[:1000]}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(resp.content)


def build_image_prompt(req: RenderRequest, shot: Optional[Shot], is_cover: bool) -> str:
    options = req.comfyui_options
    if is_cover:
        body = req.cover_prompt or (
            f"竖屏短视频封面背景，主题：{req.title}，封面文案参考：{req.cover_text}，"
            "画面主体明确，留出上方标题空间，不要生成文字，不要logo，不要水印，商业短视频封面质感"
        )
    else:
        assert shot is not None
        body = shot.visual_prompt_cn or shot.visual_prompt_en or shot.subtitle or req.title
        body = f"{body}，与短视频主题《{req.title}》一致，不要生成文字，不要logo，不要水印"
    return f"{options.prompt_prefix}，{body}".strip("，")


def generate_comfy_image(req: RenderRequest, prompt_text: str, out_path: Path, prefix: str, seed: int) -> Tuple[str, str]:
    options = req.comfyui_options
    template = load_comfy_workflow(options.workflow_template_path)
    workflow = patch_comfy_workflow(template, prompt_text, prefix, seed, options)
    prompt_id = queue_comfy_prompt(options.base_url, workflow, client_id=f"n8n-video-agent-{req.task_id}")
    images = wait_comfy_output(
        options.base_url,
        prompt_id,
        options.save_node_id,
        options.timeout_seconds,
        options.poll_interval_seconds,
    )
    download_comfy_image(options.base_url, images[0], out_path)
    return str(out_path), prompt_id


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
    for item in subtitle_entries(shots, durations):
        start = item["start"]
        end = item["end"]
        subtitle = item["subtitle"]
        idx = item["index"]
        blocks.append(f"{idx}\n{seconds_to_srt_time(start)} --> {seconds_to_srt_time(end)}\n{subtitle}\n")
    path.write_text("\n".join(blocks), encoding="utf-8")


def subtitle_entries(shots: List[Shot], durations: List[float]) -> List[Dict[str, Any]]:
    t = 0.0
    entries: List[Dict[str, Any]] = []
    for idx, (shot, dur) in enumerate(zip(shots, durations), start=1):
        start = t
        end = t + max(0.5, float(dur))
        subtitle = subtitle_text(shot)
        entries.append({
            "index": idx,
            "start": round(start, 3),
            "end": round(end, 3),
            "duration": round(end - start, 3),
            "subtitle": subtitle,
        })
        t = end
    return entries


def subtitle_text(shot: Shot) -> str:
    return shot.subtitle or shot.visual_prompt_cn or shot.visual_prompt_en or ""


def subtitle_weight(shot: Shot) -> int:
    text = safe_text(subtitle_text(shot), 500)
    # Chinese punctuation and short phrases still need readable on-screen time.
    return max(1, len(re.sub(r"\s+", "", text)))


def weighted_subtitle_durations(shots: List[Shot], target_total: float) -> List[float]:
    weights = [subtitle_weight(shot) for shot in shots]
    weight_total = sum(weights) or len(shots)
    durations = [max(0.8, target_total * weight / weight_total) for weight in weights]
    drift = target_total - sum(durations)
    durations[-1] = max(0.8, durations[-1] + drift)
    return [round(d, 3) for d in durations]


def detect_silence_midpoints(audio_path: Optional[Path], min_silence: float = 0.22, noise_db: str = "-35dB") -> List[float]:
    if not audio_path or not audio_path.exists():
        return []
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-nostats",
        "-i",
        str(audio_path),
        "-af",
        f"silencedetect=noise={noise_db}:d={min_silence}",
        "-f",
        "null",
        "-",
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if proc.returncode != 0:
        return []

    starts: List[float] = []
    midpoints: List[float] = []
    for line in proc.stderr.splitlines():
        start_match = re.search(r"silence_start:\s*([0-9.]+)", line)
        if start_match:
            starts.append(float(start_match.group(1)))
            continue
        end_match = re.search(r"silence_end:\s*([0-9.]+)", line)
        if end_match and starts:
            start = starts.pop(0)
            end = float(end_match.group(1))
            if end > start:
                midpoints.append(round((start + end) / 2, 3))
    return midpoints


def pick_alignment_boundaries(candidates: List[float], expected: List[float], total: float) -> List[float]:
    boundaries: List[float] = []
    last = 0.0
    # If a silence point is too far from the text-weighted boundary, using it makes
    # a whole subtitle card flash by. Fall back to weighted durations instead.
    max_drift = max(1.5, total * 0.08)
    remaining = sorted(point for point in candidates if 0.5 < point < total - 0.5)
    for idx, target in enumerate(expected):
        min_remaining = len(expected) - idx - 1
        viable = [
            point
            for point in remaining
            if point > last + 0.45 and len([future for future in remaining if future > point + 0.45]) >= min_remaining
        ]
        if not viable:
            return []
        chosen = min(viable, key=lambda point: abs(point - target))
        if abs(chosen - target) > max_drift:
            return []
        boundaries.append(chosen)
        last = chosen
        remaining = [point for point in remaining if point > chosen]
    return boundaries


def durations_from_boundaries(boundaries: List[float], total: float) -> List[float]:
    marks = [0.0, *boundaries, total]
    return [round(max(0.5, marks[idx + 1] - marks[idx]), 3) for idx in range(len(marks) - 1)]


def load_tts_config() -> Dict[str, Any]:
    if not TTS_CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(TTS_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"Invalid TTS config: {TTS_CONFIG_PATH}: {exc}") from exc


def strip_json_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return re.sub(r"(^|\s)//.*$", r"\1", text, flags=re.M)


def load_remotion_visual_config() -> Dict[str, Any]:
    if not REMOTION_VISUAL_CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(strip_json_comments(REMOTION_VISUAL_CONFIG_PATH.read_text(encoding="utf-8")))
    except Exception as exc:
        raise RuntimeError(f"Invalid Remotion visual config: {REMOTION_VISUAL_CONFIG_PATH}: {exc}") from exc


def load_account_brand(task_dir: Path) -> Dict[str, Any]:
    brand: Dict[str, Any] = {
        "account_name": "",
        "account_logo": "",
        "account_logo_path": None,
        "follow_voice_text": "",
    }
    if not ACCOUNT_CONFIG_PATH.exists():
        return brand
    try:
        data = json.loads(ACCOUNT_CONFIG_PATH.read_text(encoding="utf-8"))
    except Exception:
        return brand

    account_name = normalize_display_text(str(data.get("account_name") or data.get("name") or ""))
    logo_name = normalize_display_text(str(data.get("account_logo") or data.get("logo") or ""))
    brand["account_name"] = account_name
    brand["account_logo"] = logo_name
    brand["follow_voice_text"] = normalize_display_text(str(data.get("follow_voice_text") or ""))

    if logo_name:
        source = ACCOUNT_CONFIG_PATH.parent / logo_name
        if source.exists() and source.is_file():
            suffix = source.suffix or ".jpg"
            target = task_dir / f"account_logo{suffix}"
            shutil.copyfile(source, target)
            brand["account_logo_path"] = str(target)
    return brand


def normalize_template_type(template_type: str, visual_config: Dict[str, Any]) -> str:
    templates = visual_config.get("templates") or {}
    if template_type in templates:
        return template_type
    if template_type in {"knowledge", "list", "contrast", "story"}:
        return template_type
    return "knowledge"


def clamp(value: int, low: int = 0, high: int = 255) -> int:
    return max(low, min(high, value))


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#{:02X}{:02X}{:02X}".format(*(clamp(v) for v in rgb))


def extract_cover_accent(image_path: Path, fallback: str) -> str:
    if not image_path.exists():
        return fallback
    try:
        img = Image.open(image_path).convert("RGB")
        img.thumbnail((80, 80))
        pixels = list(img.getdata())
        colorful = []
        for r, g, b in pixels:
            brightness = (r + g + b) / 3
            saturation = max(r, g, b) - min(r, g, b)
            if brightness > 54 and saturation > 18:
                colorful.append((r, g, b, brightness + saturation * 1.7))
        source = sorted(colorful or [(r, g, b, (r + g + b) / 3) for r, g, b in pixels], key=lambda item: item[3], reverse=True)
        sample = source[: max(1, min(80, len(source)))]
        r = int(sum(item[0] for item in sample) / len(sample))
        g = int(sum(item[1] for item in sample) / len(sample))
        b = int(sum(item[2] for item in sample) / len(sample))
        saturation = max(r, g, b) - min(r, g, b)
        if (r + g + b) / 3 < 64 or saturation < 24:
            return fallback
        return rgb_to_hex((r, g, b))
    except Exception:
        return fallback


def merged_tts_options(options: TTSOptions) -> Dict[str, Any]:
    config = load_tts_config()
    request_options = options.model_dump(exclude_none=True)
    merged = {**config, **request_options}
    if not bool(merged.get("use_reference_audio", False)):
        merged.pop("reference_wav_path", None)
        merged.pop("prompt_wav_path", None)
        merged.pop("prompt_text", None)
    return merged


def speech_text_from_shots(req: RenderRequest) -> str:
    subtitles = [safe_text(shot.subtitle, 500) for shot in req.shots if safe_text(shot.subtitle, 500)]
    if subtitles:
        return "\n".join(subtitles)
    return req.script or req.cover_text or req.title


def render_tts_file(req: RenderRequest, text: str, output_path: Path) -> float:
    tts_url = req.tts_base_url.rstrip("/") + "/tts"
    options = merged_tts_options(req.tts_options)
    payload: Dict[str, Any] = {
        "task_id": req.task_id,
        "text": text,
        "voice_prompt": options.get("voice_prompt"),
        "cfg_value": options.get("cfg_value", 2.0),
        "inference_timesteps": options.get("inference_timesteps", 10),
        "max_chars": options.get("max_chars", 2000),
    }
    for key in ["reference_wav_path", "prompt_wav_path", "prompt_text"]:
        value = options.get(key)
        if value:
            payload[key] = value

    resp = requests.post(tts_url, json=payload, timeout=60 * 30)
    if resp.status_code != 200:
        raise RuntimeError(f"TTS request failed: {resp.status_code} {resp.text[:1000]}")
    output_path.write_bytes(resp.content)
    return ffprobe_duration(output_path)


def render_silence(path: Path, duration: float, sample_rate: int = 48000) -> None:
    if duration <= 0.02:
        path.write_bytes(b"")
        return
    run_cmd([
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", f"anullsrc=channel_layout=mono:sample_rate={sample_rate}",
        "-t", f"{duration:.3f}",
        "-c:a", "pcm_s16le",
        str(path),
    ])


def concat_wav_files(inputs: List[Path], output_path: Path) -> None:
    existing = [path for path in inputs if path.exists() and path.stat().st_size > 0]
    if not existing:
        return
    if len(existing) == 1:
        shutil.copyfile(existing[0], output_path)
        return
    filter_inputs: List[str] = []
    cmd = ["ffmpeg", "-y"]
    for path in existing:
        cmd.extend(["-i", str(path)])
    for idx in range(len(existing)):
        filter_inputs.append(f"[{idx}:a]")
    cmd.extend([
        "-filter_complex",
        "".join(filter_inputs) + f"concat=n={len(existing)}:v=0:a=1[a]",
        "-map",
        "[a]",
        "-c:a",
        "pcm_s16le",
        str(output_path),
    ])
    run_cmd(cmd)


def outro_voice_text(req: RenderRequest, visual_config: Dict[str, Any], account_brand: Dict[str, Any]) -> str:
    outro = visual_config.get("outro") or {}
    if outro.get("enabled") is False or outro.get("show_follow_animation") is False:
        return ""
    if outro.get("voice_enabled") is False:
        return ""
    text = normalize_display_text(str(account_brand.get("follow_voice_text") or outro.get("voice_text") or ""))
    if not text:
        return ""
    return (
        text
        .replace("{account_name}", normalize_display_text(str(account_brand.get("account_name") or "我")))
        .replace("{title}", normalize_display_text(req.title))
    )


def generate_main_voice(req: RenderRequest, task_dir: Path) -> tuple[Optional[Path], float]:
    if not req.enable_tts:
        return None, 0.0
    main_voice_path = task_dir / "voice_main.wav"
    duration = render_tts_file(req, speech_text_from_shots(req), main_voice_path)
    return main_voice_path, duration


def build_final_voice(
    req: RenderRequest,
    task_dir: Path,
    main_voice_path: Optional[Path],
    main_audio_duration: float,
    main_timeline_duration: float,
    visual_config: Dict[str, Any],
    account_brand: Dict[str, Any],
) -> tuple[Optional[Path], float, float, str]:
    if not main_voice_path:
        return None, 0.0, 0.0, ""

    voice_path = task_dir / "voice.wav"
    follow_text = outro_voice_text(req, visual_config, account_brand)
    if not follow_text:
        shutil.copyfile(main_voice_path, voice_path)
        return voice_path, main_audio_duration, 0.0, ""

    outro_path = task_dir / "voice_outro.wav"
    outro_duration = render_tts_file(req, follow_text, outro_path)
    summary_seconds = float((visual_config.get("outro") or {}).get("summary_seconds") or 1.0)
    gap_duration = max(0.0, main_timeline_duration - main_audio_duration + summary_seconds)
    silence_path = task_dir / "voice_outro_gap.wav"
    render_silence(silence_path, gap_duration)
    concat_wav_files([main_voice_path, silence_path, outro_path], voice_path)
    return voice_path, ffprobe_duration(voice_path), outro_duration, follow_text


def normalize_shots(req: RenderRequest, audio_duration: float, voice_path: Optional[Path] = None) -> tuple[List[Shot], List[float], Dict[str, Any]]:
    shots = req.shots or [Shot(shot_id=1, duration=8, subtitle=req.cover_text or req.title, visual_prompt_cn=req.cover_text or req.title)]
    base_durations = [max(1.0, float(s.duration or 5)) for s in shots]
    alignment: Dict[str, Any] = {
        "method": "requested_duration",
        "audio_duration": audio_duration,
        "base_durations": [round(d, 3) for d in base_durations],
    }
    if audio_duration:
        target_total = max(1.0, audio_duration + 0.5)
        weighted_durations = weighted_subtitle_durations(shots, target_total)
        expected_boundaries: List[float] = []
        t = 0.0
        for dur in weighted_durations[:-1]:
            t += dur
            expected_boundaries.append(round(t, 3))

        silence_midpoints = detect_silence_midpoints(voice_path)
        silence_boundaries = pick_alignment_boundaries(silence_midpoints, expected_boundaries, audio_duration)
        if len(silence_boundaries) == max(0, len(shots) - 1):
            durations = durations_from_boundaries(silence_boundaries, target_total)
            alignment.update({
                "method": "audio_silence_boundaries",
                "target_total": round(target_total, 3),
                "silence_midpoints": silence_midpoints,
                "selected_boundaries": silence_boundaries,
                "expected_boundaries": expected_boundaries,
            })
            return shots, durations, alignment

        alignment.update({
            "method": "weighted_text_fallback",
            "target_total": round(target_total, 3),
            "silence_midpoints": silence_midpoints,
            "selected_boundaries": [],
            "expected_boundaries": expected_boundaries,
            "fallback_reason": "not_enough_usable_silence_boundaries",
        })
        return shots, weighted_durations, alignment
    return shots, [round(d, 3) for d in base_durations], alignment


def derive_headline(text: str, fallback: str) -> str:
    cleaned = normalize_display_text(text)
    if not cleaned:
        return truncate_with_ellipsis(fallback, 18) or "重点观点"
    normalized = re.sub(r"^(第[一二三四五六七八九十]+|首先|其次|然后|最后)[，,、：:]*", "", cleaned).strip()
    clauses = [part.strip() for part in re.split(r"[，。！？；,!?;]", normalized or cleaned) if part.strip()]
    first = next((part for part in clauses if len(part) > 2), normalized or cleaned)
    return truncate_with_ellipsis(first, 18) or "重点观点"


def derive_keywords(text: str, fallback: str) -> List[str]:
    cleaned = normalize_display_text(text)
    cleaned = re.sub(r"(第[一二三四五六七八九十]+|首先|其次|然后|最后)[，,、：:]*", "", cleaned)
    tokens = [part.strip() for part in re.split(r"[，。！？；、,\s]+", cleaned) if part.strip()]
    keywords: List[str] = []
    for token in tokens:
        if len(token) <= 1:
            continue
        keywords.append(truncate_with_ellipsis(token, 10))
        if len(keywords) >= 4:
            break
    if keywords:
        return keywords
    fallback_text = truncate_with_ellipsis(fallback, 10)
    return [fallback_text] if fallback_text else ["观点"]


def normalize_keywords(value: List[str], fallback_text: str, fallback_title: str) -> List[str]:
    keywords = [
        truncate_with_ellipsis(str(item), 10)
        for item in (value or [])
        if normalize_display_text(str(item))
    ]
    if keywords:
        return keywords[:4]
    return derive_keywords(fallback_text, fallback_title)


def build_remotion_manifest(
    req: RenderRequest,
    shots: List[Shot],
    durations: List[float],
    voice_path: Optional[Path],
    cover_path: Path,
    audio_duration: float,
    voice_total_duration: float,
    outro_audio_duration: float,
    outro_voice_text_value: str,
    subtitle_alignment: Dict[str, Any],
    visual_config: Dict[str, Any],
    account_brand: Dict[str, Any],
) -> Dict[str, Any]:
    entries = subtitle_entries(shots, durations)
    timeline_duration = max(audio_duration or 0.0, sum(durations))
    template_type = normalize_template_type(req.template_type, visual_config)
    template_config = (visual_config.get("templates") or {}).get(template_type, {})
    fallback_primary = str(
        template_config.get("accent")
        or visual_config.get("fallback_primary_color")
        or "#F8D66D"
    )
    primary_color = (
        extract_cover_accent(cover_path, fallback_primary)
        if bool(visual_config.get("auto_from_cover", False))
        else fallback_primary
    )
    secondary_color = str(visual_config.get("secondary_color") or "#58B6FF")
    background_color = str(visual_config.get("background_color") or "#111111")
    segments = []
    for shot, entry in zip(shots, entries):
        text = entry["subtitle"]
        body = normalize_display_text(shot.body or text)
        headline = normalize_display_text(shot.headline or "")
        segments.append({
            **entry,
            "headline": truncate_with_ellipsis(headline, 18) if headline else derive_headline(body or text, req.title),
            "keywords": normalize_keywords(shot.keywords, body or text, req.title),
            "body": body or text,
            "layout_hint": normalize_display_text(shot.layout_hint or ""),
            "visual_prompt": shot.visual_prompt_cn or shot.visual_prompt_en or "",
        })
    return {
        "task_id": req.task_id,
        "title": req.title,
        "cover_text": req.cover_text,
        "platform": req.platform,
        "cover_path": str(cover_path),
        "voice_path": str(voice_path) if voice_path else None,
        "audio_duration": timeline_duration,
        "source_audio_duration": audio_duration,
        "voice_total_duration": voice_total_duration,
        "outro_audio_duration": outro_audio_duration,
        "outro_voice_text": outro_voice_text_value,
        "width": req.width,
        "height": req.height,
        "fps": req.fps,
        "template_type": template_type,
        "subtitle_alignment": subtitle_alignment,
        "visual_config": visual_config,
        "account": account_brand,
        "theme": {
            "style": template_config.get("layout") or "clean_knowledge",
            "primary_color": primary_color,
            "secondary_color": secondary_color,
            "background_color": background_color,
            "template_label": template_config.get("label") or "",
        },
        "segments": segments,
    }


def render_with_remotion(req: RenderRequest, remotion_manifest_path: Path, final_path: Path) -> Dict[str, Any]:
    payload = {
        "manifest_path": str(remotion_manifest_path),
        "output_path": str(final_path),
    }
    resp = requests.post(req.remotion_renderer_url.rstrip("/") + "/render", json=payload, timeout=60 * 30)
    if resp.status_code != 200:
        raise RuntimeError(f"Remotion render failed: {resp.status_code} {resp.text[:2000]}")
    return resp.json()


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
        "version": "0.4.0",
        "tts_base_url": TTS_BASE_URL,
        "comfyui_base_url": COMFYUI_BASE_URL,
        "remotion_renderer_url": REMOTION_RENDERER_URL,
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

        visual_config = load_remotion_visual_config()
        account_brand = load_account_brand(task_dir)
        main_voice_path, audio_duration = generate_main_voice(req, task_dir)
        shots, durations, subtitle_alignment = normalize_shots(req, audio_duration, main_voice_path)
        main_timeline_duration = sum(durations)
        voice_path, voice_total_duration, outro_audio_duration, outro_voice_text_value = build_final_voice(
            req,
            task_dir,
            main_voice_path,
            audio_duration,
            main_timeline_duration,
            visual_config,
            account_brand,
        )

        prompt_ids: Dict[str, Any] = {}
        media_errors: Dict[str, str] = {}
        cover_base_path = task_dir / "cover_base.png"
        cover_path = task_dir / "cover.png"
        cover_prompt = build_image_prompt(req, None, is_cover=True)
        if req.enable_comfyui:
            try:
                _, prompt_id = generate_comfy_image(
                    req,
                    cover_prompt,
                    cover_base_path,
                    prefix=f"{req.comfyui_options.filename_prefix}/{req.task_id}/cover",
                    seed=random.randint(1, 2**63 - 1),
                )
                prompt_ids["cover"] = prompt_id
                if req.comfyui_options.overlay_cover_text:
                    overlay_cover_text(cover_base_path, cover_path, req.cover_text or req.title, req.width, req.height)
                else:
                    Image.open(cover_base_path).convert("RGB").resize((req.width, req.height)).save(cover_path)
            except Exception as exc:
                if not req.comfyui_options.fallback_to_placeholder:
                    raise
                media_errors["cover"] = str(exc)[:1000]
                make_shot_image(cover_path, req.cover_text or req.title, shots[0], req.width, req.height)
        else:
            make_shot_image(cover_path, req.cover_text or req.title, shots[0], req.width, req.height)

        subtitle_path = task_dir / "subtitles.srt"
        write_srt(subtitle_path, shots, durations)
        subtitles_json_path = task_dir / "subtitles.json"
        subtitles_json_path.write_text(
            json.dumps(subtitle_entries(shots, durations), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        image_paths: List[str] = []
        clip_paths: List[str] = []
        if req.comfyui_mode == "all_shots" and req.render_engine == "ffmpeg":
            for idx, (shot, duration) in enumerate(zip(shots, durations), start=1):
                image_path = images_dir / f"shot_{idx:03}.png"
                clip_path = clips_dir / f"clip_{idx:03}.mp4"
                if req.enable_comfyui:
                    try:
                        prompt = build_image_prompt(req, shot, is_cover=False)
                        _, prompt_id = generate_comfy_image(
                            req,
                            prompt,
                            image_path,
                            prefix=f"{req.comfyui_options.filename_prefix}/{req.task_id}/shot_{idx:03}",
                            seed=random.randint(1, 2**63 - 1),
                        )
                        prompt_ids[f"shot_{idx:03}"] = prompt_id
                    except Exception as exc:
                        if not req.comfyui_options.fallback_to_placeholder:
                            raise
                        media_errors[f"shot_{idx:03}"] = str(exc)[:1000]
                        make_shot_image(image_path, req.title, shot, req.width, req.height)
                else:
                    make_shot_image(image_path, req.title, shot, req.width, req.height)
                render_clip(image_path, clip_path, duration, req.fps, req.width, req.height)
                image_paths.append(str(image_path))
                clip_paths.append(str(clip_path))

        concat_path = task_dir / "concat.txt"
        base_video_path = task_dir / "base_no_audio.mp4"
        final_path = task_dir / "final.mp4"
        remotion_manifest_path = task_dir / "remotion_manifest.json"
        remotion_manifest = build_remotion_manifest(
            req,
            shots,
            durations,
            voice_path,
            cover_path,
            audio_duration,
            voice_total_duration,
            outro_audio_duration,
            outro_voice_text_value,
            subtitle_alignment,
            visual_config,
            account_brand,
        )
        remotion_manifest_path.write_text(json.dumps(remotion_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        remotion_result: Optional[Dict[str, Any]] = None
        if req.render_engine == "remotion":
            remotion_result = render_with_remotion(req, remotion_manifest_path, final_path)
        else:
            concat_path.write_text("".join([f"file '{p}'\n" for p in clip_paths]), encoding="utf-8")
            concat_clips(concat_path, base_video_path)
            mux_audio_and_subtitles(base_video_path, voice_path, subtitle_path, final_path)

        media_manifest = {
            "engine": "ComfyUI" if req.enable_comfyui else "placeholder",
            "base_url": req.comfyui_options.base_url,
            "workflow_template_path": req.comfyui_options.workflow_template_path,
            "prompt_node_id": req.comfyui_options.prompt_node_id,
            "save_node_id": req.comfyui_options.save_node_id,
            "sampler_node_id": req.comfyui_options.sampler_node_id,
            "latent_node_id": req.comfyui_options.latent_node_id,
            "image_width": req.comfyui_options.image_width,
            "image_height": req.comfyui_options.image_height,
            "prompt_ids": prompt_ids,
            "errors": media_errors,
            "cover_prompt": cover_prompt,
            "shot_images": image_paths,
        }
        manifest = {
            "status": "ok",
            "task_id": req.task_id,
            "video_path": str(final_path),
            "base_video_path": str(base_video_path) if base_video_path.exists() else None,
            "voice_path": str(voice_path) if voice_path else None,
            "audio_duration": audio_duration,
            "voice_total_duration": voice_total_duration,
            "outro_audio_duration": outro_audio_duration,
            "subtitle_alignment": subtitle_alignment,
            "audio_engine": "VoxCPM",
            "tts_config_path": str(TTS_CONFIG_PATH),
            "remotion_visual_config_path": str(REMOTION_VISUAL_CONFIG_PATH),
            "voice_prompt": merged_tts_options(req.tts_options).get("voice_prompt"),
            "speech_text": speech_text_from_shots(req),
            "outro_voice_text": outro_voice_text_value,
            "cover_path": str(cover_path),
            "cover_base_path": str(cover_base_path) if cover_base_path.exists() else None,
            "subtitle_path": str(subtitle_path),
            "subtitles_json_path": str(subtitles_json_path),
            "remotion_manifest_path": str(remotion_manifest_path),
            "images": image_paths,
            "clips": clip_paths,
            "durations": durations,
            "concat_path": str(concat_path) if concat_path.exists() else None,
            "width": req.width,
            "height": req.height,
            "fps": req.fps,
            "render_engine": "Remotion" if req.render_engine == "remotion" else "FFmpeg",
            "template_type": remotion_manifest.get("template_type", req.template_type),
            "visual_config": visual_config,
            "remotion_manifest": remotion_manifest,
            "remotion_result": remotion_result,
            "media_engine": "ComfyUI" if req.enable_comfyui else "placeholder",
            "comfyui_prompt_ids": prompt_ids,
            "media_errors": media_errors,
            "media_manifest": media_manifest,
        }
        manifest_path = task_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        manifest["manifest_path"] = str(manifest_path)
        return manifest
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
