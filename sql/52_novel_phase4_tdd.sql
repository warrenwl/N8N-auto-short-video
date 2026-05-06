-- Phase 4 database flow assertions for chapter generation + AI review.
-- Simulates workflows 14-15 without calling the real GLM API.

BEGIN;

CREATE TEMP TABLE phase4_tdd_evidence (
  project_id UUID,
  chapter_id UUID,
  chapter_status TEXT,
  chapter_is_current BOOLEAN,
  generation_job_succeeded_count INTEGER,
  review_job_succeeded_count INTEGER,
  pending_ai_fact_count INTEGER,
  review_report_count INTEGER,
  review_report_with_ai_run_count INTEGER,
  notify_review_job_count INTEGER,
  project_status TEXT
) ON COMMIT DROP;

DO $$
DECLARE
  v_project_id UUID;
  v_outline_id UUID;
  v_generation_job_id UUID;
  v_review_job_id UUID;
  v_generation_ai_run_id UUID;
  v_review_ai_run_id UUID;
  v_chapter novel_chapters%ROWTYPE;
  v_count INTEGER;
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
    'Phase4 TDD ' || gen_random_uuid()::text,
    '都市奇幻',
    '中文网文读者',
    '强冲突、强钩子',
    '测试工作流 14-15：第 1 章候选稿生成和 AI 审稿。',
    3,
    1200,
    'OUTLINE_READY'
  )
  RETURNING id INTO v_project_id;

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
    '{"fixture":"phase4"}'::jsonb
  );

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
  VALUES (
    v_project_id,
    1,
    1,
    '旧钟表店的第一声回响',
    '林昼收到停在父亲失踪时刻的怀表。',
    '建立主角目标并引出怀表异常。',
    '陌生人抢夺怀表。',
    '林昼从逃避转为追查。',
    '怀表里传出父亲的声音。',
    'READY'
	  )
	  RETURNING id INTO v_outline_id;

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
  VALUES (
    v_project_id,
    v_outline_id,
    1,
    1,
    TRUE,
    'READY',
    'AI',
    jsonb_build_object(
      'chapter_intent', 'Phase4 测试导演台',
      'quality_gate', jsonb_build_object('pass', TRUE, 'blocking_issues', '[]'::jsonb),
      'segment_plan', jsonb_build_array(jsonb_build_object('segment_no', 1, 'goal', '生成完整章节'))
    )
  );

  INSERT INTO novel_continuity_facts (
    project_id,
    chapter_no,
    fact_type,
    fact_key,
    fact_value,
    source,
    status
  )
  VALUES
    (v_project_id, 1, 'rule', '人工锁定规则', '怀表必须保留为关键物品。', 'human', 'ACTIVE'),
    (v_project_id, 1, 'item', '旧 AI 事实', '同章旧 AI facts 不应进入本章生成/审稿上下文。', 'ai', 'ACTIVE');

  SELECT COUNT(*)
  INTO v_count
  FROM novel_continuity_facts
  WHERE project_id = v_project_id
    AND status = 'ACTIVE'
    AND (chapter_no IS NULL OR chapter_no < 1 OR source = 'human')
    AND source = 'ai';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'same-chapter AI facts should be excluded for chapter 1 context';
  END IF;

  INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, status)
  VALUES (v_project_id, 'GENERATE_CHAPTER', 1, 'PENDING')
  RETURNING id INTO v_generation_job_id;

  WITH claimed AS (
    SELECT id
    FROM novel_generation_jobs
	    WHERE job_type = 'GENERATE_CHAPTER'
	      AND project_id = v_project_id
	      AND chapter_no = 1
	      AND status = 'PENDING'
	      AND attempt_count < max_attempts
      AND EXISTS (
        SELECT 1
        FROM novel_chapter_director_cards d
        WHERE d.project_id = novel_generation_jobs.project_id
          AND d.chapter_no = novel_generation_jobs.chapter_no
          AND d.is_current = TRUE
          AND d.status = 'READY'
      )
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
  RETURNING j.id INTO v_generation_job_id;

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
    v_generation_job_id,
    'GENERATE_CHAPTER',
    'glm-test',
    'phase4-test',
    '{"messages":[]}'::jsonb,
    '{"choices":[]}'::jsonb,
    '{"chapter_title":"旧钟表店的第一声回响"}'::jsonb,
    TRUE,
    NOW() - INTERVAL '1 second',
    NOW(),
    1000
  )
  RETURNING id INTO v_generation_ai_run_id;

  SELECT *
  INTO v_chapter
  FROM create_novel_chapter_version(
    v_project_id,
    v_outline_id,
    NULL,
    1,
    '旧钟表店的第一声回响',
    '雨水砸在旧钟表店的卷帘门上。',
    '林昼收到父亲怀表并遭遇抢夺。',
    1200,
    'glm-test',
    'DRAFT_READY',
    FALSE
  );

  IF v_chapter.status <> 'DRAFT_READY' OR v_chapter.is_current IS TRUE THEN
    RAISE EXCEPTION 'generated candidate should be DRAFT_READY + is_current=false';
  END IF;

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
  VALUES
    (v_project_id, v_chapter.id, 1, v_chapter.generation_version, 'item', '父亲怀表', '怀表停在父亲失踪时刻。', 'ai', 0.9, 'PENDING'),
    (v_project_id, v_chapter.id, 1, v_chapter.generation_version, 'foreshadowing', '怀表声音', '怀表能传出父亲留下的声音。', 'ai', 0.8, 'PENDING');

  INSERT INTO novel_generation_jobs (project_id, chapter_id, job_type, chapter_no, status)
  VALUES (v_project_id, v_chapter.id, 'REVIEW_CHAPTER', 1, 'PENDING')
  RETURNING id INTO v_review_job_id;

  UPDATE novel_generation_jobs
  SET status = 'SUCCEEDED', finished_at = NOW(), updated_at = NOW()
  WHERE id = v_generation_job_id;

  WITH claimed AS (
    SELECT id
    FROM novel_generation_jobs
    WHERE job_type = 'REVIEW_CHAPTER'
      AND project_id = v_project_id
      AND chapter_id = v_chapter.id
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
  RETURNING j.id INTO v_review_job_id;

  INSERT INTO novel_ai_runs (
    project_id,
    chapter_id,
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
    v_chapter.id,
    v_review_job_id,
    'REVIEW_CHAPTER',
    'glm-test',
    'phase4-test',
    '{"messages":[]}'::jsonb,
    '{"choices":[]}'::jsonb,
    '{"total_score":87}'::jsonb,
    TRUE,
    NOW() - INTERVAL '1 second',
    NOW(),
    1000
  )
  RETURNING id INTO v_review_ai_run_id;

  WITH report AS (
    INSERT INTO novel_review_reports (
      project_id,
      chapter_id,
      ai_run_id,
      consistency_score,
      readability_score,
      plot_score,
      commercial_score,
      total_score,
      issues,
      suggestions,
      verdict
    )
    VALUES (
      v_project_id,
      v_chapter.id,
      v_review_ai_run_id,
      88,
      91,
      84,
      86,
      87,
      '[{"type":"节奏","description":"中段追逐可以再压缩。","severity":"low"}]'::jsonb,
      '["强化结尾怀表声音的悬念"]'::jsonb,
      'PASS'
    )
    RETURNING *
  ), reviewed AS (
    UPDATE novel_chapters
    SET status = 'NEED_REVIEW'
    WHERE id = v_chapter.id
      AND status IN ('DRAFT_READY', 'AI_REVIEWED')
    RETURNING *
  ), project AS (
    UPDATE novel_projects
    SET status = 'REVIEWING'
    WHERE id = v_project_id
    RETURNING *
  ), notify_job AS (
    INSERT INTO novel_generation_jobs (project_id, chapter_id, job_type, chapter_no, status)
    SELECT project_id, id, 'NOTIFY_REVIEW', chapter_no, 'PENDING'
    FROM reviewed
    ON CONFLICT DO NOTHING
    RETURNING *
  )
  SELECT COUNT(*) INTO v_count FROM report;

  UPDATE novel_generation_jobs
  SET status = 'SUCCEEDED', finished_at = NOW(), updated_at = NOW()
  WHERE id = v_review_job_id;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_chapters
    WHERE id = v_chapter.id
      AND status = 'NEED_REVIEW'
      AND is_current = FALSE
  ) THEN
    RAISE EXCEPTION 'reviewed candidate should be NEED_REVIEW + is_current=false';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM novel_continuity_facts
    WHERE chapter_id = v_chapter.id
      AND source = 'ai'
      AND status <> 'PENDING'
  ) THEN
    RAISE EXCEPTION 'generated candidate AI facts must remain PENDING before human approval';
  END IF;

  INSERT INTO phase4_tdd_evidence (
    project_id,
    chapter_id,
    chapter_status,
    chapter_is_current,
    generation_job_succeeded_count,
    review_job_succeeded_count,
    pending_ai_fact_count,
    review_report_count,
    review_report_with_ai_run_count,
    notify_review_job_count,
    project_status
  )
  SELECT
    v_project_id,
    v_chapter.id,
    (SELECT status FROM novel_chapters WHERE id = v_chapter.id),
    (SELECT is_current FROM novel_chapters WHERE id = v_chapter.id),
    (SELECT COUNT(*)::integer FROM novel_generation_jobs WHERE id = v_generation_job_id AND status = 'SUCCEEDED'),
    (SELECT COUNT(*)::integer FROM novel_generation_jobs WHERE id = v_review_job_id AND status = 'SUCCEEDED'),
    (SELECT COUNT(*)::integer FROM novel_continuity_facts WHERE chapter_id = v_chapter.id AND source = 'ai' AND status = 'PENDING'),
    (SELECT COUNT(*)::integer FROM novel_review_reports WHERE chapter_id = v_chapter.id),
    (SELECT COUNT(*)::integer FROM novel_review_reports WHERE chapter_id = v_chapter.id AND ai_run_id = v_review_ai_run_id),
    (SELECT COUNT(*)::integer FROM novel_generation_jobs WHERE project_id = v_project_id AND chapter_id = v_chapter.id AND job_type = 'NOTIFY_REVIEW' AND status = 'PENDING'),
    (SELECT status FROM novel_projects WHERE id = v_project_id);

  RAISE NOTICE 'Phase 4 DB flow assertions passed for project %, chapter %', v_project_id, v_chapter.id;
END;
$$;

TABLE phase4_tdd_evidence;

SELECT 'phase4_chapter_review_flow_passed' AS result;

ROLLBACK;
