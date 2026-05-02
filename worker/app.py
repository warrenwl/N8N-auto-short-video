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
    chunk_by_paragraph: Optional[bool] = None
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
    existing_voice_path: Optional[str] = None
    existing_audio_duration: Optional[float] = None
    existing_audio_engine: Optional[str] = None


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
    candidates = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        FONT_PATH,
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/Supplemental/Songti.ttc",
    ]
    for candidate in candidates:
        if not candidate:
            continue
        try:
            if Path(candidate).exists():
                return ImageFont.truetype(candidate, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def draw_centered(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font, fill=(255, 255, 255), spacing=12):
    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=spacing, align="center")
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = xy[0] - w // 2
    y = xy[1] - h // 2
    draw.multiline_text((x, y), text, font=font, fill=fill, spacing=spacing, align="center")


def draw_centered_stroked(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    font,
    fill=(255, 255, 255),
    spacing: int = 12,
    stroke_fill=(0, 0, 0),
    stroke_width: int = 4,
) -> None:
    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=spacing, align="center", stroke_width=stroke_width)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    x = xy[0] - w // 2
    y = xy[1] - h // 2
    draw.multiline_text(
        (x, y),
        text,
        font=font,
        fill=fill,
        spacing=spacing,
        align="center",
        stroke_width=stroke_width,
        stroke_fill=stroke_fill,
    )


def hex_to_rgb(hex_color: str, fallback: tuple[int, int, int] = (248, 214, 109)) -> tuple[int, int, int]:
    value = (hex_color or "").strip().lstrip("#")
    if len(value) != 6:
        return fallback
    try:
        return tuple(int(value[idx: idx + 2], 16) for idx in (0, 2, 4))  # type: ignore[return-value]
    except Exception:
        return fallback


def blend_rgb(a: tuple[int, int, int], b: tuple[int, int, int], ratio: float) -> tuple[int, int, int]:
    ratio = max(0.0, min(1.0, ratio))
    return tuple(clamp(int(a[idx] * (1 - ratio) + b[idx] * ratio)) for idx in range(3))


def cover_title_lines(text: str) -> List[str]:
    value = normalize_display_text(text)
    if not value:
        return ["今日观点"]
    value = re.sub(r"[，。！？；、,!?;:：]+", " ", value).strip()
    parts = [item for item in value.split() if item]
    if len(parts) >= 2:
        return parts[:2]
    compact = value.replace(" ", "")
    if len(compact) <= 5:
        return [compact]
    if len(compact) <= 8:
        return [compact[:3], compact[3:]]
    if len(compact) <= 12:
        return [compact[:5], compact[5:]]
    return [compact[:6], truncate_with_ellipsis(compact[6:], 8)]


def compact_cover_subtitle(text: str) -> str:
    value = normalize_display_text(text)
    value = re.sub(r"这句话真正伤人的地方[，,]?", "", value)
    value = value.replace("不是放弃选择，而是撤回连接", "不是放弃选择，是撤回连接")
    return truncate_with_ellipsis(value or "先别急着划走", 18)


