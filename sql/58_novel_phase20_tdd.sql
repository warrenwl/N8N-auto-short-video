-- Phase 20 TDD: manual chapter edit candidate and project archive.

BEGIN;

DO $$
DECLARE
  v_project_id UUID := gen_random_uuid();
  v_outline_id UUID := gen_random_uuid();
  v_original_chapter_id UUID;
  v_candidate_chapter_id UUID;
  v_candidate_review_token TEXT;
  v_result RECORD;
  v_original RECORD;
  v_candidate RECORD;
  v_job_count INTEGER;
  v_fact_count INTEGER;
  v_event_count INTEGER;
  v_human_count INTEGER;
  v_project_status TEXT;
BEGIN
  INSERT INTO novel_projects (
    id,
    title,
    genre,
    audience,
    style,
    premise,
    target_total_chapters,
    target_words_per_chapter,
    current_chapter_no,
    status
  )
  VALUES (
    v_project_id,
    'Phase20 正文编辑与归档测试',
    '都市逆袭',
    '中文读者',
    '节奏快',
    '验证人工正文候选稿和项目归档。',
    2,
    1200,
    1,
    'WRITING'
  );

  INSERT INTO novel_chapter_outlines (
    id,
    project_id,
    chapter_no,
    volume_no,
    title,
    summary,
    chapter_goal,
    conflict_point,
    emotional_point,
    hook,
    status
  )
  VALUES (
    v_outline_id,
    v_project_id,
    1,
    1,
    '旧城灯火',
    '主角回到旧城。',
    '建立主角目标。',
    '债主逼近。',
    '压抑后反击。',
    '收到神秘短信。',
    'READY'
  );

  SELECT id
  INTO v_original_chapter_id
  FROM create_novel_chapter_version(
    v_project_id,
    v_outline_id,
    NULL,
    1,
    '旧城灯火',
    '原正式正文。',
    '原正式摘要。',
    600,
    'phase20-test',
    'APPROVED',
    TRUE
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
  VALUES (
    v_project_id,
    v_original_chapter_id,
    1,
    1,
    'character',
    '主角目标',
    '主角要查清旧城债务背后的真相。',
    'ai',
    0.9,
    'ACTIVE'
  );

  SELECT *
  INTO v_result
  FROM save_novel_chapter_manual_edit(
    v_original_chapter_id,
    (SELECT review_token FROM novel_chapters WHERE id = v_original_chapter_id),
    '旧城灯火直改',
    '直接保存后的正式正文，不进入智能审稿队列。',
    '直接保存摘要。',
    '快速修正错字',
    'phase20_test'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'CHAPTER_MANUAL_EDIT_SAVED'
     OR v_result.job_type IS NOT NULL
     OR v_result.job_id IS NOT NULL THEN
    RAISE EXCEPTION 'direct manual chapter edit should save in place without queue job, got %', row_to_json(v_result);
  END IF;

  SELECT title, body, summary, status, is_current, generation_version
  INTO v_candidate
  FROM novel_chapters
  WHERE id = v_original_chapter_id;

  IF v_candidate.title <> '旧城灯火直改'
     OR v_candidate.body <> '直接保存后的正式正文，不进入智能审稿队列。'
     OR v_candidate.summary <> '直接保存摘要。'
     OR v_candidate.status <> 'APPROVED'
     OR v_candidate.is_current IS DISTINCT FROM TRUE
     OR v_candidate.generation_version <> 1 THEN
    RAISE EXCEPTION 'direct manual save should update the same approved chapter, got %', row_to_json(v_candidate);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_job_count
  FROM novel_generation_jobs
  WHERE chapter_id = v_original_chapter_id
    AND job_type = 'REVIEW_CHAPTER'
    AND status IN ('PENDING', 'RUNNING');

  IF v_job_count <> 0 THEN
    RAISE EXCEPTION 'direct manual save should not create review jobs, got %', v_job_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_event_count
  FROM novel_project_events
  WHERE project_id = v_project_id
    AND chapter_id = v_original_chapter_id
    AND event_type = 'CHAPTER_MANUAL_EDIT_SAVED';

  IF v_event_count <> 1 THEN
    RAISE EXCEPTION 'Expected direct manual save project event, got %', v_event_count;
  END IF;

  SELECT *
  INTO v_result
  FROM create_novel_manual_chapter_candidate(
    v_original_chapter_id,
    (SELECT review_token FROM novel_chapters WHERE id = v_original_chapter_id),
    '旧城灯火改',
    '人工修改后的正文，保留旧城线索，并强化结尾反转。',
    '人工修改摘要。',
    '手动调整正文节奏',
    'phase20_test'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'MANUAL_CHAPTER_CANDIDATE_CREATED'
     OR v_result.job_type <> 'REVIEW_CHAPTER'
     OR v_result.chapter_status <> 'DRAFT_READY' THEN
    RAISE EXCEPTION 'manual chapter edit should create candidate and review job, got %', row_to_json(v_result);
  END IF;

  v_candidate_chapter_id := v_result.chapter_id;

  SELECT id, parent_chapter_id, title, body, summary, status, is_current, generation_version, review_token
  INTO v_candidate
  FROM novel_chapters
  WHERE id = v_candidate_chapter_id;

  IF v_candidate.parent_chapter_id <> v_original_chapter_id
     OR v_candidate.title <> '旧城灯火改'
     OR v_candidate.status <> 'DRAFT_READY'
     OR v_candidate.is_current IS DISTINCT FROM FALSE
     OR v_candidate.generation_version <> 2 THEN
    RAISE EXCEPTION 'manual candidate fields are wrong, got %', row_to_json(v_candidate);
  END IF;

  SELECT id, status, is_current
  INTO v_original
  FROM novel_chapters
  WHERE id = v_original_chapter_id;

  IF v_original.status <> 'APPROVED'
     OR v_original.is_current IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'original approved chapter should remain current, got %', row_to_json(v_original);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_job_count
  FROM novel_generation_jobs
  WHERE chapter_id = v_candidate_chapter_id
    AND job_type = 'REVIEW_CHAPTER'
    AND status = 'PENDING';

  IF v_job_count <> 1 THEN
    RAISE EXCEPTION 'Expected one pending review job for manual candidate, got %', v_job_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_fact_count
  FROM novel_continuity_facts
  WHERE chapter_id = v_candidate_chapter_id
    AND status = 'PENDING'
    AND source = 'ai';

  IF v_fact_count <> 1 THEN
    RAISE EXCEPTION 'Expected copied pending facts for manual candidate, got %', v_fact_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_human_count
  FROM novel_human_reviews
  WHERE chapter_id = v_candidate_chapter_id
    AND action = 'MANUAL_EDIT';

  IF v_human_count <> 1 THEN
    RAISE EXCEPTION 'Expected one MANUAL_EDIT human record, got %', v_human_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_event_count
  FROM novel_project_events
  WHERE project_id = v_project_id
    AND chapter_id = v_candidate_chapter_id
    AND event_type = 'CHAPTER_MANUAL_EDIT_CREATED';

  IF v_event_count <> 1 THEN
    RAISE EXCEPTION 'Expected manual edit project event, got %', v_event_count;
  END IF;

  SELECT *
  INTO v_result
  FROM create_novel_manual_chapter_candidate(
    v_original_chapter_id,
    (SELECT review_token FROM novel_chapters WHERE id = v_original_chapter_id),
    '重复编辑',
    '重复编辑正文。',
    '重复摘要。',
    '重复点击',
    'phase20_test'
  );

  IF v_result.success IS DISTINCT FROM FALSE
     OR v_result.result_code <> 'ACTIVE_CHAPTER_JOB_BLOCKED' THEN
    RAISE EXCEPTION 'duplicate manual edit should be blocked by active review job, got %', row_to_json(v_result);
  END IF;

  UPDATE novel_generation_jobs
  SET status = 'SUCCEEDED', finished_at = NOW()
  WHERE chapter_id = v_candidate_chapter_id
    AND job_type = 'REVIEW_CHAPTER';

  UPDATE novel_chapters
  SET status = 'NEED_REVIEW'
  WHERE id = v_candidate_chapter_id
  RETURNING review_token INTO v_candidate_review_token;

  SELECT *
  INTO v_result
  FROM approve_novel_chapter(
    v_candidate_chapter_id,
    v_candidate_review_token,
    '通过人工编辑稿',
    'phase20_test'
  );

  IF v_result.chapter_status <> 'APPROVED'
     OR v_result.activated_fact_count <> 1
     OR v_result.inactivated_fact_count <> 1 THEN
    RAISE EXCEPTION 'manual candidate approve should switch current and facts, got %', row_to_json(v_result);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM novel_chapters
    WHERE id = v_candidate_chapter_id
      AND status = 'APPROVED'
      AND is_current = TRUE
  ) THEN
    RAISE EXCEPTION 'manual candidate was not promoted to current approved version';
  END IF;

  IF EXISTS (
    SELECT 1 FROM novel_chapters
    WHERE id = v_original_chapter_id
      AND is_current = TRUE
  ) THEN
    RAISE EXCEPTION 'old approved chapter should no longer be current after approving manual candidate';
  END IF;

  SELECT *
  INTO v_result
  FROM set_novel_project_archive_state(
    v_project_id,
    'ARCHIVE',
    '错误项目名',
    '错误确认',
    'phase20_test'
  );

  IF v_result.success IS DISTINCT FROM FALSE
     OR v_result.result_code <> 'CONFIRM_TITLE_MISMATCH' THEN
    RAISE EXCEPTION 'archive should require exact project title confirmation, got %', row_to_json(v_result);
  END IF;

  SELECT *
  INTO v_result
  FROM set_novel_project_archive_state(
    v_project_id,
    'ARCHIVE',
    'Phase20 正文编辑与归档测试',
    '测试完成后归档',
    'phase20_test'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'PROJECT_ARCHIVED'
     OR v_result.project_status <> 'ARCHIVED'
     OR v_result.cancelled_job_count < 1 THEN
    RAISE EXCEPTION 'archive should set project archived and cancel pending jobs, got %', row_to_json(v_result);
  END IF;

  SELECT status
  INTO v_project_status
  FROM novel_projects
  WHERE id = v_project_id;

  IF v_project_status <> 'ARCHIVED' THEN
    RAISE EXCEPTION 'Project status should be ARCHIVED, got %', v_project_status;
  END IF;

  SELECT *
  INTO v_result
  FROM continue_novel_project(v_project_id, '归档后继续', 'phase20_test');

  IF v_result.success IS DISTINCT FROM FALSE
     OR v_result.result_code <> 'PROJECT_ARCHIVED' THEN
    RAISE EXCEPTION 'archived project should block continue, got %', row_to_json(v_result);
  END IF;

  SELECT *
  INTO v_result
  FROM set_novel_project_archive_state(
    v_project_id,
    'RESTORE',
    NULL,
    '恢复测试项目',
    'phase20_test'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'PROJECT_RESTORED'
     OR v_result.project_status <> 'WRITING' THEN
    RAISE EXCEPTION 'restore should recover previous project status, got %', row_to_json(v_result);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_event_count
  FROM novel_project_events
  WHERE project_id = v_project_id
    AND event_type IN ('PROJECT_ARCHIVED', 'PROJECT_RESTORED');

  IF v_event_count <> 2 THEN
    RAISE EXCEPTION 'Expected archive and restore events, got %', v_event_count;
  END IF;
END $$;

ROLLBACK;
