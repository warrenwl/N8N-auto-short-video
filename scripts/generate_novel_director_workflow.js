#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function code(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function postgresNode(id, name, position, query, queryReplacement = null) {
  return {
    parameters: {
      operation: 'executeQuery',
      query,
      ...(queryReplacement ? {options: {queryReplacement}} : {options: {}}),
    },
    id,
    name,
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.6,
    position,
    credentials: {
      postgres: {
        id: 'postgresVideoAgent',
        name: 'Postgres video_agent',
      },
    },
  };
}

function codeNode(id, name, position, jsCode) {
  return {
    parameters: {jsCode},
    id,
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
  };
}

function manualNode(id, name, position) {
  return {
    parameters: {},
    id,
    name,
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    position,
  };
}

function executeWorkflowTriggerNode(id, name, position) {
  return {
    parameters: {inputSource: 'passthrough'},
    id,
    name,
    type: 'n8n-nodes-base.executeWorkflowTrigger',
    typeVersion: 1.1,
    position,
  };
}

function executeWorkflowNode(id, name, position, workflowId) {
  return {
    parameters: {
      source: 'database',
      workflowId,
      mode: 'once',
      options: {waitForSubWorkflow: false},
    },
    id,
    name,
    type: 'n8n-nodes-base.executeWorkflow',
    typeVersion: 1,
    position,
  };
}

function webhookNode(id, name, position, method, pathValue, webhookId) {
  return {
    parameters: {
      httpMethod: method,
      path: pathValue,
      responseMode: 'responseNode',
      options: {},
    },
    id,
    name,
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position,
    webhookId,
  };
}

function respondNode(id, name, position, body, statusCode, contentType = 'text/html; charset=utf-8') {
  return {
    parameters: {
      respondWith: 'text',
      responseBody: body,
      options: {
        responseCode: statusCode,
        responseHeaders: {
          entries: [{name: 'Content-Type', value: contentType}],
        },
      },
    },
    id,
    name,
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.4,
    position,
  };
}

function ifNode(id, name, position, condition, nodeId) {
  return {
    parameters: {
      conditions: {
        options: {caseSensitive: true, leftValue: '', typeValidation: 'strict'},
        conditions: [{
          id: nodeId,
          leftValue: condition,
          rightValue: true,
          operator: {type: 'boolean', operation: 'true', singleValue: true},
        }],
        combinator: 'and',
      },
      options: {},
    },
    id,
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position,
  };
}

function httpGlmNode(id, name, position) {
  return {
    parameters: {
      method: 'POST',
      url: '={{ $env.GLM_API_BASE_URL || "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions" }}',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {name: 'Authorization', value: '={{ "Bearer " + $env.GLM_API_KEY }}'},
          {name: 'Content-Type', value: 'application/json'},
        ],
      },
      sendBody: true,
      contentType: 'json',
      jsonBody: '={{ { ...$json.llm_request_body, model: $env.GLM_MODEL || $json.llm_request_body.model } }}',
      options: {
        response: {response: {responseFormat: 'json'}},
        timeout: 300000,
      },
      specifyBody: 'json',
    },
    id,
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
  };
}

function sticky(id, name, position, content) {
  return {
    parameters: {content, height: 180, width: 360, color: 4},
    id,
    name,
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position,
  };
}

function workflowBase(id, name, nodes, connections) {
  return {
    id,
    name,
    active: true,
    nodes,
    connections,
    settings: {executionOrder: 'v1'},
    versionId: `${id}-v1`,
    meta: {templateCredsSetupCompleted: true},
    description: 'Novel director workflow generated from project SQL/code files.',
  };
}

const claimDirectorQuery = `-- Claim one pending PLAN_CHAPTER_DIRECTOR job.
WITH claimed AS (
  SELECT j.id
  FROM novel_generation_jobs j
  JOIN novel_projects p ON p.id = j.project_id
  WHERE j.job_type = 'PLAN_CHAPTER_DIRECTOR'
    AND j.status = 'PENDING'
    AND j.attempt_count < j.max_attempts
    AND p.status NOT IN ('PAUSED', 'ARCHIVED')
  ORDER BY j.chapter_no ASC NULLS LAST, j.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE novel_generation_jobs j
SET
  status = 'RUNNING',
  started_at = NOW(),
  attempt_count = attempt_count + 1,
  error_message = NULL,
  updated_at = NOW()
FROM claimed
WHERE j.id = claimed.id
RETURNING j.*;`;

const claimDirectorForProjectQuery = `-- Claim one pending PLAN_CHAPTER_DIRECTOR job for a specific project.
WITH requested AS (
  SELECT $1::uuid AS project_id
), project AS (
  SELECT id, status
  FROM novel_projects
  WHERE id = (SELECT project_id FROM requested)
), claimed AS (
  SELECT j.id
  FROM novel_generation_jobs j
  JOIN novel_projects p ON p.id = j.project_id
  WHERE j.project_id = (SELECT project_id FROM requested)
    AND j.job_type = 'PLAN_CHAPTER_DIRECTOR'
    AND j.status = 'PENDING'
    AND j.attempt_count < j.max_attempts
    AND p.status NOT IN ('PAUSED', 'ARCHIVED')
  ORDER BY j.chapter_no ASC NULLS LAST, j.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
), updated AS (
  UPDATE novel_generation_jobs j
  SET
    status = 'RUNNING',
    started_at = NOW(),
    attempt_count = attempt_count + 1,
    error_message = NULL,
    payload = COALESCE(j.payload, '{}'::jsonb) || jsonb_build_object('trigger_source', 'front_immediate'),
    updated_at = NOW()
  FROM claimed
  WHERE j.id = claimed.id
  RETURNING j.*
)
SELECT TRUE AS claim_success, NULL::text AS claim_reason, updated.*
FROM updated
UNION ALL
SELECT
  FALSE AS claim_success,
  CASE
    WHEN (SELECT status FROM project) = 'PAUSED' THEN 'PROJECT_PAUSED'
    WHEN (SELECT status FROM project) = 'ARCHIVED' THEN 'PROJECT_ARCHIVED'
    ELSE 'JOB_NOT_FOUND_OR_ALREADY_CLAIMED'
  END AS claim_reason,
  NULL::uuid AS id,
  (SELECT project_id FROM requested) AS project_id,
  NULL::uuid AS chapter_id,
  'PLAN_CHAPTER_DIRECTOR'::text AS job_type,
  NULL::integer AS chapter_no,
  '{}'::jsonb AS payload,
  NULL::text AS status,
  NULL::integer AS attempt_count,
  NULL::integer AS max_attempts,
  NULL::text AS error_message,
  NULL::timestamptz AS created_at,
  NULL::timestamptz AS started_at,
  NULL::timestamptz AS finished_at,
  NULL::timestamptz AS updated_at
WHERE NOT EXISTS (SELECT 1 FROM updated);`;

