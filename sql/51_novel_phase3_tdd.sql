-- Phase 3 workflow-level database flow assertions.
-- Simulates workflows 11-13 without calling the real GLM API.

BEGIN;

CREATE TEMP TABLE phase3_tdd_evidence (
  project_id UUID,
  project_status TEXT,
  bible_count INTEGER,
  outline_ready_count INTEGER,
  bible_job_succeeded_count INTEGER,
  outline_job_succeeded_count INTEGER,
  first_chapter_job_count INTEGER,
  ai_run_count INTEGER
) ON COMMIT DROP;

DO $$
DECLARE
  v_project_id UUID;
  v_bible_job_id UUID;
  v_outline_job_id UUID;
  v_bible_ai_run_id UUID;
  v_outline_ai_run_id UUID;
  v_count INTEGER;
BEGIN
  WITH project AS (
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
      'Phase3 TDD ' || gen_random_uuid()::text,
      '都市奇幻',
      '中文网文读者',
      '强冲突、强钩子',
      '测试工作流 11-13：创建项目后生成 Bible、大纲和第 1 章任务。',
      3,
      1200,
      'CREATED'
    )
    RETURNING *
  ), job AS (
    INSERT INTO novel_generation_jobs (project_id, job_type, status)
    SELECT id, 'GENERATE_BIBLE', 'PENDING'
    FROM project
    ON CONFLICT DO NOTHING
    RETURNING *
  )
  SELECT project.id, job.id
  INTO v_project_id, v_bible_job_id
  FROM project
  JOIN job ON true;

  IF v_project_id IS NULL OR v_bible_job_id IS NULL THEN
    RAISE EXCEPTION 'project creation should create GENERATE_BIBLE job';
  END IF;

  WITH claimed AS (
    SELECT id
    FROM novel_generation_jobs
    WHERE job_type = 'GENERATE_BIBLE'
      AND project_id = v_project_id
      AND status = 'PENDING'
      AND attempt_count < max_attempts
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE novel_generation_jobs j
  SET
    status = 'RUNNING',
    started_at = NOW(),
    attempt_count = attempt_count + 1,
    updated_at = NOW()
  FROM claimed
  WHERE j.id = claimed.id
  RETURNING j.id INTO v_bible_job_id;

  IF v_bible_job_id IS NULL THEN
    RAISE EXCEPTION 'workflow 12 should claim one GENERATE_BIBLE job';
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
    success,
    started_at,
    finished_at,
    duration_ms
  )
  VALUES (
    v_project_id,
    v_bible_job_id,
    'GENERATE_BIBLE',
    'glm-test',
    'phase3-test',
    '{"messages":[]}'::jsonb,
    '{"choices":[]}'::jsonb,
    '{"world_setting":"测试世界观"}'::jsonb,
    TRUE,
    NOW() - INTERVAL '1 second',
    NOW(),
    1000
  )
  RETURNING id INTO v_bible_ai_run_id;

  WITH bible AS (
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
      '城市传闻正在复苏。',
      '修表师追查父亲失踪真相。',
      '{"name":"林昼","goal":"查清父亲失踪真相"}'::jsonb,
      '[{"name":"许青瓷","role":"记者"}]'::jsonb,
      '[{"name":"镜会"}]'::jsonb,
      '传闻能力需要付出代价。',
      '[]'::jsonb,
      '强场景、少解释。',
      '不提前揭露父亲结局。',
      '["都市传闻","父子悬念"]'::jsonb,
      'glm-test',
      '{"fixture":"phase3"}'::jsonb
    )
    ON CONFLICT (project_id) DO UPDATE
    SET
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
      raw_payload = EXCLUDED.raw_payload,
      updated_at = NOW()
    RETURNING *
  ), project AS (
    UPDATE novel_projects
    SET status = 'BIBLE_READY'
    WHERE id = v_project_id
    RETURNING *
  ), job AS (
    INSERT INTO novel_generation_jobs (project_id, job_type, status)
    VALUES (v_project_id, 'GENERATE_OUTLINE', 'PENDING')
    ON CONFLICT DO NOTHING
    RETURNING *
  )
  SELECT id
  INTO v_outline_job_id
  FROM job;

  UPDATE novel_generation_jobs
  SET status = 'SUCCEEDED', finished_at = NOW(), updated_at = NOW()
  WHERE id = v_bible_job_id;

  IF v_outline_job_id IS NULL THEN
    RAISE EXCEPTION 'Bible workflow should create GENERATE_OUTLINE job';
  END IF;

  WITH claimed AS (
    SELECT id
    FROM novel_generation_jobs
    WHERE job_type = 'GENERATE_OUTLINE'
      AND project_id = v_project_id
      AND status = 'PENDING'
      AND attempt_count < max_attempts
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE novel_generation_jobs j
  SET
    status = 'RUNNING',
    started_at = NOW(),
    attempt_count = attempt_count + 1,
    updated_at = NOW()
  FROM claimed
  WHERE j.id = claimed.id
  RETURNING j.id INTO v_outline_job_id;

  IF v_outline_job_id IS NULL THEN
    RAISE EXCEPTION 'workflow 13 should claim one GENERATE_OUTLINE job';
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
    success,
    started_at,
    finished_at,
    duration_ms
  )
  VALUES (
    v_project_id,
    v_outline_job_id,
    'GENERATE_OUTLINE',
    'glm-test',
    'phase3-test',
    '{"messages":[]}'::jsonb,
    '{"choices":[]}'::jsonb,
    '{"chapters":[{"chapter_no":1},{"chapter_no":2},{"chapter_no":3}]}'::jsonb,
    TRUE,
    NOW() - INTERVAL '1 second',
    NOW(),
    1000
  )
  RETURNING id INTO v_outline_ai_run_id;

  WITH input AS (
    SELECT
      v_project_id AS project_id,
      '[
        {"chapter_no":1,"volume_no":1,"title":"第一章：旧钟表店","summary":"林昼收到怀表。","chapter_goal":"引出主线","conflict_point":"抢夺怀表","emotional_point":"从逃避到追查","hook":"怀表传出声音"},
        {"chapter_no":2,"volume_no":1,"title":"第二章：雨夜追逐","summary":"林昼发现传闻能力。","chapter_goal":"展示能力","conflict_point":"镜会追击","emotional_point":"第一次主动反击","hook":"记者认出怀表"},
        {"chapter_no":3,"volume_no":1,"title":"第三章：镜中人","summary":"主角接触镜会线索。","chapter_goal":"扩大谜团","conflict_point":"真假证人","emotional_point":"信任试探","hook":"父亲影像出现"}
      ]'::jsonb AS chapters_json
  ), chapters AS (
    SELECT value
    FROM input, jsonb_array_elements(input.chapters_json) AS value
  ), upserted AS (
    INSERT INTO novel_chapter_outlines (
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
    SELECT
      v_project_id,
      (value->>'chapter_no')::integer,
      COALESCE(NULLIF(value->>'volume_no', '')::integer, 1),
      NULLIF(value->>'title', ''),
      NULLIF(value->>'summary', ''),
      NULLIF(value->>'chapter_goal', ''),
      NULLIF(value->>'conflict_point', ''),
      NULLIF(value->>'emotional_point', ''),
      NULLIF(value->>'hook', ''),
      'READY'
    FROM chapters
    ON CONFLICT (project_id, chapter_no) DO UPDATE
    SET
      volume_no = EXCLUDED.volume_no,
      title = EXCLUDED.title,
      summary = EXCLUDED.summary,
      chapter_goal = EXCLUDED.chapter_goal,
      conflict_point = EXCLUDED.conflict_point,
      emotional_point = EXCLUDED.emotional_point,
      hook = EXCLUDED.hook,
      status = 'READY',
      updated_at = NOW()
    RETURNING *
  ), project AS (
    UPDATE novel_projects
    SET status = 'OUTLINE_READY'
    WHERE id = v_project_id
    RETURNING *
  ), job AS (
    INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, status)
    VALUES (v_project_id, 'PLAN_CHAPTER_DIRECTOR', 1, 'PENDING')
    ON CONFLICT DO NOTHING
    RETURNING *
  )
  SELECT COUNT(*)
  INTO v_count
  FROM upserted;

  IF v_count <> 3 THEN
    RAISE EXCEPTION 'outline workflow should upsert 3 outlines, got %', v_count;
  END IF;

  UPDATE novel_generation_jobs
  SET status = 'SUCCEEDED', finished_at = NOW(), updated_at = NOW()
  WHERE id = v_outline_job_id;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_generation_jobs
    WHERE project_id = v_project_id
      AND job_type = 'PLAN_CHAPTER_DIRECTOR'
      AND chapter_no = 1
      AND status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'outline workflow should create first chapter PLAN_CHAPTER_DIRECTOR job';
  END IF;

  INSERT INTO phase3_tdd_evidence (
    project_id,
    project_status,
    bible_count,
    outline_ready_count,
    bible_job_succeeded_count,
    outline_job_succeeded_count,
    first_chapter_job_count,
    ai_run_count
  )
  SELECT
    v_project_id,
    (SELECT status FROM novel_projects WHERE id = v_project_id),
    (SELECT COUNT(*)::integer FROM novel_bibles WHERE project_id = v_project_id),
    (SELECT COUNT(*)::integer FROM novel_chapter_outlines WHERE project_id = v_project_id AND status = 'READY'),
    (SELECT COUNT(*)::integer FROM novel_generation_jobs WHERE id = v_bible_job_id AND status = 'SUCCEEDED'),
    (SELECT COUNT(*)::integer FROM novel_generation_jobs WHERE id = v_outline_job_id AND status = 'SUCCEEDED'),
    (SELECT COUNT(*)::integer FROM novel_generation_jobs WHERE project_id = v_project_id AND job_type = 'PLAN_CHAPTER_DIRECTOR' AND chapter_no = 1 AND status = 'PENDING'),
    (SELECT COUNT(*)::integer FROM novel_ai_runs WHERE project_id = v_project_id);

  RAISE NOTICE 'Phase 3 DB flow assertions passed for project %', v_project_id;
END;
$$;

TABLE phase3_tdd_evidence;

SELECT 'phase3_workflow_flow_passed' AS result;

ROLLBACK;
