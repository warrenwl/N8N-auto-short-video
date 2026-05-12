-- Story treatment TDD: new projects should generate a creative mother document before Bible.

BEGIN;

DO $$
DECLARE
  v_project_id UUID := gen_random_uuid();
  v_legacy_project_id UUID := gen_random_uuid();
  v_result RECORD;
  v_legacy_result RECORD;
  v_treatment_job_id UUID;
  v_ai_run_id UUID;
  v_count INTEGER;
  v_legacy_job_count INTEGER;
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
    '创作母本测试',
    '悬疑灵异',
    '短篇试读读者',
    '悬疑紧张、伏笔清晰、反转克制',
    '阴阳引渡人接到一桩红衣凶案。',
    4,
    2000,
    'CREATED'
  );

  SELECT *
  INTO v_result
  FROM continue_novel_project(v_project_id, '先生成创作母本', 'story_treatment_test');

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'STORY_TREATMENT_JOB_CREATED'
     OR v_result.job_type <> 'GENERATE_STORY_TREATMENT' THEN
    RAISE EXCEPTION 'continue should create story treatment first, got %', row_to_json(v_result);
  END IF;

  SELECT id
  INTO v_treatment_job_id
  FROM novel_generation_jobs
  WHERE project_id = v_project_id
    AND job_type = 'GENERATE_STORY_TREATMENT'
    AND status = 'PENDING'
  LIMIT 1;

  IF v_treatment_job_id IS NULL THEN
    RAISE EXCEPTION 'pending story treatment job should exist';
  END IF;

  INSERT INTO novel_ai_runs (
    project_id,
    job_id,
    run_type,
    model,
    prompt_version,
    request_payload,
    response_payload,
    parsed_payload,
    success
  )
  VALUES (
    v_project_id,
    v_treatment_job_id,
    'GENERATE_STORY_TREATMENT',
    'glm-5.1',
    'novel-v1-20260504',
    '{"messages":[]}'::jsonb,
    '{"choices":[]}'::jsonb,
    jsonb_build_object(
      'theme_core', '红衣不是恐怖符号，而是未偿旧债。',
      'reader_promise', '每章都有可误读线索和一次情绪偿还。',
      'reveal_ladder', jsonb_build_array(jsonb_build_object('chapter_range', '1-2'))
    ),
    TRUE
  )
  RETURNING id INTO v_ai_run_id;

  INSERT INTO novel_story_treatments (
    project_id,
    theme_core,
    reader_promise,
    mystery_stack,
    reveal_ladder,
    emotional_arc,
    protagonist_inner_wound,
    symbolic_motifs,
    ending_payoff,
    quality_notes,
    generation_model,
    raw_payload
  )
  VALUES (
    v_project_id,
    '红衣不是恐怖符号，而是未偿旧债。',
    '每章都有可误读线索和一次情绪偿还。',
    jsonb_build_array(jsonb_build_object('reader_question', '红衣女人为什么只在雨夜出现？')),
    jsonb_build_array(jsonb_build_object('chapter_range', '1-2', 'do_not_reveal', TRUE)),
    jsonb_build_array(jsonb_build_object('chapter_range', '1-4', 'inner_shift', '逃避到承担')),
    '主角曾经放弃过一个亡魂。',
    jsonb_build_array(jsonb_build_object('motif', '红伞', 'meaning', '旧债入口')),
    '主角承认旧债后完成引渡。',
    '避免把灵异写成设定百科。',
    'glm-5.1',
    jsonb_build_object('ai_run_id', v_ai_run_id)
  )
  ON CONFLICT (project_id) DO UPDATE
  SET
    theme_core = EXCLUDED.theme_core,
    reader_promise = EXCLUDED.reader_promise,
    mystery_stack = EXCLUDED.mystery_stack,
    reveal_ladder = EXCLUDED.reveal_ladder,
    emotional_arc = EXCLUDED.emotional_arc,
    protagonist_inner_wound = EXCLUDED.protagonist_inner_wound,
    symbolic_motifs = EXCLUDED.symbolic_motifs,
    ending_payoff = EXCLUDED.ending_payoff,
    quality_notes = EXCLUDED.quality_notes,
    generation_model = EXCLUDED.generation_model,
    raw_payload = EXCLUDED.raw_payload;

  INSERT INTO novel_project_events (
    project_id,
    event_type,
    actor,
    comment,
    after_payload
  )
  VALUES (
    v_project_id,
    'STORY_TREATMENT_UPDATED',
    'story_treatment_test',
    '创作母本已生成',
    jsonb_build_object('ai_run_id', v_ai_run_id)
  );

  UPDATE novel_generation_jobs
  SET status = 'SUCCEEDED', finished_at = NOW()
  WHERE id = v_treatment_job_id;

  INSERT INTO novel_generation_jobs (project_id, job_type, status)
  VALUES (v_project_id, 'GENERATE_BIBLE', 'PENDING')
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_story_treatments
  WHERE project_id = v_project_id
    AND theme_core LIKE '%未偿旧债%'
    AND jsonb_array_length(reveal_ladder) = 1;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'story treatment should be stored once with reveal ladder, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_generation_jobs
  WHERE project_id = v_project_id
    AND job_type = 'GENERATE_BIBLE'
    AND status = 'PENDING';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'story treatment completion should enqueue one pending Bible job, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_project_events
  WHERE project_id = v_project_id
    AND event_type = 'STORY_TREATMENT_UPDATED';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'story treatment update event should be recorded, got %', v_count;
  END IF;

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
    v_legacy_project_id,
    '旧项目创作母本补齐测试',
    '悬疑灵异',
    '短篇试读读者',
    '悬疑紧张',
    '旧项目已有设定集，但缺少创作母本。',
    5,
    2000,
    'OUTLINE_READY'
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
    selling_points
  )
  VALUES (
    v_legacy_project_id,
    '旧城阴阳交界。',
    '主角接灯引渡。',
    '{"name":"沈灯"}'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '引魂灯规则。',
    '[]'::jsonb,
    '恐怖外壳，救赎内核。',
    '不提前揭示终局。',
    '["民俗悬疑"]'::jsonb
  );

  SELECT *
  INTO v_legacy_result
  FROM continue_novel_project(v_legacy_project_id, '补齐旧项目母本', 'story_treatment_test');

  IF v_legacy_result.success IS DISTINCT FROM TRUE
     OR v_legacy_result.result_code <> 'STORY_TREATMENT_JOB_CREATED'
     OR v_legacy_result.job_type <> 'GENERATE_STORY_TREATMENT' THEN
    RAISE EXCEPTION 'legacy project without story treatment should create treatment first, got %', row_to_json(v_legacy_result);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_legacy_job_count
  FROM novel_generation_jobs
  WHERE project_id = v_legacy_project_id
    AND job_type = 'GENERATE_STORY_TREATMENT'
    AND status = 'PENDING';

  IF v_legacy_job_count <> 1 THEN
    RAISE EXCEPTION 'legacy project should get exactly one pending story treatment job, got %', v_legacy_job_count;
  END IF;

  RAISE NOTICE 'Story treatment DB assertions passed for project %', v_project_id;
END $$;

SELECT 'novel_story_treatment_tdd_passed' AS result;

ROLLBACK;