const readDirectorContextQuery = `-- Read context for chapter director planning.
SELECT
  p.id AS project_id,
  p.title AS novel_title,
  p.genre,
  p.audience,
  p.style,
  p.target_total_chapters,
  p.target_words_per_chapter,
  $1::uuid AS job_id,
  COALESCE((SELECT j.payload->>'trigger_source' FROM novel_generation_jobs j WHERE j.id = $1::uuid), 'queue') AS trigger_source,
  (SELECT j.payload->>'requested_by' FROM novel_generation_jobs j WHERE j.id = $1::uuid) AS requested_by,
  COALESCE((SELECT j.payload->>'comment' FROM novel_generation_jobs j WHERE j.id = $1::uuid), '') AS director_request_comment,
  'PLAN_CHAPTER_DIRECTOR'::text AS run_type,
  o.id AS outline_id,
  o.chapter_no,
  o.title AS outline_title,
  o.summary AS outline_summary,
  o.chapter_goal,
  o.conflict_point,
  o.emotional_point,
  o.hook,
  CASE
    WHEN p.target_words_per_chapter <= 1500 THEN 1
    WHEN p.target_words_per_chapter <= 2500 THEN 2
    WHEN p.target_words_per_chapter <= 3500 THEN 3
    WHEN p.target_words_per_chapter <= 4500 THEN 4
    WHEN p.target_words_per_chapter <= 6500 THEN 5
    ELSE 7
  END AS chapter_segment_total,
  jsonb_build_object(
    'world_setting', b.world_setting,
    'story_core', b.story_core,
    'main_character', b.main_character,
    'supporting_characters', b.supporting_characters,
    'villain_setting', b.villain_setting,
    'power_system', b.power_system,
    'relationship_map', b.relationship_map,
    'tone_rules', b.tone_rules,
    'forbidden_rules', b.forbidden_rules,
    'selling_points', b.selling_points
  ) AS novel_bible,
  COALESCE(previous.previous_chapters, '[]'::jsonb) AS previous_chapters,
  COALESCE(prev_latest.ending_excerpt, '') AS previous_chapter_ending,
  COALESCE(prev_transitions.previous_transition_modes, '[]'::jsonb) AS previous_transition_modes,
  COALESCE(future.future_outlines, '[]'::jsonb) AS future_outlines,
  COALESCE(facts.continuity_facts, '[]'::jsonb) AS continuity_facts,
  COALESCE(threads.plot_threads, '[]'::jsonb) AS plot_threads,
  COALESCE(review_issues.recent_review_issues, '[]'::jsonb) AS recent_review_issues,
  COALESCE(current_director.director_repair_context, '{}'::jsonb) AS director_repair_context
FROM novel_generation_jobs j
JOIN novel_projects p ON p.id = j.project_id
JOIN novel_bibles b ON b.project_id = p.id
JOIN novel_chapter_outlines o ON o.project_id = p.id AND o.chapter_no = j.chapter_no
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'chapter_no', picked.chapter_no,
    'title', picked.title,
    'summary', picked.summary
  ) ORDER BY picked.chapter_no) AS previous_chapters
  FROM (
    SELECT chapter_no, title, summary, right(body, 900) AS ending_excerpt
    FROM novel_chapters
    WHERE project_id = p.id
      AND chapter_no < o.chapter_no
      AND is_current = TRUE
      AND status IN ('APPROVED', 'PUBLISHED')
    ORDER BY chapter_no DESC
    LIMIT 3
  ) picked
) previous ON true
LEFT JOIN LATERAL (
  SELECT right(body, 900) AS ending_excerpt
  FROM novel_chapters
  WHERE project_id = p.id
    AND chapter_no < o.chapter_no
    AND is_current = TRUE
    AND status IN ('APPROVED', 'PUBLISHED')
  ORDER BY chapter_no DESC
  LIMIT 1
) prev_latest ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'chapter_no', picked.chapter_no,
    'mode', picked.card_payload->'cross_chapter_transition'->>'mode',
    'allowed', picked.card_payload->'cross_chapter_transition'->>'allowed',
    'reason', picked.card_payload->'cross_chapter_transition'->>'reason'
  ) ORDER BY picked.chapter_no DESC) AS previous_transition_modes
  FROM (
    SELECT chapter_no, card_payload
    FROM novel_chapter_director_cards
    WHERE project_id = p.id
      AND chapter_no < o.chapter_no
      AND is_current = TRUE
      AND status IN ('READY', 'SUPERSEDED')
      AND card_payload ? 'cross_chapter_transition'
    ORDER BY chapter_no DESC
    LIMIT 3
  ) picked
) prev_transitions ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'chapter_no', picked.chapter_no,
    'title', picked.title,
    'summary', picked.summary,
    'chapter_goal', picked.chapter_goal,
    'conflict_point', picked.conflict_point,
    'hook', picked.hook
  ) ORDER BY picked.chapter_no) AS future_outlines
  FROM (
    SELECT chapter_no, title, summary, chapter_goal, conflict_point, hook
    FROM novel_chapter_outlines
    WHERE project_id = p.id
      AND chapter_no > o.chapter_no
      AND status = 'READY'
    ORDER BY chapter_no ASC
    LIMIT 3
  ) picked
) future ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'fact_type', fact_type,
    'fact_key', fact_key,
    'fact_value', fact_value
  ) ORDER BY created_at DESC) AS continuity_facts
  FROM (
    SELECT fact_type, fact_key, fact_value, created_at
    FROM novel_continuity_facts
    WHERE project_id = p.id
      AND status = 'ACTIVE'
      AND (
        chapter_no IS NULL
        OR chapter_no < o.chapter_no
        OR source = 'human'
      )
    ORDER BY created_at DESC
    LIMIT 80
  ) picked
) facts ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'thread_key', thread_key,
    'thread_type', thread_type,
    'status', status,
    'introduced_chapter', introduced_chapter,
    'last_touched_chapter', last_touched_chapter,
    'next_touch_chapter', next_touch_chapter,
    'payoff_target_chapter', payoff_target_chapter,
    'do_not_reveal_before', do_not_reveal_before,
    'visibility', visibility,
    'notes', notes
  ) ORDER BY updated_at DESC) AS plot_threads
  FROM (
    SELECT *
    FROM novel_plot_threads
    WHERE project_id = p.id
      AND status IN ('SEEDING', 'ACTIVE', 'TOUCHING', 'PAYOFF_READY')
    ORDER BY updated_at DESC
    LIMIT 80
  ) picked
) threads ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'chapter_no', picked.chapter_no,
    'issues', picked.issues,
    'suggestions', picked.suggestions,
    'verdict', picked.verdict,
    'created_at', picked.created_at
  ) ORDER BY picked.created_at DESC) AS recent_review_issues
  FROM (
    SELECT c.chapter_no, r.issues, r.suggestions, r.verdict, r.created_at
    FROM novel_review_reports r
    JOIN novel_chapters c ON c.id = r.chapter_id
    WHERE r.project_id = p.id
      AND jsonb_array_length(COALESCE(r.issues, '[]'::jsonb)) > 0
    ORDER BY r.created_at DESC
    LIMIT 5
  ) picked
) review_issues ON true
LEFT JOIN LATERAL (
  SELECT jsonb_build_object(
    'current_director_card_id', d.id,
    'current_status', d.status,
    'current_version', d.version,
    'expected_segment_count', CASE
      WHEN p.target_words_per_chapter <= 1500 THEN 1
      WHEN p.target_words_per_chapter <= 2500 THEN 2
      WHEN p.target_words_per_chapter <= 3500 THEN 3
      WHEN p.target_words_per_chapter <= 4500 THEN 4
      WHEN p.target_words_per_chapter <= 6500 THEN 5
      ELSE 7
    END,
    'current_segment_count', COALESCE(
      CASE
        WHEN jsonb_typeof(d.card_payload->'segment_plan') = 'array'
          THEN jsonb_array_length(d.card_payload->'segment_plan')
        ELSE 0
      END,
      0
    ),
    'current_blocking_issues', COALESCE(
      CASE
        WHEN jsonb_typeof(d.card_payload->'quality_gate'->'blocking_issues') = 'array'
          THEN d.card_payload->'quality_gate'->'blocking_issues'
        ELSE '[]'::jsonb
      END,
      '[]'::jsonb
    ),
    'current_fact_source_audit', COALESCE(
      CASE
        WHEN jsonb_typeof(d.card_payload->'fact_source_audit') = 'array'
          THEN d.card_payload->'fact_source_audit'
        ELSE '[]'::jsonb
      END,
      '[]'::jsonb
    )
  ) AS director_repair_context
  FROM novel_chapter_director_cards d
  WHERE d.project_id = p.id
    AND d.chapter_no = o.chapter_no
    AND d.is_current = TRUE
    AND d.status = 'NEEDS_REVIEW'
  ORDER BY d.version DESC, d.created_at DESC
  LIMIT 1
) current_director ON true
WHERE j.id = $1::uuid
  AND j.project_id = $2::uuid
  AND j.job_type = 'PLAN_CHAPTER_DIRECTOR'
  AND o.status = 'READY';`;

