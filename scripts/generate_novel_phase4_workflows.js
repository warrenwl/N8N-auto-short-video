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

function codeNode(id, name, position, jsCode, options = {}) {
  const node = {
    parameters: {jsCode},
    id,
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
  };
  if (options.continueErrorOutput) {
    node.onError = 'continueErrorOutput';
  }
  return node;
}

function ifNode(id, name, position, leftValue, conditionId) {
  return {
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'strict',
          version: 2,
        },
        conditions: [
          {
            id: conditionId,
            leftValue,
            rightValue: true,
            operator: {
              type: 'boolean',
              operation: 'true',
              singleValue: true,
            },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    id,
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position,
  };
}

function webhookNode(id, name, position, httpMethod, pathName, webhookId) {
  return {
    parameters: {
      httpMethod,
      path: pathName,
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

function respondNode(id, name, position, responseBody, responseCode, contentType) {
  return {
    parameters: {
      respondWith: 'text',
      responseBody,
      options: {
        responseCode,
        responseHeaders: {
          entries: [
            {
              name: 'Content-Type',
              value: contentType,
            },
          ],
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

function httpGlmNode(id, name, position, options = {}) {
  const timeoutMs = options.timeoutMs || 300000;
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
        timeout: timeoutMs,
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

const claimChapterQuery = `-- Claim one pending GENERATE_CHAPTER job.
WITH claimed AS (
  SELECT j.id
  FROM novel_generation_jobs j
  JOIN novel_projects p ON p.id = j.project_id
  WHERE j.job_type = 'GENERATE_CHAPTER'
    AND j.status = 'PENDING'
    AND j.attempt_count < j.max_attempts
    AND p.status NOT IN ('PAUSED', 'ARCHIVED')
    AND EXISTS (
      SELECT 1
      FROM novel_chapter_director_cards d
      WHERE d.project_id = j.project_id
        AND d.chapter_no = j.chapter_no
        AND d.is_current = TRUE
        AND d.status = 'READY'
        AND (
          COALESCE(j.payload->>'director_card_id', '') = ''
          OR d.id = (j.payload->>'director_card_id')::uuid
        )
    )
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

const claimChapterForProjectQuery = `-- Claim one pending GENERATE_CHAPTER job for a specific project and always return browser-friendly state.
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
    AND j.job_type = 'GENERATE_CHAPTER'
    AND j.status = 'PENDING'
    AND j.attempt_count < j.max_attempts
    AND p.status NOT IN ('PAUSED', 'ARCHIVED')
    AND EXISTS (
      SELECT 1
      FROM novel_chapter_director_cards d
      WHERE d.project_id = j.project_id
        AND d.chapter_no = j.chapter_no
        AND d.is_current = TRUE
        AND d.status = 'READY'
        AND (
          COALESCE(j.payload->>'director_card_id', '') = ''
          OR d.id = (j.payload->>'director_card_id')::uuid
        )
    )
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
  'GENERATE_CHAPTER'::text AS job_type,
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

const readChapterContextQuery = `-- Read context for chapter generation.
SELECT
  p.id AS project_id,
  p.title AS novel_title,
  p.genre,
  p.audience,
  p.style,
  p.target_words_per_chapter,
  b.world_setting,
  b.story_core,
  b.main_character,
  b.supporting_characters,
  b.villain_setting,
  b.relationship_map,
  b.organizations,
  b.locations,
  b.plot_constraints,
  b.expansion_notes,
  b.power_system,
  b.tone_rules,
  b.forbidden_rules,
  b.selling_points,
  o.id AS outline_id,
  o.chapter_no,
  o.title AS outline_title,
  o.summary AS outline_summary,
  o.chapter_goal,
  o.conflict_point,
  o.emotional_point,
  o.hook,
  prev.id AS previous_chapter_id,
  prev.title AS previous_chapter_title,
  prev.summary AS previous_chapter_summary,
  COALESCE(prev.ending_excerpt, '') AS previous_chapter_ending,
  director.id AS director_card_id,
  director.version AS director_card_version,
  director.card_payload AS director_card,
  $1::uuid AS job_id,
  COALESCE((SELECT j.payload->>'trigger_source' FROM novel_generation_jobs j WHERE j.id = $1::uuid), 'queue') AS trigger_source,
  (SELECT j.payload->>'requested_by' FROM novel_generation_jobs j WHERE j.id = $1::uuid) AS requested_by,
  'GENERATE_CHAPTER'::text AS run_type,
  COALESCE(facts.continuity_facts, '[]'::jsonb) AS continuity_facts
FROM novel_projects p
JOIN novel_bibles b ON b.project_id = p.id
JOIN novel_chapter_outlines o ON o.project_id = p.id
LEFT JOIN LATERAL (
  SELECT id, title, summary, right(body, 900) AS ending_excerpt
  FROM novel_chapters
  WHERE project_id = p.id
    AND chapter_no < $3::integer
    AND is_current = TRUE
    AND status IN ('APPROVED', 'PUBLISHED')
  ORDER BY chapter_no DESC
  LIMIT 1
) prev ON true
JOIN LATERAL (
  SELECT d.*
  FROM novel_chapter_director_cards d
  WHERE d.project_id = p.id
    AND d.chapter_no = $3::integer
    AND d.is_current = TRUE
    AND d.status = 'READY'
    AND (
      COALESCE((SELECT j.payload->>'director_card_id' FROM novel_generation_jobs j WHERE j.id = $1::uuid), '') = ''
      OR d.id = ((SELECT j.payload->>'director_card_id' FROM novel_generation_jobs j WHERE j.id = $1::uuid))::uuid
    )
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
        OR chapter_no < $3::integer
        OR source = 'human'
      )
    ORDER BY created_at DESC
    LIMIT 80
  ) picked
) facts ON true
WHERE p.id = $2::uuid
  AND o.chapter_no = $3::integer
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

const saveCandidateChapterQuery = `-- Save generated candidate chapter and enqueue AI review.
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

const insertFactsQuery = `-- Bulk insert generated candidate AI facts as PENDING.
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

const markJobAttemptFailedQuery = `-- Mark a novel generation attempt failed after the model call errors.
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
      THEN COALESCE(NULLIF($2, ''), '章节生成模型调用失败，已达到最大重试次数')
    ELSE COALESCE(NULLIF($2, ''), '章节生成模型调用失败，已重新排队')
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

const markReviewAttemptFailedQuery = `-- Mark a novel review attempt failed after the model call or parser errors.
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
      THEN COALESCE(NULLIF($2, ''), '智能审稿模型调用失败，已达到最大重试次数')
    ELSE COALESCE(NULLIF($2, ''), '智能审稿模型调用失败，已重新排队')
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

const claimReviewQuery = `-- Claim one pending REVIEW_CHAPTER job.
WITH claimed AS (
  SELECT j.id
  FROM novel_generation_jobs j
  JOIN novel_projects p ON p.id = j.project_id
  WHERE j.job_type = 'REVIEW_CHAPTER'
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
  updated_at = NOW()
FROM claimed
WHERE j.id = claimed.id
RETURNING j.*;`;

const claimReviewByInputQuery = `-- Claim a pending REVIEW_CHAPTER job from an async caller.
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
  WHERE j.job_type = 'REVIEW_CHAPTER'
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
  updated_at = NOW()
FROM claimed
WHERE j.id = claimed.id
RETURNING j.*;`;

const readReviewContextQuery = `-- Read context for AI chapter review.
SELECT
  p.id AS project_id,
  p.title AS novel_title,
  p.genre,
  p.audience,
  p.style,
  p.target_words_per_chapter,
  $1::uuid AS job_id,
  'REVIEW_CHAPTER'::text AS run_type,
  c.id AS chapter_id,
  c.chapter_no,
  c.title AS chapter_title,
  c.body AS chapter_body,
  c.word_count AS chapter_word_count,
  length(c.body) AS chapter_body_chars,
  c.summary AS chapter_summary,
  c.generation_version,
  prev.summary AS previous_chapter_summary,
  COALESCE(prev.ending_excerpt, '') AS previous_chapter_ending,
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
  COALESCE(facts.continuity_facts, '[]'::jsonb) AS continuity_facts
FROM novel_generation_jobs j
JOIN novel_chapters c ON c.id = j.chapter_id
JOIN novel_projects p ON p.id = c.project_id
JOIN novel_bibles b ON b.project_id = p.id
LEFT JOIN LATERAL (
  SELECT summary, right(body, 900) AS ending_excerpt
  FROM novel_chapters
  WHERE project_id = p.id
    AND chapter_no < c.chapter_no
    AND is_current = TRUE
    AND status IN ('APPROVED', 'PUBLISHED')
  ORDER BY chapter_no DESC
  LIMIT 1
) prev ON true
LEFT JOIN LATERAL (
  SELECT d.*
  FROM novel_chapter_director_cards d
  WHERE d.project_id = p.id
    AND d.chapter_no = c.chapter_no
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
        OR chapter_no < c.chapter_no
        OR source = 'human'
      )
    ORDER BY created_at DESC
    LIMIT 80
  ) picked
) facts ON true
WHERE j.id = $1::uuid
  AND j.project_id = $2::uuid
  AND j.chapter_id = $3::uuid
  AND c.status = 'DRAFT_READY';`;

const saveReviewReportQuery = `-- Save AI review report, move candidate into NEED_REVIEW, and enqueue notification.
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
    $1::uuid,
    $2::uuid,
    NULLIF($3, '')::uuid,
    NULLIF($4::text, '')::integer,
    NULLIF($5::text, '')::integer,
    NULLIF($6::text, '')::integer,
    NULLIF($7::text, '')::integer,
    NULLIF($8::text, '')::integer,
    COALESCE(NULLIF($9, '')::jsonb, '[]'::jsonb),
    COALESCE(NULLIF($10, '')::jsonb, '[]'::jsonb),
    COALESCE(NULLIF($11, ''), 'MANUAL_REVIEW')
  )
  RETURNING *
), reviewed AS (
  UPDATE novel_chapters
  SET status = 'NEED_REVIEW'
  WHERE id = $2::uuid
    AND status IN ('DRAFT_READY', 'AI_REVIEWED')
  RETURNING *
), superseded_chapters AS (
  UPDATE novel_chapters old
  SET
    status = 'SUPERSEDED',
    error = '同章已有更新候选稿进入审核，旧候选稿已转入历史版本。',
    updated_at = NOW()
  FROM reviewed r
  WHERE old.project_id = r.project_id
    AND old.chapter_no = r.chapter_no
    AND old.id <> r.id
    AND old.status = 'NEED_REVIEW'
    AND old.generation_version < r.generation_version
  RETURNING old.*
), cancelled_superseded_notifications AS (
  UPDATE novel_generation_jobs j
  SET
    status = 'CANCELLED',
    error_message = '同章已有更新候选稿进入审核，取消旧审核提醒任务',
    finished_at = NOW(),
    updated_at = NOW()
  FROM superseded_chapters old
  WHERE j.chapter_id = old.id
    AND j.job_type = 'NOTIFY_REVIEW'
    AND j.status IN ('PENDING', 'RUNNING')
  RETURNING j.*
), project AS (
  UPDATE novel_projects
  SET status = 'REVIEWING'
  WHERE id = $1::uuid
  RETURNING *
), notify_job AS (
  INSERT INTO novel_generation_jobs (project_id, chapter_id, job_type, chapter_no, status)
  SELECT project_id, id, 'NOTIFY_REVIEW', chapter_no, 'PENDING'
  FROM reviewed
  ON CONFLICT DO NOTHING
  RETURNING *
)
SELECT
  report.*,
  (SELECT id FROM notify_job LIMIT 1) AS notify_job_id
FROM report;`;

function mergeChapterSegmentResponseCode(buildNodeName) {
  return `// n8n Code node: Merge Chapter Segment GLM Response Context
const context = $('${buildNodeName}').first().json;
const response = $json;
return [{json: {...context, llm_response: response}}];`;
}

function mergeChapterSegmentErrorCode(buildNodeName) {
  return `// n8n Code node: Merge Chapter Segment GLM Error Context
const context = $('${buildNodeName}').first().json;
const errorPayload = $json || {};
const errorMessage = errorPayload.error?.message
  || errorPayload.message
  || errorPayload.error?.description
  || errorPayload.description
  || '章节分段生成模型调用失败';
return [{json: {
  ...context,
  llm_response: errorPayload,
  llm_response_json: JSON.stringify(errorPayload),
  parsed_payload_json: '{}',
  error_message: String(errorMessage),
  ai_run_finished_at: new Date().toISOString(),
}}];`;
}

const mergeReviewResponseCode = `// n8n Code node: Merge Review GLM Response Context
const context = $('代码 - 构建审稿 GLM请求').first().json;
const response = $json;
return [{json: {...context, llm_response: response}}];`;

const mergeReviewErrorCode = `// n8n Code node: Merge Review GLM Error Context
const context = $('代码 - 构建审稿 GLM请求').first().json;
const errorPayload = $json || {};
const errorMessage = errorPayload.error?.message
  || errorPayload.message
  || errorPayload.error?.description
  || errorPayload.description
  || '智能审稿模型调用失败';
return [{json: {
  ...context,
  llm_response: errorPayload,
  llm_response_json: JSON.stringify(errorPayload),
  parsed_payload_json: '{}',
  error_message: String(errorMessage),
  ai_run_finished_at: new Date().toISOString(),
}}];`;

const mergeReviewParseErrorCode = `// n8n Code node: Merge Review GLM Parse Error Context
let context = {};
try {
  context = $('代码 - 合并审稿 GLM响应上下文').first().json;
} catch (error) {
  context = $('代码 - 构建审稿 GLM请求').first().json;
}
const errorPayload = $json || {};
const errorMessage = errorPayload.error?.message
  || errorPayload.message
  || errorPayload.error?.description
  || errorPayload.description
  || '智能审稿 JSON 解析失败';
return [{json: {
  ...context,
  llm_response_json: JSON.stringify(context.llm_response || errorPayload),
  parsed_payload_json: '{}',
  error_message: String(errorMessage),
  ai_run_finished_at: new Date().toISOString(),
}}];`;

const prepareReviewLaunchCode = `// n8n Code node: Prepare async AI review launch after writing a candidate chapter.
const row = $json || {};
const reviewJobId = row.review_job_id || row.job_id || '';
return reviewJobId ? [{
  json: {
    ...row,
    review_job_id: reviewJobId,
    job_id: reviewJobId,
  },
}] : [];`;

const MAX_CHAPTER_SEGMENTS = 7;

function connection(node) {
  return {node, type: 'main', index: 0};
}

function chapterSegmentName(segmentNo, kind) {
  const names = {
    build: `代码 - 构建章节第${segmentNo}段 GLM请求`,
    http: `HTTP请求 - 调用GLM生成章节第${segmentNo}段`,
    mergeResponse: `代码 - 合并章节第${segmentNo}段 GLM响应上下文`,
    mergeError: `代码 - 合并章节第${segmentNo}段 GLM错误上下文`,
    parse: `代码 - 解析章节第${segmentNo}段 GLM响应`,
    parseOk: `条件判断 - 章节第${segmentNo}段解析成功`,
    record: `数据库 - 记录章节第${segmentNo}段 AI调用`,
    hasMore: `条件判断 - 章节第${segmentNo}段还需继续`,
  };
  return names[kind];
}

function chapterSegmentNodes() {
  const nodes = [];
  for (let segmentNo = 1; segmentNo <= MAX_CHAPTER_SEGMENTS; segmentNo += 1) {
    const baseX = -260 + (segmentNo - 1) * 980;
    nodes.push(
      codeNode(
        `code-build-chapter-segment-${segmentNo}-14`,
        chapterSegmentName(segmentNo, 'build'),
        [baseX, 0],
        code('n8n/code/novel_build_chapter_segment_request.js')
      ),
      httpGlmNode(
        `http-glm-chapter-segment-${segmentNo}-14`,
        chapterSegmentName(segmentNo, 'http'),
        [baseX + 220, 0],
        {continueErrorOutput: true, timeoutMs: 900000}
      ),
      codeNode(
        `code-merge-chapter-segment-${segmentNo}-response-14`,
        chapterSegmentName(segmentNo, 'mergeResponse'),
        [baseX + 440, 0],
        mergeChapterSegmentResponseCode(chapterSegmentName(segmentNo, 'build'))
      ),
      codeNode(
        `code-merge-chapter-segment-${segmentNo}-error-14`,
        chapterSegmentName(segmentNo, 'mergeError'),
        [baseX + 440, 260],
        mergeChapterSegmentErrorCode(chapterSegmentName(segmentNo, 'build'))
      ),
      codeNode(
        `code-parse-chapter-segment-${segmentNo}-response-14`,
        chapterSegmentName(segmentNo, 'parse'),
        [baseX + 660, 0],
        code('n8n/code/novel_parse_chapter_segment_json.js')
      ),
      ifNode(
        `if-chapter-segment-${segmentNo}-parse-ok-14`,
        chapterSegmentName(segmentNo, 'parseOk'),
        [baseX + 880, 0],
        '={{ $json.parse_success }}',
        `chapter-segment-${segmentNo}-parse-ok`
      ),
      postgresNode(
        `postgres-record-chapter-segment-${segmentNo}-ai-run-14`,
        chapterSegmentName(segmentNo, 'record'),
        [baseX + 1100, -120],
        recordAiRunQuery,
        '={{ [ $json.project_id, "", $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify({ ...$json.llm_request_body, trigger_source: $json.trigger_source, requested_by: $json.requested_by, chapter_segment_no: $json.chapter_segment_no, chapter_segment_total: $json.chapter_segment_total }), $json.llm_response_json, $json.parsed_payload_json, true, "", $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
      )
    );
    if (segmentNo < MAX_CHAPTER_SEGMENTS) {
      nodes.push(
        ifNode(
          `if-chapter-segment-${segmentNo}-has-more-14`,
          chapterSegmentName(segmentNo, 'hasMore'),
          [baseX + 1100, 80],
          '={{ $json.has_more_segments }}',
          `chapter-segment-${segmentNo}-has-more`
        )
      );
    }
  }
  return nodes;
}

function chapterSegmentConnections() {
  const connections = {};
  for (let segmentNo = 1; segmentNo <= MAX_CHAPTER_SEGMENTS; segmentNo += 1) {
    connections[chapterSegmentName(segmentNo, 'build')] = {
      main: [[connection(chapterSegmentName(segmentNo, 'http'))]],
    };
    connections[chapterSegmentName(segmentNo, 'http')] = {
      main: [
        [connection(chapterSegmentName(segmentNo, 'mergeResponse'))],
        [connection(chapterSegmentName(segmentNo, 'mergeError'))],
      ],
    };
    connections[chapterSegmentName(segmentNo, 'mergeResponse')] = {
      main: [[connection(chapterSegmentName(segmentNo, 'parse'))]],
    };
    connections[chapterSegmentName(segmentNo, 'mergeError')] = {
      main: [[connection('数据库 - 记录章节 AI调用失败')]],
    };
    connections[chapterSegmentName(segmentNo, 'parse')] = {
      main: [[connection(chapterSegmentName(segmentNo, 'parseOk'))]],
    };
    if (segmentNo < MAX_CHAPTER_SEGMENTS) {
      connections[chapterSegmentName(segmentNo, 'parseOk')] = {
        main: [
          [connection(chapterSegmentName(segmentNo, 'record')), connection(chapterSegmentName(segmentNo, 'hasMore'))],
          [connection('数据库 - 记录章节 AI调用失败')],
        ],
      };
      connections[chapterSegmentName(segmentNo, 'hasMore')] = {
        main: [
          [connection(chapterSegmentName(segmentNo + 1, 'build'))],
          [connection('代码 - 合并章节分段为候选章')],
        ],
      };
    } else {
      connections[chapterSegmentName(segmentNo, 'parseOk')] = {
        main: [
          [connection(chapterSegmentName(segmentNo, 'record')), connection('代码 - 合并章节分段为候选章')],
          [connection('数据库 - 记录章节 AI调用失败')],
        ],
      };
    }
  }
  return connections;
}

const chapterWorkflow = workflowBase(
  'novelChapterV1Workflow14',
  '14_小说生成候选章节',
  [
    manualNode('manual-novel-chapter-14', '手动触发', [-920, 0]),
    executeWorkflowTriggerNode('execute-trigger-chapter-worker-14', '触发器 - 后台执行章节生成', [-920, -180]),
    postgresNode('postgres-claim-chapter-14', '数据库 - 领取GENERATE_CHAPTER任务', [-700, 0], claimChapterQuery),
    postgresNode(
      'postgres-read-chapter-context-14',
      '数据库 - 读取章节生成上下文',
      [-480, 0],
      readChapterContextQuery,
      '={{ [ $json.id, $json.project_id, $json.chapter_no ] }}'
    ),
    ...chapterSegmentNodes(),
    codeNode('code-combine-chapter-segments-14', '代码 - 合并章节分段为候选章', [6840, 160], code('n8n/code/novel_combine_chapter_segments.js')),
    postgresNode(
      'postgres-record-chapter-ai-run-failed-14',
      '数据库 - 记录章节 AI调用失败',
      [6840, 360],
      recordAiRunQuery,
      '={{ [ $json.project_id, "", $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify({ ...$json.llm_request_body, trigger_source: $json.trigger_source, requested_by: $json.requested_by }), $json.llm_response_json, $json.parsed_payload_json, false, $json.error_message, $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
    ),
    postgresNode(
      'postgres-mark-chapter-attempt-failed-14',
      '数据库 - 标记章节生成尝试失败',
      [7060, 360],
      markJobAttemptFailedQuery,
      '={{ [ $json.job_id, $json.error_message ] }}'
    ),
    postgresNode(
      'postgres-save-candidate-chapter-14',
      '数据库 - 写入候选章节并创建审稿任务',
      [7060, 160],
      saveCandidateChapterQuery,
      '={{ [ $("代码 - 合并章节分段为候选章").first().json.project_id, $("代码 - 合并章节分段为候选章").first().json.outline_id, "", $("代码 - 合并章节分段为候选章").first().json.chapter_no, $("代码 - 合并章节分段为候选章").first().json.chapter_title_base64, $("代码 - 合并章节分段为候选章").first().json.chapter_body_base64, $("代码 - 合并章节分段为候选章").first().json.chapter_summary_base64, $("代码 - 合并章节分段为候选章").first().json.word_count_estimate, $("代码 - 合并章节分段为候选章").first().json.llm_request_body.model ] }}'
    ),
    postgresNode(
      'postgres-insert-candidate-facts-14',
      '数据库 - 写入候选章节Facts',
      [7280, 160],
      insertFactsQuery,
      '={{ [ $("数据库 - 写入候选章节并创建审稿任务").first().json.project_id, $("数据库 - 写入候选章节并创建审稿任务").first().json.id, $("数据库 - 写入候选章节并创建审稿任务").first().json.chapter_no, $("数据库 - 写入候选章节并创建审稿任务").first().json.generation_version, $("代码 - 合并章节分段为候选章").first().json.new_facts_json ] }}'
    ),
    postgresNode(
      'postgres-mark-chapter-success-14',
      '数据库 - 标记章节生成任务成功',
      [7500, 160],
      markJobSucceededQuery,
      '={{ [ $("代码 - 合并章节分段为候选章").first().json.job_id ] }}'
    ),
    codeNode('code-prepare-review-launch-14', '代码 - 准备异步启动AI审稿', [7280, 0], prepareReviewLaunchCode),
    executeWorkflowNode('execute-review-worker-14', '执行子流程 - 异步AI审稿', [7500, 0], 'novelAiReviewV1Workflow15'),
    webhookNode('webhook-front-generate-chapter-14', 'Webhook - 前端立即生成章节', [-920, 260], 'POST', 'novel-generate-chapter-now', 'novel-generate-chapter-now-14'),
    codeNode('code-validate-front-chapter-14', '代码 - 校验前端生成章节', [-700, 260], code('n8n/code/novel_validate_project_generation_step.js')),
    postgresNode(
      'postgres-claim-front-chapter-14',
      '数据库 - 前端领取GENERATE_CHAPTER任务',
      [-480, 260],
      claimChapterForProjectQuery,
      '={{ [ $json.project_id ] }}'
    ),
    ifNode('if-front-chapter-claimed-14', '条件判断 - 前端章节任务已领取', [-260, 260], '={{ $json.claim_success }}', 'front-chapter-claimed'),
    executeWorkflowNode('execute-chapter-worker-14', '执行子流程 - 异步生成章节', [-40, 200], 'novelChapterV1Workflow14'),
    codeNode('code-render-front-chapter-result-14', '代码 - 生成前端章节生成结果页', [-40, 360], code('n8n/code/novel_render_generation_step_result.js')),
    respondNode('respond-front-chapter-result-14', '响应Webhook - 返回章节生成结果', [180, 360], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),
    sticky('note-chapter-14', '说明 - 候选章节生成', [-920, -340], '领取 `GENERATE_CHAPTER`，按目标字数动态切成 1-7 段串行生成，提前达到总段数后合并为 `DRAFT_READY + is_current=false` 候选章节，写入 AI facts 为 `PENDING`，并创建 `REVIEW_CHAPTER(PENDING)`；POST `/webhook/novel-generate-chapter-now` 只负责领取任务、立即返回结果页，并通过异步子流程继续模型调用。'),
  ],
  {
    '手动触发': {main: [[{node: '数据库 - 领取GENERATE_CHAPTER任务', type: 'main', index: 0}]]},
    '触发器 - 后台执行章节生成': {main: [[{node: '数据库 - 读取章节生成上下文', type: 'main', index: 0}]]},
    '数据库 - 领取GENERATE_CHAPTER任务': {main: [[{node: '数据库 - 读取章节生成上下文', type: 'main', index: 0}]]},
    '数据库 - 读取章节生成上下文': {main: [[{node: '代码 - 构建章节第1段 GLM请求', type: 'main', index: 0}]]},
    ...chapterSegmentConnections(),
    '数据库 - 记录章节 AI调用失败': {main: [[{node: '数据库 - 标记章节生成尝试失败', type: 'main', index: 0}]]},
    '代码 - 合并章节分段为候选章': {main: [[{node: '数据库 - 写入候选章节并创建审稿任务', type: 'main', index: 0}]]},
    '数据库 - 写入候选章节并创建审稿任务': {main: [[{node: '数据库 - 写入候选章节Facts', type: 'main', index: 0}, {node: '代码 - 准备异步启动AI审稿', type: 'main', index: 0}]]},
    '数据库 - 写入候选章节Facts': {main: [[{node: '数据库 - 标记章节生成任务成功', type: 'main', index: 0}]]},
    '代码 - 准备异步启动AI审稿': {main: [[{node: '执行子流程 - 异步AI审稿', type: 'main', index: 0}]]},
    'Webhook - 前端立即生成章节': {main: [[{node: '代码 - 校验前端生成章节', type: 'main', index: 0}]]},
    '代码 - 校验前端生成章节': {main: [[{node: '数据库 - 前端领取GENERATE_CHAPTER任务', type: 'main', index: 0}]]},
    '数据库 - 前端领取GENERATE_CHAPTER任务': {main: [[{node: '条件判断 - 前端章节任务已领取', type: 'main', index: 0}]]},
    '条件判断 - 前端章节任务已领取': {main: [[{node: '代码 - 生成前端章节生成结果页', type: 'main', index: 0}, {node: '执行子流程 - 异步生成章节', type: 'main', index: 0}], [{node: '代码 - 生成前端章节生成结果页', type: 'main', index: 0}]]},
    '代码 - 生成前端章节生成结果页': {main: [[{node: '响应Webhook - 返回章节生成结果', type: 'main', index: 0}]]},
  }
);

const reviewWorkflow = workflowBase(
  'novelAiReviewV1Workflow15',
  '15_小说AI审稿',
  [
    executeWorkflowTriggerNode('execute-trigger-review-15', '触发器 - 后台执行AI审稿', [-920, -180]),
    postgresNode(
      'postgres-claim-input-review-15',
      '数据库 - 领取指定REVIEW_CHAPTER任务',
      [-700, -180],
      claimReviewByInputQuery,
      '={{ [ $json.review_job_id || $json.job_id || "" ] }}'
    ),
    manualNode('manual-novel-review-15', '手动触发', [-920, 0]),
    postgresNode('postgres-claim-review-15', '数据库 - 领取REVIEW_CHAPTER任务', [-700, 0], claimReviewQuery),
    postgresNode(
      'postgres-read-review-context-15',
      '数据库 - 读取审稿上下文',
      [-480, 0],
      readReviewContextQuery,
      '={{ [ $json.id, $json.project_id, $json.chapter_id ] }}'
    ),
    codeNode('code-build-review-request-15', '代码 - 构建审稿 GLM请求', [-260, 0], code('n8n/code/novel_build_glm_request.js')),
    httpGlmNode('http-glm-review-15', 'HTTP请求 - 调用GLM审稿', [-40, 0], {continueErrorOutput: true}),
    codeNode('code-merge-review-response-15', '代码 - 合并审稿 GLM响应上下文', [180, 0], mergeReviewResponseCode),
    codeNode('code-merge-review-error-15', '代码 - 合并审稿 GLM错误上下文', [180, 220], mergeReviewErrorCode),
    codeNode(
      'code-parse-review-response-15',
      '代码 - 解析审稿 GLM响应',
      [400, 0],
      code('n8n/code/novel_parse_glm_json.js'),
      {continueErrorOutput: true}
    ),
    codeNode('code-merge-review-parse-error-15', '代码 - 合并审稿解析错误上下文', [620, 220], mergeReviewParseErrorCode),
    postgresNode(
      'postgres-record-review-ai-run-15',
      '数据库 - 记录审稿 AI调用',
      [620, 0],
      recordAiRunQuery,
      '={{ [ $json.project_id, $json.chapter_id, $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify($json.llm_request_body), $json.llm_response_json, $json.parsed_payload_json, true, "", $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
    ),
    postgresNode(
      'postgres-record-review-ai-run-failed-15',
      '数据库 - 记录审稿 AI调用失败',
      [840, 220],
      recordAiRunQuery,
      '={{ [ $json.project_id, $json.chapter_id, $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify($json.llm_request_body), $json.llm_response_json, $json.parsed_payload_json, false, $json.error_message, $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
    ),
    postgresNode(
      'postgres-save-review-report-15',
      '数据库 - 写入审稿报告并进入待人工审核',
      [840, 0],
      saveReviewReportQuery,
      '={{ [ $("代码 - 解析审稿 GLM响应").first().json.project_id, $("代码 - 解析审稿 GLM响应").first().json.chapter_id, $("数据库 - 记录审稿 AI调用").first().json.id, $("代码 - 解析审稿 GLM响应").first().json.consistency_score, $("代码 - 解析审稿 GLM响应").first().json.readability_score, $("代码 - 解析审稿 GLM响应").first().json.plot_score, $("代码 - 解析审稿 GLM响应").first().json.commercial_score, $("代码 - 解析审稿 GLM响应").first().json.total_score, $("代码 - 解析审稿 GLM响应").first().json.issues_json, $("代码 - 解析审稿 GLM响应").first().json.suggestions_json, $("代码 - 解析审稿 GLM响应").first().json.verdict ] }}'
    ),
    postgresNode(
      'postgres-mark-review-success-15',
      '数据库 - 标记审稿任务成功',
      [1060, 0],
      markJobSucceededQuery,
      '={{ [ $("代码 - 解析审稿 GLM响应").first().json.job_id ] }}'
    ),
    postgresNode(
      'postgres-mark-review-attempt-failed-15',
      '数据库 - 标记审稿尝试失败',
      [1060, 220],
      markReviewAttemptFailedQuery,
      '={{ [ $json.job_id, $json.error_message ] }}'
    ),
    sticky('note-review-15', '说明 - AI审稿', [-920, -240], '领取 `REVIEW_CHAPTER`，AI 只生成评分和建议；章节进入 `NEED_REVIEW`，并创建 `NOTIFY_REVIEW(PENDING)`，等待人工审核。'),
  ],
  {
    '触发器 - 后台执行AI审稿': {main: [[{node: '数据库 - 领取指定REVIEW_CHAPTER任务', type: 'main', index: 0}]]},
    '数据库 - 领取指定REVIEW_CHAPTER任务': {main: [[{node: '数据库 - 读取审稿上下文', type: 'main', index: 0}]]},
    '手动触发': {main: [[{node: '数据库 - 领取REVIEW_CHAPTER任务', type: 'main', index: 0}]]},
    '数据库 - 领取REVIEW_CHAPTER任务': {main: [[{node: '数据库 - 读取审稿上下文', type: 'main', index: 0}]]},
    '数据库 - 读取审稿上下文': {main: [[{node: '代码 - 构建审稿 GLM请求', type: 'main', index: 0}]]},
    '代码 - 构建审稿 GLM请求': {main: [[{node: 'HTTP请求 - 调用GLM审稿', type: 'main', index: 0}]]},
    'HTTP请求 - 调用GLM审稿': {main: [
      [{node: '代码 - 合并审稿 GLM响应上下文', type: 'main', index: 0}],
      [{node: '代码 - 合并审稿 GLM错误上下文', type: 'main', index: 0}],
    ]},
    '代码 - 合并审稿 GLM响应上下文': {main: [[{node: '代码 - 解析审稿 GLM响应', type: 'main', index: 0}]]},
    '代码 - 合并审稿 GLM错误上下文': {main: [[{node: '数据库 - 记录审稿 AI调用失败', type: 'main', index: 0}]]},
    '代码 - 解析审稿 GLM响应': {main: [
      [{node: '数据库 - 记录审稿 AI调用', type: 'main', index: 0}],
      [{node: '代码 - 合并审稿解析错误上下文', type: 'main', index: 0}],
    ]},
    '代码 - 合并审稿解析错误上下文': {main: [[{node: '数据库 - 记录审稿 AI调用失败', type: 'main', index: 0}]]},
    '数据库 - 记录审稿 AI调用': {main: [[{node: '数据库 - 写入审稿报告并进入待人工审核', type: 'main', index: 0}]]},
    '数据库 - 写入审稿报告并进入待人工审核': {main: [[{node: '数据库 - 标记审稿任务成功', type: 'main', index: 0}]]},
    '数据库 - 记录审稿 AI调用失败': {main: [[{node: '数据库 - 标记审稿尝试失败', type: 'main', index: 0}]]},
  }
);

const outputs = [
  ['n8n/workflow/14_novel_chapter_workflow.json', chapterWorkflow],
  ['n8n/workflow/available/14_novel_chapter_workflow.json', chapterWorkflow],
  ['n8n/workflow/15_novel_ai_review_workflow.json', reviewWorkflow],
  ['n8n/workflow/available/15_novel_ai_review_workflow.json', reviewWorkflow],
];

for (const [relativePath, workflow] of outputs) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), {recursive: true});
  fs.writeFileSync(fullPath, `${JSON.stringify(workflow, null, 2)}\n`);
}

console.log(`Generated ${outputs.length} novel Phase 4 workflow files.`);
