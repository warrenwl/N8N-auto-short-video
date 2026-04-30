-- Stage 0: topic idea intake candidate pool.
-- Candidate topics are reviewed before being promoted into video_topics(IDEA).

CREATE TABLE IF NOT EXISTS topic_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  status TEXT NOT NULL DEFAULT 'NEW',
  topic TEXT NOT NULL,
  title TEXT,
  angle TEXT,
  audience TEXT,
  platform TEXT DEFAULT 'douyin',
  account_key TEXT,
  category TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  score NUMERIC,
  score_reason TEXT,
  duplicate_of UUID,
  promoted_topic_id UUID,
  raw_payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE topic_candidates
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_ref TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'NEW',
  ADD COLUMN IF NOT EXISTS topic TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS angle TEXT,
  ADD COLUMN IF NOT EXISTS audience TEXT,
  ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'douyin',
  ADD COLUMN IF NOT EXISTS account_key TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS score NUMERIC,
  ADD COLUMN IF NOT EXISTS score_reason TEXT,
  ADD COLUMN IF NOT EXISTS duplicate_of UUID,
  ADD COLUMN IF NOT EXISTS promoted_topic_id UUID,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'topic_candidates_status_check'
  ) THEN
    ALTER TABLE topic_candidates
      ADD CONSTRAINT topic_candidates_status_check
      CHECK (status IN ('NEW', 'SCORED', 'SELECTED', 'PROMOTED', 'REJECTED', 'DUPLICATE'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_topic_candidates_status_updated_at
  ON topic_candidates(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_topic_candidates_platform_account
  ON topic_candidates(platform, account_key);

CREATE INDEX IF NOT EXISTS idx_topic_candidates_promoted_topic_id
  ON topic_candidates(promoted_topic_id);

ALTER TABLE video_topics
  ADD COLUMN IF NOT EXISTS source_candidate_id UUID,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS account_key TEXT;

CREATE INDEX IF NOT EXISTS idx_video_topics_source_candidate_id
  ON video_topics(source_candidate_id);