const recordAiRunQuery = `-- Record one AI run.
WITH input AS (
  SELECT
    NULLIF($12, '')::timestamptz AS started_at,
    NULLIF($13, '')::timestamptz AS finished_at
)
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
  error_message,
  started_at,
  finished_at,
  duration_ms
)
SELECT
  NULLIF($1, '')::uuid,
  NULLIF($2, '')::uuid,
  NULLIF($3, '')::uuid,
  $4,
  NULLIF($5, ''),
  NULLIF($6, ''),
  COALESCE(NULLIF($7, '')::jsonb, '{}'::jsonb),
  COALESCE(NULLIF($8, '')::jsonb, '{}'::jsonb),
  COALESCE(NULLIF($9, '')::jsonb, '{}'::jsonb),
  COALESCE(NULLIF($10::text, '')::boolean, TRUE),
  NULLIF($11, ''),
  input.started_at,
  input.finished_at,
  CASE
    WHEN input.started_at IS NOT NULL AND input.finished_at IS NOT NULL
      THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (input.finished_at - input.started_at)) * 1000)::integer)
    ELSE NULL
  END
FROM input
RETURNING *;`;

const supersedeCurrentDirectorCardQuery = `-- Supersede the current director card before inserting a new current version.
WITH input AS (
  SELECT
    $1::uuid AS project_id,
    $2::integer AS chapter_no
), updated AS (
  UPDATE novel_chapter_director_cards d
  SET is_current = FALSE,
      status = CASE WHEN d.status IN ('READY', 'NEEDS_REVIEW', 'FAILED') THEN 'SUPERSEDED' ELSE d.status END,
      updated_at = NOW()
  FROM input
  WHERE d.project_id = input.project_id
    AND d.chapter_no = input.chapter_no
    AND d.is_current = TRUE
  RETURNING d.*
)
SELECT
  input.project_id,
  input.chapter_no,
  (SELECT COUNT(*) FROM updated)::integer AS superseded_count
FROM input;`;

const saveDirectorCardQuery = `-- Save generated director card, update plot threads, and enqueue chapter generation if ready.
WITH input AS (
  SELECT
    $1::uuid AS project_id,
    NULLIF($2, '')::uuid AS outline_id,
    $3::uuid AS job_id,
    $4::integer AS chapter_no,
    COALESCE(NULLIF($5, '')::jsonb, '{}'::jsonb) AS card_payload,
    COALESCE(NULLIF($6, ''), 'NEEDS_REVIEW') AS card_status,
    COALESCE(NULLIF($7, '')::jsonb, '[]'::jsonb) AS plot_threads
), version_seed AS (
  SELECT COALESCE(MAX(version), 0) + 1 AS next_version
  FROM novel_chapter_director_cards d, input
  WHERE d.project_id = input.project_id
    AND d.chapter_no = input.chapter_no
), card AS (
  INSERT INTO novel_chapter_director_cards (
    project_id,
    outline_id,
    job_id,
    chapter_no,
    version,
    is_current,
    status,
    source,
    manual_override,
    card_payload
  )
  SELECT
    input.project_id,
    input.outline_id,
    input.job_id,
    input.chapter_no,
    version_seed.next_version,
    TRUE,
    input.card_status,
    'AI',
    FALSE,
    input.card_payload
  FROM input, version_seed
  RETURNING *
), thread_values AS (
  SELECT value
  FROM input, jsonb_array_elements(input.plot_threads) AS value
  WHERE input.card_status = 'READY'
), upsert_threads AS (
  INSERT INTO novel_plot_threads (
    project_id,
    director_card_id,
    thread_key,
    thread_type,
    status,
    introduced_chapter,
    last_touched_chapter,
    next_touch_chapter,
    payoff_target_chapter,
    do_not_reveal_before,
    visibility,
    notes
  )
  SELECT
    (SELECT project_id FROM input),
    (SELECT id FROM card),
    NULLIF(value->>'thread_key', ''),
    COALESCE(NULLIF(value->>'thread_type', ''), 'foreshadowing'),
    COALESCE(NULLIF(value->>'status', ''), 'ACTIVE'),
    NULLIF(value->>'introduced_chapter', '')::integer,
    NULLIF(value->>'last_touched_chapter', '')::integer,
    NULLIF(value->>'next_touch_chapter', '')::integer,
    NULLIF(value->>'payoff_target_chapter', '')::integer,
    NULLIF(value->>'do_not_reveal_before', '')::integer,
    NULLIF(value->>'visibility', ''),
    NULLIF(value->>'notes', '')
  FROM thread_values
  WHERE NULLIF(value->>'thread_key', '') IS NOT NULL
  ON CONFLICT (project_id, thread_key) DO UPDATE
  SET
    director_card_id = EXCLUDED.director_card_id,
    thread_type = EXCLUDED.thread_type,
    status = EXCLUDED.status,
    introduced_chapter = COALESCE(novel_plot_threads.introduced_chapter, EXCLUDED.introduced_chapter),
    last_touched_chapter = EXCLUDED.last_touched_chapter,
    next_touch_chapter = EXCLUDED.next_touch_chapter,
    payoff_target_chapter = EXCLUDED.payoff_target_chapter,
    do_not_reveal_before = EXCLUDED.do_not_reveal_before,
    visibility = EXCLUDED.visibility,
    notes = EXCLUDED.notes,
    updated_at = NOW()
  RETURNING *
), chapter_job AS (
  INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, payload, status)
  SELECT
    card.project_id,
    'GENERATE_CHAPTER',
    card.chapter_no,
    jsonb_build_object('director_card_id', card.id),
    'PENDING'
  FROM card
  WHERE card.status = 'READY'
    AND NOT EXISTS (
      SELECT 1
      FROM novel_chapters c
      WHERE c.project_id = card.project_id
        AND c.chapter_no = card.chapter_no
        AND c.status IN ('DRAFT_READY', 'AI_REVIEWED', 'NEED_REVIEW', 'APPROVED', 'PUBLISHED', 'REWRITE_REQUESTED')
    )
  ON CONFLICT DO NOTHING
  RETURNING *
)
SELECT
  TRUE AS success,
  CASE WHEN card.status = 'READY' THEN 'DIRECTOR_CARD_CHAPTER_JOB_CREATED' ELSE 'DIRECTOR_CARD_UPDATED' END AS result_code,
  'PLAN_CHAPTER_DIRECTOR'::text AS action,
  card.project_id,
  card.id AS director_card_id,
  card.outline_id,
  card.chapter_no,
  card.status AS director_status,
  card.version AS director_version,
  (SELECT id FROM chapter_job LIMIT 1) AS job_id,
  CASE WHEN card.status = 'READY' THEN 'GENERATE_CHAPTER' ELSE 'PLAN_CHAPTER_DIRECTOR' END AS job_type,
  (SELECT COUNT(*) FROM upsert_threads)::integer AS plot_thread_count,
  CASE
    WHEN card.status = 'READY' THEN '导演台已通过质量闸门，并已创建正文生成任务。'
    ELSE '导演台存在阻断问题，已保存为需调整状态，正文生成不会自动开始。'
  END AS message
FROM card;`;

