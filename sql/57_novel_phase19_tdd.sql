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
  v_patch_id UUID;
  v_fact_id UUID;
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
    'phase19_test',
    '[{"name":"新商会"}]'::jsonb,
    '[{"name":"新地点"}]'::jsonb,
    '[{"constraint":"新约束"}]'::jsonb,
    '扩写备注'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'BIBLE_UPDATED'
     OR v_result.bible_id IS NULL THEN
    RAISE EXCEPTION 'update_novel_bible_manual should save Bible, got %', row_to_json(v_result);
  END IF;

  SELECT world_setting, story_core, main_character, organizations, locations, plot_constraints, expansion_notes
  INTO v_bible
  FROM novel_bibles
  WHERE project_id = v_project_id;

  IF v_bible.world_setting <> '新世界设定'
     OR v_bible.story_core <> '新故事核心'
     OR v_bible.main_character->>'goal' <> '翻盘'
     OR v_bible.organizations->0->>'name' <> '新商会'
     OR v_bible.locations->0->>'name' <> '新地点'
     OR v_bible.plot_constraints->0->>'constraint' <> '新约束'
     OR v_bible.expansion_notes <> '扩写备注' THEN
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
  FROM update_novel_project_targets(
    v_project_id,
    4,
    1800,
    '扩展到四章',
    'phase19_test',
    '新增女主身世线、反派商会冲突和第 4 章伏笔。',
    'append_only',
    '已批准正文不改；已激活事实不破坏。'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'PROJECT_TARGET_UPDATED'
     OR v_result.project_status <> 'WRITING'
     OR v_result.target_total_chapters <> 4 THEN
    RAISE EXCEPTION 'target update should reopen completed project, got %', row_to_json(v_result);
  END IF;

  SELECT target_total_chapters, target_words_per_chapter, expansion_request, expansion_scope, expansion_constraints, status
  INTO v_project
  FROM novel_projects
  WHERE id = v_project_id;

  IF v_project.target_total_chapters <> 4
     OR v_project.target_words_per_chapter <> 1800
     OR v_project.expansion_request !~ '女主身世线'
     OR v_project.expansion_scope <> 'append_only'
     OR v_project.expansion_constraints !~ '已批准正文不改'
     OR v_project.status <> 'WRITING' THEN
    RAISE EXCEPTION 'Project targets were not updated, got %', row_to_json(v_project);
  END IF;

  SELECT *
  INTO v_result
  FROM manage_novel_project_fact(
    v_project_id,
    NULL,
    'CREATE',
    'rule',
    '核心设定锁定',
    '一女主三男主、甜宠开头、虐恋结尾不可变。',
    NULL,
    'ACTIVE',
    '新增项目核心事实',
    'phase19_test'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'FACT_CREATED' THEN
    RAISE EXCEPTION 'manage_novel_project_fact should create human fact, got %', row_to_json(v_result);
  END IF;

  SELECT id
  INTO v_fact_id
  FROM novel_continuity_facts
  WHERE project_id = v_project_id
    AND fact_key = '核心设定锁定'
    AND source = 'human'
    AND status = 'ACTIVE'
  LIMIT 1;

  IF v_fact_id IS NULL THEN
    RAISE EXCEPTION 'Expected created human fact to be active.';
  END IF;

  SELECT COUNT(*)::integer
  INTO v_event_count
  FROM novel_project_events
  WHERE project_id = v_project_id
    AND event_type = 'FACT_CREATED'
    AND after_payload->>'fact_key' = '核心设定锁定';

  IF v_event_count <> 1 THEN
    RAISE EXCEPTION 'Expected fact creation project event, got %', v_event_count;
  END IF;

  SELECT *
  INTO v_result
  FROM manage_novel_project_fact(
    v_project_id,
    NULL,
    'CREATE',
    'other',
    '清理候选事实',
    '这条事实用于验证清理失效事实只删除 INACTIVE。',
    NULL,
    'INACTIVE',
    '新增待清理失效事实',
    'phase19_test'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'FACT_CREATED' THEN
    RAISE EXCEPTION 'manage_novel_project_fact should create inactive fact, got %', row_to_json(v_result);
  END IF;

  SELECT *
  INTO v_result
  FROM manage_novel_project_fact(
    v_project_id,
    NULL,
    'CLEAR_INACTIVE',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    '清理失效事实测试',
    'phase19_test'
  );

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'FACTS_CLEARED' THEN
    RAISE EXCEPTION 'manage_novel_project_fact should clear inactive facts, got %', row_to_json(v_result);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_event_count
  FROM novel_continuity_facts
  WHERE project_id = v_project_id
    AND fact_key = '清理候选事实';

  IF v_event_count <> 0 THEN
    RAISE EXCEPTION 'Expected inactive fact to be deleted, got % rows', v_event_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_event_count
  FROM novel_continuity_facts
  WHERE project_id = v_project_id
    AND fact_key = '核心设定锁定'
    AND status = 'ACTIVE';

  IF v_event_count <> 1 THEN
    RAISE EXCEPTION 'Expected active fact to be preserved after inactive cleanup, got % rows', v_event_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_event_count
  FROM novel_project_events
  WHERE project_id = v_project_id
    AND event_type = 'FACTS_CLEARED'
    AND after_payload->>'deleted_fact_count' = '1'
    AND before_payload::text LIKE '%清理候选事实%';

  IF v_event_count <> 1 THEN
    RAISE EXCEPTION 'Expected fact cleanup project event with deleted fact audit payload, got %', v_event_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_job_count
  FROM novel_generation_jobs
  WHERE project_id = v_project_id
    AND job_type = 'GENERATE_BIBLE_PATCH'
    AND status = 'PENDING';

  IF v_job_count <> 1 THEN
    RAISE EXCEPTION 'Expected one pending Bible patch job after expansion plan update, got %', v_job_count;
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
    v_project_id,
    '新增补丁角色和商会',
    'append_only',
    '已批准正文不改',
    '{
      "new_characters":[{"name":"补丁角色","identity":"商会线联系人"}],
      "new_organizations":[{"name":"补丁商会","type":"商会","leader":"补丁会长"}],
      "new_locations":[{"name":"补丁地点","story_function":"后续冲突场"}],
      "relationship_updates":[{"from":"新主角","to":"补丁角色","relationship":"临时同盟"}],
      "plot_constraints":[{"constraint":"补丁真相第4章后揭露"}],
      "expansion_notes":"补丁备注",
      "risk_notes":[]
    }'::jsonb,
    '[]'::jsonb,
    'PENDING'
  )
  RETURNING id INTO v_patch_id;

  SELECT *
  INTO v_result
  FROM manage_novel_bible_patch(v_patch_id, 'APPLY', '确认扩写设定', 'phase19_test');

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'BIBLE_PATCH_APPLIED'
     OR v_result.bible_patch_id <> v_patch_id
     OR v_result.job_type <> 'GENERATE_OUTLINE'
     OR v_result.job_id IS NULL THEN
    RAISE EXCEPTION 'Bible patch should apply to formal Bible, got %', row_to_json(v_result);
  END IF;

  SELECT supporting_characters, organizations, locations, relationship_map, plot_constraints, expansion_notes
  INTO v_bible
  FROM novel_bibles
  WHERE project_id = v_project_id;

  IF NOT (v_bible.supporting_characters @> '[{"name":"补丁角色"}]'::jsonb)
     OR NOT (v_bible.organizations @> '[{"name":"补丁商会"}]'::jsonb)
     OR NOT (v_bible.locations @> '[{"name":"补丁地点"}]'::jsonb)
     OR NOT (v_bible.relationship_map @> '[{"from":"新主角","to":"补丁角色","relationship":"临时同盟"}]'::jsonb)
     OR NOT (v_bible.plot_constraints @> '[{"constraint":"补丁真相第4章后揭露"}]'::jsonb)
     OR v_bible.expansion_notes !~ '补丁备注' THEN
    RAISE EXCEPTION 'Bible patch was not merged into Bible, got %', row_to_json(v_bible);
  END IF;

  UPDATE novel_generation_jobs
  SET status = 'SUCCEEDED'
  WHERE project_id = v_project_id
    AND job_type = 'GENERATE_BIBLE_PATCH'
    AND status = 'PENDING';

  SELECT COUNT(*)::integer
  INTO v_job_count
  FROM novel_generation_jobs
  WHERE project_id = v_project_id
    AND job_type = 'GENERATE_OUTLINE'
    AND status = 'PENDING';

  IF v_job_count <> 1 THEN
    RAISE EXCEPTION 'Expected one pending outline job after Bible patch apply, got %', v_job_count;
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

DO $$
DECLARE
  v_archived_project_id UUID := gen_random_uuid();
  v_active_project_id UUID := gen_random_uuid();
  v_result RECORD;
  v_count INTEGER;
BEGIN
  INSERT INTO novel_projects (id, title, genre, status)
  VALUES
    (v_archived_project_id, 'Phase19 待清理归档项目', '都市逆袭', 'ARCHIVED'),
    (v_active_project_id, 'Phase19 不应清理项目', '都市逆袭', 'BIBLE_READY');

  INSERT INTO novel_bibles (project_id, world_setting, story_core)
  VALUES (v_archived_project_id, '待删除世界', '待删除核心');

  SELECT *
  INTO v_result
  FROM clear_novel_archived_projects('清理归档项目测试', 'phase19_test');

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'ARCHIVED_PROJECTS_CLEARED'
     OR v_result.deleted_project_count < 1 THEN
    RAISE EXCEPTION 'clear_novel_archived_projects should delete archived projects, got %', row_to_json(v_result);
  END IF;

  IF NOT v_result.deleted_project_titles LIKE '%Phase19 待清理归档项目%' THEN
    RAISE EXCEPTION 'clear_novel_archived_projects should return deleted project titles, got %', row_to_json(v_result);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_projects
  WHERE id = v_archived_project_id;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Archived project should be deleted, got % rows', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_bibles
  WHERE project_id = v_archived_project_id;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Archived project Bible should cascade delete, got % rows', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_projects
  WHERE id = v_active_project_id;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Active project should not be deleted, got % rows', v_count;
  END IF;

  SELECT *
  INTO v_result
  FROM clear_novel_archived_projects('再次清理', 'phase19_test');

  IF v_result.success IS DISTINCT FROM TRUE
     OR v_result.result_code <> 'ARCHIVED_PROJECTS_NONE'
     OR v_result.deleted_project_count <> 0 THEN
    RAISE EXCEPTION 'clear_novel_archived_projects should report none when no archived projects remain, got %', row_to_json(v_result);
  END IF;
END $$;

ROLLBACK;
