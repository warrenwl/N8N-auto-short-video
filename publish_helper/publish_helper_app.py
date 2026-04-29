from __future__ import annotations

import json
import os
import shutil
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import List, Optional, Union

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

DATA_ROOT = Path(os.getenv("DATA_ROOT", "/data"))
PUBLISH_ROOT = Path(os.getenv("PUBLISH_ROOT", "/data/publish"))
PUBLIC_FILE_BASE_URL = os.getenv("PUBLIC_FILE_BASE_URL", "http://localhost:8010/publish").rstrip("/")
N8N_INTERNAL_BASE_URL = os.getenv("N8N_INTERNAL_BASE_URL", "http://n8n:5678").rstrip("/")

PUBLISH_ROOT.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Publish Helper", version="0.1.0")
app.mount("/publish", StaticFiles(directory=str(PUBLISH_ROOT)), name="publish")

DOUYIN_DOWNLOAD_FILES = {
    "final.mp4": "video/mp4",
    "cover.png": "image/png",
    "cover.jpg": "image/jpeg",
    "cover.jpeg": "image/jpeg",
    "caption.txt": "text/plain; charset=utf-8",
    "metadata.json": "application/json; charset=utf-8",
}


class DouyinPackageRequest(BaseModel):
    job_id: Union[str, int]
    video_topic_id: str
    title: str = "抖音待发布视频"
    caption: str = ""
    hashtags: Union[List[str], str] = Field(default_factory=list)
    video_path: str
    cover_path: Optional[str] = ""
    manual_confirm_token: str
    public_file_base_url: Optional[str] = ""


def _resolve_under_data(path_value: str) -> Path:
    if not path_value:
        raise HTTPException(status_code=400, detail="path is empty")
    path = Path(path_value)
    if not path.is_absolute():
        path = DATA_ROOT / path
    try:
        resolved = path.resolve()
        data_resolved = DATA_ROOT.resolve()
        if data_resolved not in resolved.parents and resolved != data_resolved:
            raise HTTPException(status_code=400, detail=f"path is outside DATA_ROOT: {path_value}")
    except FileNotFoundError:
        resolved = path
    return resolved


def _hashtag_text(value: Union[List[str], str]) -> str:
    if isinstance(value, list):
        tags = [str(v).strip() for v in value if str(v).strip()]
    else:
        tags = [x.strip() for x in str(value).replace("，", ",").split(",") if x.strip()]
    tags = [t if t.startswith("#") else f"#{t}" for t in tags]
    return " ".join(tags)


def _public_download_base(public_file_base_url: str) -> str:
    if public_file_base_url.endswith("/publish"):
        return public_file_base_url[: -len("/publish")]
    return public_file_base_url


def _douyin_job_dir(job_id: str) -> Path:
    job_text = str(job_id).strip()
    if not job_text or "/" in job_text or "\\" in job_text or ".." in job_text:
        raise HTTPException(status_code=400, detail="invalid job_id")
    return PUBLISH_ROOT / "douyin" / job_text


def _douyin_file_response(job_id: str, filename: str, attachment: bool = False) -> FileResponse:
    if filename not in DOUYIN_DOWNLOAD_FILES:
        raise HTTPException(status_code=404, detail="file is not available for download")
    file_path = _douyin_job_dir(job_id) / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail=f"file not found: {filename}")
    return FileResponse(
        path=file_path,
        media_type=DOUYIN_DOWNLOAD_FILES[filename],
        filename=filename if attachment else None,
    )


def _html_escape(value: str) -> str:
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "publish-helper", "version": "0.1.0"}


@app.post("/serverchan-skip")
def serverchan_skip():
    return {
        "status": "skipped",
        "reason": "SERVERCHAN_SENDKEY is not configured",
        "service": "publish-helper",
    }


@app.get("/download/douyin/{job_id}", response_class=HTMLResponse)
def douyin_download_page(job_id: str):
    package_dir = _douyin_job_dir(job_id)
    metadata_path = package_dir / "metadata.json"
    if not package_dir.exists() or not metadata_path.exists():
        raise HTTPException(status_code=404, detail="douyin package not found")

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    title = _html_escape(metadata.get("title") or "抖音待发布视频")
    caption = _html_escape(metadata.get("caption") or "")
    cover_links = []
    for filename in ("cover.png", "cover.jpg", "cover.jpeg"):
        if (package_dir / filename).exists():
            cover_links.append(
                f'<a class="button secondary" href="/download/douyin/{job_id}/{filename}?attachment=1">下载封面</a>'
            )
            break

    cover_html = "\n".join(cover_links)
    html = f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #14161a;
      --muted: #666f7a;
      --line: #e7e9ee;
      --primary: #111827;
      --accent: #0f8b6f;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
      line-height: 1.55;
    }}
    main {{
      max-width: 680px;
      margin: 0 auto;
      padding: 22px 16px 36px;
    }}
    .panel {{
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 18px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
    }}
    h1 {{
      margin: 0 0 12px;
      font-size: 22px;
      line-height: 1.25;
      letter-spacing: 0;
    }}
    video {{
      width: 100%;
      max-height: 68vh;
      margin: 12px 0 16px;
      border-radius: 10px;
      background: #000;
    }}
    .actions {{
      display: grid;
      gap: 10px;
      margin: 14px 0;
    }}
    .button {{
      display: block;
      width: 100%;
      min-height: 46px;
      padding: 12px 14px;
      border-radius: 10px;
      background: var(--primary);
      color: #fff;
      text-align: center;
      text-decoration: none;
      font-weight: 700;
    }}
    .button.secondary {{
      background: #edf7f4;
      color: var(--accent);
      border: 1px solid #cde8df;
    }}
    .hint {{
      margin: 14px 0 0;
      color: var(--muted);
      font-size: 14px;
    }}
    pre {{
      white-space: pre-wrap;
      word-break: break-word;
      margin: 12px 0 0;
      padding: 12px;
      background: #f2f4f7;
      border-radius: 10px;
      color: #222831;
      font-family: inherit;
      font-size: 14px;
    }}
  </style>