const markJobSucceededQuery = `-- Mark a novel generation job succeeded.
UPDATE novel_generation_jobs
SET
  status = 'SUCCEEDED',
  error_message = NULL,
  finished_at = NOW(),
  updated_at = NOW()
WHERE id = $1::uuid
RETURNING *;`;

const supersedeManualDirectorCardQuery = `-- Supersede the current card before saving a manual director version.
WITH input AS (
  SELECT
    $1::uuid AS project_id,
    $2::uuid AS director_card_id
), old AS (
  SELECT d.*
  FROM novel_chapter_director_cards d, input
  WHERE d.id = input.director_card_id
    AND d.project_id = input.project_id
), updated AS (
  UPDATE novel_chapter_director_cards d
  SET is_current = FALSE,
      status = CASE WHEN d.status IN ('READY', 'NEEDS_REVIEW', 'FAILED') THEN 'SUPERSEDED' ELSE d.status END,
      updated_at = NOW()
  FROM old
  WHERE d.project_id = old.project_id
    AND d.chapter_no = old.chapter_no
    AND d.is_current = TRUE
  RETURNING d.*
)
SELECT
  COALESCE((SELECT project_id FROM old LIMIT 1), (SELECT project_id FROM input)) AS project_id,
  (SELECT chapter_no FROM old LIMIT 1) AS chapter_no,
  (SELECT COUNT(*) FROM updated)::integer AS superseded_count;`;

