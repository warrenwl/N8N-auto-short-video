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
    parameters: {
      inputSource: 'passthrough',
    },
    id,
    name,
    type: 'n8n-nodes-base.executeWorkflowTrigger',
    typeVersion: 1.1,
    position,
  };
}

function scheduleNode(id, name, position) {
  return {
    parameters: {
      rule: {
        interval: [
          {
            field: 'minutes',
            minutesInterval: 5,
          },
        ],
      },
    },
    id,
    name,
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position,
  };
}

function executeWorkflowNode(id, name, position, workflowId) {
  return {
    parameters: {
      source: 'database',
      workflowId,
      mode: 'once',
      options: {
        waitForSubWorkflow: false,
      },
    },
    id,
    name,
    type: 'n8n-nodes-base.executeWorkflow',
    typeVersion: 1,
    position,
  };
}

function httpGlmNode(id, name, position, options = {}) {
  const node = {
    parameters: {
      method: 'POST',
      url: '={{ $env.GLM_API_BASE_URL || "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions" }}',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {
            name: 'Authorization',
            value: '={{ "Bearer " + $env.GLM_API_KEY }}',
          },
          {
            name: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
      sendBody: true,
      contentType: 'json',
      jsonBody: '={{ { ...$json.llm_request_body, model: $env.GLM_MODEL || $json.llm_request_body.model } }}',
      options: {
        response: {
          response: {
            responseFormat: 'json',
          },
        },
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
  if (options.continueErrorOutput) {
    node.onError = 'continueErrorOutput';
  }
  return node;
}

function httpServerChanNode(id, name, position) {
  return {
    parameters: {
      method: 'POST',
      url: '={{ $json.serverchan_url }}',
      sendBody: true,
      contentType: 'form-urlencoded',
      bodyParameters: {
        parameters: [
          {
            name: 'title',
            value: '={{ $json.serverchan_title }}',
          },
          {
            name: 'desp',
            value: '={{ $json.serverchan_desp }}',
          },
        ],
      },
      options: {
        response: {
          response: {
            responseFormat: 'json',
          },
        },
        timeout: 120000,
      },
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
    parameters: {
      content,
      height: 180,
      width: 340,
      color: 4,
    },
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
    settings: {
      executionOrder: 'v1',
    },
    versionId: `${id}-v1`,
    meta: {
      templateCredsSetupCompleted: true,
    },
    description: 'Novel workflow V1 generated from project SQL/code files.',
  };
}

const claimRewriteQuery = `-- Claim one pending REWRITE_CHAPTER job.
WITH claimed AS (
  SELECT j.id
  FROM novel_generation_jobs j
  JOIN novel_projects p ON p.id = j.project_id
  WHERE j.job_type = 'REWRITE_CHAPTER'
    AND j.status = 'PENDING'
    AND j.attempt_count < j.max_attempts
    AND p.status NOT IN ('PAUSED', 'ARCHIVED')
  ORDER BY j.created_at ASC
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

const claimRewriteByInputQuery = `-- Claim a pending REWRITE_CHAPTER job from an async caller.
WITH input AS (
  SELECT
    CASE
      WHEN NULLIF($1::text, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN ($1::text)::uuid
      ELSE NULL::uuid
    END AS job_id
), claimed AS (
  SELECT j.id
  FROM novel_generation_jobs j
  JOIN novel_projects p ON p.id = j.project_id
  WHERE j.job_type = 'REWRITE_CHAPTER'
    AND j.status = 'PENDING'
    AND j.attempt_count < j.max_attempts
    AND p.status NOT IN ('PAUSED', 'ARCHIVED')
    AND ((SELECT job_id FROM input) IS NULL OR j.id = (SELECT job_id FROM input))
  ORDER BY j.created_at ASC
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

const readRewriteContextQuery = `-- Read context for chapter rewrite.
SELECT
  p.id AS project_id,
  p.title AS novel_title,
  p.genre,
  p.audience,
  p.style,
  p.target_words_per_chapter,
  $1::uuid AS job_id,
  'REWRITE_CHAPTER'::text AS run_type,
  original.id AS chapter_id,
  original.id AS original_chapter_id,
  original.chapter_no,
  original.title AS chapter_title,
  original.body AS chapter_body,
  original.summary AS chapter_summary,
  original.generation_version AS original_generation_version,
  o.id AS outline_id,
  o.title AS outline_title,
  o.summary AS outline_summary,
  o.chapter_goal,
  o.conflict_point,
  o.emotional_point,
  o.hook,
  o.scene_beats,
  o.reader_questions,
  director.id AS director_card_id,
  director.version AS director_card_version,
  director.card_payload AS director_card,
  jsonb_build_object(
    'world_setting', b.world_setting,
    'story_core', b.story_core,
    'main_character', b.main_character,
    'supporting_characters', b.supporting_characters,
    'villain_setting', b.villain_setting,
    'organizations', b.organizations,
    'locations', b.locations,
    'power_system', b.power_system,
    'relationship_map', b.relationship_map,
    'plot_constraints', b.plot_constraints,
    'expansion_notes', b.expansion_notes,
    'tone_rules', b.tone_rules,
    'forbidden_rules', b.forbidden_rules,
    'selling_points', b.selling_points
  ) AS novel_bible,
  COALESCE(NULLIF(j.payload->'review_issues', 'null'::jsonb), rr.issues, '[]'::jsonb) AS issues,
  COALESCE(NULLIF(j.payload->'review_suggestions', 'null'::jsonb), rr.suggestions, '[]'::jsonb) AS suggestions,
  rr.total_score,
  rr.verdict,
  COALESCE(NULLIF(j.payload->>'comment', ''), hr.comment) AS human_comment,
  COALESCE(facts.continuity_facts, '[]'::jsonb) AS continuity_facts
FROM novel_generation_jobs j
JOIN novel_chapters original ON original.id = j.chapter_id
JOIN novel_projects p ON p.id = original.project_id
JOIN novel_bibles b ON b.project_id = p.id
LEFT JOIN novel_chapter_outlines o ON o.project_id = p.id AND o.chapter_no = original.chapter_no
LEFT JOIN LATERAL (
  SELECT *
  FROM novel_review_reports report
  WHERE report.chapter_id = original.id
  ORDER BY
    CASE
      WHEN (j.payload->>'review_report_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND report.id = (j.payload->>'review_report_id')::uuid
        THEN 0
      ELSE 1
    END,
    report.created_at DESC
  LIMIT 1
) rr ON true
LEFT JOIN LATERAL (
  SELECT *
  FROM novel_human_reviews review
  WHERE review.chapter_id = original.id
    AND review.action = 'REQUEST_REWRITE'
  ORDER BY review.created_at DESC
  LIMIT 1
) hr ON true
LEFT JOIN LATERAL (
  SELECT d.*
  FROM novel_chapter_director_cards d
  WHERE d.project_id = p.id
    AND d.chapter_no = original.chapter_no
    AND d.is_current = TRUE
    AND d.status = 'READY'
  ORDER BY d.version DESC
  LIMIT 1
) director ON true
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
        OR chapter_no < original.chapter_no
        OR source = 'human'
      )
    ORDER BY created_at DESC
    LIMIT 80
  ) picked
) facts ON true
WHERE j.id = $1::uuid
  AND j.project_id = $2::uuid
  AND j.chapter_id = $3::uuid
  AND (
    original.status = 'REWRITE_REQUESTED'
    OR (
      original.status IN ('APPROVED', 'PUBLISHED')
      AND original.is_current = TRUE
      AND COALESCE(j.payload->>'rewrite_source', '') = 'approved_current'
    )
  );`;

const recordAiRunQuery = `-- Record one AI run. Handles REWRITE_CHAPTER.
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

const saveRewriteCandidateQuery = `-- Save rewritten candidate chapter and enqueue AI review.
WITH chapter AS (
  SELECT *
  FROM create_novel_chapter_version(
    $1::uuid,
    NULLIF($2, '')::uuid,
    NULLIF($3, '')::uuid,
    $4::integer,
    convert_from(decode(COALESCE(NULLIF($5, ''), ''), 'base64'), 'UTF8'),
    convert_from(decode(COALESCE(NULLIF($6, ''), ''), 'base64'), 'UTF8'),
    convert_from(decode(COALESCE(NULLIF($7, ''), ''), 'base64'), 'UTF8'),
    COALESCE(NULLIF($8::text, '')::integer, 0),
    $9,
    'DRAFT_READY',
    FALSE
  )
), review_job AS (
  INSERT INTO novel_generation_jobs (project_id, chapter_id, job_type, chapter_no, status)
  SELECT project_id, id, 'REVIEW_CHAPTER', chapter_no, 'PENDING'
  FROM chapter
  ON CONFLICT DO NOTHING
  RETURNING *
)
SELECT
  chapter.*,
  (SELECT id FROM review_job LIMIT 1) AS review_job_id
FROM chapter;`;

const insertFactsQuery = `-- Bulk insert rewritten candidate AI facts as PENDING.
WITH input AS (
  SELECT
    $1::uuid AS project_id,
    $2::uuid AS chapter_id,
    $3::integer AS chapter_no,
    $4::integer AS chapter_generation_version,
    COALESCE(NULLIF($5, '')::jsonb, '[]'::jsonb) AS facts_json
), facts AS (
  SELECT value
  FROM input, jsonb_array_elements(input.facts_json) AS value
), inserted AS (
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
  SELECT
    (SELECT project_id FROM input),
    (SELECT chapter_id FROM input),
    (SELECT chapter_no FROM input),
    (SELECT chapter_generation_version FROM input),
    COALESCE(NULLIF(value->>'fact_type', ''), 'other'),
    NULLIF(value->>'fact_key', ''),
    NULLIF(value->>'fact_value', ''),
    'ai',
    COALESCE(NULLIF(value->>'confidence', '')::numeric, 0.8),
    'PENDING'
  FROM facts
  WHERE NULLIF(value->>'fact_value', '') IS NOT NULL
  RETURNING *
)
SELECT
  (SELECT chapter_id FROM input) AS chapter_id,
  COUNT(*)::integer AS inserted_fact_count
FROM inserted;`;

const markJobSucceededQuery = `-- Mark a novel generation job succeeded.
UPDATE novel_generation_jobs
SET
  status = 'SUCCEEDED',
  error_message = NULL,
  finished_at = NOW(),
  updated_at = NOW()
WHERE id = $1::uuid
RETURNING *;`;

const markRewriteAttemptFailedQuery = `-- Mark a rewrite attempt failed after the model call errors.
WITH target AS (
  SELECT id, attempt_count, max_attempts
  FROM novel_generation_jobs
  WHERE id = $1::uuid
  FOR UPDATE
)
UPDATE novel_generation_jobs j
SET
  status = CASE
    WHEN target.attempt_count >= target.max_attempts THEN 'FAILED'
    ELSE 'PENDING'
  END,
  error_message = CASE
    WHEN target.attempt_count >= target.max_attempts
      THEN COALESCE(NULLIF($2, ''), '章节重写模型调用失败，已达到最大重试次数')
    ELSE COALESCE(NULLIF($2, ''), '章节重写模型调用失败，已重新排队')
  END,
  started_at = NULL,
  finished_at = CASE
    WHEN target.attempt_count >= target.max_attempts THEN NOW()
    ELSE NULL
  END,
  updated_at = NOW()
FROM target
WHERE j.id = target.id
RETURNING j.*;`;

const claimNotifyQuery = `-- Claim one pending NOTIFY_REVIEW job.
WITH claimed AS (
  SELECT j.id
  FROM novel_generation_jobs j
  JOIN novel_projects p ON p.id = j.project_id
  JOIN novel_chapters c ON c.id = j.chapter_id
  WHERE j.job_type = 'NOTIFY_REVIEW'
    AND j.status = 'PENDING'
    AND j.attempt_count < j.max_attempts
    AND c.status = 'NEED_REVIEW'
    AND p.status NOT IN ('PAUSED', 'ARCHIVED')
  ORDER BY j.created_at ASC
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
RETURNING j.*;`;

const readNotifyContextQuery = `-- Read review notification context.
SELECT
  j.id AS job_id,
  j.project_id,
  j.chapter_id,
  p.title AS project_title,
  c.chapter_no,
  c.title AS chapter_title,
  c.review_token,
  rr.total_score,
  rr.verdict,
  rr.issues,
  rr.suggestions
FROM novel_generation_jobs j
JOIN novel_projects p ON p.id = j.project_id
JOIN novel_chapters c ON c.id = j.chapter_id
LEFT JOIN LATERAL (
  SELECT *
  FROM novel_review_reports report
  WHERE report.chapter_id = c.id
  ORDER BY report.created_at DESC
  LIMIT 1
) rr ON true
WHERE j.id = $1::uuid
  AND j.project_id = $2::uuid
  AND j.chapter_id = $3::uuid
  AND j.job_type = 'NOTIFY_REVIEW'
  AND c.status = 'NEED_REVIEW';`;

const markNotifySucceededQuery = `-- Mark NOTIFY_REVIEW succeeded and persist reminder metadata.
UPDATE novel_generation_jobs
SET
  status = 'SUCCEEDED',
  payload = payload || jsonb_build_object(
    'review_detail_url', NULLIF($2, ''),
    'remind_status', NULLIF($3, ''),
    'remind_message', NULLIF(convert_from(decode(COALESCE(NULLIF($4, ''), ''), 'base64'), 'UTF8'), ''),
    'remind_response', COALESCE(NULLIF($5, '')::jsonb, '{}'::jsonb)
  ),
  finished_at = NOW(),
  updated_at = NOW()
WHERE id = $1::uuid
RETURNING *;`;

const mergeRewriteResponseCode = `// n8n Code node: Merge Rewrite GLM Response Context
const context = $('代码 - 构建重写 GLM请求').first().json;
const response = $json;
return [{json: {...context, llm_response: response}}];`;

const mergeRewriteErrorCode = `// n8n Code node: Merge Rewrite GLM Error Context
const context = $('代码 - 构建重写 GLM请求').first().json;
const errorPayload = $json || {};
const errorMessage = errorPayload.error?.message
  || errorPayload.message
  || errorPayload.error?.description
  || errorPayload.description
  || '章节重写模型调用失败';
return [{json: {
  ...context,
  llm_response: errorPayload,
  llm_response_json: JSON.stringify(errorPayload),
  parsed_payload_json: '{}',
  error_message: String(errorMessage),
  ai_run_finished_at: new Date().toISOString(),
}}];`;

const prepareReviewLaunchCode = `// n8n Code node: Prepare async AI review launch after writing a rewritten candidate.
const row = $json || {};
const reviewJobId = row.review_job_id || row.job_id || '';
return reviewJobId ? [{
  json: {
    ...row,
    review_job_id: reviewJobId,
    job_id: reviewJobId,
  },
}] : [];`;

const autoRecoveryQuery = `-- Novel auto recovery: retry stale jobs or fail exhausted jobs.
WITH obsolete_notifications AS (
  UPDATE novel_generation_jobs j
  SET
    status = 'CANCELLED',
    error_message = '自动恢复：章节已不处于待审核，取消过期提醒任务',
    finished_at = NOW(),
    updated_at = NOW()
  FROM novel_chapters c
  WHERE c.id = j.chapter_id
    AND j.job_type = 'NOTIFY_REVIEW'
    AND j.status IN ('PENDING', 'RUNNING')
    AND c.status <> 'NEED_REVIEW'
  RETURNING
    'OBSOLETE_NOTIFY_CANCELLED'::text AS event_type,
    j.id AS job_id,
    j.project_id,
    j.chapter_id,
    j.job_type,
    j.chapter_no,
    'PENDING_OR_RUNNING'::text AS old_status,
    j.status AS new_status,
    j.error_message
), obsolete_chapter_generations AS (
  UPDATE novel_generation_jobs j
  SET
    status = 'CANCELLED',
    error_message = '自动恢复：同章已有候选稿或正式稿，取消重复章节生成任务',
    finished_at = NOW(),
    updated_at = NOW()
  WHERE j.job_type = 'GENERATE_CHAPTER'
    AND j.status = 'PENDING'
    AND EXISTS (
      SELECT 1
      FROM novel_chapters c
      LEFT JOIN novel_chapter_outlines o ON o.id = c.outline_id
      WHERE c.project_id = j.project_id
        AND c.chapter_no = j.chapter_no
        AND c.status IN ('DRAFT_READY', 'AI_REVIEWED', 'NEED_REVIEW', 'APPROVED', 'PUBLISHED', 'REWRITE_REQUESTED')
        AND (o.id IS NULL OR c.created_at >= o.updated_at)
    )
  RETURNING
    'OBSOLETE_CHAPTER_GENERATION_CANCELLED'::text AS event_type,
    j.id AS job_id,
    j.project_id,
    j.chapter_id,
    j.job_type,
    j.chapter_no,
    'PENDING'::text AS old_status,
    j.status AS new_status,
    j.error_message
), stale AS (
  SELECT
    j.*,
    CASE
      WHEN j.job_type IN ('GENERATE_BIBLE', 'GENERATE_OUTLINE', 'PLAN_CHAPTER_DIRECTOR') THEN INTERVAL '6 minutes'
      WHEN j.job_type IN ('REVIEW_CHAPTER', 'REWRITE_CHAPTER') THEN INTERVAL '6 minutes'
      ELSE INTERVAL '20 minutes'
    END AS stale_interval
  FROM novel_generation_jobs j
  WHERE j.status = 'RUNNING'
    AND j.started_at IS NOT NULL
    AND j.started_at < NOW() - CASE
      WHEN j.job_type IN ('GENERATE_BIBLE', 'GENERATE_OUTLINE', 'PLAN_CHAPTER_DIRECTOR') THEN INTERVAL '6 minutes'
      WHEN j.job_type IN ('REVIEW_CHAPTER', 'REWRITE_CHAPTER') THEN INTERVAL '6 minutes'
      ELSE INTERVAL '20 minutes'
    END
  ORDER BY j.started_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 20
), recovered AS (
  UPDATE novel_generation_jobs j
  SET
    status = 'PENDING',
    error_message = COALESCE(j.error_message, '自动恢复：任务超时，重新排队'),
    started_at = NULL,
    updated_at = NOW()
  FROM stale st
  WHERE j.id = st.id
    AND st.attempt_count < st.max_attempts
  RETURNING
    'AUTO_RECOVERY_RETRY'::text AS event_type,
    j.id AS job_id,
    j.project_id,
    j.chapter_id,
    j.job_type,
    j.chapter_no,
    'RUNNING'::text AS old_status,
    j.status AS new_status,
    j.error_message
), failed AS (
  UPDATE novel_generation_jobs j
  SET
    status = 'FAILED',
    error_message = '自动恢复：任务超时且达到最大重试次数',
    finished_at = NOW(),
    updated_at = NOW()
  FROM stale st
  WHERE j.id = st.id
    AND st.attempt_count >= st.max_attempts
  RETURNING
    'AUTO_RECOVERY_FAILED'::text AS event_type,
    j.id AS job_id,
    j.project_id,
    j.chapter_id,
    j.job_type,
    j.chapter_no,
    'RUNNING'::text AS old_status,
    j.status AS new_status,
    j.error_message
), failed_review_chapters AS (
  UPDATE novel_chapters c
  SET
    status = 'FAILED',
    error = f.error_message
  FROM failed f
  WHERE c.id = f.chapter_id
    AND f.job_type = 'REVIEW_CHAPTER'
    AND c.status IN ('DRAFT_READY', 'AI_REVIEWED', 'NEED_REVIEW')
  RETURNING c.id
), failed_rewrite_jobs AS (
  SELECT *
  FROM failed
  WHERE job_type = 'REWRITE_CHAPTER'
), all_events AS (
  SELECT * FROM obsolete_notifications
  UNION ALL
  SELECT * FROM obsolete_chapter_generations
  UNION ALL
  SELECT * FROM recovered
  UNION ALL
  SELECT * FROM failed
)
SELECT *
FROM all_events
ORDER BY event_type, job_type, job_id;`;

const repairNextJobQuery = `-- Repair missing next-chapter director/chapter jobs.
WITH missing_director AS (
  INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, status)
  SELECT
    p.id,
    'PLAN_CHAPTER_DIRECTOR',
    p.current_chapter_no + 1,
    'PENDING'
  FROM novel_projects p
  WHERE p.status = 'WRITING'
    AND p.current_chapter_no > 0
    AND p.current_chapter_no < p.target_total_chapters
    AND EXISTS (
      SELECT 1
      FROM novel_chapter_outlines o
      WHERE o.project_id = p.id
        AND o.chapter_no = p.current_chapter_no + 1
        AND o.status = 'READY'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM novel_chapter_director_cards d
      WHERE d.project_id = p.id
        AND d.chapter_no = p.current_chapter_no + 1
        AND d.is_current = TRUE
        AND d.status IN ('READY', 'NEEDS_REVIEW')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM novel_generation_jobs j
      WHERE j.project_id = p.id
        AND j.job_type = 'PLAN_CHAPTER_DIRECTOR'
        AND j.chapter_no = p.current_chapter_no + 1
        AND j.status IN ('PENDING', 'RUNNING')
    )
  ON CONFLICT DO NOTHING
  RETURNING *
), missing_chapter AS (
  INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, status)
  SELECT
    p.id,
    'GENERATE_CHAPTER',
    p.current_chapter_no + 1,
    'PENDING'
  FROM novel_projects p
  WHERE p.status = 'WRITING'
    AND p.current_chapter_no > 0
    AND p.current_chapter_no < p.target_total_chapters
    AND EXISTS (
      SELECT 1
      FROM novel_chapter_director_cards d
      WHERE d.project_id = p.id
        AND d.chapter_no = p.current_chapter_no + 1
        AND d.is_current = TRUE
        AND d.status = 'READY'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM novel_generation_jobs j
      WHERE j.project_id = p.id
        AND j.job_type = 'GENERATE_CHAPTER'
        AND j.chapter_no = p.current_chapter_no + 1
        AND j.status IN ('PENDING', 'RUNNING')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM novel_chapters c
      LEFT JOIN novel_chapter_outlines o ON o.id = c.outline_id
      WHERE c.project_id = p.id
        AND c.chapter_no = p.current_chapter_no + 1
        AND c.status IN ('DRAFT_READY', 'AI_REVIEWED', 'NEED_REVIEW', 'APPROVED', 'PUBLISHED', 'REWRITE_REQUESTED')
        AND (o.id IS NULL OR c.created_at >= o.updated_at)
    )
  ON CONFLICT DO NOTHING
  RETURNING *
), repaired AS (
  SELECT * FROM missing_director
  UNION ALL
  SELECT * FROM missing_chapter
)
SELECT
  CASE
    WHEN job_type = 'PLAN_CHAPTER_DIRECTOR' THEN 'NEXT_DIRECTOR_JOB_REPAIRED'
    ELSE 'NEXT_CHAPTER_JOB_REPAIRED'
  END AS event_type,
  id AS job_id,
  project_id,
  chapter_id,
  job_type,
  chapter_no,
  NULL::text AS old_status,
  status AS new_status,
  NULL::text AS error_message
FROM repaired
ORDER BY created_at;`;

const rewriteNotifyWorkflow = workflowBase(
  'novelRewriteNotifyV1Workflow17',
  '17_小说重写与审核提醒',
  [
    executeWorkflowTriggerNode('execute-trigger-rewrite-17', '触发器 - 后台执行重写任务', [-1040, -460]),
    postgresNode(
      'postgres-claim-input-rewrite-17',
      '数据库 - 领取指定REWRITE_CHAPTER任务',
      [-820, -460],
      claimRewriteByInputQuery,
      '={{ [ $json.rewrite_job_id || $json.job_id || "" ] }}'
    ),
    manualNode('manual-rewrite-17', '手动触发 - 重写与提醒', [-1040, -280]),
    postgresNode('postgres-claim-rewrite-17', '数据库 - 领取REWRITE_CHAPTER任务', [-820, -280], claimRewriteQuery),
    postgresNode(
      'postgres-read-rewrite-context-17',
      '数据库 - 读取重写上下文',
      [-600, -280],
      readRewriteContextQuery,
      '={{ [ $json.id, $json.project_id, $json.chapter_id ] }}'
    ),
    codeNode('code-build-rewrite-request-17', '代码 - 构建重写 GLM请求', [-380, -280], code('n8n/code/novel_build_glm_request.js')),
    httpGlmNode('http-glm-rewrite-17', 'HTTP请求 - 调用GLM重写章节', [-160, -280], {continueErrorOutput: true}),
    codeNode('code-merge-rewrite-response-17', '代码 - 合并重写 GLM响应上下文', [60, -280], mergeRewriteResponseCode),
    codeNode('code-merge-rewrite-error-17', '代码 - 合并重写 GLM错误上下文', [60, -40], mergeRewriteErrorCode),
    codeNode('code-parse-rewrite-response-17', '代码 - 解析重写 GLM响应', [280, -280], code('n8n/code/novel_parse_glm_json.js')),
    postgresNode(
      'postgres-record-rewrite-ai-run-17',
      '数据库 - 记录重写 AI调用',
      [500, -280],
      recordAiRunQuery,
      '={{ [ $json.project_id, $json.original_chapter_id, $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify($json.llm_request_body), $json.llm_response_json, $json.parsed_payload_json, true, "", $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
    ),
    postgresNode(
      'postgres-record-rewrite-ai-run-failed-17',
      '数据库 - 记录重写 AI调用失败',
      [280, -40],
      recordAiRunQuery,
      '={{ [ $json.project_id, $json.original_chapter_id || $json.chapter_id, $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify($json.llm_request_body), $json.llm_response_json, $json.parsed_payload_json, false, $json.error_message, $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
    ),
    postgresNode(
      'postgres-mark-rewrite-attempt-failed-17',
      '数据库 - 标记重写尝试失败',
      [500, -40],
      markRewriteAttemptFailedQuery,
      '={{ [ $json.job_id, $json.error_message ] }}'
    ),
    postgresNode(
      'postgres-save-rewrite-candidate-17',
      '数据库 - 写入重写候选章节并创建审稿任务',
      [720, -280],
      saveRewriteCandidateQuery,
      '={{ [ $("代码 - 解析重写 GLM响应").first().json.project_id, $("代码 - 解析重写 GLM响应").first().json.outline_id, $("代码 - 解析重写 GLM响应").first().json.original_chapter_id, $("代码 - 解析重写 GLM响应").first().json.chapter_no, $("代码 - 解析重写 GLM响应").first().json.chapter_title_base64, $("代码 - 解析重写 GLM响应").first().json.chapter_body_base64, $("代码 - 解析重写 GLM响应").first().json.chapter_summary_base64, $("代码 - 解析重写 GLM响应").first().json.word_count_estimate, $("代码 - 解析重写 GLM响应").first().json.llm_request_body.model ] }}'
    ),
    postgresNode(
      'postgres-insert-rewrite-facts-17',
      '数据库 - 写入重写候选章节Facts',
      [940, -280],
      insertFactsQuery,
      '={{ [ $("数据库 - 写入重写候选章节并创建审稿任务").first().json.project_id, $("数据库 - 写入重写候选章节并创建审稿任务").first().json.id, $("数据库 - 写入重写候选章节并创建审稿任务").first().json.chapter_no, $("数据库 - 写入重写候选章节并创建审稿任务").first().json.generation_version, $("代码 - 解析重写 GLM响应").first().json.new_facts_json ] }}'
    ),
    postgresNode(
      'postgres-mark-rewrite-success-17',
      '数据库 - 标记重写任务成功',
      [1160, -280],
      markJobSucceededQuery,
      '={{ [ $("代码 - 解析重写 GLM响应").first().json.job_id ] }}'
    ),
    codeNode('code-prepare-review-launch-17', '代码 - 准备异步启动重写审稿', [940, -440], prepareReviewLaunchCode),
    executeWorkflowNode('execute-review-worker-17', '执行子流程 - 异步AI审稿', [1160, -440], 'novelAiReviewV1Workflow15'),

    manualNode('manual-notify-17', '手动触发 - 审核提醒', [-1040, 260]),
    postgresNode('postgres-claim-notify-17', '数据库 - 领取NOTIFY_REVIEW任务', [-820, 260], claimNotifyQuery),
    postgresNode(
      'postgres-read-notify-context-17',
      '数据库 - 读取审核提醒上下文',
      [-600, 260],
      readNotifyContextQuery,
      '={{ [ $json.id, $json.project_id, $json.chapter_id ] }}'
    ),
    codeNode('code-build-review-notification-17', '代码 - 构建小说审核提醒', [-380, 260], code('n8n/code/novel_build_review_notification.js')),
    httpServerChanNode('http-send-review-notification-17', 'HTTP请求 - 发送小说审核提醒', [-160, 260]),
    codeNode('code-normalize-review-notification-17', '代码 - 规范化小说审核提醒响应', [60, 260], code('n8n/code/novel_normalize_review_notification_response.js')),
    postgresNode(
      'postgres-mark-notify-success-17',
      '数据库 - 标记审核提醒任务成功',
      [280, 260],
      markNotifySucceededQuery,
      '={{ [ $("数据库 - 领取NOTIFY_REVIEW任务").first().json.id, $json.review_detail_url, $json.remind_status, $json.remind_message_base64, $json.remind_response_json ] }}'
    ),
    sticky('note-rewrite-17', '说明 - 重写', [-1040, -520], '领取 `REWRITE_CHAPTER`，基于原候选稿、当前章 READY 导演台、AI 审稿和人工意见生成新候选版本。新版本保持 `DRAFT_READY + is_current=false`，facts 保持 `PENDING`。'),
    sticky('note-notify-17', '说明 - 审核提醒', [-1040, 500], '领取 `NOTIFY_REVIEW`，Server酱只发送审核详情链接，不承载通过、拒绝或要求重写动作。'),
  ],
  {
    '触发器 - 后台执行重写任务': {main: [[{node: '数据库 - 领取指定REWRITE_CHAPTER任务', type: 'main', index: 0}]]},
    '数据库 - 领取指定REWRITE_CHAPTER任务': {main: [[{node: '数据库 - 读取重写上下文', type: 'main', index: 0}]]},
    '手动触发 - 重写与提醒': {main: [[
      {node: '数据库 - 领取REWRITE_CHAPTER任务', type: 'main', index: 0},
      {node: '数据库 - 领取NOTIFY_REVIEW任务', type: 'main', index: 0},
    ]]},
    '数据库 - 领取REWRITE_CHAPTER任务': {main: [[{node: '数据库 - 读取重写上下文', type: 'main', index: 0}]]},
    '数据库 - 读取重写上下文': {main: [[{node: '代码 - 构建重写 GLM请求', type: 'main', index: 0}]]},
    '代码 - 构建重写 GLM请求': {main: [[{node: 'HTTP请求 - 调用GLM重写章节', type: 'main', index: 0}]]},
    'HTTP请求 - 调用GLM重写章节': {main: [[{node: '代码 - 合并重写 GLM响应上下文', type: 'main', index: 0}], [{node: '代码 - 合并重写 GLM错误上下文', type: 'main', index: 0}]]},
    '代码 - 合并重写 GLM响应上下文': {main: [[{node: '代码 - 解析重写 GLM响应', type: 'main', index: 0}]]},
    '代码 - 合并重写 GLM错误上下文': {main: [[{node: '数据库 - 记录重写 AI调用失败', type: 'main', index: 0}]]},
    '数据库 - 记录重写 AI调用失败': {main: [[{node: '数据库 - 标记重写尝试失败', type: 'main', index: 0}]]},
    '代码 - 解析重写 GLM响应': {main: [[{node: '数据库 - 记录重写 AI调用', type: 'main', index: 0}]]},
    '数据库 - 记录重写 AI调用': {main: [[{node: '数据库 - 写入重写候选章节并创建审稿任务', type: 'main', index: 0}]]},
    '数据库 - 写入重写候选章节并创建审稿任务': {main: [[{node: '数据库 - 写入重写候选章节Facts', type: 'main', index: 0}, {node: '代码 - 准备异步启动重写审稿', type: 'main', index: 0}]]},
    '数据库 - 写入重写候选章节Facts': {main: [[{node: '数据库 - 标记重写任务成功', type: 'main', index: 0}]]},
    '代码 - 准备异步启动重写审稿': {main: [[{node: '执行子流程 - 异步AI审稿', type: 'main', index: 0}]]},

    '手动触发 - 审核提醒': {main: [[{node: '数据库 - 领取NOTIFY_REVIEW任务', type: 'main', index: 0}]]},
    '数据库 - 领取NOTIFY_REVIEW任务': {main: [[{node: '数据库 - 读取审核提醒上下文', type: 'main', index: 0}]]},
    '数据库 - 读取审核提醒上下文': {main: [[{node: '代码 - 构建小说审核提醒', type: 'main', index: 0}]]},
    '代码 - 构建小说审核提醒': {main: [[{node: 'HTTP请求 - 发送小说审核提醒', type: 'main', index: 0}]]},
    'HTTP请求 - 发送小说审核提醒': {main: [[{node: '代码 - 规范化小说审核提醒响应', type: 'main', index: 0}]]},
    '代码 - 规范化小说审核提醒响应': {main: [[{node: '数据库 - 标记审核提醒任务成功', type: 'main', index: 0}]]},
  }
);

const autoRecoveryWorkflow = workflowBase(
  'novelAutoRecoveryV1Workflow18',
  '18_小说自动恢复',
  [
    scheduleNode('schedule-auto-recovery-18', '定时触发 - 每5分钟', [-700, -140]),
    manualNode('manual-auto-recovery-18', '手动触发', [-700, 80]),
    postgresNode('postgres-auto-recovery-18', '数据库 - 小说任务自动恢复', [-460, -40], autoRecoveryQuery),
    postgresNode('postgres-repair-next-job-18', '数据库 - 补齐下一章任务', [-220, -40], repairNextJobQuery),
    codeNode('code-summarize-auto-recovery-18', '代码 - 汇总小说自动恢复结果', [20, -40], code('n8n/code/novel_summarize_auto_recovery.js')),
    sticky('note-auto-recovery-18', '说明 - 小说自动恢复', [-700, -380], '每 5 分钟扫描超时 `RUNNING` 小说任务；未达上限回到 `PENDING`，达到上限标记 `FAILED`；同时兜底补齐缺失的下一章导演台或正文任务。'),
  ],
  {
    '定时触发 - 每5分钟': {main: [[{node: '数据库 - 小说任务自动恢复', type: 'main', index: 0}]]},
    '手动触发': {main: [[{node: '数据库 - 小说任务自动恢复', type: 'main', index: 0}]]},
    '数据库 - 小说任务自动恢复': {main: [[{node: '数据库 - 补齐下一章任务', type: 'main', index: 0}]]},
    '数据库 - 补齐下一章任务': {main: [[{node: '代码 - 汇总小说自动恢复结果', type: 'main', index: 0}]]},
  }
);

const outputs = [
  ['n8n/workflow/17_novel_rewrite_notify_workflow.json', rewriteNotifyWorkflow],
  ['n8n/workflow/available/17_novel_rewrite_notify_workflow.json', rewriteNotifyWorkflow],
  ['n8n/workflow/18_novel_auto_recovery_workflow.json', autoRecoveryWorkflow],
  ['n8n/workflow/available/18_novel_auto_recovery_workflow.json', autoRecoveryWorkflow],
];

for (const [relativePath, workflow] of outputs) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), {recursive: true});
  fs.writeFileSync(fullPath, `${JSON.stringify(workflow, null, 2)}\n`);
}

console.log(`Generated ${outputs.length} novel Phase 6 workflow files.`);
