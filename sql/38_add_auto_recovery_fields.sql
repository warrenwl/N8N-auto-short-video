-- V4: automatic stalled-task recovery bookkeeping.
-- Safe to run multiple times.

ALTER TABLE video_topics
  ADD COLUMN IF NOT EXISTS auto_recovery_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_auto_recovery_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_recovery_disabled boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_video_topics_auto_recovery_scan
  ON video_topics(status, auto_recovery_disabled, updated_at);