const saveManualDirectorCardQuery = `-- Save a manually edited director card as the current version.
WITH input AS (
  SELECT
    $1::uuid AS project_id,
    $2::uuid AS director_card_id,
    COALESCE(NULLIF($3, '')::jsonb, '{}'::jsonb) AS card_payload,
    NULLIF($4, '') AS reviewer,
    NULLIF($5, '') AS comment
), old AS (
  SELECT d.*
  FROM novel_chapter_director_cards d, input
  WHERE d.id = input.director_card_id
    AND d.project_id = input.project_id
), project_rules AS (
  SELECT
    old.project_id,
    old.chapter_no,
    CASE
      WHEN p.target_words_per_chapter <= 1500 THEN 1
      WHEN p.target_words_per_chapter <= 2500 THEN 2
      WHEN p.target_words_per_chapter <= 3500 THEN 3
      WHEN p.target_words_per_chapter <= 4500 THEN 4
      WHEN p.target_words_per_chapter <= 6500 THEN 5
      ELSE 6
    END AS expected_segments
  FROM old
  JOIN novel_projects p ON p.id = old.project_id
), manual_checks AS (
  SELECT
    input.card_payload,
    COALESCE((input.card_payload->'quality_gate'->>'pass')::boolean, TRUE) AS requested_pass,
    CASE
      WHEN jsonb_typeof(input.card_payload->'quality_gate'->'blocking_issues') = 'array'
        THEN input.card_payload->'quality_gate'->'blocking_issues'
      ELSE '[]'::jsonb
    END AS provided_issues,
    CASE
      WHEN jsonb_typeof(input.card_payload->'segment_plan') = 'array'
        THEN jsonb_array_length(input.card_payload->'segment_plan')
      ELSE 0
    END AS segment_count,
    project_rules.expected_segments
  FROM input
  JOIN project_rules ON true
), issue_values AS (
  SELECT value AS issue
  FROM manual_checks, jsonb_array_elements_text(manual_checks.provided_issues) AS value
  UNION ALL
  SELECT '事实来源不足：' || NULLIF(value->>'claim', '')
  FROM manual_checks, jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(manual_checks.card_payload->'fact_source_audit') = 'array'
        THEN manual_checks.card_payload->'fact_source_audit'
      ELSE '[]'::jsonb
    END
  ) AS value
  WHERE lower(COALESCE(value->>'verdict', '')) = 'unsupported'
    AND NULLIF(value->>'claim', '') IS NOT NULL
  UNION ALL
  SELECT format(
    '导演台 segment_plan 数量必须等于正文分段数：期望 %s，实际 %s',
    manual_checks.expected_segments,
    manual_checks.segment_count
  )
  FROM manual_checks
  WHERE manual_checks.expected_segments > 0
    AND manual_checks.segment_count <> manual_checks.expected_segments
), issue_agg AS (
  SELECT COALESCE(jsonb_agg(DISTINCT issue), '[]'::jsonb) AS blocking_issues
  FROM issue_values
), normalized_payload AS (
  SELECT
    input.card_payload || jsonb_build_object(
      'quality_gate',
      COALESCE(input.card_payload->'quality_gate', '{}'::jsonb) || jsonb_build_object(
        'pass',
        manual_checks.requested_pass AND jsonb_array_length(issue_agg.blocking_issues) = 0,
        'blocking_issues',
        issue_agg.blocking_issues
      )
    ) AS card_payload
  FROM input
  JOIN manual_checks ON true
  JOIN issue_agg ON true
), status_calc AS (
  SELECT
    CASE
      WHEN COALESCE((normalized_payload.card_payload->'quality_gate'->>'pass')::boolean, FALSE)
        THEN 'READY'
      ELSE 'NEEDS_REVIEW'
    END AS card_status
  FROM normalized_payload
), version_seed AS (
  SELECT COALESCE(MAX(d.version), 0) + 1 AS next_version
  FROM novel_chapter_director_cards d
  JOIN old ON old.project_id = d.project_id AND old.chapter_no = d.chapter_no
), inserted AS (
  INSERT INTO novel_chapter_director_cards (
    project_id,
    outline_id,
    job_id,
    chapter_no,
    version,
    is_current,
    status,
    source,
    manual_override,
    card_payload
  )
  SELECT
    old.project_id,
    old.outline_id,
    old.job_id,
    old.chapter_no,
    version_seed.next_version,
    TRUE,
    status_calc.card_status,
    'MANUAL',
    TRUE,
    normalized_payload.card_payload
  FROM old, version_seed, status_calc, normalized_payload
  RETURNING *
), event AS (
  INSERT INTO novel_project_events (
    project_id,
    outline_id,
    event_type,
    actor,
    comment,
    before_payload,
    after_payload
  )
  SELECT
    inserted.project_id,
    inserted.outline_id,
    'DIRECTOR_CARD_UPDATED',
    COALESCE((SELECT reviewer FROM input), 'local_user'),
    COALESCE((SELECT comment FROM input), '手动保存导演台'),
    COALESCE((SELECT card_payload FROM old LIMIT 1), '{}'::jsonb),
    inserted.card_payload
  FROM inserted
  RETURNING *
), thread_values AS (
  SELECT value
  FROM inserted, jsonb_array_elements(COALESCE(inserted.card_payload->'foreshadowing_ops', '[]'::jsonb)) AS value
  WHERE inserted.status = 'READY'
), upsert_threads AS (
  INSERT INTO novel_plot_threads (
    project_id,
    director_card_id,
    thread_key,
    thread_type,
    status,
    introduced_chapter,
    last_touched_chapter,
    next_touch_chapter,
    payoff_target_chapter,
    do_not_reveal_before,
    visibility,
    notes
  )
  SELECT
    inserted.project_id,
    inserted.id,
    NULLIF(value->>'thread_key', ''),
    'foreshadowing',
    CASE COALESCE(NULLIF(value->>'action', ''), 'touch')
      WHEN 'seed' THEN 'SEEDING'
      WHEN 'payoff' THEN 'PAYOFF_READY'
      WHEN 'avoid_reveal' THEN 'ACTIVE'
      ELSE 'TOUCHING'
    END,
    CASE WHEN value->>'action' = 'seed' THEN inserted.chapter_no ELSE NULL END,
    inserted.chapter_no,
    NULLIF(value->>'next_touch_chapter', '')::integer,
    NULLIF(value->>'payoff_target_chapter', '')::integer,
    NULLIF(value->>'do_not_reveal_before', '')::integer,
    NULLIF(value->>'visibility', ''),
    NULLIF(value->>'instruction', '')
  FROM inserted
  JOIN thread_values ON true
  WHERE NULLIF(value->>'thread_key', '') IS NOT NULL
  ON CONFLICT (project_id, thread_key) DO UPDATE
  SET
    director_card_id = EXCLUDED.director_card_id,
    thread_type = EXCLUDED.thread_type,
    status = EXCLUDED.status,
    introduced_chapter = COALESCE(novel_plot_threads.introduced_chapter, EXCLUDED.introduced_chapter),
    last_touched_chapter = EXCLUDED.last_touched_chapter,
    next_touch_chapter = EXCLUDED.next_touch_chapter,
    payoff_target_chapter = EXCLUDED.payoff_target_chapter,
    do_not_reveal_before = EXCLUDED.do_not_reveal_before,
    visibility = EXCLUDED.visibility,
    notes = EXCLUDED.notes,
    updated_at = NOW()
  RETURNING *
)
SELECT
  (SELECT COUNT(*) FROM inserted) > 0 AS success,
  CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN 'DIRECTOR_CARD_UPDATED' ELSE 'DIRECTOR_CARD_NOT_FOUND' END AS result_code,
  'UPDATE_DIRECTOR_CARD'::text AS action,
  COALESCE((SELECT project_id FROM inserted), (SELECT project_id FROM input)) AS project_id,
  (SELECT id FROM inserted) AS director_card_id,
  (SELECT outline_id FROM inserted) AS outline_id,
  (SELECT chapter_no FROM inserted) AS chapter_no,
  (SELECT status FROM inserted) AS director_status,
  (SELECT version FROM inserted) AS director_version,
  NULL::uuid AS job_id,
  'PLAN_CHAPTER_DIRECTOR'::text AS job_type,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM inserted) THEN '没有找到可保存的导演台。'
    WHEN (SELECT status FROM inserted) = 'READY' THEN '导演台已保存为当前版本，质量闸门已通过。'
    ELSE '导演台已保存为当前版本，但仍需调整；请检查质量闸门、阻断列表、事实来源审计和分段计划数量。'
  END AS message;`;

