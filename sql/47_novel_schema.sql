-- Novel workflow V1 schema.
-- Run against the existing video_agent database.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS novel_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  genre TEXT NOT NULL,
  audience TEXT,
  style TEXT,
  premise TEXT,
  target_total_chapters INTEGER NOT NULL DEFAULT 20 CHECK (target_total_chapters > 0),
  target_words_per_chapter INTEGER NOT NULL DEFAULT 2000 CHECK (target_words_per_chapter > 0),
  expansion_request TEXT,
  expansion_scope TEXT NOT NULL DEFAULT 'append_only' CHECK (expansion_scope IN (
    'append_only',
    'rewrite_unwritten',
    'regenerate_outline'
  )),
  expansion_constraints TEXT,
  current_chapter_no INTEGER NOT NULL DEFAULT 0 CHECK (current_chapter_no >= 0),
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN (
    'CREATED',
    'BIBLE_READY',
    'OUTLINE_READY',
    'WRITING',
    'REVIEWING',
    'PAUSED',
    'ARCHIVED',
    'COMPLETED',
    'FAILED'
  )),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_novel_projects_status_updated_at
  ON novel_projects(status, updated_at DESC);

DROP TRIGGER IF EXISTS trg_novel_projects_updated_at ON novel_projects;
CREATE TRIGGER trg_novel_projects_updated_at
BEFORE UPDATE ON novel_projects
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS novel_bibles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES novel_projects(id) ON DELETE CASCADE,
  world_setting TEXT,
  story_core TEXT,
  main_character JSONB NOT NULL DEFAULT '{}'::jsonb,
  supporting_characters JSONB NOT NULL DEFAULT '[]'::jsonb,
  villain_setting JSONB NOT NULL DEFAULT '[]'::jsonb,
  power_system TEXT,
  relationship_map JSONB NOT NULL DEFAULT '[]'::jsonb,
  organizations JSONB NOT NULL DEFAULT '[]'::jsonb,
  locations JSONB NOT NULL DEFAULT '[]'::jsonb,
  plot_constraints JSONB NOT NULL DEFAULT '[]'::jsonb,
  expansion_notes TEXT,
  tone_rules TEXT,
  forbidden_rules TEXT,
  selling_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  generation_model TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id)
);

CREATE INDEX IF NOT EXISTS idx_novel_bibles_project_id
  ON novel_bibles(project_id);

DROP TRIGGER IF EXISTS trg_novel_bibles_updated_at ON novel_bibles;
CREATE TRIGGER trg_novel_bibles_updated_at
BEFORE UPDATE ON novel_bibles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS novel_chapter_outlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES novel_projects(id) ON DELETE CASCADE,
  chapter_no INTEGER NOT NULL CHECK (chapter_no > 0),
  volume_no INTEGER NOT NULL DEFAULT 1 CHECK (volume_no > 0),
  title TEXT,
  summary TEXT,
  chapter_goal TEXT,
  conflict_point TEXT,
  emotional_point TEXT,
  hook TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN (
    'PLANNED',
    'GENERATING',
    'READY',
    'FAILED'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, chapter_no)
);

CREATE INDEX IF NOT EXISTS idx_novel_chapter_outlines_project_status
  ON novel_chapter_outlines(project_id, status, chapter_no);

