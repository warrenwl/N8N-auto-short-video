UPDATE video_topics
SET
  video_path = $1,
  cover_path = $2,
  subtitle_path = $3,
  clips_json = $4::jsonb,
  render_manifest = $5::jsonb,
  voice_path = $6,
  audio_duration = $7,
  audio_engine = $8,
  shot_images_json = $9::jsonb,
  media_engine = $10,
  media_manifest = $11::jsonb,
  comfyui_prompt_ids = $12::jsonb,
  status = 'NEED_REVIEW',
  media_finished_at = CURRENT_TIMESTAMP,
  audio_finished_at = CURRENT_TIMESTAMP,
  render_finished_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP,
  error = NULL
WHERE id = $13
RETURNING id, status, video_path, cover_path, voice_path, media_engine, updated_at;