const regenerateDirectorQuery = `-- Enqueue a fresh director planning job for one chapter.
WITH input AS (
  SELECT
    $1::uuid AS project_id,
    $2::integer AS chapter_no,
    NULLIF($3, '') AS reviewer,
    NULLIF($4, '') AS comment
), outline AS (
  SELECT o.*
  FROM novel_chapter_outlines o, input
  WHERE o.project_id = input.project_id
    AND o.chapter_no = input.chapter_no
    AND o.status = 'READY'
), running_job AS (
  SELECT j.*
  FROM novel_generation_jobs j, input
  WHERE j.project_id = input.project_id
    AND j.chapter_no = input.chapter_no
    AND j.job_type = 'PLAN_CHAPTER_DIRECTOR'
    AND j.status = 'RUNNING'
  ORDER BY j.created_at DESC
  LIMIT 1
), claimed_pending AS (
  UPDATE novel_generation_jobs j
  SET
    status = 'RUNNING',
    payload = j.payload || jsonb_build_object(
      'requested_by', COALESCE((SELECT reviewer FROM input), 'local_user'),
      'trigger_source', 'manual_regenerate',
      'comment', (SELECT comment FROM input)
    ),
    started_at = COALESCE(j.started_at, NOW()),
    updated_at = NOW()
  FROM input
  WHERE j.project_id = input.project_id
    AND j.chapter_no = input.chapter_no
    AND j.job_type = 'PLAN_CHAPTER_DIRECTOR'
    AND j.status = 'PENDING'
    AND NOT EXISTS (SELECT 1 FROM running_job)
  RETURNING j.*
), job AS (
  INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, payload, status, started_at)
  SELECT
    input.project_id,
    'PLAN_CHAPTER_DIRECTOR',
    input.chapter_no,
    jsonb_build_object('requested_by', COALESCE(input.reviewer, 'local_user'), 'trigger_source', 'manual_regenerate', 'comment', input.comment),
    'RUNNING',
    NOW()
  FROM input
  WHERE EXISTS (SELECT 1 FROM outline)
    AND NOT EXISTS (SELECT 1 FROM running_job)
    AND NOT EXISTS (SELECT 1 FROM claimed_pending)
  ON CONFLICT DO NOTHING
  RETURNING *
), runnable_job AS (
  SELECT * FROM claimed_pending
  UNION ALL
  SELECT * FROM job
), event AS (
  INSERT INTO novel_project_events (project_id, outline_id, event_type, actor, comment)
  SELECT
    input.project_id,
    outline.id,
    'DIRECTOR_CARD_REGENERATE_REQUESTED',
    COALESCE(input.reviewer, 'local_user'),
    COALESCE(input.comment, '重新生成导演台')
  FROM input
  JOIN outline ON true
  WHERE EXISTS (SELECT 1 FROM runnable_job)
  RETURNING *
)
SELECT
  EXISTS (SELECT 1 FROM runnable_job) AS success,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM outline) THEN 'OUTLINE_NOT_FOUND'
    WHEN EXISTS (SELECT 1 FROM runnable_job) THEN 'DIRECTOR_CARD_REGENERATE_JOB_CREATED'
    ELSE 'REGENERATE_JOB_ALREADY_EXISTS'
  END AS result_code,
  'REGENERATE_DIRECTOR_CARD'::text AS action,
  input.project_id,
  (SELECT id FROM outline) AS outline_id,
  input.chapter_no,
  (SELECT id FROM runnable_job) AS id,
  (SELECT id FROM runnable_job) AS job_id,
  'PLAN_CHAPTER_DIRECTOR'::text AS job_type,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM outline) THEN '未找到可用于生成导演台的章节大纲。'
    WHEN EXISTS (SELECT 1 FROM runnable_job) THEN '已启动导演台重生成任务。'
    ELSE '该章节已有运行中的导演台任务。'
  END AS message
FROM input;`;

const startChapterFromDirectorQuery = `-- Enqueue chapter generation from a ready director card.
WITH input AS (
  SELECT
    $1::uuid AS project_id,
    $2::uuid AS director_card_id,
    NULLIF($3, '') AS reviewer,
    NULLIF($4, '') AS comment
), card AS (
  SELECT d.*
  FROM novel_chapter_director_cards d, input
  WHERE d.project_id = input.project_id
    AND d.id = input.director_card_id
    AND d.is_current = TRUE
), job AS (
  INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, payload, status)
  SELECT
    card.project_id,
    'GENERATE_CHAPTER',
    card.chapter_no,
    jsonb_build_object('director_card_id', card.id, 'requested_by', COALESCE((SELECT reviewer FROM input), 'local_user'), 'trigger_source', 'director_manual_start', 'comment', (SELECT comment FROM input)),
    'PENDING'
  FROM card
  WHERE card.status = 'READY'
    AND NOT EXISTS (
      SELECT 1
      FROM novel_chapters c
      WHERE c.project_id = card.project_id
        AND c.chapter_no = card.chapter_no
        AND c.status IN ('DRAFT_READY', 'AI_REVIEWED', 'NEED_REVIEW', 'APPROVED', 'PUBLISHED', 'REWRITE_REQUESTED')
    )
  ON CONFLICT DO NOTHING
  RETURNING *
), event AS (
  INSERT INTO novel_project_events (project_id, outline_id, event_type, actor, comment, after_payload)
  SELECT
    card.project_id,
    card.outline_id,
    'DIRECTOR_CARD_CHAPTER_JOB_CREATED',
    COALESCE((SELECT reviewer FROM input), 'local_user'),
    COALESCE((SELECT comment FROM input), '按导演台生成正文'),
    jsonb_build_object('director_card_id', card.id, 'chapter_job_id', (SELECT id FROM job LIMIT 1))
  FROM card
  WHERE EXISTS (SELECT 1 FROM job)
  RETURNING *
)
SELECT
  EXISTS (SELECT 1 FROM job) AS success,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM card) THEN 'DIRECTOR_CARD_NOT_FOUND'
    WHEN (SELECT status FROM card LIMIT 1) <> 'READY' THEN 'DIRECTOR_CARD_NOT_READY'
    WHEN EXISTS (
      SELECT 1
      FROM novel_chapters c
      JOIN card ON card.project_id = c.project_id AND card.chapter_no = c.chapter_no
      WHERE c.status IN ('DRAFT_READY', 'AI_REVIEWED', 'NEED_REVIEW', 'APPROVED', 'PUBLISHED', 'REWRITE_REQUESTED')
    ) THEN 'ACTIVE_CHAPTER_JOB_BLOCKED'
    WHEN EXISTS (SELECT 1 FROM job) THEN 'DIRECTOR_CARD_CHAPTER_JOB_CREATED'
    ELSE 'ACTIVE_CHAPTER_JOB_BLOCKED'
  END AS result_code,
  'START_CHAPTER_FROM_DIRECTOR'::text AS action,
  COALESCE((SELECT project_id FROM card), (SELECT project_id FROM input)) AS project_id,
  (SELECT id FROM card) AS director_card_id,
  (SELECT outline_id FROM card) AS outline_id,
  (SELECT chapter_no FROM card) AS chapter_no,
  (SELECT status FROM card) AS director_status,
  (SELECT version FROM card) AS director_version,
  (SELECT id FROM job) AS job_id,
  'GENERATE_CHAPTER'::text AS job_type,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM card) THEN '没有找到当前导演台。'
    WHEN (SELECT status FROM card LIMIT 1) <> 'READY' THEN '导演台仍需调整，不能启动正文生成。'
    WHEN EXISTS (
      SELECT 1
      FROM novel_chapters c
      JOIN card ON card.project_id = c.project_id AND card.chapter_no = c.chapter_no
      WHERE c.status IN ('DRAFT_READY', 'AI_REVIEWED', 'NEED_REVIEW', 'APPROVED', 'PUBLISHED', 'REWRITE_REQUESTED')
    ) THEN '同章已有正文版本或候选稿，不能重复启动正文生成。'
    WHEN EXISTS (SELECT 1 FROM job) THEN '已按当前导演台创建正文生成任务。'
    ELSE '同章已有正文生成任务正在等待或运行。'
  END AS message;`;

const mergeDirectorResponseCode = `// n8n Code node: Merge Director GLM Response Context
const context = $('代码 - 构建导演台 GLM请求').first().json;
const response = $json;
return [{json: {...context, llm_response: response}}];`;

