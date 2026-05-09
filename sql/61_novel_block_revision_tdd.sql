-- TDD checks for review-page local block revision flow.
-- Safe to run repeatedly: all data is inside a transaction and rolled back.

BEGIN;

DO $$
DECLARE
  v_project_id UUID;
  v_outline_id UUID;
  v_chapter_id UUID;
  v_chapter_token TEXT;
  v_other_revision_id UUID;
  v_anchor_chapter_id UUID;
  v_anchor_token TEXT;
  v_repeat_chapter_id UUID;
  v_repeat_token TEXT;
  v_soft_anchor_chapter_id UUID;
  v_soft_anchor_token TEXT;
  v_request RECORD;
  v_second_request RECORD;
  v_repeat_request RECORD;
  v_ambiguous_request RECORD;
  v_soft_anchor_request RECORD;
  v_suggest RECORD;
  v_apply RECORD;
  v_anchor_apply RECORD;
  v_repeat_apply RECORD;
  v_soft_anchor_apply RECORD;
  v_new_body TEXT;
  v_repeat_body TEXT;
  v_soft_anchor_body TEXT;
  v_repeat_offset INTEGER;
  v_count INTEGER;
BEGIN
  INSERT INTO novel_projects (
    title,
    genre,
    audience,
    style,
    target_total_chapters,
    target_words_per_chapter,
    status
  )
  VALUES (
    'TDD 局部修订项目',
    '都市悬疑',
    '测试读者',
    '节奏快、细节准',
    3,
    1200,
    'REVIEWING'
  )
  RETURNING id INTO v_project_id;

  INSERT INTO novel_bibles (
    project_id,
    world_setting,
    story_core,
    main_character,
    supporting_characters,
    selling_points
  )
  VALUES (
    v_project_id,
    '近未来城市。',
    '主角追查零点录像。',
    '{"name":"林澈"}'::jsonb,
    '[]'::jsonb,
    '["悬疑反转"]'::jsonb
  );

  INSERT INTO novel_chapter_outlines (
    project_id,
    chapter_no,
    title,
    summary,
    status
  )
  VALUES (
    v_project_id,
    1,
    '零点尸检录像',
    '主角第一次看到录像。',
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
    card_payload
  )
  VALUES (
    v_project_id,
    v_outline_id,
    1,
    1,
    TRUE,
    'READY',
    '{"beats":["发现录像","情绪失控","留下钩子"]}'::jsonb
  );

  INSERT INTO novel_chapters (
    project_id,
    outline_id,
    chapter_no,
    title,
    body,
    summary,
    word_count,
    status,
    generation_version,
    is_current
  )
  VALUES (
    v_project_id,
    v_outline_id,
    1,
    '零点尸检录像',
    '林澈按下播放键，屏幕里的尸检台冷得像一块铁。\n他盯着那段模糊影像，心里有点害怕。\n零点的钟声响起，尸体忽然睁开了眼。',
    '林澈看到零点尸检录像。',
    58,
    'NEED_REVIEW',
    1,
    FALSE
  )
  RETURNING id, review_token INTO v_chapter_id, v_chapter_token;

  SELECT *
  INTO v_request
  FROM request_novel_chapter_block_revision(
    v_chapter_id,
    v_chapter_token,
    'polish',
    '他盯着那段模糊影像，心里有点害怕。',
    '强化恐惧里的专业克制，不要写成直白害怕。',
    2,
    2,
    '林澈按下播放键，屏幕里的尸检台冷得像一块铁。',
    '零点的钟声响起，尸体忽然睁开了眼。',
    'selection_only',
    'tdd'
  );

  IF v_request.success IS DISTINCT FROM TRUE OR v_request.job_type <> 'REVISE_CHAPTER_BLOCK' THEN
    RAISE EXCEPTION 'expected queued block revision, got %', row_to_json(v_request);
  END IF;

	  IF NOT EXISTS (
	    SELECT 1
    FROM novel_chapter_block_revisions br
    WHERE br.id = v_request.revision_id
      AND br.status = 'PENDING'
      AND br.selected_text_hash IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'block revision row was not created as PENDING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_generation_jobs j
    WHERE j.id = v_request.job_id
      AND j.job_type = 'REVISE_CHAPTER_BLOCK'
      AND j.status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'block revision job was not created as PENDING';
  END IF;

  SELECT *
  INTO v_suggest
  FROM mark_novel_chapter_block_revision_suggested(
    v_request.revision_id,
    v_request.job_id,
    '他盯着那段模糊影像，指尖抵住播放键边缘，法医训练出的冷静正在一点点裂开。',
    '把直白害怕改成专业克制下的恐惧。',
    '[{"requirement":"强化恐惧里的专业克制","fulfilled":true,"evidence":"用法医训练出的冷静裂开呈现"}]'::jsonb,
    FALSE,
    '{"replacement_text":"ok"}'::jsonb
  );

  IF v_suggest.success IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'expected suggested block revision, got %', row_to_json(v_suggest);
  END IF;

  UPDATE novel_generation_jobs
  SET status = 'SUCCEEDED', finished_at = NOW()
  WHERE id = v_request.job_id;

  SELECT *
  INTO v_second_request
  FROM request_novel_chapter_block_revision(
    v_chapter_id,
    v_chapter_token,
    'expand',
    '零点的钟声响起，尸体忽然睁开了眼。',
    '稍微扩写章末钩子。',
    3,
    3,
    '他盯着那段模糊影像，心里有点害怕。',
    '',
    'selection_only',
    'tdd'
  );

  IF v_second_request.success IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'expected second queued revision, got %', row_to_json(v_second_request);
  END IF;

  v_other_revision_id := v_second_request.revision_id;

  PERFORM 1
  FROM mark_novel_chapter_block_revision_suggested(
    v_second_request.revision_id,
    v_second_request.job_id,
    '零点的钟声响起，尸体忽然睁开了眼，瞳孔里倒映着屏幕外的林澈。',
    '扩写章末钩子。',
    '[]'::jsonb,
    TRUE,
    '{}'::jsonb
  );

  UPDATE novel_generation_jobs
  SET status = 'SUCCEEDED', finished_at = NOW()
  WHERE id = v_second_request.job_id;

  SELECT *
  INTO v_apply
  FROM apply_novel_chapter_block_revision(
    v_request.revision_id,
    v_chapter_token,
    'APPLY',
    NULL,
    'tdd'
  );

  IF v_apply.success IS DISTINCT FROM TRUE
     OR v_apply.result_code <> 'BLOCK_REVISION_APPLIED'
     OR v_apply.job_type IS NOT NULL THEN
    RAISE EXCEPTION 'expected applied block revision without auto-review job, got %', row_to_json(v_apply);
  END IF;

  SELECT body
  INTO v_new_body
  FROM novel_chapters
  WHERE id = v_apply.chapter_id
    AND status = 'NEED_REVIEW'
    AND parent_chapter_id = v_chapter_id;

  IF v_new_body IS NULL OR position('法医训练出的冷静正在一点点裂开' IN v_new_body) <= 0 THEN
    RAISE EXCEPTION 'new candidate body did not contain block replacement';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_chapters
    WHERE id = v_chapter_id
      AND status = 'REWRITE_REQUESTED'
      AND is_current = FALSE
  ) THEN
    RAISE EXCEPTION 'original candidate did not leave review state';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM novel_generation_jobs
    WHERE chapter_id = v_apply.chapter_id
      AND job_type = 'REVIEW_CHAPTER'
      AND status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'review job should not be created until reviewer manually reruns review';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_chapter_block_revisions
    WHERE id = v_other_revision_id
      AND status = 'SUPERSEDED'
  ) THEN
    RAISE EXCEPTION 'other suggested revision was not superseded';
  END IF;

  INSERT INTO novel_chapters (
    project_id,
    outline_id,
    chapter_no,
    title,
    body,
    summary,
    word_count,
    status,
    generation_version,
    is_current
  )
  VALUES (
    v_project_id,
    v_outline_id,
    1,
    '零点尸检录像',
    '原锚点仍在。',
    '锚点测试。',
    5,
    'NEED_REVIEW',
    3,
    FALSE
  )
  RETURNING id, review_token INTO v_anchor_chapter_id, v_anchor_token;

  SELECT *
  INTO v_request
  FROM request_novel_chapter_block_revision(
    v_anchor_chapter_id,
    v_anchor_token,
    'modify',
    '原锚点仍在。',
    '改成更紧张的说法。',
    1,
    1,
    '',
    '',
    'selection_only',
    'tdd'
  );

  PERFORM 1
  FROM mark_novel_chapter_block_revision_suggested(
    v_request.revision_id,
    v_request.job_id,
    '原锚点像钉子一样留在屏幕里。',
    '增强紧张感。',
    '[]'::jsonb,
    FALSE,
    '{}'::jsonb
  );

  UPDATE novel_generation_jobs
  SET status = 'SUCCEEDED', finished_at = NOW()
  WHERE id = v_request.job_id;

  UPDATE novel_chapters
  SET body = '锚点已经被换走。'
  WHERE id = v_anchor_chapter_id;

  SELECT *
  INTO v_anchor_apply
  FROM apply_novel_chapter_block_revision(
    v_request.revision_id,
    v_anchor_token,
    'APPLY',
    NULL,
    'tdd'
  );

  IF v_anchor_apply.success IS DISTINCT FROM FALSE OR v_anchor_apply.result_code <> 'ANCHOR_NOT_FOUND' THEN
    RAISE EXCEPTION 'expected anchor not found, got %', row_to_json(v_anchor_apply);
  END IF;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM novel_chapters
  WHERE parent_chapter_id = v_anchor_chapter_id;

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'anchor failure created unexpected candidate count %', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM novel_chapter_block_revisions
    WHERE id = v_request.revision_id
      AND status = 'SUGGESTED'
	      AND error_message LIKE '%锚点%'
	  ) THEN
	    RAISE EXCEPTION 'anchor failure did not keep revision retryable with error';
	  END IF;

	  INSERT INTO novel_chapters (
	    project_id,
	    outline_id,
	    chapter_no,
	    title,
	    body,
	    summary,
	    word_count,
	    status,
	    generation_version,
	    is_current
	  )
	  VALUES (
	    v_project_id,
	    v_outline_id,
	    1,
	    '零点尸检录像',
	    '重复句在第一处。\n中间隔开。\n重复句在第二处。',
	    '重复锚点测试。',
	    18,
	    'NEED_REVIEW',
	    4,
	    FALSE
	  )
	  RETURNING id, review_token INTO v_repeat_chapter_id, v_repeat_token;

	  SELECT *
	  INTO v_ambiguous_request
	  FROM request_novel_chapter_block_revision(
	    v_repeat_chapter_id,
	    v_repeat_token,
	    'modify',
	    '重复句',
	    '只改第二处。',
	    3,
	    3,
	    '',
	    '',
	    'selection_only',
	    'tdd'
	  );

	  IF v_ambiguous_request.success IS DISTINCT FROM FALSE OR v_ambiguous_request.result_code <> 'AMBIGUOUS_ANCHOR' THEN
	    RAISE EXCEPTION 'expected ambiguous anchor without offset, got %', row_to_json(v_ambiguous_request);
	  END IF;

	  SELECT position('重复句在第二处。' IN body) - 1
	  INTO v_repeat_offset
	  FROM novel_chapters
	  WHERE id = v_repeat_chapter_id;

	  SELECT *
	  INTO v_repeat_request
	  FROM request_novel_chapter_block_revision(
	    v_repeat_chapter_id,
	    v_repeat_token,
	    'modify',
	    '重复句',
	    '只改第二处。',
	    3,
	    3,
	    '',
	    '',
	    'selection_only',
	    'tdd',
	    v_repeat_offset,
	    v_repeat_offset + char_length('重复句'),
	    '',
	    '在第二处。'
	  );

	  IF v_repeat_request.success IS DISTINCT FROM TRUE THEN
	    RAISE EXCEPTION 'expected offset-anchored repeated revision, got %', row_to_json(v_repeat_request);
	  END IF;

	  PERFORM 1
	  FROM mark_novel_chapter_block_revision_suggested(
	    v_repeat_request.revision_id,
	    v_repeat_request.job_id,
	    '精准锚点',
	    '只替换第二处重复短语。',
	    '[]'::jsonb,
	    FALSE,
	    '{}'::jsonb
	  );

	  UPDATE novel_generation_jobs
	  SET status = 'SUCCEEDED', finished_at = NOW()
	  WHERE id = v_repeat_request.job_id;

	  SELECT *
	  INTO v_repeat_apply
	  FROM apply_novel_chapter_block_revision(
	    v_repeat_request.revision_id,
	    v_repeat_token,
	    'APPLY',
	    NULL,
	    'tdd'
	  );

	  IF v_repeat_apply.success IS DISTINCT FROM TRUE THEN
	    RAISE EXCEPTION 'expected repeated anchor apply success, got %', row_to_json(v_repeat_apply);
	  END IF;

	  SELECT body
	  INTO v_repeat_body
	  FROM novel_chapters
	  WHERE id = v_repeat_apply.chapter_id;

		  IF position('重复句在第一处。' IN v_repeat_body) <= 0
		     OR position('精准锚点在第二处。' IN v_repeat_body) <= 0 THEN
		    RAISE EXCEPTION 'offset anchor did not preserve first occurrence and replace second: %', v_repeat_body;
		  END IF;

		  INSERT INTO novel_chapters (
		    project_id,
		    outline_id,
		    chapter_no,
		    title,
		    body,
		    summary,
		    word_count,
		    status,
		    generation_version,
		    is_current
		  )
		  VALUES (
		    v_project_id,
		    v_outline_id,
		    1,
		    '零点尸检录像',
		    '第一段原文。' || E'\r\n' || '第二段原文。',
		    '软锚点测试。',
		    12,
		    'NEED_REVIEW',
		    6,
		    FALSE
		  )
		  RETURNING id, review_token INTO v_soft_anchor_chapter_id, v_soft_anchor_token;

		  SELECT *
		  INTO v_soft_anchor_request
		  FROM request_novel_chapter_block_revision(
		    v_soft_anchor_chapter_id,
		    v_soft_anchor_token,
		    'logic_fix',
		    '第一段原文。' || E'\n' || '第二段原文。',
		    '跨段逻辑修补。',
		    1,
		    2,
		    '',
		    '',
		    'selection_only',
		    'tdd',
		    0,
		    char_length('第一段原文。' || E'\n' || '第二段原文。'),
		    '',
		    ''
		  );

		  IF v_soft_anchor_request.success IS DISTINCT FROM TRUE THEN
		    RAISE EXCEPTION 'expected whitespace-tolerant anchor request, got %', row_to_json(v_soft_anchor_request);
		  END IF;

		  PERFORM 1
		  FROM mark_novel_chapter_block_revision_suggested(
		    v_soft_anchor_request.revision_id,
		    v_soft_anchor_request.job_id,
		    '合并后的逻辑修补段落。',
		    '验证跨段换行锚点可被应用。',
		    '[]'::jsonb,
		    FALSE,
		    '{}'::jsonb
		  );

		  UPDATE novel_generation_jobs
		  SET status = 'SUCCEEDED', finished_at = NOW()
		  WHERE id = v_soft_anchor_request.job_id;

		  SELECT *
		  INTO v_soft_anchor_apply
		  FROM apply_novel_chapter_block_revision(
		    v_soft_anchor_request.revision_id,
		    v_soft_anchor_token,
		    'APPLY',
		    NULL,
		    'tdd'
		  );

		  IF v_soft_anchor_apply.success IS DISTINCT FROM TRUE THEN
		    RAISE EXCEPTION 'expected whitespace-tolerant anchor apply success, got %', row_to_json(v_soft_anchor_apply);
		  END IF;

		  SELECT body
		  INTO v_soft_anchor_body
		  FROM novel_chapters
		  WHERE id = v_soft_anchor_apply.chapter_id;

		  IF v_soft_anchor_body <> '合并后的逻辑修补段落。' THEN
		    RAISE EXCEPTION 'whitespace-tolerant anchor applied wrong body: %', v_soft_anchor_body;
		  END IF;
		END;
		$$;

ROLLBACK;
