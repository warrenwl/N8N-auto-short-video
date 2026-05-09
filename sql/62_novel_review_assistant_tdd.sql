-- Phase 24 TDD: review assistant persistence, token gate, and AI run logging.

BEGIN;

DO $$
DECLARE
  v_project_id UUID := gen_random_uuid();
  v_outline_id UUID := gen_random_uuid();
  v_chapter_id UUID;
  v_token TEXT;
  v_start RECORD;
  v_bad_start RECORD;
  v_finish RECORD;
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
    'Phase24 审稿助手测试',
    '都市逆袭',
    '男频爽文读者',
    '节奏快、冲突强',
    '验证审稿助手。',
    3,
    1200,
    'REVIEWING'
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
    v_project_id,
    '测试城市',
    '主角修复断裂因果链',
    '{"name":"林澈","goal":"翻盘"}'::jsonb,
    '[{"name":"许青"}]'::jsonb,
    '[{"name":"周霆"}]'::jsonb,
    '商业资源',
    '[]'::jsonb,
    '快节奏',
    '',
    '["反击"]'::jsonb
  );

  INSERT INTO novel_chapter_outlines (
    id,
    project_id,
    chapter_no,
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
    '雨夜对峙',
    '林澈在雨夜对峙周霆。',
    '证明林澈不是被动挨打',
    '证据来源不足',
    '压迫后反击',
    '许青递出新线索',
    'READY'
  );

  SELECT id
  INTO v_chapter_id
  FROM create_novel_chapter_version(
    v_project_id,
    v_outline_id,
    NULL,
    1,
    '雨夜对峙',
    '林澈站在雨里，突然断定周霆就是幕后人。许青没有解释，只把文件塞给他。',
    '林澈与周霆对峙。',
    42,
    'phase24-test',
    'NEED_REVIEW',
    FALSE
  );

  SELECT review_token
  INTO v_token
  FROM novel_chapters
  WHERE id = v_chapter_id;

  INSERT INTO novel_review_reports (
    project_id,
    chapter_id,
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
    v_chapter_id,
    60,
    82,
    65,
    78,
    71,
    '[{"type":"consistency","description":"许青给文件的动机不足。"}]'::jsonb,
    '["补足许青交出文件的理由。"]'::jsonb,
    'MANUAL_REVIEW'
  );

  SELECT *
  INTO v_bad_start
  FROM start_novel_review_assistant_message(
    v_chapter_id,
    'bad-token',
    NULL,
    'continuity',
    '这段合理吗？',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'phase24'
  );

  IF v_bad_start.success IS DISTINCT FROM FALSE
     OR v_bad_start.result_code <> 'NO_MATCH_OR_INVALID_STATE' THEN
    RAISE EXCEPTION 'assistant should reject bad review_token, got %', row_to_json(v_bad_start);
  END IF;

  SELECT *
  INTO v_start
  FROM start_novel_review_assistant_message(
    v_chapter_id,
    v_token,
    NULL,
    'continuity',
    '许青突然把文件给林澈，动机是否合理？',
    '许青没有解释，只把文件塞给他。',
    1,
    1,
    12,
    26,
    '林澈站在雨里，',
    '',
    'phase24'
  );

  IF v_start.success IS DISTINCT FROM TRUE
     OR v_start.thread_id IS NULL
     OR v_start.user_message_id IS NULL
     OR jsonb_typeof(v_start.novel_bible) <> 'object'
     OR jsonb_typeof(v_start.review_report) <> 'object' THEN
    RAISE EXCEPTION 'assistant start should return context and message ids, got %', row_to_json(v_start);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_review_assistant_messages
  WHERE thread_id = v_start.thread_id
    AND role = 'user'
    AND mode = 'continuity'
    AND selected_text = '许青没有解释，只把文件塞给他。';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'assistant should store one user message, got %', v_count;
  END IF;

  SELECT *
  INTO v_finish
  FROM finish_novel_review_assistant_message(
    v_start.thread_id,
    v_start.user_message_id,
    v_project_id,
    v_chapter_id,
    'REVIEW_ASSISTANT',
    'glm-5.1',
    'phase24-review-assistant',
    '{"messages":[]}'::jsonb,
    '{"choices":[{"message":{"content":"{}"}}]}'::jsonb,
    jsonb_build_object(
      'ok', true,
      'thread_id', v_start.thread_id,
      'mode', 'continuity',
      'answer', '动机证据不足，需要补一小句说明许青为什么信任林澈。',
      'findings', jsonb_build_array(jsonb_build_object('type', 'consistency', 'severity', 'medium', 'description', '交付文件缺少动机')),
      'suggestions', jsonb_build_array(jsonb_build_object('title', '补动机', 'detail', '加一句许青此前被周霆逼到绝路。')),
      'source_refs', jsonb_build_array(jsonb_build_object('source_type', 'chapter', 'label', '当前选区', 'quote', '许青没有解释，只把文件塞给他。')),
      'suggested_actions', jsonb_build_array(jsonb_build_object('action_type', 'create_block_revision', 'label', '转为局部修订', 'instruction', '补足许青交出文件的动机。'))
    ),
    TRUE,
    NULL,
    NOW() - INTERVAL '1 second',
    NOW(),
    'phase24'
  );

  IF v_finish.success IS DISTINCT FROM TRUE
     OR v_finish.ai_run_id IS NULL
     OR v_finish.assistant_message_id IS NULL
     OR v_finish.response_status_code <> 200
     OR (v_finish.response_json::jsonb)->>'ai_run_id' IS NULL THEN
    RAISE EXCEPTION 'assistant finish should record run/message and return payload, got %', row_to_json(v_finish);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_ai_runs
  WHERE id = v_finish.ai_run_id
    AND run_type = 'REVIEW_ASSISTANT'
    AND success = TRUE;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'assistant should log one REVIEW_ASSISTANT ai run, got %', v_count;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_review_assistant_messages
  WHERE id = v_finish.assistant_message_id
    AND role = 'assistant'
    AND ai_run_id = v_finish.ai_run_id
    AND suggested_actions->0->>'action_type' = 'create_block_revision';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'assistant should store assistant message with suggested actions, got %', v_count;
  END IF;
END;
$$;

ROLLBACK;

SELECT 'phase24_review_assistant_tdd_passed' AS result;
