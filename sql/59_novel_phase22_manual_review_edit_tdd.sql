-- Phase 22 TDD: manual edit directly from review detail.

BEGIN;

DO $$
DECLARE
  v_project_id UUID := gen_random_uuid();
  v_outline_id UUID := gen_random_uuid();
  v_original_chapter_id UUID;
  v_candidate_chapter_id UUID;
  v_result RECORD;
  v_old RECORD;
  v_new RECORD;
  v_count INTEGER;
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
    status
  )
  VALUES (
    v_project_id,
    'Phase22 审核改稿送审测试',
    '都市逆袭',
    '中文读者',
    '节奏快',
    '验证审核中心人工改稿送审。',
    3,
    2000,
    'REVIEWING'
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
    '主角回城。',
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
    '原待审正文。',
    '原待审摘要。',
    600,
    'phase22-test',
    'NEED_REVIEW',
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
    'PENDING'
  );

  INSERT INTO novel_generation_jobs (project_id, chapter_id, job_type, chapter_no, status)
  VALUES (v_project_id, v_original_chapter_id, 'NOTIFY_REVIEW', 1, 'PENDING');

  SELECT *
  INTO v_result
  FROM apply_novel_review_manual_edit(
    v_original_chapter_id,
    (SELECT review_token FROM novel_chapters WHERE id = v_original_chapter_id),
    '旧城灯火改',
    '人工改稿正文，拆分段落并修正节奏。',
    '人工改稿摘要。',
    '修正文节奏',
    'phase22_test',
    'RESUBMIT'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'MANUAL_REVIEW_CANDIDATE_CREATED'
     OR v_result.job_type <> 'REVIEW_CHAPTER'
     OR v_result.chapter_status <> 'DRAFT_READY' THEN
    RAISE EXCEPTION 'manual review edit should create a new review candidate, got %', row_to_json(v_result);
  END IF;

  v_candidate_chapter_id := v_result.chapter_id;

  SELECT status, is_current
  INTO v_old
  FROM novel_chapters
  WHERE id = v_original_chapter_id;

  IF v_old.status <> 'REWRITE_REQUESTED'
     OR v_old.is_current IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION 'original review candidate should leave review list, got %', row_to_json(v_old);
  END IF;

  SELECT title, body, summary, parent_chapter_id, status, is_current, generation_version
  INTO v_new
  FROM novel_chapters
  WHERE id = v_candidate_chapter_id;

  IF v_new.title <> '旧城灯火改'
     OR v_new.body <> '人工改稿正文，拆分段落并修正节奏。'
     OR v_new.parent_chapter_id <> v_original_chapter_id
     OR v_new.status <> 'DRAFT_READY'
     OR v_new.is_current IS DISTINCT FROM FALSE
     OR v_new.generation_version <> 2 THEN
    RAISE EXCEPTION 'new manual review candidate fields are wrong, got %', row_to_json(v_new);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_generation_jobs
  WHERE chapter_id = v_candidate_chapter_id
    AND job_type = 'REVIEW_CHAPTER'
    AND status = 'PENDING';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected one pending review job for manual review edit, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_generation_jobs
  WHERE chapter_id = v_original_chapter_id
    AND job_type = 'NOTIFY_REVIEW'
    AND status = 'CANCELLED';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected stale notify task to be cancelled, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_continuity_facts
  WHERE chapter_id = v_candidate_chapter_id
    AND status = 'PENDING';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected pending facts copied to manual review candidate, got %', v_count;
  END IF;
END $$;

DO $$
DECLARE
  v_project_id UUID := gen_random_uuid();
  v_outline_id UUID := gen_random_uuid();
  v_original_chapter_id UUID;
  v_candidate_chapter_id UUID;
  v_result RECORD;
  v_count INTEGER;
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
    status
  )
  VALUES (
    v_project_id,
    'Phase22 审核改稿直接通过测试',
    '悬疑',
    '中文读者',
    '克制',
    '验证审核中心人工改稿直接通过。',
    2,
    2000,
    'REVIEWING'
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
    '雨夜线索',
    '主角发现线索。',
    '建立案件目标。',
    '嫌疑人逼近。',
    '怀疑升级。',
    '线索被抢走。',
    'READY'
  );

  SELECT id
  INTO v_original_chapter_id
  FROM create_novel_chapter_version(
    v_project_id,
    v_outline_id,
    NULL,
    1,
    '雨夜线索',
    '需要改稿的待审正文。',
    '待审摘要。',
    600,
    'phase22-test',
    'NEED_REVIEW',
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
  VALUES (
    v_project_id,
    v_original_chapter_id,
    1,
    1,
    'other',
    '雨夜线索',
    '主角在雨夜找到关键票据。',
    'ai',
    0.9,
    'PENDING'
  );

  SELECT *
  INTO v_result
  FROM apply_novel_review_manual_edit(
    v_original_chapter_id,
    (SELECT review_token FROM novel_chapters WHERE id = v_original_chapter_id),
    '雨夜线索改',
    '人工改稿后的正文，可以直接进入正式版本。',
    '人工通过摘要。',
    '人工改稿后直接通过',
    'phase22_test',
    'APPROVE'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'MANUAL_REVIEW_APPROVED'
     OR v_result.chapter_status <> 'APPROVED'
     OR v_result.job_type <> 'GENERATE_CHAPTER' THEN
    RAISE EXCEPTION 'manual review edit direct approve should approve candidate and create next job, got %', row_to_json(v_result);
  END IF;

  v_candidate_chapter_id := v_result.chapter_id;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_chapters
    WHERE id = v_candidate_chapter_id
      AND status = 'APPROVED'
      AND is_current = TRUE
  ) THEN
    RAISE EXCEPTION 'direct-approved manual edit was not promoted to current approved chapter';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_chapters
    WHERE id = v_original_chapter_id
      AND status = 'REWRITE_REQUESTED'
      AND is_current = FALSE
  ) THEN
    RAISE EXCEPTION 'original direct-approved review candidate should leave review list';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_continuity_facts
  WHERE chapter_id = v_candidate_chapter_id
    AND status = 'ACTIVE';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected copied facts to become active after direct approval, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_human_reviews
  WHERE chapter_id = v_original_chapter_id
    AND action = 'MANUAL_EDIT';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected one MANUAL_EDIT record on original review candidate, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_human_reviews
  WHERE chapter_id = v_candidate_chapter_id
    AND action = 'APPROVE';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected one APPROVE record on direct-approved manual edit, got %', v_count;
  END IF;
END $$;

ROLLBACK;
