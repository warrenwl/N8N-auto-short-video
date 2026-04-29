ALTER TABLE video_topics
  ADD COLUMN IF NOT EXISTS shot_images_json JSONB,
  ADD COLUMN IF NOT EXISTS media_engine TEXT,
  ADD COLUMN IF NOT EXISTS media_manifest JSONB,
  ADD COLUMN IF NOT EXISTS comfyui_prompt_ids JSONB,
  ADD COLUMN IF NOT EXISTS media_started_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS media_finished_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_video_topics_media_engine ON video_topics(media_engine);
