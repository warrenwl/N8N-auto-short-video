-- Phase 1 database TDD assertions for the novel workflow.
-- This file is intentionally transactional: it verifies behavior, then rolls
-- back all sample data while keeping migrations in place.

BEGIN;

CREATE TEMP TABLE phase1_tdd_evidence (
  project_id UUID,
  approved_current_count INTEGER,
  active_ai_fact_count INTEGER,
  inactive_old_ai_fact_count INTEGER,
  human_approve_count INTEGER,
  next_chapter_job_count INTEGER,
  claimed_running_job_count INTEGER,
  rewrite_job_count INTEGER,
  rejected_candidate_count INTEGER
) ON COMMIT DROP;

DO $$
DECLARE
  v_project_id UUID;
  v_outline_id UUID;
  v_old_chapter novel_chapters%ROWTYPE;
  v_candidate_chapter novel_chapters%ROWTYPE;
  v_second_candidate novel_chapters%ROWTYPE;
  v_reject_candidate novel_chapters%ROWTYPE;
  v_token TEXT;
  v_result RECORD;
  v_rewrite_result RECORD;
  v_reject_result RECORD;
  v_count INTEGER;
  v_claimed_job_id UUID;
BEGIN
  IF to_regclass('public.novel_projects') IS NULL THEN
    RAISE EXCEPTION 'missing table: novel_projects';
  END IF;

  IF to_regclass('public.novel_chapters') IS NULL THEN
    RAISE EXCEPTION 'missing table: novel_chapters';
  END IF;

  IF to_regclass('public.novel_generation_jobs') IS NULL THEN
    RAISE EXCEPTION 'missing table: novel_generation_jobs';
  END IF;

  IF to_regclass('public.uniq_novel_chapters_current_version') IS NULL THEN
    RAISE EXCEPTION 'missing index: uniq_novel_chapters_current_version';
  END IF;

  IF to_regclass('public.uniq_novel_chapters_review_token') IS NULL THEN
    RAISE EXCEPTION 'missing index: uniq_novel_chapters_review_token';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'create_novel_chapter_version'
  ) THEN
    RAISE EXCEPTION 'missing function: create_novel_chapter_version';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'approve_novel_chapter'
  ) THEN
    RAISE EXCEPTION 'missing function: approve_novel_chapter';
  END IF;

  BEGIN
    INSERT INTO novel_projects (title, genre, status)
    VALUES ('Phase1 invalid status probe', '测试', 'BROKEN_STATUS');
    RAISE EXCEPTION 'project status CHECK did not reject invalid status';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  INSERT INTO novel_projects (
    title,
    genre,
    audience,
    style,
    premise,
    target_total_chapters,
    target_words_per_chapter,
    status
  )
  VALUES (
    'Phase1 TDD ' || gen_random_uuid()::text,
    '都市奇幻',
    '中文网文读者',
    '强情节、强钩子',
    '测试项目，用于验证小说工作流数据库底座。',
    3,
    1200,
    'WRITING'
  )
  RETURNING id INTO v_project_id;

  INSERT INTO novel_chapter_outlines (
    project_id,
    chapter_no,
    title,
    summary,
    status
  )
  VALUES (
    v_project_id,
    1,
    '第一章：旧版本',
    '用于验证重写候选稿不会抢占 current。',
    'READY'
  )
  RETURNING id INTO v_outline_id;

  SELECT *
  INTO v_old_chapter
  FROM create_novel_chapter_version(
    v_project_id,
    v_outline_id,
    NULL,
    1,
    '第一章：已批准旧稿',
    '旧稿正文',
    '旧稿摘要',
    4,
    'glm-test',
    'APPROVED',
    TRUE
  );

  IF v_old_chapter.status <> 'APPROVED' OR v_old_chapter.is_current IS NOT TRUE THEN
    RAISE EXCEPTION 'approved old chapter should be current, got status %, current %',
      v_old_chapter.status,
      v_old_chapter.is_current;
  END IF;

  INSERT INTO novel_continuity_facts (
    project_id,
    chapter_id,
    chapter_no,
    chapter_generation_version,
    fact_type,
    fact_key,
    fact_value,
    source,
    status
  )
  VALUES (
    v_project_id,
    v_old_chapter.id,
    1,
    v_old_chapter.generation_version,
    'character',
    '主角目标',
    '旧事实：主角想离开城市。',
    'ai',
    'ACTIVE'
  );

  SELECT *
  INTO v_candidate_chapter
  FROM create_novel_chapter_version(
    v_project_id,
    v_outline_id,
    v_old_chapter.id,
    1,
    '第一章：候选新稿',
    '候选新稿正文',
    '候选新稿摘要',
    6,
    'glm-test',
    'DRAFT_READY',
    FALSE
  );

  IF v_candidate_chapter.is_current IS TRUE THEN
    RAISE EXCEPTION 'draft candidate should not be current';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_chapters
    WHERE id = v_old_chapter.id
      AND is_current = TRUE
      AND status = 'APPROVED'
  ) THEN
    RAISE EXCEPTION 'existing approved version should remain current while candidate is draft';
  END IF;

  UPDATE novel_chapters
  SET status = 'NEED_REVIEW'
  WHERE id = v_candidate_chapter.id
  RETURNING review_token INTO v_token;

  INSERT INTO novel_generation_jobs (
    project_id,
    chapter_id,
    job_type,
    chapter_no,
    status
  )
  VALUES (
    v_project_id,
    v_candidate_chapter.id,
    'NOTIFY_REVIEW',
    v_candidate_chapter.chapter_no,
    'PENDING'
  );

  INSERT INTO novel_continuity_facts (
    project_id,
    chapter_id,
    chapter_no,
    chapter_generation_version,
    fact_type,
    fact_key,
    fact_value,
    source,
    status
  )
  VALUES (
    v_project_id,
    v_candidate_chapter.id,
    1,
    v_candidate_chapter.generation_version,
    'character',
    '主角目标',
    '新事实：主角决定留在城市查明真相。',
    'ai',
    'PENDING'
  );

  SELECT *
  INTO v_result
  FROM approve_novel_chapter(
    v_candidate_chapter.id,
    v_token,
    'Phase 1 approve assertion',
    'phase1_tdd'
  );

  IF v_result.chapter_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'approve_novel_chapter returned wrong chapter_status: %',
      v_result.chapter_status;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_chapters
    WHERE id = v_candidate_chapter.id
      AND status = 'APPROVED'
      AND is_current = TRUE
  ) THEN
    RAISE EXCEPTION 'approved candidate should become current';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM novel_generation_jobs
    WHERE chapter_id = v_candidate_chapter.id
      AND job_type = 'NOTIFY_REVIEW'
      AND status IN ('PENDING', 'RUNNING')
  ) THEN
    RAISE EXCEPTION 'approve should cancel pending review notification job';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM novel_chapters
    WHERE id = v_old_chapter.id
      AND is_current = TRUE
  ) THEN
    RAISE EXCEPTION 'old same-chapter version should no longer be current after approval';
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM novel_continuity_facts
  WHERE chapter_id = v_candidate_chapter.id
    AND source = 'ai'
    AND status = 'ACTIVE';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected 1 active fact for approved candidate, got %', v_count;
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM novel_continuity_facts
  WHERE chapter_id = v_old_chapter.id
    AND source = 'ai'
    AND status = 'INACTIVE';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'expected old AI fact to become inactive, got %', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_human_reviews
    WHERE chapter_id = v_candidate_chapter.id
      AND action = 'APPROVE'
      AND reviewer = 'phase1_tdd'
  ) THEN
    RAISE EXCEPTION 'missing human review APPROVE record';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_projects
    WHERE id = v_project_id
      AND current_chapter_no = 1
      AND status = 'WRITING'
  ) THEN
    RAISE EXCEPTION 'project progress was not updated after approval';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_generation_jobs
    WHERE project_id = v_project_id
      AND job_type = 'PLAN_CHAPTER_DIRECTOR'
      AND chapter_no = 2
      AND status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'approval should create next chapter PLAN_CHAPTER_DIRECTOR job';
  END IF;

  BEGIN
    INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, status)
    VALUES (v_project_id, 'PLAN_CHAPTER_DIRECTOR', 2, 'PENDING');
    RAISE EXCEPTION 'chapter-level job unique index did not reject duplicate pending job';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  WITH claimed AS (
    UPDATE novel_generation_jobs
    SET
      status = 'RUNNING',
      started_at = NOW(),
      attempt_count = attempt_count + 1
    WHERE id IN (
      SELECT id
      FROM novel_generation_jobs
      WHERE project_id = v_project_id
        AND status = 'PENDING'
        AND job_type = 'PLAN_CHAPTER_DIRECTOR'
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  )
  SELECT id
  INTO v_claimed_job_id
  FROM claimed;

  IF v_claimed_job_id IS NULL THEN
    RAISE EXCEPTION 'SKIP LOCKED job claim query did not claim a job';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_generation_jobs
    WHERE id = v_claimed_job_id
      AND status = 'RUNNING'
      AND attempt_count = 1
      AND started_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'claimed job did not enter RUNNING with attempt_count incremented';
  END IF;

  INSERT INTO novel_continuity_facts (
    project_id,
    chapter_id,
    chapter_no,
    chapter_generation_version,
    fact_type,
    fact_key,
    fact_value,
    source,
    status
  )
  VALUES (
    v_project_id,
    v_candidate_chapter.id,
    1,
    v_candidate_chapter.generation_version,
    'rule',
    '人工锁定规则',
    '人工规则：这一章的关键设定必须保留。',
    'human',
    'ACTIVE'
  );

  SELECT COUNT(*)
  INTO v_count
  FROM novel_continuity_facts
  WHERE project_id = v_project_id
    AND status = 'ACTIVE'
    AND (chapter_no IS NULL OR chapter_no < 1 OR source = 'human')
    AND source = 'ai';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'same-chapter AI facts should be excluded while generating/reviewing chapter 1';
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM novel_continuity_facts
  WHERE project_id = v_project_id
    AND status = 'ACTIVE'
    AND (chapter_no IS NULL OR chapter_no < 1 OR source = 'human')
    AND source = 'human';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'same-chapter human facts should remain available, got %', v_count;
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM novel_continuity_facts
  WHERE project_id = v_project_id
    AND status = 'ACTIVE'
    AND (chapter_no IS NULL OR chapter_no < 2 OR source = 'human')
    AND source = 'ai';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'chapter 2 context should include active AI facts from chapter 1, got %', v_count;
  END IF;

  SELECT *
  INTO v_second_candidate
  FROM create_novel_chapter_version(
    v_project_id,
    v_outline_id,
    v_candidate_chapter.id,
    1,
    '第一章：待重写候选稿',
    '待重写候选稿正文',
    '待重写候选稿摘要',
    7,
    'glm-test',
    'DRAFT_READY',
    FALSE
  );

  UPDATE novel_chapters
  SET status = 'NEED_REVIEW'
  WHERE id = v_second_candidate.id
  RETURNING review_token INTO v_token;

  INSERT INTO novel_generation_jobs (
    project_id,
    chapter_id,
    job_type,
    chapter_no,
    status
  )
  VALUES (
    v_project_id,
    v_second_candidate.id,
    'NOTIFY_REVIEW',
    v_second_candidate.chapter_no,
    'PENDING'
  );

  UPDATE novel_projects
  SET status = 'REVIEWING'
  WHERE id = v_project_id;

  SELECT *
  INTO v_rewrite_result
  FROM request_novel_chapter_rewrite(
    v_second_candidate.id,
    v_token,
    'Phase 1 rewrite assertion',
    'phase1_tdd'
  );

  IF v_rewrite_result.chapter_status <> 'REWRITE_REQUESTED' THEN
    RAISE EXCEPTION 'rewrite request returned wrong status: %',
      v_rewrite_result.chapter_status;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_generation_jobs
    WHERE id = v_rewrite_result.rewrite_job_id
      AND job_type = 'REWRITE_CHAPTER'
      AND status = 'PENDING'
      AND chapter_id = v_second_candidate.id
  ) THEN
    RAISE EXCEPTION 'rewrite request should create REWRITE_CHAPTER job';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM novel_generation_jobs
    WHERE chapter_id = v_second_candidate.id
      AND job_type = 'NOTIFY_REVIEW'
      AND status IN ('PENDING', 'RUNNING')
  ) THEN
    RAISE EXCEPTION 'rewrite request should cancel pending review notification job';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM novel_projects
    WHERE id = v_project_id
      AND status = 'REVIEWING'
  ) THEN
    RAISE EXCEPTION 'rewrite request should leave project out of human-review status when no pending review remains';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_chapters
    WHERE id = v_candidate_chapter.id
      AND status = 'APPROVED'
      AND is_current = TRUE
  ) THEN
    RAISE EXCEPTION 'rewrite request must not disturb approved current chapter';
  END IF;

  UPDATE novel_generation_jobs
  SET
    status = 'CANCELLED',
    finished_at = NOW(),
    updated_at = NOW()
  WHERE id = v_rewrite_result.rewrite_job_id;

  SELECT *
  INTO v_reject_candidate
  FROM create_novel_chapter_version(
    v_project_id,
    v_outline_id,
    v_candidate_chapter.id,
    1,
    '第一章：待拒绝候选稿',
    '待拒绝候选稿正文',
    '待拒绝候选稿摘要',
    8,
    'glm-test',
    'DRAFT_READY',
    FALSE
  );

  UPDATE novel_chapters
  SET status = 'NEED_REVIEW'
  WHERE id = v_reject_candidate.id
  RETURNING review_token INTO v_token;

  INSERT INTO novel_generation_jobs (
    project_id,
    chapter_id,
    job_type,
    chapter_no,
    status
  )
  VALUES (
    v_project_id,
    v_reject_candidate.id,
    'NOTIFY_REVIEW',
    v_reject_candidate.chapter_no,
    'PENDING'
  );

  UPDATE novel_projects
  SET status = 'REVIEWING'
  WHERE id = v_project_id;

  SELECT *
  INTO v_reject_result
  FROM reject_novel_chapter(
    v_reject_candidate.id,
    v_token,
    'Phase 1 reject assertion',
    'phase1_tdd'
  );

  IF v_reject_result.chapter_status <> 'REJECTED' THEN
    RAISE EXCEPTION 'reject returned wrong status: %',
      v_reject_result.chapter_status;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM novel_chapters
    WHERE id = v_reject_candidate.id
      AND is_current = TRUE
  ) THEN
    RAISE EXCEPTION 'rejected candidate should not be current';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_human_reviews
    WHERE chapter_id = v_reject_candidate.id
      AND action = 'REJECT'
      AND reviewer = 'phase1_tdd'
  ) THEN
    RAISE EXCEPTION 'missing human review REJECT record';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM novel_generation_jobs
    WHERE chapter_id = v_reject_candidate.id
      AND job_type = 'NOTIFY_REVIEW'
      AND status IN ('PENDING', 'RUNNING')
  ) THEN
    RAISE EXCEPTION 'reject should cancel pending review notification job';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_generation_jobs
    WHERE project_id = v_project_id
      AND chapter_no = v_reject_candidate.chapter_no
      AND job_type = 'PLAN_CHAPTER_DIRECTOR'
      AND status IN ('PENDING', 'RUNNING')
      AND payload->>'trigger_source' = 'chapter_rejected_retry'
  ) THEN
    RAISE EXCEPTION 'reject should create same-chapter director retry job';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM novel_projects
    WHERE id = v_project_id
      AND status = 'REVIEWING'
  ) THEN
    RAISE EXCEPTION 'reject should leave project out of human-review status when no pending review remains';
  END IF;

  INSERT INTO phase1_tdd_evidence (
    project_id,
    approved_current_count,
    active_ai_fact_count,
    inactive_old_ai_fact_count,
    human_approve_count,
    next_chapter_job_count,
    claimed_running_job_count,
    rewrite_job_count,
    rejected_candidate_count
  )
  SELECT
    v_project_id,
    (
      SELECT COUNT(*)::integer
      FROM novel_chapters
      WHERE project_id = v_project_id
        AND status = 'APPROVED'
        AND is_current = TRUE
    ),
    (
      SELECT COUNT(*)::integer
      FROM novel_continuity_facts
      WHERE project_id = v_project_id
        AND source = 'ai'
        AND status = 'ACTIVE'
    ),
    (
      SELECT COUNT(*)::integer
      FROM novel_continuity_facts
      WHERE project_id = v_project_id
        AND source = 'ai'
        AND status = 'INACTIVE'
    ),
    (
      SELECT COUNT(*)::integer
      FROM novel_human_reviews
      WHERE project_id = v_project_id
        AND action = 'APPROVE'
    ),
    (
      SELECT COUNT(*)::integer
      FROM novel_generation_jobs
      WHERE project_id = v_project_id
        AND job_type = 'PLAN_CHAPTER_DIRECTOR'
        AND chapter_no = 2
        AND status IN ('PENDING', 'RUNNING')
    ),
    (
      SELECT COUNT(*)::integer
      FROM novel_generation_jobs
      WHERE project_id = v_project_id
        AND job_type = 'PLAN_CHAPTER_DIRECTOR'
        AND chapter_no = 2
        AND status = 'RUNNING'
    ),
    (
      SELECT COUNT(*)::integer
      FROM novel_generation_jobs
      WHERE project_id = v_project_id
        AND job_type = 'REWRITE_CHAPTER'
        AND status = 'PENDING'
    ),
    (
      SELECT COUNT(*)::integer
      FROM novel_chapters
      WHERE project_id = v_project_id
        AND status = 'REJECTED'
        AND is_current = FALSE
    );

  RAISE NOTICE 'Phase 1 DB assertions passed for project %', v_project_id;
END;
$$;

TABLE phase1_tdd_evidence;

SELECT 'phase1_db_tdd_passed' AS result;

ROLLBACK;
