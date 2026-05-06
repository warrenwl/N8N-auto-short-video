-- Director console database TDD assertions.
-- Verifies PLAN_CHAPTER_DIRECTOR, current director-card uniqueness, versioning,
-- and plot-thread state progression when chapter candidates are approved.

BEGIN;

CREATE TEMP TABLE director_tdd_evidence (
  project_id UUID,
  director_job_count INTEGER,
  current_director_count INTEGER,
  manual_version INTEGER,
  seeded_thread_active_count INTEGER,
  payoff_thread_paid_count INTEGER,
  next_director_job_count INTEGER
) ON COMMIT DROP;

DO $$
DECLARE
  v_project_id UUID;
  v_outline1_id UUID;
  v_outline2_id UUID;
  v_director1_id UUID;
  v_manual_director_id UUID;
  v_chapter1 novel_chapters%ROWTYPE;
  v_chapter2 novel_chapters%ROWTYPE;
  v_review_token TEXT;
  v_approved RECORD;
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
    '导演台 TDD ' || gen_random_uuid()::text,
    '都市悬疑',
    '中文网文读者',
    '因果清晰、强钩子',
    '验证导演台链路。',
    2,
    4000,
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
    selling_points
  )
  VALUES (
    v_project_id,
    '旧城钟声会记录秘密。',
    '主角追查父亲失踪。',
    '{"name":"林昼","goal":"查清父亲失踪"}'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '听见钟声残响',
    '[]'::jsonb,
    '短句、强冲突',
    '第10章前不得揭露父亲真实身份',
    '["悬疑","追更钩子"]'::jsonb
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
  VALUES
    (v_project_id, 1, 1, '旧钟表店', '林昼进入旧钟表店。', '建立追查目标。', '陌生人阻拦。', '从怀疑到行动。', '钟声指向地下站。', 'READY')
  RETURNING id INTO v_outline1_id;

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
    2,
    1,
    '地下站',
    '林昼进入地下站。',
    '触碰身份伏笔。',
    '线索被抢。',
    '信任临界。',
    '身份谜团继续压住。',
    'READY'
  )
  RETURNING id INTO v_outline2_id;

  INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, status)
  VALUES (v_project_id, 'PLAN_CHAPTER_DIRECTOR', 1, 'PENDING');

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
    v_outline1_id,
    1,
    1,
    TRUE,
    'READY',
    'AI',
    jsonb_build_object(
      'chapter_intent', '建立追查目标',
      'quality_gate', jsonb_build_object('pass', TRUE, 'blocking_issues', '[]'::jsonb),
      'segment_plan', jsonb_build_array(
        jsonb_build_object('segment_no', 1),
        jsonb_build_object('segment_no', 2),
        jsonb_build_object('segment_no', 3),
        jsonb_build_object('segment_no', 4)
      )
    )
  )
  RETURNING id INTO v_director1_id;

  BEGIN
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
      v_outline1_id,
      1,
      2,
      TRUE,
      'READY',
      'AI',
      '{"quality_gate":{"pass":true,"blocking_issues":[]},"segment_plan":[{"segment_no":1},{"segment_no":2},{"segment_no":3},{"segment_no":4}]}'::jsonb
    );
    RAISE EXCEPTION 'director current uniqueness did not reject a second current card';
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  UPDATE novel_chapter_director_cards
  SET is_current = FALSE,
      status = 'SUPERSEDED'
  WHERE id = v_director1_id;

  INSERT INTO novel_chapter_director_cards (
    project_id,
    outline_id,
    chapter_no,
    version,
    is_current,
    status,
    source,
    manual_override,
    card_payload
  )
  VALUES (
    v_project_id,
    v_outline1_id,
    1,
    2,
    TRUE,
    'READY',
    'MANUAL',
    TRUE,
    '{"chapter_intent":"人工修订导演台","quality_gate":{"pass":true,"blocking_issues":[]},"segment_plan":[{"segment_no":1},{"segment_no":2},{"segment_no":3},{"segment_no":4}]}'::jsonb
  )
  RETURNING id INTO v_manual_director_id;

  INSERT INTO novel_plot_threads (
    project_id,
    director_card_id,
    thread_key,
    thread_type,
    status,
    introduced_chapter,
    last_touched_chapter,
    payoff_target_chapter,
    do_not_reveal_before,
    visibility,
    notes
  )
  VALUES (
    v_project_id,
    v_manual_director_id,
    '第10章身份揭露',
    'foreshadowing',
    'SEEDING',
    1,
    1,
    2,
    10,
    'reader_hint',
    '只埋线，不揭露'
  );

  SELECT *
  INTO v_chapter1
  FROM create_novel_chapter_version(
    v_project_id,
    v_outline1_id,
    NULL,
    1,
    '旧钟表店',
    '第一章正文',
    '第一章摘要',
    600,
    'phase60-test',
    'NEED_REVIEW',
    FALSE
  );

  v_review_token := v_chapter1.review_token;

  SELECT *
  INTO v_approved
  FROM approve_novel_chapter(v_chapter1.id, v_review_token, '导演台 TDD 通过第1章', 'phase60_test');

  IF v_approved.next_job_id IS NULL THEN
    RAISE EXCEPTION 'chapter 1 approval should enqueue chapter 2 director planning';
  END IF;

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
    v_outline2_id,
    2,
    1,
    TRUE,
    'READY',
    'AI',
    '{"chapter_intent":"触碰身份伏笔","quality_gate":{"pass":true,"blocking_issues":[]},"segment_plan":[{"segment_no":1},{"segment_no":2},{"segment_no":3},{"segment_no":4}]}'::jsonb
  );

  UPDATE novel_plot_threads
  SET status = 'PAYOFF_READY',
      last_touched_chapter = 2,
      payoff_target_chapter = 2
  WHERE project_id = v_project_id
    AND thread_key = '第10章身份揭露';

  SELECT *
  INTO v_chapter2
  FROM create_novel_chapter_version(
    v_project_id,
    v_outline2_id,
    NULL,
    2,
    '地下站',
    '第二章正文',
    '第二章摘要',
    600,
    'phase60-test',
    'NEED_REVIEW',
    FALSE
  );

  SELECT *
  INTO v_approved
  FROM approve_novel_chapter(v_chapter2.id, v_chapter2.review_token, '导演台 TDD 通过第2章', 'phase60_test');

  INSERT INTO director_tdd_evidence
  SELECT
    v_project_id,
    (
      SELECT COUNT(*)::integer
      FROM novel_generation_jobs
      WHERE project_id = v_project_id
        AND job_type = 'PLAN_CHAPTER_DIRECTOR'
    ),
    (
      SELECT COUNT(*)::integer
      FROM novel_chapter_director_cards
      WHERE project_id = v_project_id
        AND chapter_no = 1
        AND is_current = TRUE
    ),
    (
      SELECT version
      FROM novel_chapter_director_cards
      WHERE id = v_manual_director_id
    ),
    (
      SELECT COUNT(*)::integer
      FROM novel_plot_threads
      WHERE project_id = v_project_id
        AND thread_key = '第10章身份揭露'
        AND status IN ('ACTIVE', 'PAID_OFF')
    ),
    (
      SELECT COUNT(*)::integer
      FROM novel_plot_threads
      WHERE project_id = v_project_id
        AND thread_key = '第10章身份揭露'
        AND status = 'PAID_OFF'
    ),
    (
      SELECT COUNT(*)::integer
      FROM novel_generation_jobs
      WHERE project_id = v_project_id
        AND job_type = 'PLAN_CHAPTER_DIRECTOR'
        AND chapter_no = 2
        AND status = 'PENDING'
    );

  IF NOT EXISTS (
    SELECT 1
    FROM director_tdd_evidence
    WHERE project_id = v_project_id
      AND director_job_count >= 2
      AND current_director_count = 1
      AND manual_version = 2
      AND seeded_thread_active_count = 1
      AND payoff_thread_paid_count = 1
      AND next_director_job_count = 1
  ) THEN
    RAISE EXCEPTION 'director TDD evidence did not match expectations for project %', v_project_id;
  END IF;
END;
$$;

TABLE director_tdd_evidence;

SELECT 'novel_director_db_tdd_passed' AS result;

ROLLBACK;