DROP TRIGGER IF EXISTS trg_novel_chapter_outlines_updated_at ON novel_chapter_outlines;
CREATE TRIGGER trg_novel_chapter_outlines_updated_at
BEFORE UPDATE ON novel_chapter_outlines
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS novel_chapter_director_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES novel_projects(id) ON DELETE CASCADE,
  outline_id UUID REFERENCES novel_chapter_outlines(id) ON DELETE SET NULL,
  job_id UUID,
  chapter_no INTEGER NOT NULL CHECK (chapter_no > 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'READY' CHECK (status IN (
    'READY',
    'NEEDS_REVIEW',
    'FAILED',
    'SUPERSEDED'
  )),
  source TEXT NOT NULL DEFAULT 'AI' CHECK (source IN (
    'AI',
    'MANUAL'
  )),
  manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  card_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, chapter_no, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_novel_director_cards_current
  ON novel_chapter_director_cards(project_id, chapter_no)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_novel_director_cards_project_status
  ON novel_chapter_director_cards(project_id, status, chapter_no);

CREATE INDEX IF NOT EXISTS idx_novel_director_cards_job_id
  ON novel_chapter_director_cards(job_id);

DROP TRIGGER IF EXISTS trg_novel_chapter_director_cards_updated_at ON novel_chapter_director_cards;
CREATE TRIGGER trg_novel_chapter_director_cards_updated_at
BEFORE UPDATE ON novel_chapter_director_cards
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS novel_chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES novel_projects(id) ON DELETE CASCADE,
  outline_id UUID REFERENCES novel_chapter_outlines(id) ON DELETE SET NULL,
  parent_chapter_id UUID REFERENCES novel_chapters(id) ON DELETE SET NULL,
  chapter_no INTEGER NOT NULL CHECK (chapter_no > 0),
  title TEXT,
  body TEXT,
  summary TEXT,
  word_count INTEGER NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN (
    'PLANNED',
    'GENERATING',
    'DRAFT_READY',
    'AI_REVIEWED',
    'NEED_REVIEW',
    'APPROVED',
    'PUBLISHED',
    'REWRITE_REQUESTED',
    'SUPERSEDED',
    'REJECTED',
    'FAILED'
  )),
  ai_model TEXT,
  generation_version INTEGER NOT NULL DEFAULT 1 CHECK (generation_version > 0),
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  review_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, chapter_no, generation_version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_novel_chapters_current_version
  ON novel_chapters(project_id, chapter_no)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_novel_chapters_project_status
  ON novel_chapters(project_id, status, chapter_no);

CREATE INDEX IF NOT EXISTS idx_novel_chapters_project_current_approved
  ON novel_chapters(project_id, chapter_no)
  WHERE is_current = TRUE AND status IN ('APPROVED', 'PUBLISHED');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_novel_chapters_review_token
  ON novel_chapters(review_token);

DROP TRIGGER IF EXISTS trg_novel_chapters_updated_at ON novel_chapters;
CREATE TRIGGER trg_novel_chapters_updated_at
BEFORE UPDATE ON novel_chapters
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS novel_continuity_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES novel_projects(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES novel_chapters(id) ON DELETE SET NULL,
  chapter_no INTEGER CHECK (chapter_no IS NULL OR chapter_no > 0),
  chapter_generation_version INTEGER,
  fact_type TEXT NOT NULL CHECK (fact_type IN (
    'character',
    'item',
    'location',
    'ability',
    'relationship',
    'foreshadowing',
    'timeline',
    'rule',
    'other'
  )),
  fact_key TEXT,
  fact_value TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'human', 'import', 'system')),
  confidence NUMERIC NOT NULL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'ACTIVE',
    'PENDING',
    'INACTIVE'
  )),
  superseded_by UUID REFERENCES novel_continuity_facts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_novel_continuity_facts_active_project
  ON novel_continuity_facts(project_id, fact_type, created_at DESC)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_novel_continuity_facts_chapter_id
  ON novel_continuity_facts(chapter_id);

CREATE TABLE IF NOT EXISTS novel_plot_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES novel_projects(id) ON DELETE CASCADE,
  director_card_id UUID REFERENCES novel_chapter_director_cards(id) ON DELETE SET NULL,
  thread_key TEXT NOT NULL,
  thread_type TEXT NOT NULL DEFAULT 'foreshadowing' CHECK (thread_type IN (
    'foreshadowing',
    'timeline',
    'rule',
    'relationship',
    'mystery',
    'other'
  )),
  status TEXT NOT NULL DEFAULT 'SEEDING' CHECK (status IN (
    'SEEDING',
    'ACTIVE',
    'TOUCHING',
    'PAYOFF_READY',
    'PAID_OFF'
  )),
  introduced_chapter INTEGER CHECK (introduced_chapter IS NULL OR introduced_chapter > 0),
  last_touched_chapter INTEGER CHECK (last_touched_chapter IS NULL OR last_touched_chapter > 0),
  next_touch_chapter INTEGER CHECK (next_touch_chapter IS NULL OR next_touch_chapter > 0),
  payoff_target_chapter INTEGER CHECK (payoff_target_chapter IS NULL OR payoff_target_chapter > 0),
  do_not_reveal_before INTEGER CHECK (do_not_reveal_before IS NULL OR do_not_reveal_before > 0),
  visibility TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, thread_key)
);

