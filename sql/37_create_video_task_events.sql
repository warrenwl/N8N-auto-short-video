-- V3: task event log for video generation, review, recovery and publishing.
-- This table is append-only. Use it to inspect why a task entered a state,
-- what triggered a recovery action, and which stage completed last.

CREATE TABLE IF NOT EXISTS video_task_events (
  id BIGSERIAL PRIMARY KEY,
  video_topic_id UUID NOT NULL REFERENCES video_topics(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  stage TEXT,
  old_status TEXT,
  new_status TEXT,
  actor TEXT NOT NULL DEFAULT 'n8n',
  source TEXT,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_task_events_topic_created
  ON video_task_events(video_topic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_task_events_type_created
  ON video_task_events(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_task_events_stage_created
  ON video_task_events(stage, created_at DESC);
