-- Initializes the separate application database used by the video agent workflow.
-- n8n itself uses the POSTGRES_DB database configured in docker-compose.yml.

SELECT 'CREATE DATABASE video_agent'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'video_agent'
)\gexec

\connect video_agent;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS video_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'youtube',
  style TEXT NOT NULL DEFAULT '口播科普',
  duration_seconds INTEGER NOT NULL DEFAULT 45 CHECK (duration_seconds > 0),
  language TEXT NOT NULL DEFAULT 'zh-CN',
  target_audience TEXT DEFAULT '普通短视频用户',
  status TEXT NOT NULL DEFAULT 'IDEA' CHECK (status IN (
    'IDEA',
    'GENERATING_SCRIPT',
    'SCRIPT_READY',
    'MEDIA_READY',
    'RENDERED',
    'NEED_REVIEW',
    'APPROVED',
    'PUBLISHED',
    'FAILED'
  )),
  title TEXT,
  hook TEXT,
  script TEXT,
  cover_text TEXT,
  hashtags JSONB NOT NULL DEFAULT '[]'::jsonb,
  shots_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_check JSONB NOT NULL DEFAULT '{}'::jsonb,
  video_path TEXT,
  cover_path TEXT,
  publish_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_topics_status_created_at
  ON video_topics(status, created_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_video_topics_updated_at ON video_topics;
CREATE TRIGGER trg_video_topics_updated_at
BEFORE UPDATE ON video_topics
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO video_topics (topic, platform, style, duration_seconds, target_audience, status)
VALUES
('3个普通人也能做的副业方向', 'youtube', '口播科普', 45, '想做副业的新手', 'IDEA')
ON CONFLICT DO NOTHING;
