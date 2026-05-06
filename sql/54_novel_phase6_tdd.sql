-- Phase 6 TDD: rewrite candidate, notification payload, and auto recovery rules.

BEGIN;

CREATE TEMP TABLE phase6_assert_state (
  project_id UUID,
  original_chapter_id UUID,
  rewritten_chapter_id UUID,
  original_status TEXT,
  rewritten_status TEXT,
  rewritten_is_current BOOLEAN,
  active_new_fact_count BIGINT,
  inactive_old_fact_count BIGINT,
  notify_succeeded_count BIGINT,
  notify_detail_link_count BIGINT,
  retry_job_pending_count BIGINT,
  failed_review_job_count BIGINT,
  failed_review_chapter_count BIGINT,
  failed_rewrite_job_count BIGINT,
  rewrite_original_still_requested_count BIGINT,
  repaired_next_job_count BIGINT,
  rewrite_payload_review_report_count BIGINT,
  rewrite_payload_review_issue_count BIGINT,
  rewrite_payload_review_suggestion_count BIGINT
) ON COMMIT DROP;

DO $$
DECLARE
  v_project_id UUID;
  v_outline_id UUID;
  v_original novel_chapters%ROWTYPE;
  v_rewritten novel_chapters%ROWTYPE;
  v_token TEXT;
  v_review_report_id UUID;
  v_rewrite_job_id UUID;
  v_notify_job_id UUID;
  v_review_fail_project_id UUID;
  v_review_fail_outline_id UUID;
  v_review_fail_chapter novel_chapters%ROWTYPE;
  v_review_fail_job_id UUID;
  v_rewrite_fail_project_id UUID;
  v_rewrite_fail_outline_id UUID;
  v_rewrite_fail_chapter novel_chapters%ROWTYPE;
  v_rewrite_fail_job_id UUID;
  v_retry_project_id UUID;
  v_retry_job_id UUID;
  v_repair_project_id UUID;
  v_dummy INTEGER;