CREATE INDEX IF NOT EXISTS idx_novel_plot_threads_project_status
  ON novel_plot_threads(project_id, status, next_touch_chapter, payoff_target_chapter);

DROP TRIGGER IF EXISTS trg_novel_plot_threads_updated_at ON novel_plot_threads;
CREATE TRIGGER trg_novel_plot_threads_updated_at
BEFORE UPDATE ON novel_plot_threads
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS novel_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES novel_projects(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES novel_chapters(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'GENERATE_BIBLE',
    'GENERATE_BIBLE_PATCH',
    'GENERATE_OUTLINE',
    'PLAN_CHAPTER_DIRECTOR',
    'GENERATE_CHAPTER',
    'REVIEW_CHAPTER',
    'REWRITE_CHAPTER',
    'REVISE_CHAPTER_BLOCK',
    'NOTIFY_REVIEW'
  )),
  chapter_no INTEGER CHECK (chapter_no IS NULL OR chapter_no > 0),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'RUNNING',
    'SUCCEEDED',
    'FAILED',
    'CANCELLED'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_novel_generation_jobs_status_type_created_at
  ON novel_generation_jobs(status, job_type, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_novel_jobs_project_level
  ON novel_generation_jobs(project_id, job_type)
  WHERE chapter_no IS NULL
    AND status IN ('PENDING', 'RUNNING');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_novel_jobs_chapter_level
  ON novel_generation_jobs(
    project_id,
    job_type,
    chapter_no,
    COALESCE(chapter_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE chapter_no IS NOT NULL
    AND status IN ('PENDING', 'RUNNING');

DROP TRIGGER IF EXISTS trg_novel_generation_jobs_updated_at ON novel_generation_jobs;
CREATE TRIGGER trg_novel_generation_jobs_updated_at
BEFORE UPDATE ON novel_generation_jobs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

ALTER TABLE novel_chapter_director_cards
  DROP CONSTRAINT IF EXISTS novel_chapter_director_cards_job_id_fkey;

ALTER TABLE novel_chapter_director_cards
  ADD CONSTRAINT novel_chapter_director_cards_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES novel_generation_jobs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS novel_ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES novel_projects(id) ON DELETE CASCADE,
  chapter_id UUID REFERENCES novel_chapters(id) ON DELETE SET NULL,
  job_id UUID REFERENCES novel_generation_jobs(id) ON DELETE SET NULL,
  run_type TEXT NOT NULL CHECK (run_type IN (
    'GENERATE_BIBLE',
    'GENERATE_BIBLE_PATCH',
    'GENERATE_OUTLINE',
    'PLAN_CHAPTER_DIRECTOR',
    'GENERATE_CHAPTER',
    'REVIEW_CHAPTER',
    'REWRITE_CHAPTER',
    'REVISE_CHAPTER_BLOCK',
    'REVIEW_ASSISTANT'
  )),
  model TEXT,
  prompt_version TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  parsed_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_novel_ai_runs_project_created_at
  ON novel_ai_runs(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_novel_ai_runs_chapter_created_at
  ON novel_ai_runs(chapter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_novel_ai_runs_job_id
  ON novel_ai_runs(job_id);

CREATE TABLE IF NOT EXISTS novel_bible_patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES novel_projects(id) ON DELETE CASCADE,
  job_id UUID REFERENCES novel_generation_jobs(id) ON DELETE SET NULL,
  ai_run_id UUID REFERENCES novel_ai_runs(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'AI' CHECK (source IN ('AI', 'MANUAL')),
  expansion_request TEXT,
  expansion_scope TEXT,
  expansion_constraints TEXT,
  patch_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'APPLIED',
    'FAILED'
  )),
  reviewer TEXT,
  comment TEXT,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_novel_bible_patches_project_status
  ON novel_bible_patches(project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_novel_bible_patches_job_id
  ON novel_bible_patches(job_id);

CREATE INDEX IF NOT EXISTS idx_novel_bible_patches_ai_run_id
  ON novel_bible_patches(ai_run_id);

DROP TRIGGER IF EXISTS trg_novel_bible_patches_updated_at ON novel_bible_patches;
CREATE TRIGGER trg_novel_bible_patches_updated_at
BEFORE UPDATE ON novel_bible_patches
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS novel_review_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES novel_projects(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES novel_chapters(id) ON DELETE CASCADE,
  ai_run_id UUID REFERENCES novel_ai_runs(id) ON DELETE SET NULL,
  consistency_score INTEGER CHECK (consistency_score BETWEEN 0 AND 100),
  readability_score INTEGER CHECK (readability_score BETWEEN 0 AND 100),
  plot_score INTEGER CHECK (plot_score BETWEEN 0 AND 100),
  commercial_score INTEGER CHECK (commercial_score BETWEEN 0 AND 100),
  total_score INTEGER CHECK (total_score BETWEEN 0 AND 100),
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggestions JSONB NOT NULL DEFAULT '[]'::jsonb,
  verdict TEXT NOT NULL DEFAULT 'MANUAL_REVIEW' CHECK (verdict IN (
    'PASS',
    'REWRITE',
    'MANUAL_REVIEW'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_novel_review_reports_chapter_created_at
  ON novel_review_reports(chapter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_novel_review_reports_ai_run_id
  ON novel_review_reports(ai_run_id);

CREATE TABLE IF NOT EXISTS novel_human_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES novel_projects(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES novel_chapters(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN (
    'APPROVE',
    'REQUEST_REWRITE',
    'REJECT',
    'PAUSE_PROJECT',
    'MANUAL_EDIT'
  )),
  comment TEXT,
  reviewer TEXT NOT NULL DEFAULT 'local_user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_novel_human_reviews_chapter_created_at
  ON novel_human_reviews(chapter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_novel_human_reviews_project_created_at
  ON novel_human_reviews(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS novel_review_assistant_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES novel_projects(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES novel_chapters(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN (
    'ACTIVE',
    'ARCHIVED'
  )),
  title TEXT,
  created_by TEXT NOT NULL DEFAULT 'local_user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_novel_review_assistant_threads_chapter
  ON novel_review_assistant_threads(chapter_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_novel_review_assistant_threads_project
  ON novel_review_assistant_threads(project_id, updated_at DESC);

DROP TRIGGER IF EXISTS trg_novel_review_assistant_threads_updated_at ON novel_review_assistant_threads;
CREATE TRIGGER trg_novel_review_assistant_threads_updated_at
BEFORE UPDATE ON novel_review_assistant_threads
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS novel_review_assistant_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES novel_review_assistant_threads(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES novel_projects(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES novel_chapters(id) ON DELETE CASCADE,
  ai_run_id UUID REFERENCES novel_ai_runs(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN (
    'user',
    'assistant',
    'system'
  )),
  mode TEXT NOT NULL CHECK (mode IN (
    'continuity',
    'selection_advice',
    'design_reference'
  )),
  content TEXT NOT NULL,
  selected_text TEXT,
  paragraph_start INTEGER CHECK (paragraph_start IS NULL OR paragraph_start > 0),
  paragraph_end INTEGER CHECK (paragraph_end IS NULL OR paragraph_end > 0),
  selection_start_offset INTEGER CHECK (selection_start_offset IS NULL OR selection_start_offset >= 0),
  selection_end_offset INTEGER CHECK (selection_end_offset IS NULL OR selection_end_offset >= 0),
  anchor_prefix TEXT,
  anchor_suffix TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  suggested_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL DEFAULT 'local_user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_novel_review_assistant_messages_thread
  ON novel_review_assistant_messages(thread_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_novel_review_assistant_messages_chapter
  ON novel_review_assistant_messages(chapter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_novel_review_assistant_messages_ai_run
  ON novel_review_assistant_messages(ai_run_id);

CREATE TABLE IF NOT EXISTS novel_chapter_block_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES novel_projects(id) ON DELETE CASCADE,
  chapter_id UUID NOT NULL REFERENCES novel_chapters(id) ON DELETE CASCADE,
  job_id UUID REFERENCES novel_generation_jobs(id) ON DELETE SET NULL,
  applied_chapter_id UUID REFERENCES novel_chapters(id) ON DELETE SET NULL,
  source_generation_version INTEGER NOT NULL CHECK (source_generation_version > 0),
  action_type TEXT NOT NULL CHECK (action_type IN (
    'modify',
    'expand',
    'condense',
    'polish',
    'continue',
    'logic_fix',
    'custom'
  )),
  range_lock TEXT NOT NULL DEFAULT 'selection_only' CHECK (range_lock IN (
    'selection_only',
    'adjacent_one',
    'flag_later'
  )),
  paragraph_start INTEGER CHECK (paragraph_start IS NULL OR paragraph_start > 0),
  paragraph_end INTEGER CHECK (paragraph_end IS NULL OR paragraph_end > 0),
  selection_start_offset INTEGER CHECK (selection_start_offset IS NULL OR selection_start_offset >= 0),
  selection_end_offset INTEGER CHECK (selection_end_offset IS NULL OR selection_end_offset >= 0),
  anchor_prefix TEXT,
  anchor_suffix TEXT,
  selected_text TEXT NOT NULL,
  selected_text_hash TEXT,
  before_context TEXT,
  after_context TEXT,
  instruction TEXT NOT NULL,
  replacement_text TEXT,
  change_summary TEXT,
  instruction_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  affects_later_text BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'RUNNING',
    'SUGGESTED',
    'APPLIED',
    'REJECTED',
    'FAILED',
    'SUPERSEDED'
  )),
  error_message TEXT,
  created_by TEXT NOT NULL DEFAULT 'local_user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    paragraph_start IS NULL
    OR paragraph_end IS NULL
    OR paragraph_end >= paragraph_start
  ),
  CHECK (
    selection_start_offset IS NULL
    OR selection_end_offset IS NULL
    OR selection_end_offset >= selection_start_offset
  )
);

ALTER TABLE novel_chapter_block_revisions
  ADD COLUMN IF NOT EXISTS selection_start_offset INTEGER;

ALTER TABLE novel_chapter_block_revisions
  ADD COLUMN IF NOT EXISTS selection_end_offset INTEGER;

ALTER TABLE novel_chapter_block_revisions
  ADD COLUMN IF NOT EXISTS anchor_prefix TEXT;

ALTER TABLE novel_chapter_block_revisions
  ADD COLUMN IF NOT EXISTS anchor_suffix TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'novel_block_revision_selection_offsets_check'
  ) THEN
    ALTER TABLE novel_chapter_block_revisions
      ADD CONSTRAINT novel_block_revision_selection_offsets_check
      CHECK (
        (selection_start_offset IS NULL OR selection_start_offset >= 0)
        AND (selection_end_offset IS NULL OR selection_end_offset >= 0)
        AND (
          selection_start_offset IS NULL
          OR selection_end_offset IS NULL
          OR selection_end_offset >= selection_start_offset
        )
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_novel_block_revisions_chapter_created_at
  ON novel_chapter_block_revisions(chapter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_novel_block_revisions_job_id
  ON novel_chapter_block_revisions(job_id);

CREATE INDEX IF NOT EXISTS idx_novel_block_revisions_status_created_at
  ON novel_chapter_block_revisions(status, created_at DESC);

DROP TRIGGER IF EXISTS trg_novel_chapter_block_revisions_updated_at ON novel_chapter_block_revisions;
CREATE TRIGGER trg_novel_chapter_block_revisions_updated_at
BEFORE UPDATE ON novel_chapter_block_revisions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS novel_project_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES novel_projects(id) ON DELETE CASCADE,
  bible_id UUID REFERENCES novel_bibles(id) ON DELETE SET NULL,
  outline_id UUID REFERENCES novel_chapter_outlines(id) ON DELETE SET NULL,
  chapter_id UUID REFERENCES novel_chapters(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'BIBLE_UPDATED',
    'BIBLE_PATCH_CREATED',
    'BIBLE_PATCH_APPLIED',
    'BIBLE_PATCH_REJECTED',
    'BIBLE_PATCH_REGENERATE_REQUESTED',
    'OUTLINE_UPDATED',
    'DIRECTOR_CARD_UPDATED',
    'DIRECTOR_CARD_REGENERATE_REQUESTED',
    'DIRECTOR_CARD_CHAPTER_JOB_CREATED',
    'PROJECT_TARGET_UPDATED',
    'PROJECT_PAUSED',
    'PROJECT_RESUMED',
    'CHAPTER_BLOCK_REVISION_SUGGESTED',
    'CHAPTER_MANUAL_EDIT_CREATED',
    'CHAPTER_MANUAL_EDIT_SAVED',
    'BIBLE_REGENERATE_REQUESTED',
    'OUTLINE_REGENERATE_REQUESTED',
    'PROJECT_ARCHIVED',
    'PROJECT_RESTORED',
    'FACT_CREATED',
    'FACT_UPDATED',
    'FACT_ACTIVATED',
    'FACT_DEACTIVATED',
    'FACTS_CLEARED'
  )),
  actor TEXT NOT NULL DEFAULT 'local_user',
  comment TEXT,
  before_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_novel_project_events_project_created_at
  ON novel_project_events(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_novel_project_events_outline_created_at
  ON novel_project_events(outline_id, created_at DESC);

CREATE TABLE IF NOT EXISTS novel_daily_report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  today_job_total_count INTEGER NOT NULL DEFAULT 0 CHECK (today_job_total_count >= 0),
  today_job_succeeded_count INTEGER NOT NULL DEFAULT 0 CHECK (today_job_succeeded_count >= 0),
  today_job_failed_count INTEGER NOT NULL DEFAULT 0 CHECK (today_job_failed_count >= 0),
  today_job_cancelled_count INTEGER NOT NULL DEFAULT 0 CHECK (today_job_cancelled_count >= 0),
  today_ai_run_count INTEGER NOT NULL DEFAULT 0 CHECK (today_ai_run_count >= 0),
  today_ai_success_count INTEGER NOT NULL DEFAULT 0 CHECK (today_ai_success_count >= 0),
  today_ai_failed_count INTEGER NOT NULL DEFAULT 0 CHECK (today_ai_failed_count >= 0),
  avg_ai_duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (avg_ai_duration_ms >= 0),
  max_ai_duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (max_ai_duration_ms >= 0),
  waiting_job_count INTEGER NOT NULL DEFAULT 0 CHECK (waiting_job_count >= 0),
  running_job_count INTEGER NOT NULL DEFAULT 0 CHECK (running_job_count >= 0),
  failed_job_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_job_count >= 0),
  need_review_count INTEGER NOT NULL DEFAULT 0 CHECK (need_review_count >= 0),
  active_project_count INTEGER NOT NULL DEFAULT 0 CHECK (active_project_count >= 0),
  completed_project_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_project_count >= 0),
  latest_failed_jobs JSONB NOT NULL DEFAULT '[]'::jsonb,
  slow_ai_runs JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT,
  UNIQUE(report_date)
);

CREATE INDEX IF NOT EXISTS idx_novel_daily_report_snapshots_captured_at
  ON novel_daily_report_snapshots(captured_at DESC);

ALTER TABLE novel_projects
  ADD COLUMN IF NOT EXISTS expansion_request TEXT;

ALTER TABLE novel_projects
  ADD COLUMN IF NOT EXISTS expansion_scope TEXT NOT NULL DEFAULT 'append_only';

ALTER TABLE novel_projects
  ADD COLUMN IF NOT EXISTS expansion_constraints TEXT;

ALTER TABLE novel_projects
  DROP CONSTRAINT IF EXISTS novel_projects_status_check;

ALTER TABLE novel_projects
  ADD CONSTRAINT novel_projects_status_check CHECK (status IN (
    'CREATED',
    'BIBLE_READY',
    'OUTLINE_READY',
    'WRITING',
    'REVIEWING',
    'PAUSED',
    'ARCHIVED',
    'COMPLETED',
    'FAILED'
  ));

ALTER TABLE novel_projects
  DROP CONSTRAINT IF EXISTS novel_projects_expansion_scope_check;

ALTER TABLE novel_projects
  ADD CONSTRAINT novel_projects_expansion_scope_check CHECK (expansion_scope IN (
    'append_only',
    'rewrite_unwritten',
    'regenerate_outline'
  ));

ALTER TABLE novel_bibles
  ADD COLUMN IF NOT EXISTS organizations JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE novel_bibles
  ADD COLUMN IF NOT EXISTS locations JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE novel_bibles
  ADD COLUMN IF NOT EXISTS plot_constraints JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE novel_bibles
  ADD COLUMN IF NOT EXISTS expansion_notes TEXT;

ALTER TABLE novel_chapters
  DROP CONSTRAINT IF EXISTS novel_chapters_status_check;

ALTER TABLE novel_chapters
  ADD CONSTRAINT novel_chapters_status_check CHECK (status IN (
    'PLANNED',
    'GENERATING',
    'DRAFT_READY',
    'AI_REVIEWED',
    'NEED_REVIEW',
    'APPROVED',
    'PUBLISHED',
    'REWRITE_REQUESTED',
    'SUPERSEDED',
    'REJECTED',
    'FAILED'
  ));

ALTER TABLE novel_generation_jobs
  DROP CONSTRAINT IF EXISTS novel_generation_jobs_job_type_check;

ALTER TABLE novel_generation_jobs
  ADD CONSTRAINT novel_generation_jobs_job_type_check CHECK (job_type IN (
    'GENERATE_BIBLE',
    'GENERATE_BIBLE_PATCH',
    'GENERATE_OUTLINE',
    'PLAN_CHAPTER_DIRECTOR',
    'GENERATE_CHAPTER',
    'REVIEW_CHAPTER',
    'REWRITE_CHAPTER',
    'REVISE_CHAPTER_BLOCK',
    'NOTIFY_REVIEW'
  ));

ALTER TABLE novel_ai_runs
  DROP CONSTRAINT IF EXISTS novel_ai_runs_run_type_check;

ALTER TABLE novel_ai_runs
  ADD CONSTRAINT novel_ai_runs_run_type_check CHECK (run_type IN (
    'GENERATE_BIBLE',
    'GENERATE_BIBLE_PATCH',
    'GENERATE_OUTLINE',
    'PLAN_CHAPTER_DIRECTOR',
    'GENERATE_CHAPTER',
    'REVIEW_CHAPTER',
    'REWRITE_CHAPTER',
    'REVISE_CHAPTER_BLOCK',
    'REVIEW_ASSISTANT'
  ));

ALTER TABLE novel_human_reviews
  DROP CONSTRAINT IF EXISTS novel_human_reviews_action_check;

ALTER TABLE novel_human_reviews
  ADD CONSTRAINT novel_human_reviews_action_check CHECK (action IN (
    'APPROVE',
    'REQUEST_REWRITE',
    'REJECT',
    'PAUSE_PROJECT',
    'MANUAL_EDIT'
  ));

ALTER TABLE novel_project_events
  DROP CONSTRAINT IF EXISTS novel_project_events_event_type_check;

ALTER TABLE novel_project_events
  ADD CONSTRAINT novel_project_events_event_type_check CHECK (event_type IN (
    'BIBLE_UPDATED',
    'BIBLE_PATCH_CREATED',
    'BIBLE_PATCH_APPLIED',
    'BIBLE_PATCH_REJECTED',
    'BIBLE_PATCH_REGENERATE_REQUESTED',
    'OUTLINE_UPDATED',
    'DIRECTOR_CARD_UPDATED',
    'DIRECTOR_CARD_REGENERATE_REQUESTED',
    'DIRECTOR_CARD_CHAPTER_JOB_CREATED',
    'PROJECT_TARGET_UPDATED',
    'PROJECT_PAUSED',
    'PROJECT_RESUMED',
    'CHAPTER_BLOCK_REVISION_SUGGESTED',
    'CHAPTER_MANUAL_EDIT_CREATED',
    'CHAPTER_MANUAL_EDIT_SAVED',
    'BIBLE_REGENERATE_REQUESTED',
    'OUTLINE_REGENERATE_REQUESTED',
    'PROJECT_ARCHIVED',
    'PROJECT_RESTORED',
    'FACT_CREATED',
    'FACT_UPDATED',
    'FACT_ACTIVATED',
    'FACT_DEACTIVATED',
    'FACTS_CLEARED'
  ));