def draw_cover_message_bubble(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    fill: tuple[int, int, int, int],
    text_fill: tuple[int, int, int, int],
    align_right: bool = False,
) -> None:
    x1, y1, x2, y2 = box
    radius = max(18, min(34, (y2 - y1) // 2))
    draw.rounded_rectangle(box, radius=radius, fill=fill)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = x1 + (x2 - x1 - text_w) // 2 - bbox[0]
    text_y = y1 + (y2 - y1 - text_h) // 2 - bbox[1]
    draw.text((text_x, text_y), text, font=font, fill=text_fill)


def draw_centered_label(
    draw: ImageDraw.ImageDraw,
    box: tuple[int, int, int, int],
    text: str,
    font: ImageFont.FreeTypeFont | ImageFont.ImageFont,
    fill: tuple[int, int, int, int],
    text_fill: tuple[int, int, int, int],
    radius: int,
) -> None:
    x1, y1, x2, y2 = box
    draw.rounded_rectangle(box, radius=radius, fill=fill)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = x1 + (x2 - x1 - text_w) // 2 - bbox[0]
    text_y = y1 + (y2 - y1 - text_h) // 2 - bbox[1]
    draw.text((text_x, text_y), text, font=font, fill=text_fill)


def make_shot_image(
    path: Path,
    title: str,
    shot: Shot,
    width: int,
    height: int,
    template_type: str = "knowledge",
    is_cover: bool = False,
) -> None:
    visual_config = load_remotion_visual_config()
    template_key = normalize_template_type(template_type, visual_config)
    template_config = (visual_config.get("templates") or {}).get(template_key, {})
    accent = hex_to_rgb(
        str(template_config.get("accent") or visual_config.get("fallback_primary_color") or "#F8D66D")
    )
    bg = hex_to_rgb(str(visual_config.get("background_color") or "#090A0C"), (9, 10, 12))
    secondary = hex_to_rgb(str(visual_config.get("secondary_color") or "#FF8A5B"), (255, 138, 91))

    img = Image.new("RGB", (width, height), bg)
    draw = ImageDraw.Draw(img, "RGBA")

    for y in range(height):
        vertical = y / max(1, height - 1)
        base = blend_rgb(bg, blend_rgb(accent, secondary, 0.32), 0.10 + vertical * 0.08)
        draw.line((0, y, width, y), fill=(*base, 255))

    # Large soft shapes mimic the Remotion video palette without exposing prompt text.
    draw.ellipse((-width * 0.34, int(height * 0.06), int(width * 0.78), int(height * 0.48)), fill=(*accent, 42))
    draw.ellipse((int(width * 0.34), int(height * 0.52), int(width * 1.24), int(height * 1.05)), fill=(*secondary, 34))
    draw.polygon(
        [
            (int(width * 0.05), int(height * 0.23)),
            (int(width * 0.95), int(height * 0.16)),
            (int(width * 0.86), int(height * 0.22)),
            (int(width * 0.12), int(height * 0.31)),
        ],
        fill=(*accent, 32),
    )

    title_text = truncate_with_ellipsis(title or "今日观点", 16)
    support_candidates = [
        normalize_display_text(shot.headline or ""),
        normalize_display_text(shot.subtitle or ""),
        normalize_display_text(shot.body or ""),
    ]
    support_text = next(
        (item for item in support_candidates if item and item != normalize_display_text(title_text)),
        "值得认真看完的一条口播",
    )
    support_text = truncate_with_ellipsis(support_text, 38)
    keywords = normalize_keywords(shot.keywords, support_text, title_text)[:3]
    label = str(template_config.get("label") or "主题口播")

    title_font = load_font(94 if len(title_text) <= 9 else 80)
    support_font = load_font(42)
    badge_font = load_font(30)
    chip_font = load_font(32)
    marker_font = load_font(34)

    if is_cover:
        cover_accent = hex_to_rgb("#F7D35B")
        warning_red = hex_to_rgb("#E9483D")
        img = Image.new("RGB", (width, height), (8, 9, 11))
        draw = ImageDraw.Draw(img, "RGBA")
        for y in range(height):
            vertical = y / max(1, height - 1)
            base = blend_rgb((8, 9, 11), (20, 22, 26), vertical * 0.38)
            if y > height * 0.55:
                base = blend_rgb(base, (28, 20, 18), (vertical - 0.55) * 0.18)
            draw.line((0, y, width, y), fill=(*base, 255))

        # Mature fallback cover: one hook, one huge title, one supporting line.
        draw.rectangle((0, 0, width, height), fill=(0, 0, 0, 62))
        draw.ellipse((int(width * 0.58), -170, int(width * 1.22), int(height * 0.32)), fill=(*warning_red, 18))
        draw.ellipse((-250, int(height * 0.70), int(width * 0.48), height + 120), fill=(*cover_accent, 12))
        draw.rectangle((0, int(height * 0.28), width, int(height * 0.70)), fill=(0, 0, 0, 76))

        lines = cover_title_lines(title_text)
        if len(lines) == 1 and len(lines[0]) > 4:
            lines = [lines[0][:3], lines[0][3:]]
        badge_font = load_font(42)
        badge_text = "别忽略这句话"
        badge_bbox = draw.textbbox((0, 0), badge_text, font=badge_font)
        badge_w = badge_bbox[2] - badge_bbox[0] + 56
        badge_x = (width - badge_w) // 2
        draw_centered_label(
            draw,
            (badge_x, 132, badge_x + badge_w, 198),
            badge_text,
            badge_font,
            (*warning_red, 240),
            (255, 255, 255, 255),
            33,
        )

        title_y = int(height * 0.37)
        for index, line in enumerate(lines[:2]):
            font = load_font(184 if len(line) <= 4 else 150 if len(line) <= 6 else 120)
            bbox = draw.textbbox((0, 0), line, font=font)
            text_w = bbox[2] - bbox[0]
            text_h = bbox[3] - bbox[1]
            x = (width - text_w) // 2
            color = (255, 255, 255, 255) if index == 0 else (*cover_accent, 255)
            draw.text((x + 7, title_y + 8), line, font=font, fill=(0, 0, 0, 188))
            draw.text((x, title_y), line, font=font, fill=color, stroke_width=4, stroke_fill=(0, 0, 0, 220))
            if index == 1:
                draw.rounded_rectangle(
                    (x + 10, title_y + text_h + 16, x + text_w - 10, title_y + text_h + 28),
                    radius=6,
                    fill=(*warning_red, 230),
                )
            title_y += text_h + 34

        subtitle = compact_cover_subtitle(support_text)
        subtitle_font = load_font(40)
        subtitle_text = wrap_text(subtitle, 15)
        subtitle_bbox = draw.multiline_textbbox((0, 0), subtitle_text, font=subtitle_font, spacing=9, align="center")
        subtitle_h = subtitle_bbox[3] - subtitle_bbox[1]
        subtitle_y = int(height * 0.76)
        draw.rounded_rectangle(
            (86, subtitle_y - subtitle_h // 2 - 28, width - 86, subtitle_y + subtitle_h // 2 + 28),
            radius=28,
            fill=(0, 0, 0, 96),
            outline=(255, 255, 255, 20),
            width=2,
        )
        draw.rounded_rectangle(
            (106, subtitle_y - subtitle_h // 2 - 6, 118, subtitle_y + subtitle_h // 2 + 6),
            radius=6,
            fill=(*warning_red, 235),
        )
        draw_centered(draw, (width // 2, subtitle_y), subtitle_text, subtitle_font, fill=(236, 238, 242), spacing=9)

        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path)
        return

    draw.rounded_rectangle((64, 108, width - 64, 172), radius=28, fill=(255, 255, 255, 22), outline=(*accent, 96), width=2)
    draw.text((98, 126), label, font=badge_font, fill=(*accent, 255))
    right_label = "主题封面" if is_cover else "分镜画面"
    right_bbox = draw.textbbox((0, 0), right_label, font=badge_font)
    draw.text((width - 98 - (right_bbox[2] - right_bbox[0]), 126), right_label, font=badge_font, fill=(255, 255, 255, 142))

    title_box = (70, int(height * 0.28), width - 70, int(height * 0.52))
    draw.rounded_rectangle(title_box, radius=44, fill=(0, 0, 0, 72), outline=(255, 255, 255, 30), width=2)
    draw_centered(
        draw,
        (width // 2, int(height * 0.40)),
        wrap_text(title_text, 8),
        title_font,
        fill=(255, 255, 255),
        spacing=16,
    )

    support_box = (86, int(height * 0.56), width - 86, int(height * 0.68))
    draw.rounded_rectangle(support_box, radius=28, fill=(255, 255, 255, 28), outline=(*accent, 42), width=2)
    draw_centered(
        draw,
        (width // 2, int(height * 0.62)),
        wrap_text(support_text, 17),
        support_font,
        fill=(242, 244, 248),
        spacing=10,
    )

    chip_x = 88
    chip_y = int(height * 0.73)
    for keyword in keywords:
        text = truncate_with_ellipsis(keyword, 8)
        bbox = draw.textbbox((0, 0), text, font=chip_font)
        chip_w = min(width - 176, bbox[2] - bbox[0] + 52)
        draw.rounded_rectangle((chip_x, chip_y, chip_x + chip_w, chip_y + 62), radius=31, fill=(*accent, 56), outline=(*accent, 130), width=2)
        draw.text((chip_x + 26, chip_y + 13), text, font=chip_font, fill=(255, 255, 255, 235))
        chip_x += chip_w + 18
        if chip_x > width - 220:
            break

    marker = "封面" if is_cover else (f"SHOT {shot.shot_id}" if shot.shot_id else "SHOT")
    draw.text((88, height - 150), marker, font=marker_font, fill=(255, 255, 255, 128))
    draw.line((88, height - 94, width - 88, height - 94), fill=(*accent, 120), width=4)
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


def write_srt_entries(path: Path, entries: List[Dict[str, Any]]) -> None:
    blocks = []
    for idx, item in enumerate(entries, start=1):
        start = item["start"]
        end = item["end"]
        subtitle = item.get("text") or item.get("subtitle") or ""
        blocks.append(f"{idx}\n{seconds_to_srt_time(start)} --> {seconds_to_srt_time(end)}\n{subtitle}\n")
    path.write_text("\n".join(blocks), encoding="utf-8")


def write_srt(path: Path, shots: List[Shot], durations: List[float], caption_cues: Optional[List[Dict[str, Any]]] = None) -> None:
    write_srt_entries(path, caption_cues or subtitle_entries(shots, durations))


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


def split_caption_phrases(text: str, max_chars: int = 18) -> List[str]:
    cleaned = re.sub(r"\s+", "", safe_text(text, 1000))
    if not cleaned:
        return []
    phrases: List[str] = []
    current = ""

    def push_current() -> None:
        nonlocal current
        value = current.strip()
        if value:
            phrases.append(value)
        current = ""

    for ch in cleaned:
        current += ch
        is_punctuation = ch in "。！？!?；;"
        is_soft_punctuation = ch in "，、,"
        if is_punctuation or (is_soft_punctuation and len(current) >= max(8, int(max_chars * 0.55))) or len(current) >= max_chars:
            push_current()
    push_current()

    # Avoid lonely punctuation or very short tail cues that flash too quickly.
    merged: List[str] = []
    for phrase in phrases:
        if merged and (len(phrase) <= 3 or re.fullmatch(r"[，。！？、,!?；;]+", phrase)):
            merged[-1] = f"{merged[-1]}{phrase}"
        else:
            merged.append(phrase)
    return merged


def text_weight(text: str) -> int:
    return max(1, len(re.sub(r"\s+", "", safe_text(text, 1000))))


def weighted_phrase_durations(phrases: List[str], total: float) -> List[float]:
    if not phrases:
        return []
    weights = [text_weight(item) for item in phrases]
    weight_total = sum(weights) or len(phrases)
    min_duration = 0.55 if total < 4 else 0.72
    durations = [max(min_duration, total * weight / weight_total) for weight in weights]
    drift = total - sum(durations)
    durations[-1] = max(min_duration, durations[-1] + drift)
    if sum(durations) > total and total > 0:
        scale = total / sum(durations)
        durations = [max(0.42, item * scale) for item in durations]
        drift = total - sum(durations)
        durations[-1] = max(0.42, durations[-1] + drift)
    return [round(item, 3) for item in durations]


def pick_phrase_boundaries(
    local_silences: List[float],
    expected_boundaries: List[float],
    total: float,
) -> List[float]:
    if not expected_boundaries:
        return []
    boundaries: List[float] = []
    last = 0.0
    max_drift = min(0.72, max(0.32, total * 0.16))
    remaining = sorted(point for point in local_silences if 0.35 < point < total - 0.35)
    for idx, target in enumerate(expected_boundaries):
        min_remaining = len(expected_boundaries) - idx - 1
        viable = [
            point
            for point in remaining
            if point > last + 0.35 and len([future for future in remaining if future > point + 0.35]) >= min_remaining
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


def build_caption_cues(
    shots: List[Shot],
    durations: List[float],
    subtitle_alignment: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    entries = subtitle_entries(shots, durations)
    silence_midpoints = [
        float(item)
        for item in (subtitle_alignment or {}).get("silence_midpoints", [])
        if isinstance(item, (int, float))
    ]
    cues: List[Dict[str, Any]] = []
    cue_index = 1
    for shot, entry in zip(shots, entries):
        start = float(entry["start"])
        end = float(entry["end"])
        total = max(0.1, end - start)
        phrases = split_caption_phrases(str(entry["subtitle"]))
        if not phrases:
            continue
        durations_for_phrases = weighted_phrase_durations(phrases, total)
        expected = []
        acc = 0.0
        for dur in durations_for_phrases[:-1]:
            acc += dur
            expected.append(round(acc, 3))
        local_silences = [round(point - start, 3) for point in silence_midpoints if start + 0.2 < point < end - 0.2]
        boundaries = pick_phrase_boundaries(local_silences, expected, total)
        marks = [0.0, *(boundaries or expected), total]
        for phrase_idx, phrase in enumerate(phrases):
            cue_start = start + marks[phrase_idx]
            cue_end = start + marks[phrase_idx + 1]
            if cue_end <= cue_start:
                continue
            cues.append({
                "index": cue_index,
                "shot_index": entry["index"],
                "phrase_index": phrase_idx + 1,
                "start": round(cue_start, 3),
                "end": round(cue_end, 3),
                "duration": round(cue_end - cue_start, 3),
                "text": phrase,
                "subtitle": phrase,
                "keywords": normalize_keywords(shot.keywords, phrase, ""),
                "alignment_method": "silence_phrase_boundaries" if boundaries else "weighted_phrase_fallback",
            })
            cue_index += 1
    return cues


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
    if "chunk_by_paragraph" in options:
        payload["chunk_by_paragraph"] = bool(options.get("chunk_by_paragraph"))
    for key in ["sentence_pause_seconds", "paragraph_pause_seconds"]:
        value = options.get(key)
        if value is not None:
            payload[key] = value
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
    caption_cues = build_caption_cues(shots, durations, subtitle_alignment)
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
        "caption_cues": caption_cues,
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


def task_paths(task_id: str) -> Dict[str, Path]:
    task_dir = OUTPUT_DIR / task_id
    images_dir = task_dir / "images"
    clips_dir = task_dir / "clips"
    task_dir.mkdir(parents=True, exist_ok=True)
    images_dir.mkdir(parents=True, exist_ok=True)
    clips_dir.mkdir(parents=True, exist_ok=True)
    return {
        "task_dir": task_dir,
        "images_dir": images_dir,
        "clips_dir": clips_dir,
        "audio_manifest": task_dir / "audio_manifest.json",
        "media_manifest": task_dir / "media_manifest.json",
        "cover_base": task_dir / "cover_base.png",
        "cover": task_dir / "cover.png",
        "subtitles_srt": task_dir / "subtitles.srt",
        "subtitles_json": task_dir / "subtitles.json",
        "remotion_manifest": task_dir / "remotion_manifest.json",
        "manifest": task_dir / "manifest.json",
        "concat": task_dir / "concat.txt",
        "base_video": task_dir / "base_no_audio.mp4",
        "final": task_dir / "final.mp4",
    }


def shot_dicts(shots: List[Shot]) -> List[Dict[str, Any]]:
    return [shot.model_dump() for shot in shots]


def load_audio_manifest(task_dir: Path) -> Optional[Dict[str, Any]]:
    path = task_dir / "audio_manifest.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def audio_manifest_from_existing_voice(req: RenderRequest) -> Optional[Dict[str, Any]]:
    if not req.existing_voice_path:
        return None

    voice_path = Path(req.existing_voice_path)
    if not voice_path.exists():
        return None

    paths = task_paths(req.task_id)
    task_dir = paths["task_dir"]
    audio_duration = float(req.existing_audio_duration or 0)
    if audio_duration <= 0:
        audio_duration = ffprobe_duration(voice_path)

    shots, durations, subtitle_alignment = normalize_shots(req, audio_duration, voice_path)
    audio_manifest = {
        "status": "ok",
        "task_id": req.task_id,
        "voice_path": str(voice_path),
        "main_voice_path": None,
        "audio_duration": audio_duration,
        "voice_total_duration": audio_duration,
        "outro_audio_duration": 0.0,
        "subtitle_alignment": subtitle_alignment,
        "durations": durations,
        "shots": shot_dicts(shots),
        "audio_engine": req.existing_audio_engine or "VoxCPM",
        "tts_config_path": str(TTS_CONFIG_PATH),
        "voice_prompt": None,
        "speech_text": speech_text_from_shots(req),
        "outro_voice_text": "",
        "source": "existing_voice_path",
    }
    paths["audio_manifest"].write_text(json.dumps(audio_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return audio_manifest


def generate_audio_stage(req: RenderRequest) -> Dict[str, Any]:
    paths = task_paths(req.task_id)
    task_dir = paths["task_dir"]
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
    audio_manifest = {
        "status": "ok",
        "task_id": req.task_id,
        "voice_path": str(voice_path) if voice_path else None,
        "main_voice_path": str(main_voice_path) if main_voice_path else None,
        "audio_duration": audio_duration,
        "voice_total_duration": voice_total_duration,
        "outro_audio_duration": outro_audio_duration,
        "subtitle_alignment": subtitle_alignment,
        "durations": durations,
        "shots": shot_dicts(shots),
        "audio_engine": "VoxCPM" if req.enable_tts else "none",
        "tts_config_path": str(TTS_CONFIG_PATH),
        "voice_prompt": merged_tts_options(req.tts_options).get("voice_prompt"),
        "speech_text": speech_text_from_shots(req),
        "outro_voice_text": outro_voice_text_value,
    }
    paths["audio_manifest"].write_text(json.dumps(audio_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return audio_manifest


def generate_cover_stage(req: RenderRequest) -> Dict[str, Any]:
    paths = task_paths(req.task_id)
    task_dir = paths["task_dir"]
    audio_manifest = load_audio_manifest(task_dir)
    shots = [Shot(**item) for item in (audio_manifest or {}).get("shots", [])] or req.shots
    normalized_shots = shots or [Shot(shot_id=1, duration=8, subtitle=req.cover_text or req.title, visual_prompt_cn=req.cover_text or req.title)]
    prompt_ids: Dict[str, Any] = {}
    media_errors: Dict[str, str] = {}
    cover_base_path = paths["cover_base"]
    cover_path = paths["cover"]
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
            make_shot_image(cover_path, req.cover_text or req.title, normalized_shots[0], req.width, req.height, req.template_type, is_cover=True)
    else:
        make_shot_image(cover_path, req.cover_text or req.title, normalized_shots[0], req.width, req.height, req.template_type, is_cover=True)

    media_manifest = {
        "status": "ok",
        "task_id": req.task_id,
        "engine": "ComfyUI" if req.enable_comfyui else "placeholder",
        "cover_path": str(cover_path),
        "cover_base_path": str(cover_base_path) if cover_base_path.exists() else None,
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
        "shot_images": [],
    }
    paths["media_manifest"].write_text(json.dumps(media_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return media_manifest


def render_video_stage(req: RenderRequest) -> Dict[str, Any]:
    paths = task_paths(req.task_id)
    task_dir = paths["task_dir"]
    audio_manifest = load_audio_manifest(task_dir)
    if not audio_manifest:
        audio_manifest = audio_manifest_from_existing_voice(req) or generate_audio_stage(req)
    media_manifest_path = paths["media_manifest"]
    media_manifest = json.loads(media_manifest_path.read_text(encoding="utf-8")) if media_manifest_path.exists() else generate_cover_stage(req)

    visual_config = load_remotion_visual_config()
    account_brand = load_account_brand(task_dir)
    shots = [Shot(**item) for item in audio_manifest.get("shots", [])] or req.shots
    durations = [float(item) for item in audio_manifest.get("durations", [])]
    if not shots or not durations:
        voice_candidate = Path(str(audio_manifest.get("voice_path"))) if audio_manifest.get("voice_path") else None
        shots, durations, subtitle_alignment = normalize_shots(req, float(audio_manifest.get("audio_duration") or 0), voice_candidate)
    else:
        subtitle_alignment = audio_manifest.get("subtitle_alignment") or {}

    cover_path = Path(str(media_manifest.get("cover_path") or paths["cover"]))
    if not cover_path.exists():
        cover_stage = generate_cover_stage(req)
        media_manifest = cover_stage
        cover_path = Path(str(cover_stage.get("cover_path") or paths["cover"]))

    subtitle_path = paths["subtitles_srt"]
    caption_cues = build_caption_cues(shots, durations, subtitle_alignment)
    write_srt(subtitle_path, shots, durations, caption_cues)
    subtitles_json_path = paths["subtitles_json"]
    subtitles_json_path.write_text(
        json.dumps({
            "entries": subtitle_entries(shots, durations),
            "caption_cues": caption_cues,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    voice_path = Path(str(audio_manifest["voice_path"])) if audio_manifest.get("voice_path") else None
    remotion_manifest = build_remotion_manifest(
        req,
        shots,
        durations,
        voice_path,
        cover_path,
        float(audio_manifest.get("audio_duration") or 0),
        float(audio_manifest.get("voice_total_duration") or 0),
        float(audio_manifest.get("outro_audio_duration") or 0),
        str(audio_manifest.get("outro_voice_text") or ""),
        subtitle_alignment,
        visual_config,
        account_brand,
    )
    paths["remotion_manifest"].write_text(json.dumps(remotion_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    remotion_result: Optional[Dict[str, Any]] = None
    image_paths: List[str] = []
    clip_paths: List[str] = []
    if req.render_engine == "remotion":
        remotion_result = render_with_remotion(req, paths["remotion_manifest"], paths["final"])
    else:
        if req.comfyui_mode == "all_shots":
            for idx, (shot, duration) in enumerate(zip(shots, durations), start=1):
                image_path = paths["images_dir"] / f"shot_{idx:03}.png"
                clip_path = paths["clips_dir"] / f"clip_{idx:03}.mp4"
                make_shot_image(image_path, req.title, shot, req.width, req.height, req.template_type)
                render_clip(image_path, clip_path, duration, req.fps, req.width, req.height)
                image_paths.append(str(image_path))
                clip_paths.append(str(clip_path))
        paths["concat"].write_text("".join([f"file '{p}'\n" for p in clip_paths]), encoding="utf-8")
        concat_clips(paths["concat"], paths["base_video"])
        mux_audio_and_subtitles(paths["base_video"], voice_path, subtitle_path, paths["final"])

    manifest = {
        "status": "ok",
        "task_id": req.task_id,
        "video_path": str(paths["final"]),
        "base_video_path": str(paths["base_video"]) if paths["base_video"].exists() else None,
        "voice_path": str(voice_path) if voice_path else None,
        "audio_duration": float(audio_manifest.get("audio_duration") or 0),
        "voice_total_duration": float(audio_manifest.get("voice_total_duration") or 0),
        "outro_audio_duration": float(audio_manifest.get("outro_audio_duration") or 0),
        "subtitle_alignment": subtitle_alignment,
        "audio_engine": audio_manifest.get("audio_engine") or "VoxCPM",
        "tts_config_path": str(TTS_CONFIG_PATH),
        "remotion_visual_config_path": str(REMOTION_VISUAL_CONFIG_PATH),
        "voice_prompt": audio_manifest.get("voice_prompt"),
        "speech_text": audio_manifest.get("speech_text") or speech_text_from_shots(req),
        "outro_voice_text": audio_manifest.get("outro_voice_text") or "",
        "cover_path": str(cover_path),
        "cover_base_path": media_manifest.get("cover_base_path"),
        "subtitle_path": str(subtitle_path),
        "subtitles_json_path": str(subtitles_json_path),
        "audio_manifest_path": str(paths["audio_manifest"]),
        "media_manifest_path": str(media_manifest_path),
        "remotion_manifest_path": str(paths["remotion_manifest"]),
        "images": image_paths or media_manifest.get("shot_images") or [],
        "clips": clip_paths,
        "durations": durations,
        "concat_path": str(paths["concat"]) if paths["concat"].exists() else None,
        "width": req.width,
        "height": req.height,
        "fps": req.fps,
        "render_engine": "Remotion" if req.render_engine == "remotion" else "FFmpeg",
        "template_type": remotion_manifest.get("template_type", req.template_type),
        "visual_config": visual_config,
        "remotion_manifest": remotion_manifest,
        "remotion_result": remotion_result,
        "media_engine": media_manifest.get("engine") or ("ComfyUI" if req.enable_comfyui else "placeholder"),
        "comfyui_prompt_ids": media_manifest.get("prompt_ids") or {},
        "media_errors": media_manifest.get("errors") or {},
        "media_manifest": media_manifest,
    }
    paths["manifest"].write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    manifest["manifest_path"] = str(paths["manifest"])
    return manifest


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


@app.post("/render/audio")
def render_audio(req: RenderRequest):
    try:
        return generate_audio_stage(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/render/cover")
def render_cover(req: RenderRequest):
    try:
        return generate_cover_stage(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/render/remotion")
def render_remotion(req: RenderRequest):
    try:
        return render_video_stage(req)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


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
                make_shot_image(cover_path, req.cover_text or req.title, shots[0], req.width, req.height, req.template_type, is_cover=True)
        else:
            make_shot_image(cover_path, req.cover_text or req.title, shots[0], req.width, req.height, req.template_type, is_cover=True)

        subtitle_path = task_dir / "subtitles.srt"
        caption_cues = build_caption_cues(shots, durations, subtitle_alignment)
        write_srt(subtitle_path, shots, durations, caption_cues)
        subtitles_json_path = task_dir / "subtitles.json"
        subtitles_json_path.write_text(
            json.dumps({
                "entries": subtitle_entries(shots, durations),
                "caption_cues": caption_cues,
            }, ensure_ascii=False, indent=2),
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
                        make_shot_image(image_path, req.title, shot, req.width, req.height, req.template_type)
                else:
                    make_shot_image(image_path, req.title, shot, req.width, req.height, req.template_type)
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