BEGIN
  INSERT INTO novel_projects (
    title,
    genre,
    target_total_chapters,
    target_words_per_chapter,
    status
  )
  VALUES ('Phase6 TDD 重写主链路', '都市逆袭', 2, 1200, 'REVIEWING')
  RETURNING id INTO v_project_id;

  INSERT INTO novel_bibles (
    project_id,
    world_setting,
    story_core,
    main_character,
    generation_model
  )
  VALUES (
    v_project_id,
    '旧城传闻复苏',
    '主角追查父亲失踪',
    '{"name":"林昼"}'::jsonb,
    'mock-model'
  );

  INSERT INTO novel_chapter_outlines (
    project_id,
    chapter_no,
    title,
    summary,
    chapter_goal,
    status
  )
  VALUES (
    v_project_id,
    1,
    '第一章',
    '主角遇到抢表者',
    '强化冲突',
    'READY'
  )
  RETURNING id INTO v_outline_id;

  SELECT *
  INTO v_original
  FROM create_novel_chapter_version(
    v_project_id,
    v_outline_id,
    NULL,
    1,
    '第一章 原候选',
    '原候选正文',
    '原候选摘要',
    1000,
    'mock-model',
    'NEED_REVIEW',
    FALSE
  );

  v_token := v_original.review_token;

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
    v_original.id,
    72,
    '[{"type":"冲突","description":"开场冲突不够强","severity":"medium"}]'::jsonb,
    '["强化开头压迫感"]'::jsonb,
    'REWRITE'
  )
  RETURNING id INTO v_review_report_id;

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
    v_original.id,
    1,
    v_original.generation_version,
    'item',
    'old_watch',
    '旧版本怀表设定',
    'ai',
    'PENDING'
  );

  PERFORM *
  FROM apply_novel_review_action(
    v_original.id,
    v_token,
    'REQUEST_REWRITE',
    '请强化开头冲突',
    'phase6_tdd'
  );

  SELECT id
  INTO v_rewrite_job_id
  FROM novel_generation_jobs
  WHERE project_id = v_project_id
    AND chapter_id = v_original.id
    AND job_type = 'REWRITE_CHAPTER'
    AND status = 'PENDING'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_rewrite_job_id IS NULL THEN
    RAISE EXCEPTION 'request rewrite did not create REWRITE_CHAPTER job';
  END IF;

  SELECT *
  INTO v_rewritten
  FROM create_novel_chapter_version(
    v_project_id,
    v_outline_id,
    v_original.id,
    1,
    '第一章 重写候选',
    '重写候选正文',
    '重写候选摘要',
    1300,
    'mock-model',
    'DRAFT_READY',
    FALSE
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
    v_rewritten.id,
    1,
    v_rewritten.generation_version,
    'item',
    'new_watch',
    '新版本怀表设定',
    'ai',
    'PENDING'
  );

  UPDATE novel_generation_jobs
  SET status = 'SUCCEEDED', finished_at = NOW(), updated_at = NOW()
  WHERE id = v_rewrite_job_id;

  INSERT INTO novel_generation_jobs (
    project_id,
    chapter_id,
    job_type,
    chapter_no,
    status
  )
  VALUES (
    v_project_id,
    v_rewritten.id,
    'REVIEW_CHAPTER',
    1,
    'SUCCEEDED'
  );

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
    v_rewritten.id,
    88,
    '[]'::jsonb,
    '["可以通过"]'::jsonb,
    'PASS'
  );

  UPDATE novel_chapters
  SET status = 'NEED_REVIEW'
  WHERE id = v_rewritten.id;

  INSERT INTO novel_generation_jobs (
    project_id,
    chapter_id,
    job_type,
    chapter_no,
    payload,
    status
  )
  VALUES (
    v_project_id,
    v_rewritten.id,
    'NOTIFY_REVIEW',
    1,
    jsonb_build_object(
      'review_detail_url',
      'http://localhost:5678/webhook/novel-review-detail?chapter_id=' || v_rewritten.id::text || '&review_token=' || v_rewritten.review_token
    ),
    'SUCCEEDED'
  )
  RETURNING id INTO v_notify_job_id;

  PERFORM *
  FROM apply_novel_review_action(
    v_rewritten.id,
    v_rewritten.review_token,
    'APPROVE',
    '重写稿通过',
    'phase6_tdd'
  );

  INSERT INTO novel_projects (title, genre, target_total_chapters, status)
  VALUES ('Phase6 TDD REVIEW 失败', '都市逆袭', 2, 'REVIEWING')
  RETURNING id INTO v_review_fail_project_id;

  INSERT INTO novel_chapter_outlines (project_id, chapter_no, title, status)
  VALUES (v_review_fail_project_id, 1, '失败审稿章', 'READY')
  RETURNING id INTO v_review_fail_outline_id;

  SELECT *
  INTO v_review_fail_chapter
  FROM create_novel_chapter_version(
    v_review_fail_project_id,
    v_review_fail_outline_id,
    NULL,
    1,
    '失败审稿候选',
    '正文',
    '摘要',
    1000,
    'mock-model',
    'DRAFT_READY',
    FALSE
  );

  INSERT INTO novel_generation_jobs (
    project_id,
    chapter_id,
    job_type,
    chapter_no,
    status,
    attempt_count,
    max_attempts,
    started_at
  )
  VALUES (
    v_review_fail_project_id,
    v_review_fail_chapter.id,
    'REVIEW_CHAPTER',
    1,
    'RUNNING',
    3,
    3,
    NOW() - INTERVAL '30 minutes'
  )
  RETURNING id INTO v_review_fail_job_id;

  INSERT INTO novel_projects (title, genre, target_total_chapters, status)
  VALUES ('Phase6 TDD REWRITE 失败', '都市逆袭', 2, 'REVIEWING')
  RETURNING id INTO v_rewrite_fail_project_id;

  INSERT INTO novel_chapter_outlines (project_id, chapter_no, title, status)
  VALUES (v_rewrite_fail_project_id, 1, '失败重写章', 'READY')
  RETURNING id INTO v_rewrite_fail_outline_id;

  SELECT *
  INTO v_rewrite_fail_chapter
  FROM create_novel_chapter_version(
    v_rewrite_fail_project_id,
    v_rewrite_fail_outline_id,
    NULL,
    1,
    '失败重写原稿',
    '正文',
    '摘要',
    1000,
    'mock-model',
    'REWRITE_REQUESTED',
    FALSE
  );

  INSERT INTO novel_generation_jobs (
    project_id,
    chapter_id,
    job_type,
    chapter_no,
    status,
    attempt_count,
    max_attempts,
    started_at
  )
  VALUES (
    v_rewrite_fail_project_id,
    v_rewrite_fail_chapter.id,
    'REWRITE_CHAPTER',
    1,
    'RUNNING',
    3,
    3,
    NOW() - INTERVAL '30 minutes'
  )
  RETURNING id INTO v_rewrite_fail_job_id;

  INSERT INTO novel_projects (title, genre, target_total_chapters, status)
  VALUES ('Phase6 TDD 重试任务', '都市逆袭', 2, 'OUTLINE_READY')
  RETURNING id INTO v_retry_project_id;

  INSERT INTO novel_generation_jobs (
    project_id,
    job_type,
    chapter_no,
    status,
    attempt_count,
    max_attempts,
    started_at
  )
  VALUES (
    v_retry_project_id,
    'GENERATE_CHAPTER',
    1,
    'RUNNING',
    1,
    3,
    NOW() - INTERVAL '30 minutes'
  )
  RETURNING id INTO v_retry_job_id;

  INSERT INTO novel_projects (
    title,
    genre,
    target_total_chapters,
    current_chapter_no,
    status
  )
  VALUES (
    'Phase6 TDD 补下一章',
    '都市逆袭',
    2,
    1,
    'WRITING'
  )
  RETURNING id INTO v_repair_project_id;

  WITH stale AS (
    SELECT
      j.*,
      CASE
        WHEN j.job_type IN ('GENERATE_BIBLE', 'GENERATE_OUTLINE') THEN INTERVAL '10 minutes'
        ELSE INTERVAL '20 minutes'
      END AS stale_interval
    FROM novel_generation_jobs j
    WHERE j.status = 'RUNNING'
      AND j.started_at IS NOT NULL
      AND j.started_at < NOW() - CASE
        WHEN j.job_type IN ('GENERATE_BIBLE', 'GENERATE_OUTLINE') THEN INTERVAL '10 minutes'
        ELSE INTERVAL '20 minutes'
      END
    ORDER BY j.started_at ASC
    FOR UPDATE SKIP LOCKED
  ), recovered AS (
    UPDATE novel_generation_jobs j
    SET
      status = 'PENDING',
      error_message = COALESCE(j.error_message, '自动恢复：任务超时，重新排队'),
      started_at = NULL,
      updated_at = NOW()
    FROM stale st
    WHERE j.id = st.id
      AND st.attempt_count < st.max_attempts
    RETURNING j.*
  ), failed AS (
    UPDATE novel_generation_jobs j
    SET
      status = 'FAILED',
      error_message = '自动恢复：任务超时且达到最大重试次数',
      finished_at = NOW(),
      updated_at = NOW()
    FROM stale st
    WHERE j.id = st.id
      AND st.attempt_count >= st.max_attempts
    RETURNING j.*
  ), failed_review_chapters AS (
    UPDATE novel_chapters c
    SET
      status = 'FAILED',
      error = f.error_message
    FROM failed f
    WHERE c.id = f.chapter_id
      AND f.job_type = 'REVIEW_CHAPTER'
      AND c.status IN ('DRAFT_READY', 'AI_REVIEWED', 'NEED_REVIEW')
    RETURNING c.*
  )
  SELECT 1 INTO v_dummy;

  INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, status)
  SELECT
    p.id,
    'PLAN_CHAPTER_DIRECTOR',
    p.current_chapter_no + 1,
    'PENDING'
  FROM novel_projects p
  WHERE p.status = 'WRITING'
    AND p.current_chapter_no > 0
    AND p.current_chapter_no < p.target_total_chapters
    AND NOT EXISTS (
      SELECT 1
      FROM novel_generation_jobs j
      WHERE j.project_id = p.id
        AND j.job_type = 'PLAN_CHAPTER_DIRECTOR'
        AND j.chapter_no = p.current_chapter_no + 1
        AND j.status IN ('PENDING', 'RUNNING')
    )
  ON CONFLICT DO NOTHING;

  INSERT INTO phase6_assert_state
  SELECT
    v_project_id AS project_id,
    v_original.id AS original_chapter_id,
    v_rewritten.id AS rewritten_chapter_id,
    (SELECT status FROM novel_chapters WHERE id = v_original.id) AS original_status,
    (SELECT status FROM novel_chapters WHERE id = v_rewritten.id) AS rewritten_status,
    (SELECT is_current FROM novel_chapters WHERE id = v_rewritten.id) AS rewritten_is_current,
    (
      SELECT COUNT(*)
      FROM novel_continuity_facts
      WHERE chapter_id = v_rewritten.id
        AND status = 'ACTIVE'
    ) AS active_new_fact_count,
    (
      SELECT COUNT(*)
      FROM novel_continuity_facts
      WHERE chapter_id = v_original.id
        AND status = 'INACTIVE'
    ) AS inactive_old_fact_count,
    (
      SELECT COUNT(*)
      FROM novel_generation_jobs
      WHERE id = v_notify_job_id
        AND status = 'SUCCEEDED'
    ) AS notify_succeeded_count,
    (
      SELECT COUNT(*)
      FROM novel_generation_jobs
      WHERE id = v_notify_job_id
        AND payload->>'review_detail_url' LIKE '%/webhook/novel-review-detail%'
        AND payload::text NOT LIKE '%action=approve%'
        AND payload::text NOT LIKE '%action=reject%'
    ) AS notify_detail_link_count,
    (
      SELECT COUNT(*)
      FROM novel_generation_jobs
      WHERE id = v_retry_job_id
        AND status = 'PENDING'
    ) AS retry_job_pending_count,
    (
      SELECT COUNT(*)
      FROM novel_generation_jobs
      WHERE id = v_review_fail_job_id
        AND status = 'FAILED'
    ) AS failed_review_job_count,
    (
      SELECT COUNT(*)
      FROM novel_chapters
      WHERE id = v_review_fail_chapter.id
        AND status = 'FAILED'
    ) AS failed_review_chapter_count,
    (
      SELECT COUNT(*)
      FROM novel_generation_jobs
      WHERE id = v_rewrite_fail_job_id
        AND status = 'FAILED'
    ) AS failed_rewrite_job_count,
    (
      SELECT COUNT(*)
      FROM novel_chapters
      WHERE id = v_rewrite_fail_chapter.id
        AND status = 'REWRITE_REQUESTED'
    ) AS rewrite_original_still_requested_count,
    (
      SELECT COUNT(*)
      FROM novel_generation_jobs
      WHERE project_id = v_repair_project_id
        AND job_type = 'PLAN_CHAPTER_DIRECTOR'
        AND chapter_no = 2
        AND status = 'PENDING'
    ) AS repaired_next_job_count,
    (
      SELECT COUNT(*)
      FROM novel_generation_jobs
      WHERE id = v_rewrite_job_id
        AND payload->>'review_report_id' = v_review_report_id::text
    ) AS rewrite_payload_review_report_count,
    (
      SELECT COALESCE(jsonb_array_length(payload->'review_issues'), 0)
      FROM novel_generation_jobs
      WHERE id = v_rewrite_job_id
    ) AS rewrite_payload_review_issue_count,
    (
      SELECT COALESCE(jsonb_array_length(payload->'review_suggestions'), 0)
      FROM novel_generation_jobs
      WHERE id = v_rewrite_job_id
    ) AS rewrite_payload_review_suggestion_count;

  IF EXISTS (
    SELECT 1
    FROM phase6_assert_state
    WHERE original_status <> 'REWRITE_REQUESTED'
      OR rewritten_status <> 'APPROVED'
      OR rewritten_is_current IS DISTINCT FROM TRUE
      OR active_new_fact_count <> 1
      OR inactive_old_fact_count <> 1
      OR notify_succeeded_count <> 1
      OR notify_detail_link_count <> 1
      OR retry_job_pending_count <> 1
      OR failed_review_job_count <> 1
      OR failed_review_chapter_count <> 1
      OR failed_rewrite_job_count <> 1
      OR rewrite_original_still_requested_count <> 1
      OR repaired_next_job_count <> 1
      OR rewrite_payload_review_report_count <> 1
      OR rewrite_payload_review_issue_count <> 1
      OR rewrite_payload_review_suggestion_count <> 1
  ) THEN
    RAISE EXCEPTION 'phase6 assertions failed: %',
      (SELECT row_to_json(phase6_assert_state) FROM phase6_assert_state LIMIT 1);
  END IF;

  RAISE NOTICE 'Phase 6 DB flow assertions passed for project %, rewritten chapter %',
    v_project_id,
    v_rewritten.id;
END $$;

SELECT * FROM phase6_assert_state;

SELECT 'phase6_rewrite_notify_recovery_flow_passed' AS result;

ROLLBACK;
