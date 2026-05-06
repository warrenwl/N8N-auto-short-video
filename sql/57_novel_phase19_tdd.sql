-- Phase 19 TDD: project management and manual editing.

BEGIN;

DO $$
DECLARE
  v_project_id UUID := gen_random_uuid();
  v_outline_id UUID := gen_random_uuid();
  v_chapter1_id UUID;
  v_chapter2_id UUID;
  v_result RECORD;
  v_event_count INTEGER;
  v_job_count INTEGER;
  v_project RECORD;
  v_bible RECORD;
  v_outline RECORD;
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
    'Phase19 管理能力测试',
    '都市逆袭',
    '中文读者',
    '节奏快',
    '验证人工管理操作。',
    2,
    1200,
    2,
    'COMPLETED'
  );

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
    v_project_id,
    '旧世界设定',
    '旧故事核心',
    '{"name":"旧主角"}'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '旧能力体系',
    '[]'::jsonb,
    '旧文风',
    '',
    '[]'::jsonb,
    'phase19-test',
    '{}'::jsonb
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
  VALUES
    (v_outline_id, v_project_id, 1, 1, '旧标题', '旧摘要', '旧目标', '旧冲突', '旧情绪', '旧钩子', 'READY'),
    (gen_random_uuid(), v_project_id, 2, 1, '第二章', '第二章摘要', '目标', '冲突', '情绪', '钩子', 'READY');

  SELECT id
  INTO v_chapter1_id
  FROM create_novel_chapter_version(
    v_project_id,
    v_outline_id,
    NULL,
    1,
    '第一章',
    '第一章正文',
    '第一章摘要',
    1000,
    'phase19-test',
    'APPROVED',
    TRUE
  );

  SELECT id
  INTO v_chapter2_id
  FROM create_novel_chapter_version(
    v_project_id,
    NULL,
    v_chapter1_id,
    2,
    '第二章',
    '第二章正文',
    '第二章摘要',
    1000,
    'phase19-test',
    'APPROVED',
    TRUE
  );

  SELECT *
  INTO v_result
  FROM update_novel_bible_manual(
    v_project_id,
    '新世界设定',
    '新故事核心',
    '{"name":"新主角","goal":"翻盘"}'::jsonb,
    '[{"name":"新配角"}]'::jsonb,
    '[{"name":"新反派"}]'::jsonb,
    '新能力体系',
    '[{"from":"新主角","to":"新配角"}]'::jsonb,
    '新文风规则',
    '新禁忌',
    '["新卖点"]'::jsonb,
    '补充设定',
    'phase19_test'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'BIBLE_UPDATED'
     OR v_result.bible_id IS NULL THEN
    RAISE EXCEPTION 'update_novel_bible_manual should save Bible, got %', row_to_json(v_result);
  END IF;

  SELECT world_setting, story_core, main_character
  INTO v_bible
  FROM novel_bibles
  WHERE project_id = v_project_id;

  IF v_bible.world_setting <> '新世界设定'
     OR v_bible.story_core <> '新故事核心'
     OR v_bible.main_character->>'goal' <> '翻盘' THEN
    RAISE EXCEPTION 'Bible was not updated, got %', row_to_json(v_bible);
  END IF;

  SELECT *
  INTO v_result
  FROM update_novel_outline_manual(
    v_project_id,
    v_outline_id,
    2,
    '新标题',
    '新摘要',
    '新目标',
    '新冲突',
    '新情绪',
    '新钩子',
    '调整第一章大纲',
    'phase19_test'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'OUTLINE_UPDATED'
     OR v_result.chapter_no <> 1 THEN
    RAISE EXCEPTION 'update_novel_outline_manual should save outline, got %', row_to_json(v_result);
  END IF;

  SELECT title, summary, volume_no, status
  INTO v_outline
  FROM novel_chapter_outlines
  WHERE id = v_outline_id;

  IF v_outline.title <> '新标题'
     OR v_outline.summary <> '新摘要'
     OR v_outline.volume_no <> 2
     OR v_outline.status <> 'READY' THEN
    RAISE EXCEPTION 'Outline was not updated, got %', row_to_json(v_outline);
  END IF;

  SELECT *
  INTO v_result
  FROM update_novel_project_targets(v_project_id, 1, 1200, '错误目标', 'phase19_test');

  IF v_result.success IS DISTINCT FROM FALSE
     OR v_result.result_code <> 'TARGET_BELOW_PROGRESS' THEN
    RAISE EXCEPTION 'target below progress should be rejected, got %', row_to_json(v_result);
  END IF;

  SELECT *
  INTO v_result
  FROM update_novel_project_targets(v_project_id, 4, 1800, '扩展到四章', 'phase19_test');

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'PROJECT_TARGET_UPDATED'
     OR v_result.project_status <> 'WRITING'
     OR v_result.target_total_chapters <> 4 THEN
    RAISE EXCEPTION 'target update should reopen completed project, got %', row_to_json(v_result);
  END IF;

  SELECT target_total_chapters, target_words_per_chapter, status
  INTO v_project
  FROM novel_projects
  WHERE id = v_project_id;

  IF v_project.target_total_chapters <> 4
     OR v_project.target_words_per_chapter <> 1800
     OR v_project.status <> 'WRITING' THEN
    RAISE EXCEPTION 'Project targets were not updated, got %', row_to_json(v_project);
  END IF;

  SELECT *
  INTO v_result
  FROM continue_novel_project(v_project_id, '补齐扩展后的大纲', 'phase19_test');

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'OUTLINE_JOB_CREATED'
     OR v_result.job_type <> 'GENERATE_OUTLINE' THEN
    RAISE EXCEPTION 'continue should create outline job when next outline is missing, got %', row_to_json(v_result);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_job_count
  FROM novel_generation_jobs
  WHERE project_id = v_project_id
    AND job_type = 'GENERATE_OUTLINE'
    AND status = 'PENDING';

  IF v_job_count <> 1 THEN
    RAISE EXCEPTION 'Expected one pending outline job after target increase, got %', v_job_count;
  END IF;

  SELECT *
  INTO v_result
  FROM set_novel_project_pause_state(v_project_id, 'PAUSE', '暂停调整', 'phase19_test');

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'PROJECT_PAUSED'
     OR v_result.project_status <> 'PAUSED' THEN
    RAISE EXCEPTION 'pause should set project paused, got %', row_to_json(v_result);
  END IF;

  SELECT status
  INTO v_project
  FROM novel_projects
  WHERE id = v_project_id;

  IF v_project.status <> 'PAUSED' THEN
    RAISE EXCEPTION 'Project was not paused, got %', row_to_json(v_project);
  END IF;

  SELECT *
  INTO v_result
  FROM continue_novel_project(v_project_id, '暂停时继续', 'phase19_test');

  IF v_result.success IS DISTINCT FROM FALSE
     OR v_result.result_code <> 'ACTIVE_JOB_BLOCKED' THEN
    RAISE EXCEPTION 'paused project with pending job should be blocked by active queue first, got %', row_to_json(v_result);
  END IF;

  UPDATE novel_generation_jobs
  SET status = 'CANCELLED'
  WHERE project_id = v_project_id
    AND job_type = 'GENERATE_OUTLINE'
    AND status = 'PENDING';

  SELECT *
  INTO v_result
  FROM continue_novel_project(v_project_id, '暂停时继续', 'phase19_test');

  IF v_result.success IS DISTINCT FROM FALSE
     OR v_result.result_code <> 'PROJECT_PAUSED' THEN
    RAISE EXCEPTION 'paused project should block continue after queue clears, got %', row_to_json(v_result);
  END IF;

  SELECT *
  INTO v_result
  FROM set_novel_project_pause_state(v_project_id, 'RESUME', '恢复写作', 'phase19_test');

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'PROJECT_RESUMED'
     OR v_result.project_status <> 'BIBLE_READY' THEN
    RAISE EXCEPTION 'resume should restore previous pre-pause status, got %', row_to_json(v_result);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_event_count
  FROM novel_project_events
  WHERE project_id = v_project_id;

  IF v_event_count < 5 THEN
    RAISE EXCEPTION 'Expected project events for edits/targets/pause/resume, got %', v_event_count;
  END IF;
END $$;

ROLLBACK;
