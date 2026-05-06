BEGIN;

DO $$
DECLARE
  v_project_id UUID;
  v_bible_project_id UUID;
  v_outline_project_id UUID;
  v_review_project_id UUID;
  v_rewrite_project_id UUID;
  v_chapter_id UUID;
  v_review_chapter_id UUID;
  v_rewrite_chapter_id UUID;
  v_token TEXT;
  v_result RECORD;
  v_job_count INTEGER;
  v_human_count INTEGER;
  v_original RECORD;
BEGIN
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
    'Phase18 继续写作设定集补齐',
    '都市逆袭',
    '中文读者',
    '节奏快',
    '项目刚创建，需要补齐设定集任务。',
    3,
    800,
    'CREATED'
  )
  RETURNING id INTO v_project_id;

  SELECT *
  INTO v_result
  FROM continue_novel_project(v_project_id, '继续写作测试', 'phase18_test');

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'BIBLE_JOB_CREATED'
     OR v_result.job_type <> 'GENERATE_BIBLE'
     OR v_result.job_id IS NULL THEN
    RAISE EXCEPTION 'continue_novel_project should create bible job, got %', row_to_json(v_result);
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
    'Phase18 继续写作大纲补齐',
    '都市逆袭',
    '中文读者',
    '节奏快',
    '已有设定集，需要补齐大纲任务。',
    3,
    800,
    'BIBLE_READY'
  )
  RETURNING id INTO v_bible_project_id;

  INSERT INTO novel_bibles (project_id, story_core, world_setting)
  VALUES (v_bible_project_id, '测试故事核心', '测试世界设定');

  SELECT *
  INTO v_result
  FROM continue_novel_project(v_bible_project_id, '继续写作测试', 'phase18_test');

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'OUTLINE_JOB_CREATED'
     OR v_result.job_type <> 'GENERATE_OUTLINE'
     OR v_result.job_id IS NULL THEN
    RAISE EXCEPTION 'continue_novel_project should create outline job, got %', row_to_json(v_result);
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
    'Phase18 继续写作章节补齐',
    '都市逆袭',
    '中文读者',
    '节奏快',
    '已有设定集和大纲，需要补齐下一章。',
    3,
    800,
    'WRITING'
  )
  RETURNING id INTO v_outline_project_id;

  INSERT INTO novel_bibles (project_id, story_core, world_setting)
  VALUES (v_outline_project_id, '测试故事核心', '测试世界设定');

  INSERT INTO novel_chapter_outlines (project_id, chapter_no, title, summary, status)
  VALUES
    (v_outline_project_id, 1, '第一章', '第一章大纲', 'READY'),
    (v_outline_project_id, 2, '第二章', '第二章大纲', 'READY'),
    (v_outline_project_id, 3, '第三章', '第三章大纲', 'READY');

  SELECT *
  INTO v_chapter_id
  FROM (
    SELECT id
    FROM create_novel_chapter_version(
      v_outline_project_id,
      NULL,
      NULL,
      1,
      '第一章',
      '第一章正文',
      '第一章摘要',
      600,
      'phase18-test',
      'APPROVED',
      TRUE
    )
  ) created;

  UPDATE novel_projects
  SET current_chapter_no = 1
  WHERE id = v_outline_project_id;

  SELECT *
  INTO v_result
  FROM continue_novel_project(v_outline_project_id, '继续写作测试', 'phase18_test');

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'DIRECTOR_JOB_CREATED'
     OR v_result.job_type <> 'PLAN_CHAPTER_DIRECTOR'
     OR v_result.chapter_no <> 2
     OR v_result.job_id IS NULL THEN
    RAISE EXCEPTION 'continue_novel_project should create next chapter director job, got %', row_to_json(v_result);
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
    'Phase18 待审阻断继续写作',
    '都市逆袭',
    '中文读者',
    '节奏快',
    '存在待审章节，应阻断继续写作。',
    3,
    800,
    'REVIEWING'
  )
  RETURNING id INTO v_review_project_id;

  SELECT id
  INTO v_review_chapter_id
  FROM create_novel_chapter_version(
    v_review_project_id,
    NULL,
    NULL,
    1,
    '待审章',
    '待审正文',
    '待审摘要',
    600,
    'phase18-test',
    'NEED_REVIEW',
    FALSE
  );

  SELECT *
  INTO v_result
  FROM continue_novel_project(v_review_project_id, '继续写作测试', 'phase18_test');

  IF v_result.success IS DISTINCT FROM FALSE
     OR v_result.result_code <> 'NEED_REVIEW_BLOCKED' THEN
    RAISE EXCEPTION 'continue_novel_project should block when review exists, got %', row_to_json(v_result);
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
    'Phase18 当前正式章重写',
    '都市逆袭',
    '中文读者',
    '节奏快',
    '正式章节申请重写时不能改变 current。',
    3,
    800,
    'WRITING'
  )
  RETURNING id INTO v_rewrite_project_id;

  SELECT id, review_token
  INTO v_rewrite_chapter_id, v_token
  FROM create_novel_chapter_version(
    v_rewrite_project_id,
    NULL,
    NULL,
    1,
    '正式章',
    '正式正文',
    '正式摘要',
    600,
    'phase18-test',
    'APPROVED',
    TRUE
  );

  SELECT *
  INTO v_result
  FROM request_novel_current_chapter_rewrite(
    v_rewrite_chapter_id,
    v_token,
    '希望强化冲突并保留结尾钩子。',
    'phase18_test'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'REWRITE_JOB_CREATED'
     OR v_result.job_type <> 'REWRITE_CHAPTER'
     OR v_result.job_id IS NULL THEN
    RAISE EXCEPTION 'request_novel_current_chapter_rewrite should create rewrite job, got %', row_to_json(v_result);
  END IF;

  SELECT status, is_current
  INTO v_original
  FROM novel_chapters
  WHERE id = v_rewrite_chapter_id;

  IF v_original.status <> 'APPROVED' OR v_original.is_current IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'approved rewrite should keep original current approved, got %', row_to_json(v_original);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_human_count
  FROM novel_human_reviews
  WHERE chapter_id = v_rewrite_chapter_id
    AND action = 'REQUEST_REWRITE';

  IF v_human_count <> 1 THEN
    RAISE EXCEPTION 'approved rewrite should write one human review, got %', v_human_count;
  END IF;

  SELECT *
  INTO v_result
  FROM request_novel_current_chapter_rewrite(
    v_rewrite_chapter_id,
    v_token,
    '重复点击不应该追加人工记录。',
    'phase18_test'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'REWRITE_JOB_ALREADY_EXISTS'
     OR v_result.job_type <> 'REWRITE_CHAPTER'
     OR v_result.job_id IS NULL THEN
    RAISE EXCEPTION 'duplicate approved rewrite should return existing job, got %', row_to_json(v_result);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_human_count
  FROM novel_human_reviews
  WHERE chapter_id = v_rewrite_chapter_id
    AND action = 'REQUEST_REWRITE';

  IF v_human_count <> 1 THEN
    RAISE EXCEPTION 'duplicate approved rewrite should not append human review, got %', v_human_count;
  END IF;

  SELECT *
  INTO v_result
  FROM request_novel_review_notification(v_review_chapter_id, (SELECT review_token FROM novel_chapters WHERE id = v_review_chapter_id), '重新提醒', 'phase18_test');

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'NOTIFY_JOB_CREATED'
     OR v_result.job_type <> 'NOTIFY_REVIEW'
     OR v_result.job_id IS NULL THEN
    RAISE EXCEPTION 'request_novel_review_notification should create notify job, got %', row_to_json(v_result);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_job_count
  FROM novel_generation_jobs
  WHERE project_id IN (v_project_id, v_bible_project_id, v_outline_project_id, v_review_project_id, v_rewrite_project_id);

  IF v_job_count < 5 THEN
    RAISE EXCEPTION 'phase18 should create expected jobs, got %', v_job_count;
  END IF;
END $$;

ROLLBACK;
