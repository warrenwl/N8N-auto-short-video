// n8n Code node: Inspect Existing Artifacts
// Reads /data/output/<task_id> to repair cases where worker finished files
// but n8n restarted before PostgreSQL writeback.

const fs = require('fs');

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function exists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  } catch (error) {
    return false;
  }
}

function dataPath(apiPath) {
  if (!apiPath) return '';
  return String(apiPath).replace(/^\/data\//, '/data/');
}

function jsonString(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

const outputRoot = '/data/output';

function joinPath(...parts) {
  return parts
    .map((part) => String(part || '').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
    .replace(/^/, '/');
}

return $input.all().flatMap((item) => {
  const row = item.json || {};
  const taskId = String(row.id || '').trim();
  if (!taskId) return [];

  const taskDir = joinPath(outputRoot, taskId);
  const mediaManifestPath = joinPath(taskDir, 'media_manifest.json');
  const coverPath = joinPath(taskDir, 'cover.png');
  const finalPath = joinPath(taskDir, 'final.mp4');
  const manifestPath = joinPath(taskDir, 'manifest.json');

  if (row.status === 'GENERATING_COVER' && exists(mediaManifestPath) && exists(coverPath)) {
    const mediaManifest = readJson(mediaManifestPath, {});
    const apiCoverPath = mediaManifest.cover_path || `/data/output/${taskId}/cover.png`;
    return [{
      json: {
        task_id: taskId,
        old_status: row.status,
        repair_kind: 'cover_completed',
        next_status: 'AUDIO_READY',
        review_status: 'VIDEO_RERENDER_REQUESTED',
        trigger_url: `http://localhost:5678/webhook/video-rerender-video-only?task_id=${encodeURIComponent(taskId)}&token=${encodeURIComponent(row.review_token || '')}`,
        message: '自动产物修复：封面文件已生成但数据库未回写，补齐封面字段并仅重新合成视频',
        cover_path: apiCoverPath,
        video_path: '',
        subtitle_path: '',
        clips_json: '[]',
        render_manifest_json: '{}',
        voice_path: '',
        audio_duration: '',
        audio_engine: '',
        shot_images_json: '[]',
        media_engine: mediaManifest.engine || 'ComfyUI',
        media_manifest_json: jsonString(mediaManifest, {}),
        comfyui_prompt_ids_json: jsonString(mediaManifest.prompt_ids || {}, {}),
      },
    }];
  }

  if (row.status === 'RENDERING_VIDEO' && exists(finalPath) && exists(manifestPath)) {
    const manifest = readJson(manifestPath, {});
    const mediaManifest = manifest.media_manifest || readJson(mediaManifestPath, {});
    const remotionManifest = manifest.remotion_manifest || readJson(joinPath(taskDir, 'remotion_manifest.json'), {});
    return [{
      json: {
        task_id: taskId,
        old_status: row.status,
        repair_kind: 'video_completed',
        next_status: 'NEED_REVIEW',
        review_status: '',
        trigger_url: '',
        message: '自动产物修复：最终视频已生成但数据库未回写，补齐成片字段并进入待审核',
        cover_path: manifest.cover_path || mediaManifest.cover_path || `/data/output/${taskId}/cover.png`,
        video_path: manifest.video_path || `/data/output/${taskId}/final.mp4`,
        subtitle_path: manifest.subtitle_path || `/data/output/${taskId}/subtitles.srt`,
        clips_json: jsonString(manifest.clips || [], []),
        render_manifest_json: jsonString(remotionManifest, {}),
        voice_path: manifest.voice_path || '',
        audio_duration: manifest.audio_duration || '',
        audio_engine: manifest.audio_engine || '',
        shot_images_json: jsonString(manifest.images || [], []),
        media_engine: manifest.media_engine || mediaManifest.engine || '',
        media_manifest_json: jsonString(mediaManifest, {}),
        comfyui_prompt_ids_json: jsonString(manifest.comfyui_prompt_ids || mediaManifest.prompt_ids || {}, {}),
      },
    }];
  }

  return [];
});