const directorWorkflow = workflowBase(
  'novelDirectorV1Workflow13B',
  '13B_小说导演台规划',
  [
    manualNode('manual-novel-director-13b', '手动触发', [-920, 0]),
    executeWorkflowTriggerNode('execute-trigger-director-worker-13b', '触发器 - 后台执行导演台规划', [-920, -180]),
    postgresNode('postgres-claim-director-13b', '数据库 - 领取PLAN_CHAPTER_DIRECTOR任务', [-700, 0], claimDirectorQuery),
    postgresNode(
      'postgres-read-director-context-13b',
      '数据库 - 读取导演台上下文',
      [-480, 0],
      readDirectorContextQuery,
      '={{ [ $json.id, $json.project_id ] }}'
    ),
    codeNode('code-build-director-request-13b', '代码 - 构建导演台 GLM请求', [-260, 0], code('n8n/code/novel_build_glm_request.js')),
    httpGlmNode('http-glm-director-13b', 'HTTP请求 - 调用GLM生成导演台', [-40, 0]),
    codeNode('code-merge-director-response-13b', '代码 - 合并导演台 GLM响应上下文', [180, 0], mergeDirectorResponseCode),
    codeNode('code-parse-director-response-13b', '代码 - 解析导演台 GLM响应', [400, 0], code('n8n/code/novel_parse_director_card_json.js')),
    postgresNode(
      'postgres-record-director-ai-run-13b',
      '数据库 - 记录导演台 AI调用',
      [620, 0],
      recordAiRunQuery,
      '={{ [ $json.project_id, "", $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify({ ...$json.llm_request_body, trigger_source: $json.trigger_source, requested_by: $json.requested_by, chapter_no: $json.chapter_no, chapter_segment_total: $json.chapter_segment_total }), $json.llm_response_json, $json.parsed_payload_json, true, "", $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
    ),
	    postgresNode(
	      'postgres-save-director-card-13b',
	      '数据库 - 保存导演台并按闸门排正文',
	      [1060, 0],
	      saveDirectorCardQuery,
	      '={{ [ $("代码 - 解析导演台 GLM响应").first().json.project_id, $("代码 - 解析导演台 GLM响应").first().json.outline_id, $("代码 - 解析导演台 GLM响应").first().json.job_id, $("代码 - 解析导演台 GLM响应").first().json.chapter_no, $("代码 - 解析导演台 GLM响应").first().json.card_payload_json, $("代码 - 解析导演台 GLM响应").first().json.director_status, $("代码 - 解析导演台 GLM响应").first().json.plot_threads_json ] }}'
	    ),
	    postgresNode(
	      'postgres-supersede-current-director-13b',
	      '数据库 - 取消旧当前导演台版本',
	      [840, 0],
	      supersedeCurrentDirectorCardQuery,
	      '={{ [ $("代码 - 解析导演台 GLM响应").first().json.project_id, $("代码 - 解析导演台 GLM响应").first().json.chapter_no ] }}'
	    ),
	    postgresNode(
	      'postgres-mark-director-success-13b',
	      '数据库 - 标记导演台任务成功',
	      [1280, 0],
	      markJobSucceededQuery,
	      '={{ [ $("代码 - 解析导演台 GLM响应").first().json.job_id ] }}'
	    ),
    webhookNode('webhook-front-generate-director-13b', 'Webhook - 前端立即生成导演台', [-920, 260], 'POST', 'novel-generate-director-now', 'novel-generate-director-now-13b'),
    codeNode('code-validate-front-director-13b', '代码 - 校验前端生成导演台', [-700, 260], code('n8n/code/novel_validate_project_generation_step.js')),
    postgresNode(
      'postgres-claim-front-director-13b',
      '数据库 - 前端领取PLAN_CHAPTER_DIRECTOR任务',
      [-480, 260],
      claimDirectorForProjectQuery,
      '={{ [ $json.project_id ] }}'
    ),
    ifNode('if-front-director-claimed-13b', '条件判断 - 前端导演台任务已领取', [-260, 260], '={{ $json.claim_success }}', 'front-director-claimed'),
    executeWorkflowNode('execute-director-worker-13b', '执行子流程 - 异步生成导演台', [-40, 200], 'novelDirectorV1Workflow13B'),
    codeNode('code-render-front-director-result-13b', '代码 - 生成前端导演台生成结果页', [-40, 360], code('n8n/code/novel_render_generation_step_result.js')),
    respondNode('respond-front-director-result-13b', '响应Webhook - 返回导演台生成结果', [180, 360], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}'),
    webhookNode('webhook-update-director-13b', 'Webhook - 保存导演台', [-920, 560], 'POST', 'novel-director-card-update', 'novel-director-card-update-13b'),
    codeNode('code-validate-update-director-13b', '代码 - 校验保存导演台', [-700, 560], code('n8n/code/novel_validate_director_card_action.js')),
	    postgresNode(
	      'postgres-supersede-manual-director-13b',
	      '数据库 - 取消旧当前手动导演台版本',
	      [-480, 560],
	      supersedeManualDirectorCardQuery,
	      '={{ [ $("代码 - 校验保存导演台").first().json.project_id, $("代码 - 校验保存导演台").first().json.director_card_id ] }}'
	    ),
	    postgresNode(
	      'postgres-save-manual-director-13b',
	      '数据库 - 保存手动导演台版本',
	      [-260, 560],
	      saveManualDirectorCardQuery,
	      '={{ [ $("代码 - 校验保存导演台").first().json.project_id, $("代码 - 校验保存导演台").first().json.director_card_id, $("代码 - 校验保存导演台").first().json.card_payload_json, $("代码 - 校验保存导演台").first().json.reviewer, $("代码 - 校验保存导演台").first().json.comment ] }}'
	    ),
	    codeNode('code-render-update-director-result-13b', '代码 - 生成保存导演台结果页', [-40, 560], code('n8n/code/novel_render_project_action_result.js')),
	    respondNode('respond-update-director-result-13b', '响应Webhook - 返回保存导演台结果', [180, 560], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}'),
    webhookNode('webhook-regenerate-director-13b', 'Webhook - 重新生成导演台', [180, 560], 'POST', 'novel-director-card-regenerate', 'novel-director-card-regenerate-13b'),
    codeNode('code-validate-regenerate-director-13b', '代码 - 校验重新生成导演台', [400, 560], code('n8n/code/novel_validate_director_card_action.js')),
    postgresNode(
      'postgres-regenerate-director-13b',
      '数据库 - 创建导演台重生成任务',
      [620, 560],
      regenerateDirectorQuery,
      '={{ [ $json.project_id, $json.chapter_no, $json.reviewer, $json.comment ] }}'
    ),
    ifNode('if-regenerate-director-claimed-13b', '条件判断 - 重生成导演台任务已领取', [840, 560], '={{ $json.success }}', 'regenerate-director-claimed'),
    codeNode('code-render-regenerate-director-result-13b', '代码 - 生成重新生成导演台结果页', [1060, 620], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-regenerate-director-result-13b', '响应Webhook - 返回重新生成导演台结果', [1280, 620], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}'),
    webhookNode('webhook-start-chapter-director-13b', 'Webhook - 按导演台生成正文', [180, 760], 'POST', 'novel-director-card-start-chapter', 'novel-director-card-start-chapter-13b'),
    codeNode('code-validate-start-chapter-director-13b', '代码 - 校验按导演台生成正文', [400, 760], code('n8n/code/novel_validate_director_card_action.js')),
    postgresNode(
      'postgres-start-chapter-director-13b',
      '数据库 - 按导演台创建正文任务',
      [620, 760],
      startChapterFromDirectorQuery,
      '={{ [ $json.project_id, $json.director_card_id, $json.reviewer, $json.comment ] }}'
    ),
    codeNode('code-render-start-chapter-director-result-13b', '代码 - 生成按导演台生成正文结果页', [840, 760], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-start-chapter-director-result-13b', '响应Webhook - 返回按导演台生成正文结果', [1060, 760], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}'),
    sticky('note-director-13b', '说明 - 导演台规划', [-920, -420], '领取 `PLAN_CHAPTER_DIRECTOR`，读取 Bible、大纲、前后章节、连续性事实和伏笔账本，生成短 JSON 导演台；通过质量闸门后自动创建 `GENERATE_CHAPTER(PENDING)`。'),
  ],
  {
    '手动触发': {main: [[{node: '数据库 - 领取PLAN_CHAPTER_DIRECTOR任务', type: 'main', index: 0}]]},
    '触发器 - 后台执行导演台规划': {main: [[{node: '数据库 - 读取导演台上下文', type: 'main', index: 0}]]},
    '数据库 - 领取PLAN_CHAPTER_DIRECTOR任务': {main: [[{node: '数据库 - 读取导演台上下文', type: 'main', index: 0}]]},
    '数据库 - 读取导演台上下文': {main: [[{node: '代码 - 构建导演台 GLM请求', type: 'main', index: 0}]]},
    '代码 - 构建导演台 GLM请求': {main: [[{node: 'HTTP请求 - 调用GLM生成导演台', type: 'main', index: 0}]]},
    'HTTP请求 - 调用GLM生成导演台': {main: [[{node: '代码 - 合并导演台 GLM响应上下文', type: 'main', index: 0}]]},
    '代码 - 合并导演台 GLM响应上下文': {main: [[{node: '代码 - 解析导演台 GLM响应', type: 'main', index: 0}]]},
    '代码 - 解析导演台 GLM响应': {main: [[{node: '数据库 - 记录导演台 AI调用', type: 'main', index: 0}]]},
    '数据库 - 记录导演台 AI调用': {main: [[{node: '数据库 - 取消旧当前导演台版本', type: 'main', index: 0}]]},
    '数据库 - 取消旧当前导演台版本': {main: [[{node: '数据库 - 保存导演台并按闸门排正文', type: 'main', index: 0}]]},
    '数据库 - 保存导演台并按闸门排正文': {main: [[{node: '数据库 - 标记导演台任务成功', type: 'main', index: 0}]]},
    'Webhook - 前端立即生成导演台': {main: [[{node: '代码 - 校验前端生成导演台', type: 'main', index: 0}]]},
    '代码 - 校验前端生成导演台': {main: [[{node: '数据库 - 前端领取PLAN_CHAPTER_DIRECTOR任务', type: 'main', index: 0}]]},
    '数据库 - 前端领取PLAN_CHAPTER_DIRECTOR任务': {main: [[{node: '条件判断 - 前端导演台任务已领取', type: 'main', index: 0}]]},
    '条件判断 - 前端导演台任务已领取': {main: [[{node: '代码 - 生成前端导演台生成结果页', type: 'main', index: 0}, {node: '执行子流程 - 异步生成导演台', type: 'main', index: 0}], [{node: '代码 - 生成前端导演台生成结果页', type: 'main', index: 0}]]},
    '代码 - 生成前端导演台生成结果页': {main: [[{node: '响应Webhook - 返回导演台生成结果', type: 'main', index: 0}]]},
    'Webhook - 保存导演台': {main: [[{node: '代码 - 校验保存导演台', type: 'main', index: 0}]]},
    '代码 - 校验保存导演台': {main: [[{node: '数据库 - 取消旧当前手动导演台版本', type: 'main', index: 0}]]},
    '数据库 - 取消旧当前手动导演台版本': {main: [[{node: '数据库 - 保存手动导演台版本', type: 'main', index: 0}]]},
    '数据库 - 保存手动导演台版本': {main: [[{node: '代码 - 生成保存导演台结果页', type: 'main', index: 0}]]},
    '代码 - 生成保存导演台结果页': {main: [[{node: '响应Webhook - 返回保存导演台结果', type: 'main', index: 0}]]},
    'Webhook - 重新生成导演台': {main: [[{node: '代码 - 校验重新生成导演台', type: 'main', index: 0}]]},
    '代码 - 校验重新生成导演台': {main: [[{node: '数据库 - 创建导演台重生成任务', type: 'main', index: 0}]]},
    '数据库 - 创建导演台重生成任务': {main: [[{node: '条件判断 - 重生成导演台任务已领取', type: 'main', index: 0}]]},
    '条件判断 - 重生成导演台任务已领取': {main: [[{node: '代码 - 生成重新生成导演台结果页', type: 'main', index: 0}, {node: '执行子流程 - 异步生成导演台', type: 'main', index: 0}], [{node: '代码 - 生成重新生成导演台结果页', type: 'main', index: 0}]]},
    '代码 - 生成重新生成导演台结果页': {main: [[{node: '响应Webhook - 返回重新生成导演台结果', type: 'main', index: 0}]]},
    'Webhook - 按导演台生成正文': {main: [[{node: '代码 - 校验按导演台生成正文', type: 'main', index: 0}]]},
    '代码 - 校验按导演台生成正文': {main: [[{node: '数据库 - 按导演台创建正文任务', type: 'main', index: 0}]]},
    '数据库 - 按导演台创建正文任务': {main: [[{node: '代码 - 生成按导演台生成正文结果页', type: 'main', index: 0}]]},
    '代码 - 生成按导演台生成正文结果页': {main: [[{node: '响应Webhook - 返回按导演台生成正文结果', type: 'main', index: 0}]]},
  }
);

const outputs = [
  ['n8n/workflow/13b_novel_director_workflow.json', directorWorkflow],
  ['n8n/workflow/available/13b_novel_director_workflow.json', directorWorkflow],
];

for (const [relativePath, workflow] of outputs) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), {recursive: true});
  fs.writeFileSync(fullPath, `${JSON.stringify(workflow, null, 2)}\n`);
}

console.log(`Generated ${outputs.length} novel director workflow files.`);
