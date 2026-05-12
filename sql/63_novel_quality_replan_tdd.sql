-- Quality replan TDD: upstream setting/outline/target changes must retire stale director cards.

BEGIN;

DO $$
DECLARE
  v_project_targets_id UUID := gen_random_uuid();
  v_project_outline_id UUID := gen_random_uuid();
  v_project_patch_id UUID := gen_random_uuid();
  v_project_treatment_id UUID := gen_random_uuid();
  v_outline_update_id UUID := gen_random_uuid();
  v_patch_id UUID;
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
    current_chapter_no,
    status
  )
  VALUES
    (
      v_project_targets_id,
      '质量重规划-目标修改',
      '悬疑灵异',
      '短篇试读读者',
      '节奏快、冲突强、章末留钩子',
      '验证目标修改后旧导演台退役。',
      5,
      2000,
      2,
      'WRITING'
    ),
    (
      v_project_outline_id,
      '质量重规划-大纲修改',
      '悬疑灵异',
      '短篇试读读者',
      '节奏快、冲突强、章末留钩子',
      '验证大纲编辑后旧导演台退役。',
      3,
      2000,
      2,
      'OUTLINE_READY'
    ),
    (
      v_project_patch_id,
      '质量重规划-设定补丁',
      '悬疑灵异',
      '短篇试读读者',
      '节奏快、冲突强、章末留钩子',
      '验证设定补丁后旧导演台退役。',
      5,
      2000,
      2,
      'WRITING'
    ),
    (
      v_project_treatment_id,
      '质量重规划-创作母本',
      '悬疑灵异',
      '短篇试读读者',
      '节奏快、冲突强、章末留钩子',
      '验证创作母本重跑后下游任务取消。',
      5,
      2000,
      2,
      'WRITING'
    );

  INSERT INTO novel_story_treatments (
    project_id,
    theme_core,
    reader_promise,
    mystery_stack,
    reveal_ladder,
    emotional_arc
  )
  VALUES (
    v_project_treatment_id,
    '旧母本主题。',
    '旧读者承诺。',
    jsonb_build_array(jsonb_build_object('reader_question', '旧问题')),
    jsonb_build_array(jsonb_build_object('chapter_range', '1-2', 'truth_progress', '旧真相')),
    jsonb_build_array(jsonb_build_object('chapter_range', '1-2', 'emotion', '旧情绪'))
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
  VALUES
    (v_project_targets_id, '引魂灯照见旧怨。', '男主接灯赎旧债。', '{"name":"陆沉"}'::jsonb, '[]'::jsonb, '[]'::jsonb, '引魂灯', '[]'::jsonb, '志异惊悚', '', '["反转"]'::jsonb),
    (v_project_outline_id, '引魂灯照见旧怨。', '男主接灯赎旧债。', '{"name":"陆沉"}'::jsonb, '[]'::jsonb, '[]'::jsonb, '引魂灯', '[]'::jsonb, '志异惊悚', '', '["反转"]'::jsonb),
    (v_project_patch_id, '引魂灯照见旧怨。', '男主接灯赎旧债。', '{"name":"陆沉"}'::jsonb, '[]'::jsonb, '[]'::jsonb, '引魂灯', '[]'::jsonb, '志异惊悚', '', '["反转"]'::jsonb),
    (v_project_treatment_id, '旧世界设定。', '旧故事核心。', '{"name":"陆沉"}'::jsonb, '[]'::jsonb, '[]'::jsonb, '引魂灯', '[]'::jsonb, '志异惊悚', '', '["反转"]'::jsonb);

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
    (gen_random_uuid(), v_project_targets_id, 3, 1, '旧三章', '旧三章摘要。', '旧目标。', '旧冲突。', '旧情绪。', '旧钩子。', 'READY'),
    (gen_random_uuid(), v_project_targets_id, 4, 1, '旧四章', '旧四章摘要。', '旧目标。', '旧冲突。', '旧情绪。', '旧钩子。', 'READY'),
    (v_outline_update_id, v_project_outline_id, 3, 1, '旧大纲章', '旧大纲摘要。', '旧目标。', '旧冲突。', '旧情绪。', '旧钩子。', 'READY'),
    (gen_random_uuid(), v_project_patch_id, 3, 1, '补丁前三章', '旧三章摘要。', '旧目标。', '旧冲突。', '旧情绪。', '旧钩子。', 'READY'),
    (gen_random_uuid(), v_project_patch_id, 4, 1, '补丁前四章', '旧四章摘要。', '旧目标。', '旧冲突。', '旧情绪。', '旧钩子。', 'READY'),
    (gen_random_uuid(), v_project_treatment_id, 3, 1, '母本前三章', '旧三章摘要。', '旧目标。', '旧冲突。', '旧情绪。', '旧钩子。', 'READY');

  INSERT INTO novel_chapter_director_cards (
    project_id,
    outline_id,
    chapter_no,
    version,
    is_current,
    status,
    source,
    card_payload
  )
  SELECT
    o.project_id,
    o.id,
    o.chapter_no,
    1,
    TRUE,
    'READY',
    'AI',
    jsonb_build_object(
      'chapter_intent', '旧导演台',
      'quality_gate', jsonb_build_object('pass', TRUE, 'blocking_issues', '[]'::jsonb),
      'segment_plan', jsonb_build_array(jsonb_build_object('segment_no', 1))
    )
  FROM novel_chapter_outlines o
  WHERE o.project_id IN (v_project_targets_id, v_project_outline_id, v_project_patch_id, v_project_treatment_id);

  INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, status)
  VALUES
    (v_project_targets_id, 'GENERATE_CHAPTER', 3, 'PENDING'),
    (v_project_outline_id, 'GENERATE_CHAPTER', 3, 'PENDING'),
    (v_project_patch_id, 'GENERATE_CHAPTER', 3, 'PENDING'),
    (v_project_patch_id, 'PLAN_CHAPTER_DIRECTOR', 4, 'PENDING'),
    (v_project_treatment_id, 'PLAN_CHAPTER_DIRECTOR', 3, 'PENDING'),
    (v_project_treatment_id, 'GENERATE_CHAPTER', 3, 'PENDING');

  INSERT INTO novel_generation_jobs (project_id, job_type, status)
  VALUES
    (v_project_treatment_id, 'GENERATE_OUTLINE', 'PENDING');

  INSERT INTO novel_continuity_facts (
    project_id,
    fact_type,
    fact_key,
    fact_value,
    source,
    status
  )
  VALUES (
    v_project_treatment_id,
    'foreshadowing',
    '旧母本候选事实',
    '旧母本下游沉淀的待确认事实。',
    'ai',
    'PENDING'
  );

  SELECT *
  INTO v_result
  FROM update_novel_project_targets(
    v_project_targets_id,
    5,
    4000,
    '拉长未写章节',
    'quality_replan_test'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'PROJECT_TARGET_UPDATED' THEN
    RAISE EXCEPTION 'target update should succeed, got %', row_to_json(v_result);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_chapter_director_cards
  WHERE project_id = v_project_targets_id
    AND chapter_no IN (3, 4)
    AND is_current = TRUE;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'target update should retire future current director cards, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_generation_jobs
  WHERE project_id = v_project_targets_id
    AND job_type = 'PLAN_CHAPTER_DIRECTOR'
    AND chapter_no IN (3, 4)
    AND status = 'PENDING';

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'target update should enqueue replanning for chapters 3 and 4, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_generation_jobs
  WHERE project_id = v_project_targets_id
    AND job_type = 'GENERATE_CHAPTER'
    AND chapter_no = 3
    AND status = 'CANCELLED';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'target update should cancel stale chapter job, got %', v_count;
  END IF;

  SELECT *
  INTO v_result
  FROM update_novel_outline_manual(
    v_project_outline_id,
    v_outline_update_id,
    1,
    '新大纲章',
    '新大纲摘要。',
    '新目标。',
    '新冲突。',
    '新情绪。',
    '新钩子。',
    '人工调整大纲',
    'quality_replan_test',
    jsonb_build_array(jsonb_build_object('beat_no', 1, 'beat_goal', '新场景阶梯')),
    jsonb_build_array('新读者追问')
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'OUTLINE_UPDATED' THEN
    RAISE EXCEPTION 'outline update should succeed, got %', row_to_json(v_result);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_chapter_outlines
  WHERE id = v_outline_update_id
    AND scene_beats->0->>'beat_goal' = '新场景阶梯'
    AND reader_questions->>0 = '新读者追问';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'outline update should persist scene beats and reader questions, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_chapter_director_cards
  WHERE project_id = v_project_outline_id
    AND chapter_no = 3
    AND status = 'SUPERSEDED';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'outline update should supersede the stale director card, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_generation_jobs
  WHERE project_id = v_project_outline_id
    AND job_type = 'PLAN_CHAPTER_DIRECTOR'
    AND chapter_no = 3
    AND status = 'PENDING';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'outline update should enqueue a fresh director job, got %', v_count;
  END IF;

  INSERT INTO novel_bible_patches (
    project_id,
    expansion_request,
    expansion_scope,
    expansion_constraints,
    patch_payload,
    risk_notes,
    status
  )
  VALUES (
    v_project_patch_id,
    '重排未写章节，补妹妹宽恕与赵权翻转。',
    'rewrite_unwritten',
    '已批准正文不改。',
    '{"new_characters":[{"name":"妹妹","identity":"男主心结"}],"expansion_notes":"重排未写章节。"}'::jsonb,
    '[]'::jsonb,
    'PENDING'
  )
  RETURNING id INTO v_patch_id;

  SELECT *
  INTO v_result
  FROM manage_novel_bible_patch(v_patch_id, 'APPLY', '确认补丁', 'quality_replan_test');

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'BIBLE_PATCH_APPLIED'
     OR v_result.job_type <> 'GENERATE_OUTLINE' THEN
    RAISE EXCEPTION 'Bible patch apply should enqueue outline recompute, got %', row_to_json(v_result);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_chapter_director_cards
  WHERE project_id = v_project_patch_id
    AND chapter_no IN (3, 4)
    AND is_current = TRUE;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Bible patch apply should retire stale current director cards, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_generation_jobs
  WHERE project_id = v_project_patch_id
    AND job_type IN ('GENERATE_CHAPTER', 'PLAN_CHAPTER_DIRECTOR')
    AND chapter_no IN (3, 4)
    AND status = 'CANCELLED';

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Bible patch apply should cancel stale downstream jobs, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_generation_jobs
  WHERE project_id = v_project_patch_id
    AND job_type = 'GENERATE_OUTLINE'
    AND status = 'PENDING';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Bible patch apply should leave one outline recompute job, got %', v_count;
  END IF;

  SELECT *
  INTO v_result
  FROM request_novel_project_regeneration(
    v_project_treatment_id,
    'TREATMENT',
    '强化母本',
    'quality_replan_test',
    '强化民俗恐怖外壳、救赎内核和真相阶梯。'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'STORY_TREATMENT_REGENERATE_JOB_CREATED'
     OR v_result.job_type <> 'GENERATE_STORY_TREATMENT' THEN
    RAISE EXCEPTION 'treatment regeneration should enqueue story treatment job, got %', row_to_json(v_result);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_generation_jobs
  WHERE project_id = v_project_treatment_id
    AND job_type = 'GENERATE_STORY_TREATMENT'
    AND status = 'PENDING'
    AND payload->>'regenerate_prompt' = '强化民俗恐怖外壳、救赎内核和真相阶梯。';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'treatment regeneration should preserve regenerate prompt in the new job, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_generation_jobs
  WHERE project_id = v_project_treatment_id
    AND job_type IN ('GENERATE_OUTLINE', 'PLAN_CHAPTER_DIRECTOR', 'GENERATE_CHAPTER')
    AND status = 'CANCELLED';

  IF v_count <> 3 THEN
    RAISE EXCEPTION 'treatment regeneration should cancel old downstream pending jobs, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_continuity_facts
  WHERE project_id = v_project_treatment_id
    AND fact_key = '旧母本候选事实'
    AND status = 'INACTIVE';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'treatment regeneration should inactivate pending AI facts, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_project_events
  WHERE project_id = v_project_treatment_id
    AND event_type = 'STORY_TREATMENT_REGENERATE_REQUESTED';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'treatment regeneration should record project event, got %', v_count;
  END IF;
END $$;

SELECT 'novel_quality_replan_tdd_passed' AS result;

ROLLBACK;
