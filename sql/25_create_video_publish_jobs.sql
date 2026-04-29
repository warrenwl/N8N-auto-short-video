-- Stage 9: semi-automatic publishing jobs.
-- Keep platform publishing state out of video_topics so more platforms can be added later.

CREATE TABLE IF NOT EXISTS video_publish_jobs (
  id BIGSERIAL PRIMARY KEY,
  video_topic_id UUID NOT NULL,
  platform TEXT NOT NULL DEFAULT 'douyin',
  status TEXT NOT NULL DEFAULT 'PENDING',

  title TEXT,
  caption TEXT,
  hashtags TEXT,

  video_path TEXT,
  cover_path TEXT,
  package_dir TEXT,

  video_url TEXT,
  cover_url TEXT,
  caption_url TEXT,
  metadata_url TEXT,
  download_page_url TEXT,
  video_download_url TEXT,

  manual_confirm_token TEXT,

  remind_channel TEXT,
  remind_status TEXT,
  remind_message TEXT,
  remind_response JSONB,
  reminded_at TIMESTAMPTZ,

  manual_publish_note TEXT,
  published_url TEXT,
  published_at TIMESTAMPTZ,

  error_code TEXT,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_publish_jobs_platform_status
  ON video_publish_jobs(platform, status);

CREATE INDEX IF NOT EXISTS idx_video_publish_jobs_topic_platform
  ON video_publish_jobs(video_topic_id, platform);

CREATE UNIQUE INDEX IF NOT EXISTS idx_video_publish_jobs_one_active_topic_platform
  ON video_publish_jobs(video_topic_id, platform)
  WHERE status NOT IN ('FAILED', 'MANUAL_SKIPPED');

ALTER TABLE video_topics
  ADD COLUMN IF NOT EXISTS publish_status TEXT,
  ADD COLUMN IF NOT EXISTS published_manually_at TIMESTAMPTZ;
