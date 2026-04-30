-- M5 async job table for GLM topic candidate generation.

CREATE TABLE IF NOT EXISTS topic_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL DEFAULT 'glm',
  status TEXT NOT NULL DEFAULT 'RUNNING',
  platform TEXT DEFAULT 'douyin',
  account_key TEXT DEFAULT 'mes',
  category TEXT,
  direction TEXT,
  audience TEXT,
  style TEXT,
  requested_count INTEGER DEFAULT 0,
  parsed_count INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  created_candidates JSONB DEFAULT '[]'::jsonb,
  request_payload JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE topic_generation_jobs
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'glm',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'RUNNING',
  ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'douyin',
  ADD COLUMN IF NOT EXISTS account_key TEXT DEFAULT 'mes',
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS direction TEXT,
  ADD COLUMN IF NOT EXISTS audience TEXT,
  ADD COLUMN IF NOT EXISTS style TEXT,
  ADD COLUMN IF NOT EXISTS requested_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS parsed_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicate_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_candidates JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS request_payload JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'topic_generation_jobs_status_check'
  ) THEN
    ALTER TABLE topic_generation_jobs
      ADD CONSTRAINT topic_generation_jobs_status_check
      CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_topic_generation_jobs_status_created_at
  ON topic_generation_jobs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_topic_generation_jobs_account_created_at
  ON topic_generation_jobs(account_key, created_at DESC);