</head>
<body>
  <main>
    <section class="panel">
      <h1>{title}</h1>
      <video controls playsinline preload="metadata" src="/publish/douyin/{job_id}/final.mp4"></video>
      <div class="actions">
        <a class="button" href="/download/douyin/{job_id}/final.mp4?attachment=1">下载视频文件</a>
        {cover_html}
        <a class="button secondary" href="/download/douyin/{job_id}/caption.txt?attachment=1">下载文案</a>
      </div>
      <p class="hint">微信内如果仍然只能播放不能保存，请点右上角选择“在浏览器打开”，再使用下载视频文件。</p>
      <pre>{caption}</pre>
    </section>
  </main>
</body>
</html>"""
    return HTMLResponse(content=html)


@app.get("/download/douyin/{job_id}/{filename}")
def douyin_download_file(job_id: str, filename: str, attachment: bool = False):
    return _douyin_file_response(job_id, filename, attachment=attachment)


@app.get("/webhook/douyin-manual-publish-action")
def proxy_douyin_manual_publish_action(action: str, job_id: str, token: str, note: str = "", published_url: str = ""):
    query = urllib.parse.urlencode(
        {
            "action": action,
            "job_id": job_id,
            "token": token,
            "note": note,
            "published_url": published_url,
        }
    )
    target = f"{N8N_INTERNAL_BASE_URL}/webhook/douyin-manual-publish-action?{query}"
    try:
        with urllib.request.urlopen(target, timeout=30) as response:
            body = response.read()
            content_type = response.headers.get("Content-Type", "text/html; charset=utf-8")
            return Response(content=body, status_code=response.status, media_type=content_type)
    except urllib.error.HTTPError as error:
        body = error.read()
        content_type = error.headers.get("Content-Type", "text/html; charset=utf-8")
        return Response(content=body, status_code=error.code, media_type=content_type)
    except Exception as error:
        html = f"""<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>发布确认失败</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;padding:28px;">
  <h1>发布确认失败</h1>
  <p>无法连接本地 n8n：{str(error)}</p>
</body>
</html>"""
        return HTMLResponse(content=html, status_code=502)


@app.post("/package/douyin")
def create_douyin_package(req: DouyinPackageRequest):
    job_id = str(req.job_id)
    public_file_base_url = (req.public_file_base_url or PUBLIC_FILE_BASE_URL).rstrip("/")
    public_download_base_url = _public_download_base(public_file_base_url)
    package_dir = PUBLISH_ROOT / "douyin" / job_id
    package_dir.mkdir(parents=True, exist_ok=True)

    src_video = _resolve_under_data(req.video_path)
    if not src_video.exists():
        raise HTTPException(status_code=404, detail=f"video not found: {src_video}")

    video_dst = package_dir / "final.mp4"
    shutil.copy2(src_video, video_dst)

    cover_url = ""
    cover_dst = None
    if req.cover_path:
        src_cover = _resolve_under_data(req.cover_path)
        if src_cover.exists():
            suffix = src_cover.suffix.lower() or ".png"
            cover_dst = package_dir / f"cover{suffix}"
            shutil.copy2(src_cover, cover_dst)
            cover_url = f"{public_file_base_url}/douyin/{job_id}/{cover_dst.name}"

    hashtags = _hashtag_text(req.hashtags)
    caption = (req.caption or "").strip()
    if hashtags and hashtags not in caption:
        caption = f"{caption}\n\n{hashtags}".strip()

    caption_path = package_dir / "caption.txt"
    caption_path.write_text(caption, encoding="utf-8")

    metadata = {
        "job_id": job_id,
        "video_topic_id": req.video_topic_id,
        "title": req.title,
        "caption": caption,
        "hashtags": hashtags,
        "video_path": str(video_dst),
        "cover_path": str(cover_dst) if cover_dst else "",
        "manual_confirm_token": req.manual_confirm_token,
        "public_file_base_url": public_file_base_url,
        "download_page_url": f"{public_download_base_url}/download/douyin/{job_id}",
        "video_download_url": f"{public_download_base_url}/download/douyin/{job_id}/final.mp4?attachment=1",
    }
    metadata_path = package_dir / "metadata.json"
    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    return {
        "status": "ok",
        "job_id": job_id,
        "video_topic_id": req.video_topic_id,
        "title": req.title,
        "caption": caption,
        "hashtags": hashtags,
        "manual_confirm_token": req.manual_confirm_token,
        "package_dir": str(package_dir),
        "video_url": f"{public_file_base_url}/douyin/{job_id}/final.mp4",
        "download_page_url": f"{public_download_base_url}/download/douyin/{job_id}",
        "video_download_url": f"{public_download_base_url}/download/douyin/{job_id}/final.mp4?attachment=1",
        "cover_url": cover_url,
        "caption_url": f"{public_file_base_url}/douyin/{job_id}/caption.txt",
        "metadata_url": f"{public_file_base_url}/douyin/{job_id}/metadata.json",
    }
