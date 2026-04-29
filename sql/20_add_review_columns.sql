-- Stage 7: manual review workflow columns and statuses.
-- Safe to run multiple times.
ALTER TABLE video_topics
  ADD COLUMN IF NOT EXISTS review_status text,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS review_token text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamp,
  ADD COLUMN IF NOT EXISTS approved_at timestamp,
  ADD COLUMN IF NOT EXISTS rejected_at timestamp,
  ADD COLUMN IF NOT EXISTS review_action_source text;

CREATE INDEX IF NOT EXISTS idx_video_topics_status_review_token
  ON video_topics(status, review_token);

ALTER TABLE video_topics
DROP CONSTRAINT IF EXISTS video_topics_status_check;

ALTER TABLE video_topics
ADD CONSTRAINT video_topics_status_check
CHECK (status = ANY (ARRAY[
  'IDEA',
  'GENERATING_SCRIPT',
  'SCRIPT_READY',
  'RENDER_PREPARED',
  'GENERATING_AUDIO',
  'AUDIO_READY',
  'GENERATING_COVER',
  'COVER_READY',
  'RENDERING_VIDEO',
  'MEDIA_READY',
  'RENDERING',
  'RENDERED',
  'NEED_REVIEW',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
  'FAILED',
  'RENDER_FAILED'
]::text[]));
