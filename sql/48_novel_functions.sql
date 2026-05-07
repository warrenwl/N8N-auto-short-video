-- Novel workflow V1 database functions.
-- Run after sql/47_novel_schema.sql.

CREATE OR REPLACE FUNCTION normalize_novel_chapter_title(
  p_title TEXT,
  p_fallback TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_title TEXT := btrim(COALESCE(p_title, ''));
  v_fallback TEXT := btrim(COALESCE(p_fallback, ''));
  v_cleaned TEXT;
BEGIN
  IF v_title = '' THEN
    RETURN NULLIF(v_fallback, '');
  END IF;

  v_cleaned := btrim(regexp_replace(
    v_title,
    '^\s*第\s*([0-9０-９]+|[一二三四五六七八九十百千万零〇两]+|[Xx]+)\s*章\s*[：:、，,.．。-]?\s*',
    ''
  ));

  RETURN COALESCE(NULLIF(v_cleaned, ''), NULLIF(v_fallback, ''), v_title);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION create_novel_chapter_version(
  p_project_id UUID,
  p_outline_id UUID,
  p_parent_chapter_id UUID,
  p_chapter_no INTEGER,
  p_title TEXT,
  p_body TEXT,
  p_summary TEXT,
  p_word_count INTEGER,
  p_ai_model TEXT,
  p_status TEXT DEFAULT 'DRAFT_READY',
  p_make_current BOOLEAN DEFAULT FALSE
)
RETURNS novel_chapters AS $$
DECLARE
  v_version INTEGER;
  v_row novel_chapters%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_project_id::text), p_chapter_no);

  SELECT COALESCE(MAX(generation_version), 0) + 1
  INTO v_version
  FROM novel_chapters
  WHERE project_id = p_project_id
    AND chapter_no = p_chapter_no;

  IF p_make_current THEN
    UPDATE novel_chapters
    SET is_current = FALSE
    WHERE project_id = p_project_id
      AND chapter_no = p_chapter_no
      AND is_current = TRUE;
  END IF;

  INSERT INTO novel_chapters (
    project_id,
    outline_id,
    parent_chapter_id,
    chapter_no,
    title,
    body,
    summary,
    word_count,
    status,
    ai_model,
    generation_version,
    is_current
  )
  VALUES (
    p_project_id,
    p_outline_id,
    p_parent_chapter_id,
    p_chapter_no,
    normalize_novel_chapter_title(p_title, p_title),
    p_body,
    p_summary,
    COALESCE(p_word_count, 0),
    p_status,
    p_ai_model,
    v_version,
    p_make_current
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION upsert_novel_daily_report_snapshot(
  p_report_date DATE DEFAULT CURRENT_DATE,
  p_note TEXT DEFAULT NULL
)
RETURNS novel_daily_report_snapshots AS $$
DECLARE
  v_row novel_daily_report_snapshots%ROWTYPE;
BEGIN
  WITH bounds AS (
    SELECT
      p_report_date::date AS report_date,
      p_report_date::timestamptz AS day_start,
      (p_report_date::timestamptz + interval '1 day') AS day_end
  ), job_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(j.finished_at, j.updated_at, j.created_at) >= b.day_start AND COALESCE(j.finished_at, j.updated_at, j.created_at) < b.day_end)::integer AS today_job_total_count,
      COUNT(*) FILTER (WHERE j.status = 'SUCCEEDED' AND COALESCE(j.finished_at, j.updated_at, j.created_at) >= b.day_start AND COALESCE(j.finished_at, j.updated_at, j.created_at) < b.day_end)::integer AS today_job_succeeded_count,
      COUNT(*) FILTER (WHERE j.status = 'FAILED' AND COALESCE(j.finished_at, j.updated_at, j.created_at) >= b.day_start AND COALESCE(j.finished_at, j.updated_at, j.created_at) < b.day_end)::integer AS today_job_failed_count,
      COUNT(*) FILTER (WHERE j.status = 'CANCELLED' AND COALESCE(j.finished_at, j.updated_at, j.created_at) >= b.day_start AND COALESCE(j.finished_at, j.updated_at, j.created_at) < b.day_end)::integer AS today_job_cancelled_count,
      COUNT(*) FILTER (WHERE j.status = 'PENDING')::integer AS waiting_job_count,
      COUNT(*) FILTER (WHERE j.status = 'RUNNING')::integer AS running_job_count,
      COUNT(*) FILTER (WHERE j.status = 'FAILED')::integer AS failed_job_count
    FROM novel_generation_jobs j
    CROSS JOIN bounds b
  ), ai_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE ai.created_at >= b.day_start AND ai.created_at < b.day_end)::integer AS today_ai_run_count,
      COUNT(*) FILTER (WHERE ai.success = TRUE AND ai.created_at >= b.day_start AND ai.created_at < b.day_end)::integer AS today_ai_success_count,
      COUNT(*) FILTER (WHERE ai.success = FALSE AND ai.created_at >= b.day_start AND ai.created_at < b.day_end)::integer AS today_ai_failed_count,
      COALESCE(ROUND(AVG(ai.duration_ms) FILTER (WHERE ai.created_at >= b.day_start AND ai.created_at < b.day_end)), 0)::integer AS avg_ai_duration_ms,
      COALESCE(MAX(ai.duration_ms) FILTER (WHERE ai.created_at >= b.day_start AND ai.created_at < b.day_end), 0)::integer AS max_ai_duration_ms
    FROM novel_ai_runs ai
    CROSS JOIN bounds b
  ), chapter_stats AS (
    SELECT
      COUNT(*) FILTER (
        WHERE c.status = 'NEED_REVIEW'
          AND NOT EXISTS (
            SELECT 1
            FROM novel_chapter_outlines o
            WHERE o.id = c.outline_id
              AND c.created_at < o.updated_at
          )
      )::integer AS need_review_count
    FROM novel_chapters c
  ), project_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE p.status IN ('CREATED', 'BIBLE_READY', 'OUTLINE_READY', 'WRITING', 'REVIEWING'))::integer AS active_project_count,
      COUNT(*) FILTER (WHERE p.status = 'COMPLETED')::integer AS completed_project_count
    FROM novel_projects p
  ), latest_failed AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'project_title', x.project_title,
      'chapter_no', x.chapter_no,
      'chapter_title', x.chapter_title,
      'job_type', x.job_type,
      'status', x.status,
      'error_message', x.error_message,
      'updated_at', x.updated_at
    ) ORDER BY x.updated_at DESC), '[]'::jsonb) AS latest_failed_jobs
    FROM (
      SELECT
        p.title AS project_title,
        COALESCE(j.chapter_no, c.chapter_no) AS chapter_no,
        c.title AS chapter_title,
        j.job_type,
        j.status,
        j.error_message,
        j.updated_at
      FROM novel_generation_jobs j
      JOIN novel_projects p ON p.id = j.project_id
      LEFT JOIN novel_chapters c ON c.id = j.chapter_id
      WHERE j.status = 'FAILED'
      ORDER BY j.updated_at DESC, j.created_at DESC
      LIMIT 8
    ) x
  ), slow_runs AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'project_title', x.project_title,
      'chapter_no', x.chapter_no,
      'run_type', x.run_type,
      'success', x.success,
      'duration_ms', x.duration_ms,
      'created_at', x.created_at
    ) ORDER BY x.duration_ms DESC NULLS LAST, x.created_at DESC), '[]'::jsonb) AS slow_ai_runs
    FROM (
      SELECT
        p.title AS project_title,
        c.chapter_no,
        ai.run_type,
        ai.success,
        ai.duration_ms,
        ai.created_at
      FROM novel_ai_runs ai
      LEFT JOIN novel_projects p ON p.id = ai.project_id
      LEFT JOIN novel_chapters c ON c.id = ai.chapter_id
      CROSS JOIN bounds b
      WHERE ai.created_at >= b.day_start
        AND ai.created_at < b.day_end
      ORDER BY ai.duration_ms DESC NULLS LAST, ai.created_at DESC
      LIMIT 8
    ) x
  ), snapshot_input AS (
    SELECT
      (SELECT report_date FROM bounds) AS report_date,
      job_stats.today_job_total_count,
      job_stats.today_job_succeeded_count,
      job_stats.today_job_failed_count,
      job_stats.today_job_cancelled_count,
      ai_stats.today_ai_run_count,
      ai_stats.today_ai_success_count,
      ai_stats.today_ai_failed_count,
      ai_stats.avg_ai_duration_ms,
      ai_stats.max_ai_duration_ms,
      job_stats.waiting_job_count,
      job_stats.running_job_count,
      job_stats.failed_job_count,
      chapter_stats.need_review_count,
      project_stats.active_project_count,
      project_stats.completed_project_count,
      latest_failed.latest_failed_jobs,
      slow_runs.slow_ai_runs
    FROM job_stats, ai_stats, chapter_stats, project_stats, latest_failed, slow_runs
  )
  INSERT INTO novel_daily_report_snapshots (
    report_date,
    captured_at,
    today_job_total_count,
    today_job_succeeded_count,
    today_job_failed_count,
    today_job_cancelled_count,
    today_ai_run_count,
    today_ai_success_count,
    today_ai_failed_count,
    avg_ai_duration_ms,
    max_ai_duration_ms,
    waiting_job_count,
    running_job_count,
    failed_job_count,
    need_review_count,
    active_project_count,
    completed_project_count,
    latest_failed_jobs,
    slow_ai_runs,
    note
  )
  SELECT
    report_date,
    NOW(),
    today_job_total_count,
    today_job_succeeded_count,
    today_job_failed_count,
    today_job_cancelled_count,
    today_ai_run_count,
    today_ai_success_count,
    today_ai_failed_count,
    avg_ai_duration_ms,
    max_ai_duration_ms,
    waiting_job_count,
    running_job_count,
    failed_job_count,
    need_review_count,
    active_project_count,
    completed_project_count,
    latest_failed_jobs,
    slow_ai_runs,
    NULLIF(p_note, '')
  FROM snapshot_input
  ON CONFLICT (report_date) DO UPDATE
  SET
    captured_at = EXCLUDED.captured_at,
    today_job_total_count = EXCLUDED.today_job_total_count,
    today_job_succeeded_count = EXCLUDED.today_job_succeeded_count,
    today_job_failed_count = EXCLUDED.today_job_failed_count,
    today_job_cancelled_count = EXCLUDED.today_job_cancelled_count,
    today_ai_run_count = EXCLUDED.today_ai_run_count,
    today_ai_success_count = EXCLUDED.today_ai_success_count,
    today_ai_failed_count = EXCLUDED.today_ai_failed_count,
    avg_ai_duration_ms = EXCLUDED.avg_ai_duration_ms,
    max_ai_duration_ms = EXCLUDED.max_ai_duration_ms,
    waiting_job_count = EXCLUDED.waiting_job_count,
    running_job_count = EXCLUDED.running_job_count,
    failed_job_count = EXCLUDED.failed_job_count,
    need_review_count = EXCLUDED.need_review_count,
    active_project_count = EXCLUDED.active_project_count,
    completed_project_count = EXCLUDED.completed_project_count,
    latest_failed_jobs = EXCLUDED.latest_failed_jobs,
    slow_ai_runs = EXCLUDED.slow_ai_runs,
    note = EXCLUDED.note
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION approve_novel_chapter(
  p_chapter_id UUID,
  p_review_token TEXT,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  chapter_id UUID,
  project_id UUID,
  chapter_no INTEGER,
  chapter_status TEXT,
  project_status TEXT,
  next_job_id UUID,
  activated_fact_count BIGINT,
  inactivated_fact_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT *
    FROM novel_chapters
    WHERE id = p_chapter_id
      AND review_token = p_review_token
      AND status = 'NEED_REVIEW'
      AND NOT EXISTS (
        SELECT 1
        FROM novel_chapter_outlines o
        WHERE o.id = novel_chapters.outline_id
          AND novel_chapters.created_at < o.updated_at
      )
    FOR UPDATE
  ), disable_current AS (
    UPDATE novel_chapters c
    SET is_current = FALSE
    FROM candidate a
    WHERE c.project_id = a.project_id
      AND c.chapter_no = a.chapter_no
      AND c.id <> a.id
      AND c.is_current = TRUE
    RETURNING c.*
  ), disable_current_count AS (
    SELECT COUNT(*) AS disabled_count
    FROM disable_current
  ), approved AS (
    UPDATE novel_chapters c
    SET
      status = 'APPROVED',
      is_current = TRUE
    FROM candidate a
    CROSS JOIN disable_current_count
    WHERE c.id = a.id
    RETURNING c.*
	  ), human_review AS (
	    INSERT INTO novel_human_reviews (
      project_id,
      chapter_id,
      action,
      comment,
      reviewer
    )
    SELECT
      a.project_id,
      a.id,
      'APPROVE',
      NULLIF(p_comment, ''),
      COALESCE(NULLIF(p_reviewer, ''), 'local_user')
    FROM approved a
    RETURNING *
  ), cancelled_review_reminders AS (
    UPDATE novel_generation_jobs j
    SET
      status = 'CANCELLED',
      error_message = COALESCE(j.error_message, '人工审核已通过，取消待发送审核提醒任务'),
      finished_at = COALESCE(j.finished_at, NOW()),
      updated_at = NOW()
    FROM approved a
    WHERE j.chapter_id = a.id
      AND j.job_type = 'NOTIFY_REVIEW'
      AND j.status IN ('PENDING', 'RUNNING')
    RETURNING j.*
  ), inactive_old_facts AS (
    UPDATE novel_continuity_facts f
    SET status = 'INACTIVE'
    FROM approved a
    WHERE f.project_id = a.project_id
      AND f.chapter_no = a.chapter_no
      AND f.chapter_id IS DISTINCT FROM a.id
      AND f.source = 'ai'
      AND f.status IN ('ACTIVE', 'PENDING')
    RETURNING f.*
  ), active_new_facts AS (
    UPDATE novel_continuity_facts f
    SET status = 'ACTIVE'
    FROM approved a
    WHERE f.chapter_id = a.id
      AND f.source = 'ai'
      AND f.status = 'PENDING'
    RETURNING f.*
  ), advanced_plot_threads AS (
    UPDATE novel_plot_threads t
    SET
      status = CASE
        WHEN t.status = 'PAYOFF_READY' THEN 'PAID_OFF'
        WHEN t.status IN ('SEEDING', 'TOUCHING') THEN 'ACTIVE'
        ELSE t.status
      END,
      updated_at = NOW()
    FROM approved a
    WHERE t.project_id = a.project_id
      AND t.last_touched_chapter = a.chapter_no
      AND t.status IN ('SEEDING', 'TOUCHING', 'PAYOFF_READY')
    RETURNING t.*
  ), updated_project AS (
    UPDATE novel_projects p
    SET
      current_chapter_no = GREATEST(p.current_chapter_no, a.chapter_no),
      status = CASE
        WHEN a.chapter_no >= p.target_total_chapters THEN 'COMPLETED'
        ELSE 'WRITING'
      END
    FROM approved a
    WHERE p.id = a.project_id
    RETURNING p.*, a.chapter_no AS approved_chapter_no
  ), next_job AS (
    INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, status)
    SELECT
      up.id,
      'PLAN_CHAPTER_DIRECTOR',
      up.approved_chapter_no + 1,
      'PENDING'
    FROM updated_project up
    WHERE up.approved_chapter_no < up.target_total_chapters
    ON CONFLICT DO NOTHING
    RETURNING *
  )
  SELECT
    a.id AS chapter_id,
    a.project_id,
    a.chapter_no,
    a.status AS chapter_status,
    (SELECT up.status FROM updated_project up LIMIT 1) AS project_status,
    (SELECT nj.id FROM next_job nj LIMIT 1) AS next_job_id,
    (SELECT COUNT(*) FROM active_new_facts) AS activated_fact_count,
    (SELECT COUNT(*) FROM inactive_old_facts) AS inactivated_fact_count
  FROM approved a;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION request_novel_chapter_rewrite(
  p_chapter_id UUID,
  p_review_token TEXT,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  chapter_id UUID,
  project_id UUID,
  chapter_no INTEGER,
  chapter_status TEXT,
  rewrite_job_id UUID
) AS $$
BEGIN
  RETURN QUERY
  WITH requested AS (
    UPDATE novel_chapters
    SET status = 'REWRITE_REQUESTED'
    WHERE id = p_chapter_id
      AND review_token = p_review_token
      AND status = 'NEED_REVIEW'
      AND NOT EXISTS (
        SELECT 1
        FROM novel_chapter_outlines o
        WHERE o.id = novel_chapters.outline_id
          AND novel_chapters.created_at < o.updated_at
      )
    RETURNING *
  ), human_review AS (
    INSERT INTO novel_human_reviews (
      project_id,
      chapter_id,
      action,
      comment,
      reviewer
    )
    SELECT
      r.project_id,
      r.id,
      'REQUEST_REWRITE',
      NULLIF(p_comment, ''),
      COALESCE(NULLIF(p_reviewer, ''), 'local_user')
    FROM requested r
    RETURNING *
  ), cancelled_review_reminders AS (
    UPDATE novel_generation_jobs j
    SET
      status = 'CANCELLED',
      error_message = COALESCE(j.error_message, '人工要求重写，取消待发送审核提醒任务'),
      finished_at = COALESCE(j.finished_at, NOW()),
      updated_at = NOW()
    FROM requested r
    WHERE j.chapter_id = r.id
      AND j.job_type = 'NOTIFY_REVIEW'
      AND j.status IN ('PENDING', 'RUNNING')
    RETURNING j.*
  ), updated_project AS (
    UPDATE novel_projects p
    SET
      status = 'WRITING',
      updated_at = NOW()
    FROM requested r
    WHERE p.id = r.project_id
      AND p.status = 'REVIEWING'
      AND NOT EXISTS (
        SELECT 1
        FROM novel_chapters pending
        WHERE pending.project_id = r.project_id
          AND pending.id <> r.id
          AND pending.status = 'NEED_REVIEW'
      )
    RETURNING p.*
	  ), latest_review_report AS (
	    SELECT rr.*
	    FROM novel_review_reports rr
	    JOIN requested r ON r.id = rr.chapter_id
	    ORDER BY rr.created_at DESC
	    LIMIT 1
	  ), rewrite_job AS (
	    INSERT INTO novel_generation_jobs (
      project_id,
      chapter_id,
      job_type,
      chapter_no,
      payload,
      status
    )
    SELECT
      r.project_id,
      r.id,
      'REWRITE_CHAPTER',
	      r.chapter_no,
	      jsonb_build_object(
	        'human_review_id', (SELECT hr.id FROM human_review hr LIMIT 1),
	        'review_report_id', (SELECT rr.id FROM latest_review_report rr LIMIT 1),
	        'review_issues', COALESCE((SELECT rr.issues FROM latest_review_report rr LIMIT 1), '[]'::jsonb),
	        'review_suggestions', COALESCE((SELECT rr.suggestions FROM latest_review_report rr LIMIT 1), '[]'::jsonb),
	        'comment', NULLIF(p_comment, '')
	      ),
      'PENDING'
    FROM requested r
    ON CONFLICT DO NOTHING
    RETURNING *
  )
  SELECT
    r.id AS chapter_id,
    r.project_id,
    r.chapter_no,
    r.status AS chapter_status,
    (SELECT rj.id FROM rewrite_job rj LIMIT 1) AS rewrite_job_id
  FROM requested r;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reject_novel_chapter(
  p_chapter_id UUID,
  p_review_token TEXT,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  chapter_id UUID,
  project_id UUID,
  chapter_no INTEGER,
  chapter_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH rejected AS (
    UPDATE novel_chapters
    SET
      status = 'REJECTED',
      is_current = FALSE
    WHERE id = p_chapter_id
      AND review_token = p_review_token
      AND status = 'NEED_REVIEW'
      AND NOT EXISTS (
        SELECT 1
        FROM novel_chapter_outlines o
        WHERE o.id = novel_chapters.outline_id
          AND novel_chapters.created_at < o.updated_at
      )
    RETURNING *
  ), human_review AS (
    INSERT INTO novel_human_reviews (
      project_id,
      chapter_id,
      action,
      comment,
      reviewer
    )
    SELECT
      r.project_id,
      r.id,
      'REJECT',
      NULLIF(p_comment, ''),
      COALESCE(NULLIF(p_reviewer, ''), 'local_user')
    FROM rejected r
    RETURNING *
  ), cancelled_review_reminders AS (
    UPDATE novel_generation_jobs j
    SET
      status = 'CANCELLED',
      error_message = COALESCE(j.error_message, '人工拒绝候选稿，取消待发送审核提醒任务'),
      finished_at = COALESCE(j.finished_at, NOW()),
      updated_at = NOW()
    FROM rejected r
    WHERE j.chapter_id = r.id
      AND j.job_type = 'NOTIFY_REVIEW'
      AND j.status IN ('PENDING', 'RUNNING')
    RETURNING j.*
  ), updated_project AS (
    UPDATE novel_projects p
    SET
      status = 'WRITING',
      updated_at = NOW()
    FROM rejected r
    WHERE p.id = r.project_id
      AND p.status = 'REVIEWING'
      AND NOT EXISTS (
        SELECT 1
        FROM novel_chapters pending
        WHERE pending.project_id = r.project_id
          AND pending.id <> r.id
          AND pending.status = 'NEED_REVIEW'
      )
    RETURNING p.*
  ), retry_director_job AS (
    INSERT INTO novel_generation_jobs (
      project_id,
      job_type,
      chapter_no,
      payload,
      status
    )
    SELECT
      r.project_id,
      'PLAN_CHAPTER_DIRECTOR',
      r.chapter_no,
      jsonb_build_object(
        'trigger_source', 'chapter_rejected_retry',
        'requested_by', COALESCE(NULLIF(p_reviewer, ''), 'local_user'),
        'comment', NULLIF(p_comment, ''),
        'rejected_chapter_id', r.id
      ),
      'PENDING'
    FROM rejected r
    WHERE NOT EXISTS (
        SELECT 1
        FROM novel_chapters pending
        WHERE pending.project_id = r.project_id
          AND pending.id <> r.id
          AND pending.status = 'NEED_REVIEW'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM novel_generation_jobs active
        WHERE active.project_id = r.project_id
          AND active.chapter_no = r.chapter_no
          AND active.job_type IN ('PLAN_CHAPTER_DIRECTOR', 'GENERATE_CHAPTER', 'REVIEW_CHAPTER', 'REWRITE_CHAPTER')
          AND active.status IN ('PENDING', 'RUNNING')
      )
    ON CONFLICT DO NOTHING
    RETURNING *
  )
  SELECT
    r.id AS chapter_id,
    r.project_id,
    r.chapter_no,
    r.status AS chapter_status
  FROM rejected r;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION apply_novel_review_action(
  p_chapter_id UUID,
  p_review_token TEXT,
  p_action TEXT,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  success BOOLEAN,
  result_code TEXT,
  action TEXT,
  chapter_id UUID,
  project_id UUID,
  chapter_no INTEGER,
  chapter_status TEXT,
  project_status TEXT,
  next_job_id UUID,
  rewrite_job_id UUID,
  activated_fact_count BIGINT,
  inactivated_fact_count BIGINT
) AS $$
DECLARE
  v_action TEXT := UPPER(TRIM(COALESCE(p_action, '')));
BEGIN
  IF v_action = 'APPROVE' THEN
    RETURN QUERY
    SELECT
      TRUE AS success,
      'APPROVED'::text AS result_code,
      v_action AS action,
      approved.chapter_id,
      approved.project_id,
      approved.chapter_no,
      approved.chapter_status,
      approved.project_status,
      approved.next_job_id,
      NULL::uuid AS rewrite_job_id,
      approved.activated_fact_count,
      approved.inactivated_fact_count
    FROM approve_novel_chapter(
      p_chapter_id,
      p_review_token,
      p_comment,
      p_reviewer
    ) approved;

    IF NOT FOUND THEN
      RETURN QUERY
      SELECT
        FALSE,
        'NO_MATCH_OR_INVALID_STATE'::text,
        v_action,
        p_chapter_id,
        NULL::uuid,
        NULL::integer,
        NULL::text,
        NULL::text,
        NULL::uuid,
        NULL::uuid,
        0::bigint,
        0::bigint;
    END IF;

    RETURN;
  END IF;

  IF v_action = 'REQUEST_REWRITE' THEN
    RETURN QUERY
    SELECT
      TRUE AS success,
      'REWRITE_REQUESTED'::text AS result_code,
      v_action AS action,
      requested.chapter_id,
      requested.project_id,
      requested.chapter_no,
      requested.chapter_status,
      NULL::text AS project_status,
      NULL::uuid AS next_job_id,
      requested.rewrite_job_id,
      0::bigint AS activated_fact_count,
      0::bigint AS inactivated_fact_count
    FROM request_novel_chapter_rewrite(
      p_chapter_id,
      p_review_token,
      p_comment,
      p_reviewer
    ) requested;

    IF NOT FOUND THEN
      RETURN QUERY
      SELECT
        FALSE,
        'NO_MATCH_OR_INVALID_STATE'::text,
        v_action,
        p_chapter_id,
        NULL::uuid,
        NULL::integer,
        NULL::text,
        NULL::text,
        NULL::uuid,
        NULL::uuid,
        0::bigint,
        0::bigint;
    END IF;

    RETURN;
  END IF;

  IF v_action = 'REJECT' THEN
    RETURN QUERY
    SELECT
      TRUE AS success,
      'REJECTED'::text AS result_code,
      v_action AS action,
      rejected.chapter_id,
      rejected.project_id,
      rejected.chapter_no,
      rejected.chapter_status,
      (SELECT p.status FROM novel_projects p WHERE p.id = rejected.project_id) AS project_status,
      (
        SELECT j.id
        FROM novel_generation_jobs j
        WHERE j.project_id = rejected.project_id
          AND j.chapter_no = rejected.chapter_no
          AND j.job_type = 'PLAN_CHAPTER_DIRECTOR'
          AND j.status IN ('PENDING', 'RUNNING')
        ORDER BY j.created_at DESC
        LIMIT 1
      ) AS next_job_id,
      NULL::uuid AS rewrite_job_id,
      0::bigint AS activated_fact_count,
      0::bigint AS inactivated_fact_count
    FROM reject_novel_chapter(
      p_chapter_id,
      p_review_token,
      p_comment,
      p_reviewer
    ) rejected;

    IF NOT FOUND THEN
      RETURN QUERY
      SELECT
        FALSE,
        'NO_MATCH_OR_INVALID_STATE'::text,
        v_action,
        p_chapter_id,
        NULL::uuid,
        NULL::integer,
        NULL::text,
        NULL::text,
        NULL::uuid,
        NULL::uuid,
        0::bigint,
        0::bigint;
    END IF;

    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    FALSE,
    'INVALID_ACTION'::text,
    v_action,
    p_chapter_id,
    NULL::uuid,
    NULL::integer,
    NULL::text,
    NULL::text,
    NULL::uuid,
    NULL::uuid,
    0::bigint,
    0::bigint;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION continue_novel_project(
  p_project_id UUID,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  success BOOLEAN,
  result_code TEXT,
  action TEXT,
  project_id UUID,
  project_status TEXT,
  job_type TEXT,
  chapter_no INTEGER,
  job_id UUID,
  message TEXT
) AS $$
DECLARE
  v_project novel_projects%ROWTYPE;
  v_need_review_count INTEGER;
  v_active_job_count INTEGER;
  v_failed_job_count INTEGER;
  v_bible_count INTEGER;
  v_outline_count INTEGER;
  v_max_current_chapter_no INTEGER;
  v_next_chapter_no INTEGER;
  v_rejected_retry_chapter_id UUID;
  v_job novel_generation_jobs%ROWTYPE;
BEGIN
  SELECT *
  INTO v_project
  FROM novel_projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_NOT_FOUND'::text,
      'CONTINUE_PROJECT'::text,
      p_project_id,
      NULL::text,
      NULL::text,
      NULL::integer,
      NULL::uuid,
      '项目不存在'::text;
    RETURN;
  END IF;

  IF v_project.status = 'ARCHIVED' THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_ARCHIVED'::text,
      'CONTINUE_PROJECT'::text,
      v_project.id,
      v_project.status,
      NULL::text,
      NULL::integer,
      NULL::uuid,
      '项目已归档，请先恢复项目再继续写作。'::text;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_need_review_count
  FROM novel_chapters c
  WHERE c.project_id = p_project_id
    AND c.status = 'NEED_REVIEW'
    AND NOT EXISTS (
      SELECT 1
      FROM novel_chapter_outlines o
      WHERE o.id = c.outline_id
        AND c.created_at < o.updated_at
    );

  SELECT COUNT(*)::integer
  INTO v_active_job_count
  FROM novel_generation_jobs j
  WHERE j.project_id = p_project_id
    AND j.status IN ('PENDING', 'RUNNING');

  SELECT COUNT(*)::integer
  INTO v_failed_job_count
  FROM novel_generation_jobs j
  WHERE j.project_id = p_project_id
    AND j.status = 'FAILED';

  IF v_need_review_count > 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'NEED_REVIEW_BLOCKED'::text,
      'CONTINUE_PROJECT'::text,
      v_project.id,
      v_project.status,
      NULL::text,
      NULL::integer,
      NULL::uuid,
      format('还有 %s 个章节待人工审核，请先处理审核。', v_need_review_count)::text;
    RETURN;
  END IF;

  IF v_active_job_count > 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'ACTIVE_JOB_BLOCKED'::text,
      'CONTINUE_PROJECT'::text,
      v_project.id,
      v_project.status,
      NULL::text,
      NULL::integer,
      NULL::uuid,
      format('还有 %s 个任务在队列中或运行中，请先等待队列推进。', v_active_job_count)::text;
    RETURN;
  END IF;

  IF v_failed_job_count > 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'FAILED_JOB_BLOCKED'::text,
      'CONTINUE_PROJECT'::text,
      v_project.id,
      v_project.status,
      NULL::text,
      NULL::integer,
      NULL::uuid,
      format('还有 %s 个失败任务，请先查看队列异常。', v_failed_job_count)::text;
    RETURN;
  END IF;

  IF v_project.status = 'PAUSED' THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_PAUSED'::text,
      'CONTINUE_PROJECT'::text,
      v_project.id,
      v_project.status,
      NULL::text,
      NULL::integer,
      NULL::uuid,
      '项目已暂停，暂不继续写作。'::text;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_bible_count
  FROM novel_bibles b
  WHERE b.project_id = p_project_id;

  IF v_bible_count = 0 THEN
    INSERT INTO novel_generation_jobs (project_id, job_type, status, payload)
    VALUES (
      p_project_id,
      'GENERATE_BIBLE',
      'PENDING',
      jsonb_build_object(
        'requested_by', COALESCE(NULLIF(p_reviewer, ''), 'local_user'),
        'comment', NULLIF(p_comment, '')
      )
    )
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_job;

    RETURN QUERY SELECT
      TRUE,
      'BIBLE_JOB_CREATED'::text,
      'CONTINUE_PROJECT'::text,
      v_project.id,
      v_project.status,
      'GENERATE_BIBLE'::text,
      NULL::integer,
      v_job.id,
      '已创建生成设定集任务。'::text;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_outline_count
  FROM novel_chapter_outlines o
  WHERE o.project_id = p_project_id
    AND o.status = 'READY';

  IF v_outline_count = 0 THEN
    UPDATE novel_projects
    SET status = 'BIBLE_READY'
    WHERE id = p_project_id
      AND status NOT IN ('PAUSED', 'FAILED', 'COMPLETED');

    INSERT INTO novel_generation_jobs (project_id, job_type, status, payload)
    VALUES (
      p_project_id,
      'GENERATE_OUTLINE',
      'PENDING',
      jsonb_build_object(
        'requested_by', COALESCE(NULLIF(p_reviewer, ''), 'local_user'),
        'comment', NULLIF(p_comment, '')
      )
    )
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_job;

    RETURN QUERY SELECT
      TRUE,
      'OUTLINE_JOB_CREATED'::text,
      'CONTINUE_PROJECT'::text,
      v_project.id,
      'BIBLE_READY'::text,
      'GENERATE_OUTLINE'::text,
      NULL::integer,
      v_job.id,
      '已创建生成大纲任务。'::text;
    RETURN;
  END IF;

  SELECT COALESCE(MAX(c.chapter_no), 0)::integer
  INTO v_max_current_chapter_no
  FROM novel_chapters c
  WHERE c.project_id = p_project_id
    AND c.is_current = TRUE
    AND c.status IN ('APPROVED', 'PUBLISHED')
    AND NOT EXISTS (
      SELECT 1
      FROM novel_chapter_outlines o
      WHERE o.id = c.outline_id
        AND c.created_at < o.updated_at
    );

  v_next_chapter_no := GREATEST(v_project.current_chapter_no, v_max_current_chapter_no) + 1;

  IF v_next_chapter_no > v_project.target_total_chapters THEN
    UPDATE novel_projects
    SET status = 'COMPLETED',
        current_chapter_no = GREATEST(current_chapter_no, v_max_current_chapter_no)
    WHERE id = p_project_id;

    RETURN QUERY SELECT
      FALSE,
      'PROJECT_COMPLETED'::text,
      'CONTINUE_PROJECT'::text,
      v_project.id,
      'COMPLETED'::text,
      NULL::text,
      NULL::integer,
      NULL::uuid,
      '目标章节已经写完。'::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_chapter_outlines o
    WHERE o.project_id = p_project_id
      AND o.chapter_no = v_next_chapter_no
      AND o.status = 'READY'
  ) THEN
    UPDATE novel_projects
    SET status = 'BIBLE_READY'
    WHERE id = p_project_id
      AND status NOT IN ('PAUSED', 'FAILED');

    INSERT INTO novel_generation_jobs (project_id, job_type, status, payload)
    VALUES (
      p_project_id,
      'GENERATE_OUTLINE',
      'PENDING',
      jsonb_build_object(
        'requested_by', COALESCE(NULLIF(p_reviewer, ''), 'local_user'),
        'comment', NULLIF(p_comment, ''),
        'reason', 'missing_next_chapter_outline',
        'next_chapter_no', v_next_chapter_no
      )
    )
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_job;

    RETURN QUERY SELECT
      TRUE,
      'OUTLINE_JOB_CREATED'::text,
      'CONTINUE_PROJECT'::text,
      v_project.id,
      'BIBLE_READY'::text,
      'GENERATE_OUTLINE'::text,
      NULL::integer,
      v_job.id,
      format('第 %s 章还没有可用大纲，已先创建补齐大纲任务。', v_next_chapter_no)::text;
    RETURN;
  END IF;

  UPDATE novel_projects
  SET status = CASE WHEN v_next_chapter_no = 1 THEN 'OUTLINE_READY' ELSE 'WRITING' END
  WHERE id = p_project_id
    AND status NOT IN ('PAUSED', 'FAILED', 'COMPLETED');

  SELECT c.id
  INTO v_rejected_retry_chapter_id
  FROM novel_chapters c
  WHERE c.project_id = p_project_id
    AND c.chapter_no = v_next_chapter_no
    AND c.status = 'REJECTED'
  ORDER BY
    c.generation_version DESC,
    COALESCE(c.updated_at, c.created_at) DESC
  LIMIT 1;

  INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, status, payload)
  VALUES (
    p_project_id,
    'PLAN_CHAPTER_DIRECTOR',
    v_next_chapter_no,
    'PENDING',
    jsonb_build_object(
      'trigger_source', CASE WHEN v_rejected_retry_chapter_id IS NULL THEN 'project_continue' ELSE 'chapter_rejected_retry' END,
      'requested_by', COALESCE(NULLIF(p_reviewer, ''), 'local_user'),
      'comment', NULLIF(p_comment, ''),
      'rejected_chapter_id', v_rejected_retry_chapter_id
    )
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_job;

  RETURN QUERY SELECT
    TRUE,
    'DIRECTOR_JOB_CREATED'::text,
    'CONTINUE_PROJECT'::text,
    v_project.id,
    CASE WHEN v_next_chapter_no = 1 THEN 'OUTLINE_READY' ELSE 'WRITING' END,
    'PLAN_CHAPTER_DIRECTOR'::text,
    v_next_chapter_no,
    v_job.id,
    CASE
      WHEN v_rejected_retry_chapter_id IS NULL THEN format('已创建第 %s 章导演台规划任务。', v_next_chapter_no)
      ELSE format('已创建第 %s 章继续重写任务，会先经过导演台规划。', v_next_chapter_no)
    END::text;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION request_novel_project_regeneration(
  p_project_id UUID,
  p_step TEXT,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user',
  p_regenerate_prompt TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  result_code TEXT,
  action TEXT,
  project_id UUID,
  project_status TEXT,
  bible_id UUID,
  outline_id UUID,
  chapter_no INTEGER,
  job_type TEXT,
  job_id UUID,
  cancelled_job_count INTEGER,
  message TEXT
) AS $$
DECLARE
  v_project novel_projects%ROWTYPE;
  v_step TEXT := upper(trim(COALESCE(p_step, '')));
  v_job_type TEXT;
  v_action TEXT;
  v_event_type TEXT;
  v_status_after TEXT;
  v_actor TEXT := COALESCE(NULLIF(p_reviewer, ''), 'local_user');
  v_running_job_count INTEGER := 0;
  v_cancelled_job_count INTEGER := 0;
  v_bible_id UUID;
  v_outline_id UUID;
  v_existing_job novel_generation_jobs%ROWTYPE;
  v_job novel_generation_jobs%ROWTYPE;
  v_before JSONB := '{}'::jsonb;
  v_after JSONB := '{}'::jsonb;
  v_regenerate_prompt TEXT := NULLIF(trim(COALESCE(p_regenerate_prompt, '')), '');
  v_old_premise TEXT;
  v_inactivated_fact_count INTEGER := 0;
BEGIN
  IF v_step IN ('BIBLE', 'GENERATE_BIBLE', '设定集') THEN
    v_step := 'BIBLE';
    v_job_type := 'GENERATE_BIBLE';
    v_action := 'REGENERATE_BIBLE';
    v_event_type := 'BIBLE_REGENERATE_REQUESTED';
    v_status_after := 'CREATED';
  ELSIF v_step IN ('OUTLINE', 'GENERATE_OUTLINE', '大纲') THEN
    v_step := 'OUTLINE';
    v_job_type := 'GENERATE_OUTLINE';
    v_action := 'REGENERATE_OUTLINE';
    v_event_type := 'OUTLINE_REGENERATE_REQUESTED';
    v_status_after := 'BIBLE_READY';
  ELSE
    RETURN QUERY SELECT
      FALSE,
      'INVALID_REGENERATE_STEP'::text,
      'REGENERATE_PROJECT_ASSET'::text,
      p_project_id,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      NULL::text,
      NULL::uuid,
      0::integer,
      '重跑类型无效，只支持设定集或大纲。'::text;
    RETURN;
  END IF;

  SELECT *
  INTO v_project
  FROM novel_projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_NOT_FOUND'::text,
      v_action,
      p_project_id,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      v_job_type,
      NULL::uuid,
      0::integer,
      '项目不存在，无法重新生成。'::text;
    RETURN;
  END IF;

  IF v_project.status = 'ARCHIVED' THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_ARCHIVED'::text,
      v_action,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      v_job_type,
      NULL::uuid,
      0::integer,
      '项目已归档，请先恢复项目再重新生成。'::text;
    RETURN;
  END IF;

  IF v_project.status = 'PAUSED' THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_PAUSED'::text,
      v_action,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      v_job_type,
      NULL::uuid,
      0::integer,
      '项目已暂停，请先恢复项目再重新生成。'::text;
    RETURN;
  END IF;

  SELECT b.id
  INTO v_bible_id
  FROM novel_bibles b
  WHERE b.project_id = p_project_id;

  IF v_step = 'OUTLINE' AND v_bible_id IS NULL THEN
    RETURN QUERY SELECT
      FALSE,
      'BIBLE_REQUIRED'::text,
      v_action,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      v_job_type,
      NULL::uuid,
      0::integer,
      '需要先生成设定集，才能重新生成大纲。'::text;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_running_job_count
  FROM novel_generation_jobs j
  WHERE j.project_id = p_project_id
    AND j.status = 'RUNNING';

  IF v_running_job_count > 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'RUNNING_JOB_BLOCKED'::text,
      v_action,
      p_project_id,
      v_project.status,
      v_bible_id,
      NULL::uuid,
      NULL::integer,
      v_job_type,
      NULL::uuid,
      0::integer,
      format('还有 %s 个任务正在运行，暂不重新生成。', v_running_job_count)::text;
    RETURN;
  END IF;

  SELECT *
  INTO v_existing_job
  FROM novel_generation_jobs j
  WHERE j.project_id = p_project_id
    AND j.job_type = v_job_type
    AND j.status = 'PENDING'
    AND j.chapter_no IS NULL
  ORDER BY j.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_step = 'BIBLE' THEN
      UPDATE novel_continuity_facts f
      SET status = 'INACTIVE'
      WHERE f.project_id = p_project_id
        AND f.source = 'ai'
        AND f.status = 'PENDING';

      GET DIAGNOSTICS v_inactivated_fact_count = ROW_COUNT;
    END IF;

    IF v_step = 'BIBLE' AND v_regenerate_prompt IS NOT NULL THEN
      v_old_premise := v_project.premise;

      UPDATE novel_projects
      SET
        premise = v_regenerate_prompt,
        status = v_status_after,
        error = NULL
      WHERE id = p_project_id
      RETURNING * INTO v_project;

      UPDATE novel_generation_jobs
      SET
        payload = COALESCE(payload, '{}'::jsonb) || jsonb_build_object(
          'requested_by', v_actor,
          'comment', COALESCE(NULLIF(p_comment, ''), payload->>'comment'),
          'regenerate_prompt', v_regenerate_prompt,
          'premise_override', v_regenerate_prompt,
          'old_premise', COALESCE(payload->>'old_premise', v_old_premise),
          'inactivated_pending_ai_fact_count', v_inactivated_fact_count
        ),
        updated_at = NOW()
      WHERE id = v_existing_job.id
      RETURNING * INTO v_existing_job;
    END IF;

    RETURN QUERY SELECT
      TRUE,
      'REGENERATE_JOB_ALREADY_EXISTS'::text,
      v_action,
      p_project_id,
      v_project.status,
      v_bible_id,
      NULL::uuid,
      NULL::integer,
      v_job_type,
      v_existing_job.id,
      0::integer,
      CASE
        WHEN v_step = 'BIBLE' AND v_regenerate_prompt IS NOT NULL THEN format('已有待处理的设定集重跑任务，已更新为新的核心创意，并将 %s 条旧候选事实设为失效，请直接启动或查看队列。', v_inactivated_fact_count)
        WHEN v_step = 'BIBLE' THEN format('已有待处理的设定集重跑任务，并将 %s 条旧候选事实设为失效，请直接启动或查看队列。', v_inactivated_fact_count)
        ELSE '已有待处理的大纲重跑任务，请直接启动或查看队列。'
      END::text;
    RETURN;
  END IF;

  v_before := to_jsonb(v_project) || jsonb_build_object(
    'bible_id', v_bible_id,
    'outline_count', (SELECT COUNT(*) FROM novel_chapter_outlines o WHERE o.project_id = p_project_id),
    'pending_job_count', (SELECT COUNT(*) FROM novel_generation_jobs j WHERE j.project_id = p_project_id AND j.status = 'PENDING')
  );

  IF v_step = 'BIBLE' THEN
    UPDATE novel_generation_jobs j
    SET
      status = 'CANCELLED',
      error_message = COALESCE(error_message, '重新生成设定集，旧待处理任务已取消。'),
      finished_at = NOW(),
      updated_at = NOW()
    WHERE j.project_id = p_project_id
      AND j.status = 'PENDING';
  ELSE
    UPDATE novel_generation_jobs j
    SET
      status = 'CANCELLED',
      error_message = COALESCE(error_message, '重新生成大纲，旧待处理任务已取消。'),
      finished_at = NOW(),
      updated_at = NOW()
    WHERE j.project_id = p_project_id
      AND j.status = 'PENDING'
      AND j.job_type IN ('GENERATE_OUTLINE', 'PLAN_CHAPTER_DIRECTOR', 'GENERATE_CHAPTER', 'REVIEW_CHAPTER', 'REWRITE_CHAPTER', 'NOTIFY_REVIEW');
  END IF;

  GET DIAGNOSTICS v_cancelled_job_count = ROW_COUNT;

  IF v_step = 'BIBLE' THEN
    UPDATE novel_continuity_facts f
    SET status = 'INACTIVE'
    WHERE f.project_id = p_project_id
      AND f.source = 'ai'
      AND f.status = 'PENDING';

    GET DIAGNOSTICS v_inactivated_fact_count = ROW_COUNT;
  END IF;

  UPDATE novel_projects
  SET
      status = v_status_after,
      premise = CASE
        WHEN v_step = 'BIBLE' AND v_regenerate_prompt IS NOT NULL THEN v_regenerate_prompt
        ELSE premise
      END,
      error = NULL
  WHERE id = p_project_id
  RETURNING * INTO v_project;

  INSERT INTO novel_generation_jobs (project_id, job_type, status, payload)
  VALUES (
    p_project_id,
    v_job_type,
    'PENDING',
    jsonb_build_object(
      'requested_by', v_actor,
      'comment', NULLIF(p_comment, ''),
      'regenerate_prompt', v_regenerate_prompt,
      'premise_override', CASE WHEN v_step = 'BIBLE' THEN v_regenerate_prompt ELSE NULL END,
      'old_premise', CASE WHEN v_step = 'BIBLE' THEN v_before->>'premise' ELSE NULL END,
      'reason', 'manual_regenerate',
      'regenerate_step', lower(v_step),
      'cancelled_job_count', v_cancelled_job_count,
      'inactivated_pending_ai_fact_count', v_inactivated_fact_count
    )
  )
  RETURNING * INTO v_job;

  SELECT o.id
  INTO v_outline_id
  FROM novel_chapter_outlines o
  WHERE o.project_id = p_project_id
  ORDER BY o.chapter_no
  LIMIT 1;

  v_after := to_jsonb(v_project) || jsonb_build_object(
    'job_id', v_job.id,
    'job_type', v_job_type,
    'cancelled_job_count', v_cancelled_job_count,
    'inactivated_pending_ai_fact_count', v_inactivated_fact_count,
    'regenerate_prompt', v_regenerate_prompt,
    'premise', v_project.premise
  );

  INSERT INTO novel_project_events (
    project_id,
    bible_id,
    outline_id,
    event_type,
    actor,
    comment,
    before_payload,
    after_payload
  )
  VALUES (
    p_project_id,
    v_bible_id,
    CASE WHEN v_step = 'OUTLINE' THEN v_outline_id ELSE NULL END,
    v_event_type,
    v_actor,
    NULLIF(p_comment, ''),
    v_before,
    v_after
  );

  RETURN QUERY SELECT
    TRUE,
    CASE WHEN v_step = 'BIBLE' THEN 'BIBLE_REGENERATE_JOB_CREATED' ELSE 'OUTLINE_REGENERATE_JOB_CREATED' END::text,
    v_action,
    p_project_id,
    v_project.status,
    v_bible_id,
    CASE WHEN v_step = 'OUTLINE' THEN v_outline_id ELSE NULL END,
    NULL::integer,
    v_job_type,
    v_job.id,
    v_cancelled_job_count,
    CASE
      WHEN v_step = 'BIBLE' AND v_regenerate_prompt IS NOT NULL THEN format('已用新的核心创意创建重新生成设定集任务，取消 %s 个旧待处理任务，并将 %s 条旧候选事实设为失效。完成后会继续创建新的大纲生成任务。', v_cancelled_job_count, v_inactivated_fact_count)
      WHEN v_step = 'BIBLE' THEN format('已创建重新生成设定集任务，取消 %s 个旧待处理任务，并将 %s 条旧候选事实设为失效。完成后会继续创建新的大纲生成任务。', v_cancelled_job_count, v_inactivated_fact_count)
      ELSE format('已创建重新生成大纲任务，并取消 %s 个旧待处理任务。已生成章节不会自动删除。', v_cancelled_job_count)
    END::text;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_novel_bible_manual(
  p_project_id UUID,
  p_world_setting TEXT DEFAULT NULL,
  p_story_core TEXT DEFAULT NULL,
  p_main_character JSONB DEFAULT '{}'::jsonb,
  p_supporting_characters JSONB DEFAULT '[]'::jsonb,
  p_villain_setting JSONB DEFAULT '[]'::jsonb,
  p_power_system TEXT DEFAULT NULL,
  p_relationship_map JSONB DEFAULT '[]'::jsonb,
  p_tone_rules TEXT DEFAULT NULL,
  p_forbidden_rules TEXT DEFAULT NULL,
  p_selling_points JSONB DEFAULT '[]'::jsonb,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  success BOOLEAN,
  result_code TEXT,
  action TEXT,
  project_id UUID,
  project_status TEXT,
  bible_id UUID,
  outline_id UUID,
  chapter_no INTEGER,
  message TEXT
) AS $$
DECLARE
  v_project novel_projects%ROWTYPE;
  v_before JSONB := '{}'::jsonb;
  v_after JSONB := '{}'::jsonb;
  v_bible_id UUID;
  v_actor TEXT := COALESCE(NULLIF(p_reviewer, ''), 'local_user');
BEGIN
  SELECT *
  INTO v_project
  FROM novel_projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_NOT_FOUND'::text,
      'UPDATE_BIBLE'::text,
      p_project_id,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      '项目不存在，无法更新设定集。'::text;
    RETURN;
  END IF;

  SELECT to_jsonb(b)
  INTO v_before
  FROM novel_bibles b
  WHERE b.project_id = p_project_id;

  INSERT INTO novel_bibles (
    project_id,
    world_setting,
    story_core,
    main_character,
    supporting_characters,
    villain_setting,
    power_system,
    relationship_map,
    tone_rules,
    forbidden_rules,
    selling_points,
    generation_model,
    raw_payload
  )
  VALUES (
    p_project_id,
    NULLIF(p_world_setting, ''),
    NULLIF(p_story_core, ''),
    COALESCE(p_main_character, '{}'::jsonb),
    COALESCE(p_supporting_characters, '[]'::jsonb),
    COALESCE(p_villain_setting, '[]'::jsonb),
    NULLIF(p_power_system, ''),
    COALESCE(p_relationship_map, '[]'::jsonb),
    NULLIF(p_tone_rules, ''),
    NULLIF(p_forbidden_rules, ''),
    COALESCE(p_selling_points, '[]'::jsonb),
    'manual',
    jsonb_build_object('source', 'manual_edit', 'updated_by', v_actor)
  )
  ON CONFLICT ON CONSTRAINT novel_bibles_project_id_key DO UPDATE SET
    world_setting = EXCLUDED.world_setting,
    story_core = EXCLUDED.story_core,
    main_character = EXCLUDED.main_character,
    supporting_characters = EXCLUDED.supporting_characters,
    villain_setting = EXCLUDED.villain_setting,
    power_system = EXCLUDED.power_system,
    relationship_map = EXCLUDED.relationship_map,
    tone_rules = EXCLUDED.tone_rules,
    forbidden_rules = EXCLUDED.forbidden_rules,
    selling_points = EXCLUDED.selling_points,
    generation_model = EXCLUDED.generation_model,
    raw_payload = EXCLUDED.raw_payload
  RETURNING id INTO v_bible_id;

  SELECT to_jsonb(b)
  INTO v_after
  FROM novel_bibles b
  WHERE b.id = v_bible_id;

  UPDATE novel_projects
  SET status = CASE WHEN status = 'CREATED' THEN 'BIBLE_READY' ELSE status END
  WHERE id = p_project_id
  RETURNING * INTO v_project;

  INSERT INTO novel_project_events (
    project_id,
    bible_id,
    event_type,
    actor,
    comment,
    before_payload,
    after_payload
  )
  VALUES (
    p_project_id,
    v_bible_id,
    'BIBLE_UPDATED',
    v_actor,
    NULLIF(p_comment, ''),
    COALESCE(v_before, '{}'::jsonb),
    COALESCE(v_after, '{}'::jsonb)
  );

  RETURN QUERY SELECT
    TRUE,
    'BIBLE_UPDATED'::text,
    'UPDATE_BIBLE'::text,
    p_project_id,
    v_project.status,
    v_bible_id,
    NULL::uuid,
    NULL::integer,
    '设定集已保存，后续生成会读取新的项目设定。'::text;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_novel_outline_manual(
  p_project_id UUID,
  p_outline_id UUID,
  p_volume_no INTEGER,
  p_title TEXT,
  p_summary TEXT,
  p_chapter_goal TEXT,
  p_conflict_point TEXT,
  p_emotional_point TEXT,
  p_hook TEXT,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  success BOOLEAN,
  result_code TEXT,
  action TEXT,
  project_id UUID,
  project_status TEXT,
  bible_id UUID,
  outline_id UUID,
  chapter_no INTEGER,
  message TEXT
) AS $$
DECLARE
  v_project novel_projects%ROWTYPE;
  v_outline novel_chapter_outlines%ROWTYPE;
  v_before JSONB := '{}'::jsonb;
  v_after JSONB := '{}'::jsonb;
  v_actor TEXT := COALESCE(NULLIF(p_reviewer, ''), 'local_user');
BEGIN
  SELECT *
  INTO v_project
  FROM novel_projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_NOT_FOUND'::text,
      'UPDATE_OUTLINE'::text,
      p_project_id,
      NULL::text,
      NULL::uuid,
      p_outline_id,
      NULL::integer,
      '项目不存在，无法更新大纲。'::text;
    RETURN;
  END IF;

  IF p_volume_no IS NULL OR p_volume_no <= 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'INVALID_OUTLINE_INPUT'::text,
      'UPDATE_OUTLINE'::text,
      p_project_id,
      v_project.status,
      NULL::uuid,
      p_outline_id,
      NULL::integer,
      '卷号必须大于 0。'::text;
    RETURN;
  END IF;

  SELECT *
  INTO v_outline
  FROM novel_chapter_outlines o
  WHERE o.id = p_outline_id
    AND o.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'OUTLINE_NOT_FOUND'::text,
      'UPDATE_OUTLINE'::text,
      p_project_id,
      v_project.status,
      NULL::uuid,
      p_outline_id,
      NULL::integer,
      '章节大纲不存在。'::text;
    RETURN;
  END IF;

  v_before := to_jsonb(v_outline);

  UPDATE novel_chapter_outlines
  SET
    volume_no = p_volume_no,
    title = normalize_novel_chapter_title(p_title, p_title),
    summary = NULLIF(p_summary, ''),
    chapter_goal = NULLIF(p_chapter_goal, ''),
    conflict_point = NULLIF(p_conflict_point, ''),
    emotional_point = NULLIF(p_emotional_point, ''),
    hook = NULLIF(p_hook, ''),
    status = 'READY'
  WHERE id = p_outline_id
  RETURNING * INTO v_outline;

  v_after := to_jsonb(v_outline);

  UPDATE novel_projects
  SET status = CASE WHEN status IN ('CREATED', 'BIBLE_READY') THEN 'OUTLINE_READY' ELSE status END
  WHERE id = p_project_id
  RETURNING * INTO v_project;

  INSERT INTO novel_project_events (
    project_id,
    outline_id,
    event_type,
    actor,
    comment,
    before_payload,
    after_payload
  )
  VALUES (
    p_project_id,
    p_outline_id,
    'OUTLINE_UPDATED',
    v_actor,
    NULLIF(p_comment, ''),
    v_before,
    v_after
  );

  RETURN QUERY SELECT
    TRUE,
    'OUTLINE_UPDATED'::text,
    'UPDATE_OUTLINE'::text,
    p_project_id,
    v_project.status,
    NULL::uuid,
    p_outline_id,
    v_outline.chapter_no,
    format('第 %s 章大纲已保存。', v_outline.chapter_no)::text;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_novel_project_targets(
  p_project_id UUID,
  p_target_total_chapters INTEGER,
  p_target_words_per_chapter INTEGER,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  success BOOLEAN,
  result_code TEXT,
  action TEXT,
  project_id UUID,
  project_status TEXT,
  bible_id UUID,
  outline_id UUID,
  chapter_no INTEGER,
  target_total_chapters INTEGER,
  target_words_per_chapter INTEGER,
  message TEXT
) AS $$
DECLARE
  v_project novel_projects%ROWTYPE;
  v_before JSONB := '{}'::jsonb;
  v_after JSONB := '{}'::jsonb;
  v_actor TEXT := COALESCE(NULLIF(p_reviewer, ''), 'local_user');
BEGIN
  SELECT *
  INTO v_project
  FROM novel_projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_NOT_FOUND'::text,
      'UPDATE_PROJECT_TARGET'::text,
      p_project_id,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      NULL::integer,
      NULL::integer,
      '项目不存在，无法修改目标。'::text;
    RETURN;
  END IF;

  IF p_target_total_chapters IS NULL OR p_target_total_chapters <= 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'INVALID_PROJECT_TARGET'::text,
      'UPDATE_PROJECT_TARGET'::text,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      v_project.target_total_chapters,
      v_project.target_words_per_chapter,
      '目标章节数必须大于 0。'::text;
    RETURN;
  END IF;

  IF p_target_words_per_chapter IS NULL OR p_target_words_per_chapter <= 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'INVALID_PROJECT_TARGET'::text,
      'UPDATE_PROJECT_TARGET'::text,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      v_project.target_total_chapters,
      v_project.target_words_per_chapter,
      '每章目标字数必须大于 0。'::text;
    RETURN;
  END IF;

  IF p_target_total_chapters < v_project.current_chapter_no THEN
    RETURN QUERY SELECT
      FALSE,
      'TARGET_BELOW_PROGRESS'::text,
      'UPDATE_PROJECT_TARGET'::text,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      v_project.target_total_chapters,
      v_project.target_words_per_chapter,
      format('目标章节数不能小于当前进度 %s。', v_project.current_chapter_no)::text;
    RETURN;
  END IF;

  v_before := to_jsonb(v_project);

  UPDATE novel_projects
  SET
    target_total_chapters = p_target_total_chapters,
    target_words_per_chapter = p_target_words_per_chapter,
    status = CASE
      WHEN status = 'COMPLETED' AND current_chapter_no < p_target_total_chapters THEN 'WRITING'
      ELSE status
    END
  WHERE id = p_project_id
  RETURNING * INTO v_project;

  v_after := to_jsonb(v_project);

  INSERT INTO novel_project_events (
    project_id,
    event_type,
    actor,
    comment,
    before_payload,
    after_payload
  )
  VALUES (
    p_project_id,
    'PROJECT_TARGET_UPDATED',
    v_actor,
    NULLIF(p_comment, ''),
    v_before,
    v_after
  );

  RETURN QUERY SELECT
    TRUE,
    'PROJECT_TARGET_UPDATED'::text,
    'UPDATE_PROJECT_TARGET'::text,
    p_project_id,
    v_project.status,
    NULL::uuid,
    NULL::uuid,
    NULL::integer,
	    v_project.target_total_chapters,
	    v_project.target_words_per_chapter,
	    '项目目标已保存；新字数只影响后续章节生成和重写，已生成章节不会自动改写。'::text;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION manage_novel_project_fact(
  p_project_id UUID,
  p_fact_id UUID DEFAULT NULL,
  p_fact_action TEXT DEFAULT 'CREATE',
  p_fact_type TEXT DEFAULT 'other',
  p_fact_key TEXT DEFAULT NULL,
  p_fact_value TEXT DEFAULT NULL,
  p_chapter_no INTEGER DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  success BOOLEAN,
  result_code TEXT,
  action TEXT,
  project_id UUID,
  project_status TEXT,
  bible_id UUID,
  outline_id UUID,
  chapter_no INTEGER,
  message TEXT
) AS $$
DECLARE
  v_project novel_projects%ROWTYPE;
  v_fact novel_continuity_facts%ROWTYPE;
  v_action TEXT := upper(COALESCE(NULLIF(p_fact_action, ''), 'CREATE'));
  v_fact_type TEXT := COALESCE(NULLIF(p_fact_type, ''), 'other');
  v_status TEXT := NULLIF(upper(COALESCE(p_status, '')), '');
  v_actor TEXT := COALESCE(NULLIF(p_reviewer, ''), 'local_user');
  v_deleted_fact_count INTEGER := 0;
BEGIN
  IF v_action IN ('ADD', '新增', '新增事实') THEN
    v_action := 'CREATE';
  ELSIF v_action IN ('EDIT', 'SAVE', '编辑', '保存') THEN
    v_action := 'UPDATE';
  ELSIF v_action IN ('ACTIVE', '启用', '激活') THEN
    v_action := 'ACTIVATE';
  ELSIF v_action IN ('INACTIVE', 'DISABLE', '停用', '失效') THEN
    v_action := 'DEACTIVATE';
  ELSIF v_action IN ('CLEAN_INACTIVE', 'CLEAR', 'CLEAN', '清理失效事实', '清理') THEN
    v_action := 'CLEAR_INACTIVE';
  END IF;

  IF v_action NOT IN ('CREATE', 'UPDATE', 'ACTIVATE', 'DEACTIVATE', 'CLEAR_INACTIVE') THEN
    RETURN QUERY SELECT
      FALSE,
      'INVALID_FACT_ACTION'::text,
      'MANAGE_FACT'::text,
      p_project_id,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      '事实库操作只能是新增、编辑、激活、设为失效或清理失效事实。'::text;
    RETURN;
  END IF;

  IF v_fact_type NOT IN ('character', 'item', 'location', 'ability', 'relationship', 'foreshadowing', 'timeline', 'rule', 'other') THEN
    v_fact_type := 'other';
  END IF;

  IF v_status IS NOT NULL AND v_status NOT IN ('ACTIVE', 'PENDING', 'INACTIVE') THEN
    v_status := NULL;
  END IF;

  SELECT *
  INTO v_project
  FROM novel_projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_NOT_FOUND'::text,
      'MANAGE_FACT'::text,
      p_project_id,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      '项目不存在，无法操作事实库。'::text;
    RETURN;
  END IF;

  IF v_action = 'CLEAR_INACTIVE' THEN
    DELETE FROM novel_continuity_facts f
    WHERE f.project_id = p_project_id
      AND f.status = 'INACTIVE';

    GET DIAGNOSTICS v_deleted_fact_count = ROW_COUNT;

    RETURN QUERY SELECT
      TRUE,
      'FACTS_CLEARED'::text,
      'CLEAR_INACTIVE_FACTS'::text,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      format('已清理 %s 条失效事实；激活和待确认事实已保留。', v_deleted_fact_count)::text;
    RETURN;
  END IF;

  IF v_action = 'CREATE' THEN
    IF NULLIF(p_fact_value, '') IS NULL THEN
      RETURN QUERY SELECT
        FALSE,
        'INVALID_FACT_INPUT'::text,
        'CREATE_FACT'::text,
        p_project_id,
        v_project.status,
        NULL::uuid,
        NULL::uuid,
        p_chapter_no,
        '事实内容不能为空。'::text;
      RETURN;
    END IF;

    INSERT INTO novel_continuity_facts (
      project_id,
      chapter_no,
      fact_type,
      fact_key,
      fact_value,
      source,
      confidence,
      status
    )
    VALUES (
      p_project_id,
      p_chapter_no,
      v_fact_type,
      NULLIF(p_fact_key, ''),
      NULLIF(p_fact_value, ''),
      'human',
      1.0,
      COALESCE(v_status, 'ACTIVE')
    )
    RETURNING * INTO v_fact;

    RETURN QUERY SELECT
      TRUE,
      'FACT_CREATED'::text,
      'CREATE_FACT'::text,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      v_fact.chapter_no,
      '人工事实已新增；激活状态的事实会进入后续章节生成上下文。'::text;
    RETURN;
  END IF;

  SELECT *
  INTO v_fact
  FROM novel_continuity_facts f
  WHERE f.id = p_fact_id
    AND f.project_id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'FACT_NOT_FOUND'::text,
      CASE
        WHEN v_action = 'UPDATE' THEN 'UPDATE_FACT'
        WHEN v_action = 'ACTIVATE' THEN 'ACTIVATE_FACT'
        ELSE 'DEACTIVATE_FACT'
      END::text,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      '事实不存在或不属于当前项目。'::text;
    RETURN;
  END IF;

  IF v_action = 'UPDATE' THEN
    IF NULLIF(p_fact_value, '') IS NULL THEN
      RETURN QUERY SELECT
        FALSE,
        'INVALID_FACT_INPUT'::text,
        'UPDATE_FACT'::text,
        p_project_id,
        v_project.status,
        NULL::uuid,
        NULL::uuid,
        v_fact.chapter_no,
        '事实内容不能为空。'::text;
      RETURN;
    END IF;

    UPDATE novel_continuity_facts
    SET
      fact_type = v_fact_type,
      fact_key = NULLIF(p_fact_key, ''),
      fact_value = NULLIF(p_fact_value, ''),
      chapter_no = p_chapter_no,
      source = 'human',
      confidence = 1.0,
      status = COALESCE(v_status, status)
    WHERE id = v_fact.id
    RETURNING * INTO v_fact;

    RETURN QUERY SELECT
      TRUE,
      'FACT_UPDATED'::text,
      'UPDATE_FACT'::text,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      v_fact.chapter_no,
      '事实已保存；人工维护后的事实会优先作为后续续写约束。'::text;
    RETURN;
  END IF;

  UPDATE novel_continuity_facts
  SET
    status = CASE WHEN v_action = 'ACTIVATE' THEN 'ACTIVE' ELSE 'INACTIVE' END,
    source = 'human',
    confidence = GREATEST(confidence, 1.0)
  WHERE id = v_fact.id
  RETURNING * INTO v_fact;

  RETURN QUERY SELECT
    TRUE,
    CASE WHEN v_action = 'ACTIVATE' THEN 'FACT_ACTIVATED' ELSE 'FACT_DEACTIVATED' END::text,
    CASE WHEN v_action = 'ACTIVATE' THEN 'ACTIVATE_FACT' ELSE 'DEACTIVATE_FACT' END::text,
    p_project_id,
    v_project.status,
    NULL::uuid,
    NULL::uuid,
    v_fact.chapter_no,
    CASE
      WHEN v_action = 'ACTIVATE' THEN '事实已激活，会进入后续章节生成上下文。'
      ELSE '事实已设为失效，后续章节生成不会再主动参考它。'
    END::text;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION clear_novel_stale_chapters(
  p_project_id UUID,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  success BOOLEAN,
  result_code TEXT,
  action TEXT,
  project_id UUID,
  project_status TEXT,
  chapter_no INTEGER,
  job_type TEXT,
  job_id UUID,
  cancelled_job_count INTEGER,
  deleted_chapter_count INTEGER,
  inactivated_fact_count INTEGER,
  message TEXT
) AS $$
DECLARE
  v_project novel_projects%ROWTYPE;
  v_stale_chapter_count INTEGER := 0;
  v_running_job_count INTEGER := 0;
  v_cancelled_job_count INTEGER := 0;
  v_deleted_chapter_count INTEGER := 0;
  v_inactivated_fact_count INTEGER := 0;
  v_current_chapter_no INTEGER := 0;
  v_status_after TEXT;
BEGIN
  SELECT *
  INTO v_project
  FROM novel_projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_NOT_FOUND'::text,
      'CLEAR_STALE_CHAPTERS'::text,
      p_project_id,
      NULL::text,
      NULL::integer,
      NULL::text,
      NULL::uuid,
      0::integer,
      0::integer,
      0::integer,
      '项目不存在，无法清理过期历史章节。'::text;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_stale_chapter_count
  FROM novel_chapters c
  JOIN novel_chapter_outlines o ON o.id = c.outline_id
  WHERE c.project_id = p_project_id
    AND c.created_at < o.updated_at;

  IF v_stale_chapter_count = 0 THEN
    RETURN QUERY SELECT
      TRUE,
      'STALE_CHAPTERS_NONE'::text,
      'CLEAR_STALE_CHAPTERS'::text,
      p_project_id,
      v_project.status,
      NULL::integer,
      NULL::text,
      NULL::uuid,
      0::integer,
      0::integer,
      0::integer,
      '当前没有可清理的过期历史章节。'::text;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_running_job_count
  FROM novel_generation_jobs j
  JOIN novel_chapters c ON c.id = j.chapter_id
  JOIN novel_chapter_outlines o ON o.id = c.outline_id
  WHERE c.project_id = p_project_id
    AND c.created_at < o.updated_at
    AND j.status = 'RUNNING';

  IF v_running_job_count > 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'RUNNING_STALE_CHAPTER_JOB_BLOCKED'::text,
      'CLEAR_STALE_CHAPTERS'::text,
      p_project_id,
      v_project.status,
      NULL::integer,
      NULL::text,
      NULL::uuid,
      0::integer,
      0::integer,
      0::integer,
      format('还有 %s 个过期历史章节关联的任务正在运行，暂不清理。', v_running_job_count)::text;
    RETURN;
  END IF;

  WITH stale AS (
    SELECT c.id
    FROM novel_chapters c
    JOIN novel_chapter_outlines o ON o.id = c.outline_id
    WHERE c.project_id = p_project_id
      AND c.created_at < o.updated_at
  ), cancelled AS (
    UPDATE novel_generation_jobs j
    SET
      status = 'CANCELLED',
      error_message = COALESCE(j.error_message, '清理过期历史章节，旧待处理任务已取消。'),
      finished_at = NOW(),
      updated_at = NOW()
    WHERE j.chapter_id IN (SELECT id FROM stale)
      AND j.status = 'PENDING'
    RETURNING j.id
  )
  SELECT COUNT(*)::integer INTO v_cancelled_job_count FROM cancelled;

  WITH stale AS (
    SELECT c.id
    FROM novel_chapters c
    JOIN novel_chapter_outlines o ON o.id = c.outline_id
    WHERE c.project_id = p_project_id
      AND c.created_at < o.updated_at
  ), inactivated AS (
    UPDATE novel_continuity_facts f
    SET status = 'INACTIVE'
    WHERE f.chapter_id IN (SELECT id FROM stale)
      AND f.source = 'ai'
      AND f.status <> 'INACTIVE'
    RETURNING f.id
  )
  SELECT COUNT(*)::integer INTO v_inactivated_fact_count FROM inactivated;

  WITH stale AS (
    SELECT c.id
    FROM novel_chapters c
    JOIN novel_chapter_outlines o ON o.id = c.outline_id
    WHERE c.project_id = p_project_id
      AND c.created_at < o.updated_at
  ), deleted AS (
    DELETE FROM novel_chapters c
    WHERE c.id IN (SELECT id FROM stale)
    RETURNING c.id
  )
  SELECT COUNT(*)::integer INTO v_deleted_chapter_count FROM deleted;

  SELECT COALESCE(MAX(c.chapter_no), 0)::integer
  INTO v_current_chapter_no
  FROM novel_chapters c
  WHERE c.project_id = p_project_id
    AND c.is_current = TRUE
    AND c.status IN ('APPROVED', 'PUBLISHED');

  IF v_project.status NOT IN ('PAUSED', 'ARCHIVED', 'FAILED') THEN
    IF EXISTS (
      SELECT 1
      FROM novel_chapters c
      WHERE c.project_id = p_project_id
        AND c.status = 'NEED_REVIEW'
    ) THEN
      v_status_after := 'REVIEWING';
    ELSIF v_current_chapter_no >= v_project.target_total_chapters THEN
      v_status_after := 'COMPLETED';
    ELSIF v_current_chapter_no > 0 THEN
      v_status_after := 'WRITING';
    ELSIF EXISTS (
      SELECT 1 FROM novel_chapter_outlines o WHERE o.project_id = p_project_id AND o.status = 'READY'
    ) THEN
      v_status_after := 'OUTLINE_READY';
    ELSIF EXISTS (
      SELECT 1 FROM novel_bibles b WHERE b.project_id = p_project_id
    ) THEN
      v_status_after := 'BIBLE_READY';
    ELSE
      v_status_after := 'CREATED';
    END IF;

    UPDATE novel_projects
    SET
      current_chapter_no = v_current_chapter_no,
      status = v_status_after,
      error = NULL
    WHERE id = p_project_id
    RETURNING * INTO v_project;
  ELSE
    UPDATE novel_projects
    SET current_chapter_no = v_current_chapter_no
    WHERE id = p_project_id
    RETURNING * INTO v_project;
  END IF;

  RETURN QUERY SELECT
    TRUE,
    'STALE_CHAPTERS_CLEARED'::text,
    'CLEAR_STALE_CHAPTERS'::text,
    p_project_id,
    v_project.status,
    NULL::integer,
    NULL::text,
    NULL::uuid,
    v_cancelled_job_count,
    v_deleted_chapter_count,
    v_inactivated_fact_count,
    format('已清理 %s 个过期历史章节，取消 %s 个旧待处理任务，并将 %s 条旧 AI 事实设为失效。', v_deleted_chapter_count, v_cancelled_job_count, v_inactivated_fact_count)::text;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_novel_project_pause_state(
  p_project_id UUID,
  p_desired_action TEXT,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  success BOOLEAN,
  result_code TEXT,
  action TEXT,
  project_id UUID,
  project_status TEXT,
  bible_id UUID,
  outline_id UUID,
  chapter_no INTEGER,
  message TEXT
) AS $$
DECLARE
  v_project novel_projects%ROWTYPE;
  v_before JSONB := '{}'::jsonb;
  v_after JSONB := '{}'::jsonb;
  v_actor TEXT := COALESCE(NULLIF(p_reviewer, ''), 'local_user');
  v_action TEXT := upper(COALESCE(NULLIF(p_desired_action, ''), ''));
  v_resume_status TEXT;
BEGIN
  SELECT *
  INTO v_project
  FROM novel_projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_NOT_FOUND'::text,
      'TOGGLE_PROJECT_PAUSE'::text,
      p_project_id,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      '项目不存在，无法修改状态。'::text;
    RETURN;
  END IF;

  IF v_action NOT IN ('PAUSE', 'RESUME') THEN
    RETURN QUERY SELECT
      FALSE,
      'INVALID_PROJECT_ACTION'::text,
      'TOGGLE_PROJECT_PAUSE'::text,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      '项目状态操作无效。'::text;
    RETURN;
  END IF;

  IF v_action = 'PAUSE' THEN
    IF v_project.status = 'ARCHIVED' THEN
      RETURN QUERY SELECT
        FALSE,
        'PROJECT_ARCHIVED'::text,
        'PAUSE_PROJECT'::text,
        p_project_id,
        v_project.status,
        NULL::uuid,
        NULL::uuid,
        NULL::integer,
        '项目已归档，不能暂停；如需继续请先恢复项目。'::text;
      RETURN;
    END IF;

    IF v_project.status = 'PAUSED' THEN
      RETURN QUERY SELECT
        TRUE,
        'PROJECT_ALREADY_PAUSED'::text,
        'PAUSE_PROJECT'::text,
        p_project_id,
        v_project.status,
        NULL::uuid,
        NULL::uuid,
        NULL::integer,
        '项目已经是暂停状态。'::text;
      RETURN;
    END IF;

    IF v_project.status = 'FAILED' THEN
      RETURN QUERY SELECT
        FALSE,
        'PROJECT_FAILED_BLOCKED'::text,
        'PAUSE_PROJECT'::text,
        p_project_id,
        v_project.status,
        NULL::uuid,
        NULL::uuid,
        NULL::integer,
        '项目已失败，请先处理失败原因。'::text;
      RETURN;
    END IF;

    v_before := to_jsonb(v_project);

    UPDATE novel_projects
    SET status = 'PAUSED'
    WHERE id = p_project_id
    RETURNING * INTO v_project;

    v_after := to_jsonb(v_project);

    INSERT INTO novel_project_events (
      project_id,
      event_type,
      actor,
      comment,
      before_payload,
      after_payload
    )
    VALUES (
      p_project_id,
      'PROJECT_PAUSED',
      v_actor,
      NULLIF(p_comment, ''),
      v_before,
      v_after
    );

    RETURN QUERY SELECT
      TRUE,
      'PROJECT_PAUSED'::text,
      'PAUSE_PROJECT'::text,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      '项目已暂停；待处理任务会保留，但队列领取会跳过暂停项目。'::text;
    RETURN;
  END IF;

  IF v_project.status <> 'PAUSED' THEN
    RETURN QUERY SELECT
      TRUE,
      'PROJECT_NOT_PAUSED'::text,
      'RESUME_PROJECT'::text,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      '项目当前不在暂停状态。'::text;
    RETURN;
  END IF;

  SELECT e.before_payload->>'status'
  INTO v_resume_status
  FROM novel_project_events e
  WHERE e.project_id = p_project_id
    AND e.event_type = 'PROJECT_PAUSED'
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF v_resume_status IS NULL OR v_resume_status NOT IN ('CREATED', 'BIBLE_READY', 'OUTLINE_READY', 'WRITING', 'REVIEWING', 'COMPLETED') THEN
    IF EXISTS (
      SELECT 1
      FROM novel_chapters c
      WHERE c.project_id = p_project_id
        AND c.status = 'NEED_REVIEW'
        AND NOT EXISTS (
          SELECT 1
          FROM novel_chapter_outlines o
          WHERE o.id = c.outline_id
            AND c.created_at < o.updated_at
        )
    ) THEN
      v_resume_status := 'REVIEWING';
    ELSIF v_project.current_chapter_no >= v_project.target_total_chapters THEN
      v_resume_status := 'COMPLETED';
    ELSIF v_project.current_chapter_no > 0 THEN
      v_resume_status := 'WRITING';
    ELSIF EXISTS (
      SELECT 1 FROM novel_chapter_outlines o WHERE o.project_id = p_project_id AND o.status = 'READY'
    ) THEN
      v_resume_status := 'OUTLINE_READY';
    ELSIF EXISTS (
      SELECT 1 FROM novel_bibles b WHERE b.project_id = p_project_id
    ) THEN
      v_resume_status := 'BIBLE_READY';
    ELSE
      v_resume_status := 'CREATED';
    END IF;
  END IF;

  v_before := to_jsonb(v_project);

  UPDATE novel_projects
  SET status = v_resume_status
  WHERE id = p_project_id
  RETURNING * INTO v_project;

  v_after := to_jsonb(v_project);

  INSERT INTO novel_project_events (
    project_id,
    event_type,
    actor,
    comment,
    before_payload,
    after_payload
  )
  VALUES (
    p_project_id,
    'PROJECT_RESUMED',
    v_actor,
    NULLIF(p_comment, ''),
    v_before,
    v_after
  );

  RETURN QUERY SELECT
    TRUE,
    'PROJECT_RESUMED'::text,
    'RESUME_PROJECT'::text,
    p_project_id,
    v_project.status,
    NULL::uuid,
    NULL::uuid,
    NULL::integer,
    '项目已恢复，队列可以继续领取该项目任务。'::text;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION save_novel_chapter_manual_edit(
  p_chapter_id UUID,
  p_review_token TEXT,
  p_title TEXT,
  p_body TEXT,
  p_summary TEXT DEFAULT NULL,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  success BOOLEAN,
  result_code TEXT,
  action TEXT,
  chapter_id UUID,
  project_id UUID,
  chapter_no INTEGER,
  chapter_status TEXT,
  job_type TEXT,
  job_id UUID,
  message TEXT
) AS $$
DECLARE
  v_before novel_chapters%ROWTYPE;
  v_after novel_chapters%ROWTYPE;
  v_project novel_projects%ROWTYPE;
  v_actor TEXT := COALESCE(NULLIF(p_reviewer, ''), 'local_user');
  v_active_chapter_job_count INTEGER := 0;
  v_body TEXT := NULLIF(p_body, '');
BEGIN
  SELECT *
  INTO v_before
  FROM novel_chapters
  WHERE id = p_chapter_id
    AND review_token = p_review_token
    AND status IN ('DRAFT_READY', 'AI_REVIEWED', 'NEED_REVIEW', 'APPROVED', 'PUBLISHED')
    AND NOT EXISTS (
      SELECT 1
      FROM novel_chapter_outlines o
      WHERE o.id = novel_chapters.outline_id
        AND novel_chapters.created_at < o.updated_at
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'NO_MATCH_OR_INVALID_STATE'::text,
      'MANUAL_EDIT_CHAPTER'::text,
      p_chapter_id,
      NULL::uuid,
      NULL::integer,
      NULL::text,
      NULL::text,
      NULL::uuid,
      '只能编辑当前大纲下最新展示的正文版本；已拒绝、已要求重写、失败或过期历史版本不可直接保存。'::text;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM novel_chapters newer
    WHERE newer.project_id = v_before.project_id
      AND newer.chapter_no = v_before.chapter_no
      AND newer.generation_version > v_before.generation_version
      AND (newer.body IS NOT NULL OR newer.summary IS NOT NULL OR newer.title IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1
        FROM novel_chapter_outlines o
        WHERE o.id = newer.outline_id
          AND newer.created_at < o.updated_at
      )
  ) THEN
    RETURN QUERY SELECT
      FALSE,
      'SUPERSEDED_CHAPTER_VERSION'::text,
      'MANUAL_EDIT_CHAPTER'::text,
      v_before.id,
      v_before.project_id,
      v_before.chapter_no,
      v_before.status,
      NULL::text,
      NULL::uuid,
      '当前章节已有更新版本，请刷新页面后编辑最新版本。'::text;
    RETURN;
  END IF;

  SELECT *
  INTO v_project
  FROM novel_projects
  WHERE id = v_before.project_id
  FOR UPDATE;

  IF v_project.status = 'ARCHIVED' THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_ARCHIVED'::text,
      'MANUAL_EDIT_CHAPTER'::text,
      v_before.id,
      v_before.project_id,
      v_before.chapter_no,
      v_before.status,
      NULL::text,
      NULL::uuid,
      '项目已归档，请先恢复项目再编辑正文。'::text;
    RETURN;
  END IF;

  IF v_body IS NULL OR length(trim(v_body)) = 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'INVALID_CHAPTER_BODY'::text,
      'MANUAL_EDIT_CHAPTER'::text,
      v_before.id,
      v_before.project_id,
      v_before.chapter_no,
      v_before.status,
      NULL::text,
      NULL::uuid,
      '正文不能为空。'::text;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_active_chapter_job_count
  FROM novel_generation_jobs j
  WHERE j.project_id = v_before.project_id
    AND j.chapter_no = v_before.chapter_no
    AND j.job_type IN ('GENERATE_CHAPTER', 'REVIEW_CHAPTER', 'REWRITE_CHAPTER')
    AND j.status IN ('PENDING', 'RUNNING');

  IF v_active_chapter_job_count > 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'ACTIVE_CHAPTER_JOB_BLOCKED'::text,
      'MANUAL_EDIT_CHAPTER'::text,
      v_before.id,
      v_before.project_id,
      v_before.chapter_no,
      v_before.status,
      NULL::text,
      NULL::uuid,
      '同章还有生成、审稿或重写任务在队列中，请先等待处理完成。'::text;
    RETURN;
  END IF;

  UPDATE novel_chapters
  SET
    title = COALESCE(NULLIF(p_title, ''), title),
    body = v_body,
    summary = COALESCE(NULLIF(p_summary, ''), summary),
    word_count = char_length(regexp_replace(v_body, '\s+', '', 'g')),
    error = NULL
  WHERE id = v_before.id
  RETURNING * INTO v_after;

  INSERT INTO novel_human_reviews (
    project_id,
    chapter_id,
    action,
    comment,
    reviewer
  )
  VALUES (
    v_after.project_id,
    v_after.id,
    'MANUAL_EDIT',
    NULLIF(p_comment, ''),
    v_actor
  );

  INSERT INTO novel_project_events (
    project_id,
    chapter_id,
    event_type,
    actor,
    comment,
    before_payload,
    after_payload
  )
  VALUES (
    v_after.project_id,
    v_after.id,
    'CHAPTER_MANUAL_EDIT_SAVED',
    v_actor,
    NULLIF(p_comment, ''),
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  RETURN QUERY SELECT
    TRUE,
    'CHAPTER_MANUAL_EDIT_SAVED'::text,
    'MANUAL_EDIT_CHAPTER'::text,
    v_after.id,
    v_after.project_id,
    v_after.chapter_no,
    v_after.status,
    NULL::text,
    NULL::uuid,
    format('已直接保存第 %s 章正文；未创建候选稿，未调用模型，未新增审稿任务。', v_after.chapter_no)::text;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_novel_manual_chapter_candidate(
  p_chapter_id UUID,
  p_review_token TEXT,
  p_title TEXT,
  p_body TEXT,
  p_summary TEXT DEFAULT NULL,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  success BOOLEAN,
  result_code TEXT,
  action TEXT,
  chapter_id UUID,
  project_id UUID,
  chapter_no INTEGER,
  chapter_status TEXT,
  job_type TEXT,
  job_id UUID,
  message TEXT
) AS $$
DECLARE
  v_original novel_chapters%ROWTYPE;
  v_candidate novel_chapters%ROWTYPE;
  v_project novel_projects%ROWTYPE;
  v_job novel_generation_jobs%ROWTYPE;
  v_actor TEXT := COALESCE(NULLIF(p_reviewer, ''), 'local_user');
  v_active_chapter_job_count INTEGER := 0;
  v_need_review_count INTEGER := 0;
  v_copied_fact_count INTEGER := 0;
  v_body TEXT := NULLIF(p_body, '');
BEGIN
  SELECT *
  INTO v_original
  FROM novel_chapters
  WHERE id = p_chapter_id
    AND review_token = p_review_token
    AND is_current = TRUE
    AND status IN ('APPROVED', 'PUBLISHED')
    AND NOT EXISTS (
      SELECT 1
      FROM novel_chapter_outlines o
      WHERE o.id = novel_chapters.outline_id
        AND novel_chapters.created_at < o.updated_at
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'NO_MATCH_OR_INVALID_STATE'::text,
      'MANUAL_EDIT_CHAPTER'::text,
      p_chapter_id,
      NULL::uuid,
      NULL::integer,
      NULL::text,
      NULL::text,
      NULL::uuid,
      '只能基于当前正式版本创建人工编辑候选稿。'::text;
    RETURN;
  END IF;

  SELECT *
  INTO v_project
  FROM novel_projects
  WHERE id = v_original.project_id
  FOR UPDATE;

  IF v_project.status = 'ARCHIVED' THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_ARCHIVED'::text,
      'MANUAL_EDIT_CHAPTER'::text,
      v_original.id,
      v_original.project_id,
      v_original.chapter_no,
      v_original.status,
      NULL::text,
      NULL::uuid,
      '项目已归档，请先恢复项目再编辑正文。'::text;
    RETURN;
  END IF;

  IF v_body IS NULL OR length(trim(v_body)) = 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'INVALID_CHAPTER_BODY'::text,
      'MANUAL_EDIT_CHAPTER'::text,
      v_original.id,
      v_original.project_id,
      v_original.chapter_no,
      v_original.status,
      NULL::text,
      NULL::uuid,
      '正文不能为空。'::text;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_need_review_count
  FROM novel_chapters c
  WHERE c.project_id = v_original.project_id
    AND c.chapter_no = v_original.chapter_no
    AND c.status = 'NEED_REVIEW'
    AND NOT EXISTS (
      SELECT 1
      FROM novel_chapter_outlines o
      WHERE o.id = c.outline_id
        AND c.created_at < o.updated_at
    );

  IF v_need_review_count > 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'NEED_REVIEW_BLOCKED'::text,
      'MANUAL_EDIT_CHAPTER'::text,
      v_original.id,
      v_original.project_id,
      v_original.chapter_no,
      v_original.status,
      NULL::text,
      NULL::uuid,
      '同章已有候选稿待人工审核，请先完成审核后再创建新的人工编辑稿。'::text;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_active_chapter_job_count
  FROM novel_generation_jobs j
  WHERE j.project_id = v_original.project_id
    AND j.chapter_no = v_original.chapter_no
    AND j.job_type IN ('REVIEW_CHAPTER', 'REWRITE_CHAPTER')
    AND j.status IN ('PENDING', 'RUNNING');

  IF v_active_chapter_job_count > 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'ACTIVE_CHAPTER_JOB_BLOCKED'::text,
      'MANUAL_EDIT_CHAPTER'::text,
      v_original.id,
      v_original.project_id,
      v_original.chapter_no,
      v_original.status,
      NULL::text,
      NULL::uuid,
      '同章还有审稿或重写任务在队列中，请先等待处理完成。'::text;
    RETURN;
  END IF;

  SELECT *
  INTO v_candidate
  FROM create_novel_chapter_version(
    v_original.project_id,
    v_original.outline_id,
    v_original.id,
    v_original.chapter_no,
    COALESCE(NULLIF(p_title, ''), v_original.title),
    v_body,
    COALESCE(NULLIF(p_summary, ''), v_original.summary),
    char_length(regexp_replace(v_body, '\s+', '', 'g')),
    'manual',
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
    confidence,
    status
  )
  SELECT
    v_candidate.project_id,
    v_candidate.id,
    v_candidate.chapter_no,
    v_candidate.generation_version,
    f.fact_type,
    f.fact_key,
    f.fact_value,
    'ai',
    LEAST(f.confidence, 0.6),
    'PENDING'
  FROM novel_continuity_facts f
  WHERE f.project_id = v_original.project_id
    AND f.chapter_no = v_original.chapter_no
    AND f.source = 'ai'
    AND f.status = 'ACTIVE';

  GET DIAGNOSTICS v_copied_fact_count = ROW_COUNT;

  INSERT INTO novel_human_reviews (
    project_id,
    chapter_id,
    action,
    comment,
    reviewer
  )
  VALUES (
    v_candidate.project_id,
    v_candidate.id,
    'MANUAL_EDIT',
    NULLIF(p_comment, ''),
    v_actor
  );

  INSERT INTO novel_project_events (
    project_id,
    chapter_id,
    event_type,
    actor,
    comment,
    before_payload,
    after_payload
  )
  VALUES (
    v_candidate.project_id,
    v_candidate.id,
    'CHAPTER_MANUAL_EDIT_CREATED',
    v_actor,
    NULLIF(p_comment, ''),
    to_jsonb(v_original),
    to_jsonb(v_candidate) || jsonb_build_object('copied_fact_count', v_copied_fact_count)
  );

  INSERT INTO novel_generation_jobs (
    project_id,
    chapter_id,
    job_type,
    chapter_no,
    payload,
    status
  )
  VALUES (
    v_candidate.project_id,
    v_candidate.id,
    'REVIEW_CHAPTER',
    v_candidate.chapter_no,
    jsonb_build_object(
      'source', 'manual_chapter_edit',
      'parent_chapter_id', v_original.id,
      'requested_by', v_actor,
      'comment', NULLIF(p_comment, ''),
      'copied_fact_count', v_copied_fact_count
    ),
    'PENDING'
  )
  RETURNING * INTO v_job;

  RETURN QUERY SELECT
    TRUE,
    'MANUAL_CHAPTER_CANDIDATE_CREATED'::text,
    'MANUAL_EDIT_CHAPTER'::text,
    v_candidate.id,
    v_candidate.project_id,
    v_candidate.chapter_no,
    v_candidate.status,
    v_job.job_type,
    v_job.id,
    format('已创建第 %s 章人工编辑候选稿，并进入智能审稿队列；原正式版本保持不变。', v_candidate.chapter_no)::text;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION apply_novel_review_manual_edit(
  p_chapter_id UUID,
  p_review_token TEXT,
  p_title TEXT,
  p_body TEXT,
  p_summary TEXT DEFAULT NULL,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user',
  p_decision TEXT DEFAULT 'RESUBMIT'
)
RETURNS TABLE (
  success BOOLEAN,
  result_code TEXT,
  action TEXT,
  chapter_id UUID,
  project_id UUID,
  chapter_no INTEGER,
  chapter_status TEXT,
  project_status TEXT,
  job_type TEXT,
  job_id UUID,
  next_job_id UUID,
  activated_fact_count BIGINT,
  inactivated_fact_count BIGINT,
  message TEXT
) AS $$
DECLARE
  v_original novel_chapters%ROWTYPE;
  v_candidate novel_chapters%ROWTYPE;
  v_project novel_projects%ROWTYPE;
  v_job novel_generation_jobs%ROWTYPE;
  v_approved RECORD;
  v_actor TEXT := COALESCE(NULLIF(p_reviewer, ''), 'local_user');
  v_decision TEXT := UPPER(TRIM(COALESCE(p_decision, 'RESUBMIT')));
  v_body TEXT := NULLIF(p_body, '');
  v_copied_fact_count INTEGER := 0;
  v_cancelled_job_count INTEGER := 0;
  v_project_status TEXT;
BEGIN
  IF v_decision IN ('SUBMIT', 'SUBMIT_REVIEW', 'SEND_REVIEW', 'REVIEW', 'RESUBMIT', '送审', '提交审核') THEN
    v_decision := 'RESUBMIT';
  ELSIF v_decision IN ('APPROVE', 'PASS', 'DIRECT_APPROVE', '通过', '直接通过') THEN
    v_decision := 'APPROVE';
  ELSE
    RETURN QUERY SELECT
      FALSE,
      'INVALID_MANUAL_REVIEW_DECISION'::text,
      'MANUAL_EDIT_REVIEW_CHAPTER'::text,
      p_chapter_id,
      NULL::uuid,
      NULL::integer,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      0::bigint,
      0::bigint,
      '人工改稿决策无效，只支持送审或直接通过。'::text;
    RETURN;
  END IF;

  SELECT *
  INTO v_original
  FROM novel_chapters c
  WHERE c.id = p_chapter_id
    AND c.review_token = p_review_token
    AND c.status = 'NEED_REVIEW'
    AND NOT EXISTS (
      SELECT 1
      FROM novel_chapter_outlines o
      WHERE o.id = c.outline_id
        AND c.created_at < o.updated_at
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'NO_MATCH_OR_INVALID_STATE'::text,
      'MANUAL_EDIT_REVIEW_CHAPTER'::text,
      p_chapter_id,
      NULL::uuid,
      NULL::integer,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      0::bigint,
      0::bigint,
      '只能编辑当前仍处于待人工审核状态的候选稿。'::text;
    RETURN;
  END IF;

  SELECT *
  INTO v_project
  FROM novel_projects p
  WHERE p.id = v_original.project_id
  FOR UPDATE;

  IF v_project.status = 'ARCHIVED' THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_ARCHIVED'::text,
      'MANUAL_EDIT_REVIEW_CHAPTER'::text,
      v_original.id,
      v_original.project_id,
      v_original.chapter_no,
      v_original.status,
      v_project.status,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      0::bigint,
      0::bigint,
      '项目已归档，请先恢复项目再编辑待审正文。'::text;
    RETURN;
  END IF;

  IF v_body IS NULL OR length(trim(v_body)) = 0 THEN
    RETURN QUERY SELECT
      FALSE,
      'INVALID_CHAPTER_BODY'::text,
      'MANUAL_EDIT_REVIEW_CHAPTER'::text,
      v_original.id,
      v_original.project_id,
      v_original.chapter_no,
      v_original.status,
      v_project.status,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      0::bigint,
      0::bigint,
      '正文不能为空。'::text;
    RETURN;
  END IF;

  UPDATE novel_generation_jobs j
  SET
    status = 'CANCELLED',
    error_message = COALESCE(error_message, '人工改稿后取消旧待审候选稿相关任务'),
    finished_at = COALESCE(finished_at, NOW())
  WHERE j.chapter_id = v_original.id
    AND j.job_type IN ('REVIEW_CHAPTER', 'NOTIFY_REVIEW', 'REWRITE_CHAPTER')
    AND j.status IN ('PENDING', 'RUNNING');

  GET DIAGNOSTICS v_cancelled_job_count = ROW_COUNT;

  UPDATE novel_chapters c
  SET
    status = 'REWRITE_REQUESTED',
    is_current = FALSE
  WHERE c.id = v_original.id;

  INSERT INTO novel_human_reviews (
    project_id,
    chapter_id,
    action,
    comment,
    reviewer
  )
  VALUES (
    v_original.project_id,
    v_original.id,
    'MANUAL_EDIT',
    NULLIF(p_comment, ''),
    v_actor
  );

  SELECT *
  INTO v_candidate
  FROM create_novel_chapter_version(
    v_original.project_id,
    v_original.outline_id,
    v_original.id,
    v_original.chapter_no,
    COALESCE(NULLIF(p_title, ''), v_original.title),
    v_body,
    COALESCE(NULLIF(p_summary, ''), v_original.summary),
    char_length(regexp_replace(v_body, '\s+', '', 'g')),
    'manual',
    CASE WHEN v_decision = 'APPROVE' THEN 'NEED_REVIEW' ELSE 'DRAFT_READY' END,
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
    confidence,
    status
  )
  SELECT
    v_candidate.project_id,
    v_candidate.id,
    v_candidate.chapter_no,
    v_candidate.generation_version,
    f.fact_type,
    f.fact_key,
    f.fact_value,
    'ai',
    LEAST(f.confidence, 0.65),
    'PENDING'
  FROM novel_continuity_facts f
  WHERE f.project_id = v_original.project_id
    AND f.chapter_no = v_original.chapter_no
    AND f.chapter_id = v_original.id
    AND f.source = 'ai'
    AND f.status IN ('PENDING', 'ACTIVE');

  GET DIAGNOSTICS v_copied_fact_count = ROW_COUNT;

  INSERT INTO novel_project_events (
    project_id,
    chapter_id,
    event_type,
    actor,
    comment,
    before_payload,
    after_payload
  )
  VALUES (
    v_candidate.project_id,
    v_candidate.id,
    'CHAPTER_MANUAL_EDIT_CREATED',
    v_actor,
    NULLIF(p_comment, ''),
    to_jsonb(v_original),
    to_jsonb(v_candidate) || jsonb_build_object(
      'source_review_chapter_id', v_original.id,
      'decision', v_decision,
      'copied_fact_count', v_copied_fact_count,
      'cancelled_job_count', v_cancelled_job_count
    )
  );

  IF v_decision = 'APPROVE' THEN
    SELECT *
    INTO v_approved
    FROM approve_novel_chapter(
      v_candidate.id,
      v_candidate.review_token,
      COALESCE(NULLIF(p_comment, ''), '人工改稿后直接通过'),
      v_actor
    );

    IF NOT FOUND THEN
      RETURN QUERY SELECT
        FALSE,
        'NO_MATCH_OR_INVALID_STATE'::text,
        'MANUAL_EDIT_REVIEW_CHAPTER'::text,
        v_candidate.id,
        v_candidate.project_id,
        v_candidate.chapter_no,
        v_candidate.status,
        v_project.status,
        NULL::text,
        NULL::uuid,
        NULL::uuid,
        0::bigint,
        0::bigint,
        '人工改稿已创建，但直接通过未能生效，请回审核中心重新处理。'::text;
      RETURN;
    END IF;

    RETURN QUERY SELECT
      TRUE,
      'MANUAL_REVIEW_APPROVED'::text,
      'MANUAL_EDIT_REVIEW_CHAPTER'::text,
      v_approved.chapter_id,
      v_approved.project_id,
      v_approved.chapter_no,
      v_approved.chapter_status,
      v_approved.project_status,
	      CASE WHEN v_approved.next_job_id IS NULL THEN NULL::text ELSE 'PLAN_CHAPTER_DIRECTOR'::text END,
      v_approved.next_job_id,
      v_approved.next_job_id,
      v_approved.activated_fact_count,
      v_approved.inactivated_fact_count,
      format('已保存第 %s 章人工改稿并直接通过；原待审稿已退出审核列表。', v_approved.chapter_no)::text;
    RETURN;
  END IF;

  UPDATE novel_projects p
  SET status = 'REVIEWING'
  WHERE p.id = v_candidate.project_id
    AND p.status NOT IN ('PAUSED', 'ARCHIVED', 'FAILED', 'COMPLETED')
  RETURNING p.status INTO v_project_status;

  v_project_status := COALESCE(v_project_status, v_project.status);

  INSERT INTO novel_generation_jobs (
    project_id,
    chapter_id,
    job_type,
    chapter_no,
    payload,
    status
  )
  VALUES (
    v_candidate.project_id,
    v_candidate.id,
    'REVIEW_CHAPTER',
    v_candidate.chapter_no,
    jsonb_build_object(
      'source', 'manual_review_edit',
      'parent_chapter_id', v_original.id,
      'requested_by', v_actor,
      'comment', NULLIF(p_comment, ''),
      'copied_fact_count', v_copied_fact_count,
      'cancelled_job_count', v_cancelled_job_count
    ),
    'PENDING'
  )
  RETURNING * INTO v_job;

  RETURN QUERY SELECT
    TRUE,
    'MANUAL_REVIEW_CANDIDATE_CREATED'::text,
    'MANUAL_EDIT_REVIEW_CHAPTER'::text,
    v_candidate.id,
    v_candidate.project_id,
    v_candidate.chapter_no,
    v_candidate.status,
    v_project_status,
    v_job.job_type,
    v_job.id,
    NULL::uuid,
    0::bigint,
    0::bigint,
    format('已保存第 %s 章人工改稿，并进入智能审稿队列；原待审稿已退出审核列表。', v_candidate.chapter_no)::text;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_novel_project_archive_state(
  p_project_id UUID,
  p_desired_action TEXT,
  p_confirm_title TEXT DEFAULT NULL,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  success BOOLEAN,
  result_code TEXT,
  action TEXT,
  project_id UUID,
  project_status TEXT,
  bible_id UUID,
  outline_id UUID,
  chapter_no INTEGER,
  cancelled_job_count INTEGER,
  message TEXT
) AS $$
DECLARE
  v_project novel_projects%ROWTYPE;
  v_before JSONB := '{}'::jsonb;
  v_after JSONB := '{}'::jsonb;
  v_actor TEXT := COALESCE(NULLIF(p_reviewer, ''), 'local_user');
  v_action TEXT := upper(COALESCE(NULLIF(p_desired_action, ''), ''));
  v_running_job_count INTEGER := 0;
  v_cancelled_job_count INTEGER := 0;
  v_restore_status TEXT;
BEGIN
  SELECT *
  INTO v_project
  FROM novel_projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'PROJECT_NOT_FOUND'::text,
      'ARCHIVE_PROJECT'::text,
      p_project_id,
      NULL::text,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      0::integer,
      '项目不存在，无法归档或恢复。'::text;
    RETURN;
  END IF;

  IF v_action NOT IN ('ARCHIVE', 'RESTORE') THEN
    RETURN QUERY SELECT
      FALSE,
      'INVALID_PROJECT_ACTION'::text,
      'ARCHIVE_PROJECT'::text,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      0::integer,
      '项目归档操作无效。'::text;
    RETURN;
  END IF;

  IF v_action = 'ARCHIVE' THEN
    IF v_project.status = 'ARCHIVED' THEN
      RETURN QUERY SELECT
        TRUE,
        'PROJECT_ALREADY_ARCHIVED'::text,
        'ARCHIVE_PROJECT'::text,
        p_project_id,
        v_project.status,
        NULL::uuid,
        NULL::uuid,
        NULL::integer,
        0::integer,
        '项目已经归档。'::text;
      RETURN;
    END IF;

    IF trim(COALESCE(p_confirm_title, '')) <> v_project.title THEN
      RETURN QUERY SELECT
        FALSE,
        'CONFIRM_TITLE_MISMATCH'::text,
        'ARCHIVE_PROJECT'::text,
        p_project_id,
        v_project.status,
        NULL::uuid,
        NULL::uuid,
        NULL::integer,
        0::integer,
        '归档确认项目名不匹配，未执行归档。'::text;
      RETURN;
    END IF;

    SELECT COUNT(*)::integer
    INTO v_running_job_count
    FROM novel_generation_jobs j
    WHERE j.project_id = p_project_id
      AND j.status = 'RUNNING';

    IF v_running_job_count > 0 THEN
      RETURN QUERY SELECT
        FALSE,
        'RUNNING_JOB_BLOCKED'::text,
        'ARCHIVE_PROJECT'::text,
        p_project_id,
        v_project.status,
        NULL::uuid,
        NULL::uuid,
        NULL::integer,
        0::integer,
        format('还有 %s 个任务正在运行，暂不归档。', v_running_job_count)::text;
      RETURN;
    END IF;

    v_before := to_jsonb(v_project);

    UPDATE novel_generation_jobs j
    SET
      status = 'CANCELLED',
      error_message = COALESCE(error_message, '项目已归档，待处理任务已取消。'),
      finished_at = NOW(),
      updated_at = NOW()
    WHERE j.project_id = p_project_id
      AND j.status = 'PENDING';

    GET DIAGNOSTICS v_cancelled_job_count = ROW_COUNT;

    UPDATE novel_projects
    SET status = 'ARCHIVED'
    WHERE id = p_project_id
    RETURNING * INTO v_project;

    v_after := to_jsonb(v_project) || jsonb_build_object('cancelled_job_count', v_cancelled_job_count);

    INSERT INTO novel_project_events (
      project_id,
      event_type,
      actor,
      comment,
      before_payload,
      after_payload
    )
    VALUES (
      p_project_id,
      'PROJECT_ARCHIVED',
      v_actor,
      NULLIF(p_comment, ''),
      v_before,
      v_after
    );

    RETURN QUERY SELECT
      TRUE,
      'PROJECT_ARCHIVED'::text,
      'ARCHIVE_PROJECT'::text,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      v_cancelled_job_count,
      format('项目已归档，%s 个待处理任务已取消；数据仍保留，可从控制台恢复。', v_cancelled_job_count)::text;
    RETURN;
  END IF;

  IF v_project.status <> 'ARCHIVED' THEN
    RETURN QUERY SELECT
      TRUE,
      'PROJECT_NOT_ARCHIVED'::text,
      'RESTORE_PROJECT'::text,
      p_project_id,
      v_project.status,
      NULL::uuid,
      NULL::uuid,
      NULL::integer,
      0::integer,
      '项目当前不在归档状态。'::text;
    RETURN;
  END IF;

  SELECT e.before_payload->>'status'
  INTO v_restore_status
  FROM novel_project_events e
  WHERE e.project_id = p_project_id
    AND e.event_type = 'PROJECT_ARCHIVED'
  ORDER BY e.created_at DESC
  LIMIT 1;

  IF v_restore_status IS NULL OR v_restore_status NOT IN ('CREATED', 'BIBLE_READY', 'OUTLINE_READY', 'WRITING', 'REVIEWING', 'PAUSED', 'COMPLETED', 'FAILED') THEN
    IF EXISTS (
      SELECT 1
      FROM novel_chapters c
      WHERE c.project_id = p_project_id
        AND c.status = 'NEED_REVIEW'
        AND NOT EXISTS (
          SELECT 1
          FROM novel_chapter_outlines o
          WHERE o.id = c.outline_id
            AND c.created_at < o.updated_at
        )
    ) THEN
      v_restore_status := 'REVIEWING';
    ELSIF v_project.current_chapter_no >= v_project.target_total_chapters THEN
      v_restore_status := 'COMPLETED';
    ELSIF v_project.current_chapter_no > 0 THEN
      v_restore_status := 'WRITING';
    ELSIF EXISTS (
      SELECT 1 FROM novel_chapter_outlines o WHERE o.project_id = p_project_id AND o.status = 'READY'
    ) THEN
      v_restore_status := 'OUTLINE_READY';
    ELSIF EXISTS (
      SELECT 1 FROM novel_bibles b WHERE b.project_id = p_project_id
    ) THEN
      v_restore_status := 'BIBLE_READY';
    ELSE
      v_restore_status := 'CREATED';
    END IF;
  END IF;

  v_before := to_jsonb(v_project);

  UPDATE novel_projects
  SET status = v_restore_status
  WHERE id = p_project_id
  RETURNING * INTO v_project;

  v_after := to_jsonb(v_project);

  INSERT INTO novel_project_events (
    project_id,
    event_type,
    actor,
    comment,
    before_payload,
    after_payload
  )
  VALUES (
    p_project_id,
    'PROJECT_RESTORED',
    v_actor,
    NULLIF(p_comment, ''),
    v_before,
    v_after
  );

  RETURN QUERY SELECT
    TRUE,
    'PROJECT_RESTORED'::text,
    'RESTORE_PROJECT'::text,
    p_project_id,
    v_project.status,
    NULL::uuid,
    NULL::uuid,
    NULL::integer,
    0::integer,
    '项目已从归档恢复；如需继续生成，请回到项目控制台点击继续写作。'::text;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION request_novel_current_chapter_rewrite(
  p_chapter_id UUID,
  p_review_token TEXT,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  success BOOLEAN,
  result_code TEXT,
  action TEXT,
  chapter_id UUID,
  project_id UUID,
  chapter_no INTEGER,
  chapter_status TEXT,
  job_type TEXT,
  job_id UUID,
  message TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT *
    FROM novel_chapters
    WHERE id = p_chapter_id
      AND review_token = p_review_token
      AND is_current = TRUE
      AND status IN ('APPROVED', 'PUBLISHED')
      AND NOT EXISTS (
        SELECT 1
        FROM novel_chapter_outlines o
        WHERE o.id = novel_chapters.outline_id
          AND novel_chapters.created_at < o.updated_at
      )
    FOR UPDATE
  ), existing_job AS (
    SELECT j.*
    FROM candidate c
    JOIN novel_generation_jobs j ON j.project_id = c.project_id
      AND j.chapter_id = c.id
      AND j.job_type = 'REWRITE_CHAPTER'
      AND j.chapter_no = c.chapter_no
      AND j.status IN ('PENDING', 'RUNNING')
    ORDER BY j.created_at DESC
    LIMIT 1
  ), human_review AS (
    INSERT INTO novel_human_reviews (
      project_id,
      chapter_id,
      action,
      comment,
      reviewer
    )
    SELECT
      c.project_id,
      c.id,
      'REQUEST_REWRITE',
      NULLIF(p_comment, ''),
      COALESCE(NULLIF(p_reviewer, ''), 'local_user')
    FROM candidate c
    WHERE NOT EXISTS (SELECT 1 FROM existing_job)
    RETURNING *
  ), rewrite_job AS (
    INSERT INTO novel_generation_jobs (
      project_id,
      chapter_id,
      job_type,
      chapter_no,
      payload,
      status
    )
    SELECT
      c.project_id,
      c.id,
      'REWRITE_CHAPTER',
      c.chapter_no,
      jsonb_build_object(
        'human_review_id', hr.id,
        'comment', COALESCE(NULLIF(p_comment, ''), '请在保持主线连续的前提下重写这一章。'),
        'rewrite_source', 'approved_current'
      ),
      'PENDING'
    FROM candidate c
    JOIN human_review hr ON TRUE
    ON CONFLICT DO NOTHING
    RETURNING *
  )
  SELECT
    TRUE,
    CASE
      WHEN (SELECT id FROM rewrite_job LIMIT 1) IS NULL THEN 'REWRITE_JOB_ALREADY_EXISTS'
      ELSE 'REWRITE_JOB_CREATED'
    END::text,
    'REQUEST_APPROVED_REWRITE'::text,
    c.id,
    c.project_id,
    c.chapter_no,
    c.status,
    'REWRITE_CHAPTER'::text,
    COALESCE((SELECT id FROM rewrite_job LIMIT 1), (SELECT id FROM existing_job LIMIT 1)),
    CASE
      WHEN (SELECT id FROM rewrite_job LIMIT 1) IS NULL THEN '已有重写任务在排队或运行，不会重复创建。'
      ELSE '已创建当前正式章节的重写任务，旧正式版本仍保持可续写。'
    END::text
  FROM candidate c;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'NO_MATCH_OR_INVALID_STATE'::text,
      'REQUEST_APPROVED_REWRITE'::text,
      p_chapter_id,
      NULL::uuid,
      NULL::integer,
      NULL::text,
      NULL::text,
      NULL::uuid,
      '只能对当前正式版本申请重写。'::text;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION request_novel_review_notification(
  p_chapter_id UUID,
  p_review_token TEXT,
  p_comment TEXT DEFAULT NULL,
  p_reviewer TEXT DEFAULT 'local_user'
)
RETURNS TABLE (
  success BOOLEAN,
  result_code TEXT,
  action TEXT,
  chapter_id UUID,
  project_id UUID,
  chapter_no INTEGER,
  chapter_status TEXT,
  job_type TEXT,
  job_id UUID,
  message TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT *
    FROM novel_chapters
    WHERE id = p_chapter_id
      AND review_token = p_review_token
      AND status = 'NEED_REVIEW'
      AND NOT EXISTS (
        SELECT 1
        FROM novel_chapter_outlines o
        WHERE o.id = novel_chapters.outline_id
          AND novel_chapters.created_at < o.updated_at
      )
    FOR UPDATE
  ), notify_job AS (
    INSERT INTO novel_generation_jobs (
      project_id,
      chapter_id,
      job_type,
      chapter_no,
      payload,
      status
    )
    SELECT
      c.project_id,
      c.id,
      'NOTIFY_REVIEW',
      c.chapter_no,
      jsonb_build_object(
        'requested_by', COALESCE(NULLIF(p_reviewer, ''), 'local_user'),
        'comment', NULLIF(p_comment, ''),
        'request_source', 'manual_resend'
      ),
      'PENDING'
    FROM candidate c
    ON CONFLICT DO NOTHING
    RETURNING *
  ), existing_job AS (
    SELECT j.*
    FROM candidate c
    JOIN novel_generation_jobs j ON j.project_id = c.project_id
      AND j.chapter_id = c.id
      AND j.job_type = 'NOTIFY_REVIEW'
      AND j.chapter_no = c.chapter_no
      AND j.status IN ('PENDING', 'RUNNING')
    ORDER BY j.created_at DESC
    LIMIT 1
  )
  SELECT
    TRUE,
    CASE
      WHEN (SELECT id FROM notify_job LIMIT 1) IS NULL THEN 'NOTIFY_JOB_ALREADY_EXISTS'
      ELSE 'NOTIFY_JOB_CREATED'
    END::text,
    'RESEND_REVIEW_NOTIFICATION'::text,
    c.id,
    c.project_id,
    c.chapter_no,
    c.status,
    'NOTIFY_REVIEW'::text,
    COALESCE((SELECT id FROM notify_job LIMIT 1), (SELECT id FROM existing_job LIMIT 1)),
    '已创建审核提醒任务，提醒只会进入审核详情页。'::text
  FROM candidate c;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      FALSE,
      'NO_MATCH_OR_INVALID_STATE'::text,
      'RESEND_REVIEW_NOTIFICATION'::text,
      p_chapter_id,
      NULL::uuid,
      NULL::integer,
      NULL::text,
      NULL::text,
      NULL::uuid,
      '只能为待人工审核章节重新发送提醒。'::text;
  END IF;
END;
$$ LANGUAGE plpgsql;
