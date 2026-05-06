-- Phase 5 TDD: human review action closes chapter 1 and creates chapter 2 job.

BEGIN;

CREATE TEMP TABLE phase5_assert_state (
  project_id UUID,
  chapter_id UUID,
  chapter_status TEXT,
  chapter_is_current BOOLEAN,
  project_status TEXT,
  current_chapter_no INTEGER,
  activated_fact_count BIGINT,
  human_approve_count BIGINT,
  next_chapter_job_count BIGINT,
  rewrite_job_count BIGINT,
  rejected_candidate_count BIGINT
) ON COMMIT DROP;

DO $$
DECLARE
  v_project_id UUID;
  v_outline_1 UUID;
  v_outline_2 UUID;
  v_chapter novel_chapters%ROWTYPE;
  v_token TEXT;
  v_result RECORD;
  v_rewrite_project_id UUID;
  v_rewrite_outline_id UUID;
  v_rewrite_chapter novel_chapters%ROWTYPE;
  v_rewrite_token TEXT;
  v_reject_project_id UUID;
  v_reject_outline_id UUID;
  v_reject_chapter novel_chapters%ROWTYPE;
  v_reject_token TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'apply_novel_review_action'
  ) THEN
    RAISE EXCEPTION 'missing function: apply_novel_review_action';
  END IF;

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
    'Phase5 TDD 主链路',
    '都市逆袭',
    '中文网文读者',
    '节奏快',
    '主角从低谷逆袭',
    2,
    1200,
    'REVIEWING'
  )
  RETURNING id INTO v_project_id;

  INSERT INTO novel_chapter_outlines (
    project_id,
    chapter_no,
    title,
    summary,
    status
  )
  VALUES (v_project_id, 1, '第一章', '主角被迫登场', 'READY')
  RETURNING id INTO v_outline_1;

  INSERT INTO novel_chapter_outlines (
    project_id,
    chapter_no,
    title,
    summary,
    status
  )
  VALUES (v_project_id, 2, '第二章', '主角开始反击', 'READY')
  RETURNING id INTO v_outline_2;

  SELECT *
  INTO v_chapter
  FROM create_novel_chapter_version(
    v_project_id,
    v_outline_1,
    NULL,
    1,
    '第一章 候选稿',
    '候选正文',
    '候选摘要',
    1000,
    'mock-model',
    'NEED_REVIEW',
    FALSE
  );

  v_token := v_chapter.review_token;

  INSERT INTO novel_review_reports (
    project_id,
    chapter_id,
    total_score,
    issues,
    suggestions,
    verdict
  )
  VALUES (
    v_project_id,
    v_chapter.id,
    88,
    '[]'::jsonb,
    '[]'::jsonb,
    'MANUAL_REVIEW'
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
  VALUES
    (v_project_id, v_chapter.id, 1, v_chapter.generation_version, 'character', 'hero', '主角获得第一个线索', 'ai', 'PENDING'),
    (v_project_id, v_chapter.id, 1, v_chapter.generation_version, 'foreshadowing', 'ring', '戒指埋下后续伏笔', 'ai', 'PENDING');

  SELECT *
  INTO v_result
  FROM apply_novel_review_action(
    v_chapter.id,
    v_token,
    'APPROVE',
    '可以进入下一章',
    'phase5_tdd'
  );

  IF v_result.success IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'approve action did not succeed: %', v_result.result_code;
  END IF;

  IF v_result.chapter_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'approve returned wrong chapter_status: %', v_result.chapter_status;
  END IF;

  IF v_result.next_job_id IS NULL THEN
    RAISE EXCEPTION 'approve did not create next chapter job';
  END IF;

  IF v_result.activated_fact_count <> 2 THEN
    RAISE EXCEPTION 'approve activated wrong fact count: %', v_result.activated_fact_count;
  END IF;

  SELECT *
  INTO v_result
  FROM apply_novel_review_action(
    v_chapter.id,
    v_token,
    'APPROVE',
    '重复点击',
    'phase5_tdd'
  );

  IF v_result.success IS DISTINCT FROM FALSE
     OR v_result.result_code <> 'NO_MATCH_OR_INVALID_STATE' THEN
    RAISE EXCEPTION 'repeat approve should be rejected, got success %, code %',
      v_result.success,
      v_result.result_code;
  END IF;

  INSERT INTO novel_projects (title, genre, target_total_chapters, status)
  VALUES ('Phase5 TDD 重写', '都市逆袭', 3, 'REVIEWING')
  RETURNING id INTO v_rewrite_project_id;

  INSERT INTO novel_chapter_outlines (project_id, chapter_no, title, status)
  VALUES (v_rewrite_project_id, 1, '重写章', 'READY')
  RETURNING id INTO v_rewrite_outline_id;

  SELECT *
  INTO v_rewrite_chapter
  FROM create_novel_chapter_version(
    v_rewrite_project_id,
    v_rewrite_outline_id,
    NULL,
    1,
    '重写候选',
    '需要重写的正文',
    '摘要',
    900,
    'mock-model',
    'NEED_REVIEW',
    FALSE
  );

  v_rewrite_token := v_rewrite_chapter.review_token;

  SELECT *
  INTO v_result
  FROM apply_novel_review_action(
    v_rewrite_chapter.id,
    v_rewrite_token,
    'REQUEST_REWRITE',
    '冲突不够强',
    'phase5_tdd'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.chapter_status <> 'REWRITE_REQUESTED'
     OR v_result.rewrite_job_id IS NULL THEN
    RAISE EXCEPTION 'request rewrite failed: success %, status %, rewrite_job_id %',
      v_result.success,
      v_result.chapter_status,
      v_result.rewrite_job_id;
  END IF;

  INSERT INTO novel_projects (title, genre, target_total_chapters, status)
  VALUES ('Phase5 TDD 拒绝', '都市逆袭', 3, 'REVIEWING')
  RETURNING id INTO v_reject_project_id;

  INSERT INTO novel_chapter_outlines (project_id, chapter_no, title, status)
  VALUES (v_reject_project_id, 1, '拒绝章', 'READY')
  RETURNING id INTO v_reject_outline_id;

  SELECT *
  INTO v_reject_chapter
  FROM create_novel_chapter_version(
    v_reject_project_id,
    v_reject_outline_id,
    NULL,
    1,
    '拒绝候选',
    '不采用的正文',
    '摘要',
    900,
    'mock-model',
    'NEED_REVIEW',
    FALSE
  );

  v_reject_token := v_reject_chapter.review_token;

  SELECT *
  INTO v_result
  FROM apply_novel_review_action(
    v_reject_chapter.id,
    v_reject_token,
    'REJECT',
    '方向不符合',
    'phase5_tdd'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.chapter_status <> 'REJECTED' THEN
    RAISE EXCEPTION 'reject failed: success %, status %',
      v_result.success,
      v_result.chapter_status;
  END IF;

  SELECT *
  INTO v_result
  FROM apply_novel_review_action(
    v_reject_chapter.id,
    v_reject_token,
    'BAD_ACTION',
    '',
    'phase5_tdd'
  );

  IF v_result.success IS DISTINCT FROM FALSE
     OR v_result.result_code <> 'INVALID_ACTION' THEN
    RAISE EXCEPTION 'invalid action should be rejected, got success %, code %',
      v_result.success,
      v_result.result_code;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_chapters
    WHERE id = v_chapter.id
      AND status = 'APPROVED'
      AND is_current = TRUE
  ) THEN
    RAISE EXCEPTION 'approved chapter is not APPROVED + current';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM novel_chapters
    WHERE project_id = v_project_id
      AND chapter_no = 1
      AND id <> v_chapter.id
      AND is_current = TRUE
  ) THEN
    RAISE EXCEPTION 'another same-chapter version is still current';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_projects
    WHERE id = v_project_id
      AND status = 'WRITING'
      AND current_chapter_no = 1
  ) THEN
    RAISE EXCEPTION 'project did not move to WRITING/current_chapter_no=1';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_generation_jobs
    WHERE project_id = v_project_id
      AND job_type = 'PLAN_CHAPTER_DIRECTOR'
      AND chapter_no = 2
      AND status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'next chapter PLAN_CHAPTER_DIRECTOR(PENDING) job missing';
  END IF;

  INSERT INTO phase5_assert_state
  SELECT
    v_project_id AS project_id,
    v_chapter.id AS chapter_id,
    c.status AS chapter_status,
    c.is_current AS chapter_is_current,
    p.status AS project_status,
    p.current_chapter_no,
    COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'ACTIVE') AS activated_fact_count,
    COUNT(DISTINCT hr.id) FILTER (WHERE hr.action = 'APPROVE') AS human_approve_count,
    COUNT(DISTINCT j.id) FILTER (
      WHERE j.job_type = 'PLAN_CHAPTER_DIRECTOR'
        AND j.chapter_no = 2
        AND j.status = 'PENDING'
    ) AS next_chapter_job_count,
    (
      SELECT COUNT(*)
      FROM novel_generation_jobs
      WHERE project_id = v_rewrite_project_id
        AND job_type = 'REWRITE_CHAPTER'
        AND status = 'PENDING'
    ) AS rewrite_job_count,
    (
      SELECT COUNT(*)
      FROM novel_chapters
      WHERE project_id = v_reject_project_id
        AND status = 'REJECTED'
        AND is_current = FALSE
    ) AS rejected_candidate_count
  FROM novel_projects p
  JOIN novel_chapters c ON c.project_id = p.id
  LEFT JOIN novel_continuity_facts f ON f.chapter_id = c.id
  LEFT JOIN novel_human_reviews hr ON hr.chapter_id = c.id
  LEFT JOIN novel_generation_jobs j ON j.project_id = p.id
  WHERE p.id = v_project_id
    AND c.id = v_chapter.id
  GROUP BY p.id, c.id;

  RAISE NOTICE 'Phase 5 DB flow assertions passed for project %, chapter %',
    v_project_id,
    v_chapter.id;
END $$;

SELECT * FROM phase5_assert_state;

SELECT 'phase5_human_review_flow_passed' AS result;

ROLLBACK;
