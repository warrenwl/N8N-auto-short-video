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

const reviewSelect = `SELECT
  c.id AS chapter_id,
  c.project_id,
  p.title AS project_title,
  c.chapter_no,
  c.title AS chapter_title,
  c.body,
  c.summary,
  c.generation_version,
  c.review_token,
  c.status,
  c.is_current,
  c.created_at,
  c.updated_at,
  rr.consistency_score,
  rr.readability_score,
  rr.plot_score,
  rr.commercial_score,
  rr.total_score,
  rr.issues,
  rr.suggestions,
  rr.verdict,
  rr.created_at AS review_created_at,
  rr.ai_run_id,
  ai.model AS ai_run_model,
  ai.prompt_version AS ai_run_prompt_version,
  ai.duration_ms AS ai_run_duration_ms,
  ai.success AS ai_run_success,
  ai.created_at AS ai_run_created_at,
  ai.error_message AS ai_run_error_message,
  ai.parsed_payload->'cross_chapter_transition_review' AS cross_chapter_transition_review,
  latest_job.job_type AS latest_job_type,
  latest_job.status AS latest_job_status,
  latest_job.attempt_count AS latest_job_attempt_count,
  latest_job.error_message AS latest_job_error_message,
  latest_job.updated_at AS latest_job_updated_at,
  notify_job.status AS notify_status,
  notify_job.payload->>'remind_status' AS remind_status,
  notify_job.payload->>'review_detail_url' AS review_detail_url,
  COALESCE(facts.pending_fact_count, 0) AS pending_fact_count,
  COALESCE(facts.active_fact_count, 0) AS active_fact_count,
  COALESCE(facts.inactive_fact_count, 0) AS inactive_fact_count,
  COALESCE(human.human_review_count, 0) AS human_review_count,
  COALESCE(human.human_reviews, '[]'::jsonb) AS human_reviews,
  COALESCE(blocks.block_revision_count, 0) AS block_revision_count,
  COALESCE(blocks.block_revisions, '[]'::jsonb) AS block_revisions
FROM novel_chapters c
JOIN novel_projects p ON p.id = c.project_id
LEFT JOIN novel_chapter_outlines co ON co.id = c.outline_id
LEFT JOIN LATERAL (
  SELECT *
  FROM novel_review_reports r
  WHERE r.chapter_id = c.id
  ORDER BY r.created_at DESC
  LIMIT 1
) rr ON true
LEFT JOIN novel_ai_runs ai ON ai.id = rr.ai_run_id
LEFT JOIN LATERAL (
  SELECT j.*
  FROM novel_generation_jobs j
  WHERE j.chapter_id = c.id
  ORDER BY j.updated_at DESC, j.created_at DESC
  LIMIT 1
) latest_job ON true
LEFT JOIN LATERAL (
  SELECT j.*
  FROM novel_generation_jobs j
  WHERE j.chapter_id = c.id
    AND j.job_type = 'NOTIFY_REVIEW'
  ORDER BY j.updated_at DESC, j.created_at DESC
  LIMIT 1
) notify_job ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE f.status = 'PENDING')::integer AS pending_fact_count,
    COUNT(*) FILTER (WHERE f.status = 'ACTIVE')::integer AS active_fact_count,
    COUNT(*) FILTER (WHERE f.status = 'INACTIVE')::integer AS inactive_fact_count
  FROM novel_continuity_facts f
  WHERE f.chapter_id = c.id
) facts ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::integer AS human_review_count,
    COALESCE(jsonb_agg(jsonb_build_object(
      'action', h.action,
      'reviewer', h.reviewer,
      'comment', h.comment,
      'created_at', h.created_at
    ) ORDER BY h.created_at DESC), '[]'::jsonb) AS human_reviews
  FROM novel_human_reviews h
  WHERE h.chapter_id = c.id
) human ON true
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)::integer AS block_revision_count,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', picked.id,
      'status', picked.status,
      'action_type', picked.action_type,
      'range_lock', picked.range_lock,
      'paragraph_start', picked.paragraph_start,
      'paragraph_end', picked.paragraph_end,
      'selection_start_offset', picked.selection_start_offset,
      'selection_end_offset', picked.selection_end_offset,
      'anchor_prefix', picked.anchor_prefix,
      'anchor_suffix', picked.anchor_suffix,
      'selected_text', picked.selected_text,
      'before_context', picked.before_context,
      'after_context', picked.after_context,
      'instruction', picked.instruction,
      'replacement_text', picked.replacement_text,
      'change_summary', picked.change_summary,
      'instruction_checklist', picked.instruction_checklist,
      'affects_later_text', picked.affects_later_text,
      'error_message', picked.error_message,
      'job_id', picked.job_id,
      'applied_chapter_id', picked.applied_chapter_id,
      'created_by', picked.created_by,
      'created_at', picked.created_at,
      'updated_at', picked.updated_at
    ) ORDER BY picked.created_at DESC), '[]'::jsonb) AS block_revisions
  FROM (
    SELECT br.*
    FROM novel_chapter_block_revisions br
    WHERE br.chapter_id = c.id
    ORDER BY br.created_at DESC
    LIMIT 10
  ) picked
) blocks ON true`;

const listReviewQuery = `-- List candidate chapters waiting for human review.
WITH listed AS (
  ${reviewSelect}
  WHERE c.status = 'NEED_REVIEW'
    AND (co.id IS NULL OR c.created_at >= co.updated_at)
    AND NOT EXISTS (
      SELECT 1
      FROM novel_chapters newer
      WHERE newer.project_id = c.project_id
        AND newer.chapter_no = c.chapter_no
        AND newer.status = 'NEED_REVIEW'
        AND newer.id <> c.id
        AND (
          newer.generation_version > c.generation_version
          OR (
            newer.generation_version = c.generation_version
            AND COALESCE(newer.updated_at, newer.created_at) > COALESCE(c.updated_at, c.created_at)
          )
        )
    )
  ORDER BY c.updated_at DESC, c.created_at DESC
  LIMIT 100
)
SELECT false AS is_empty, 'LIST'::text AS page_mode, listed.*
FROM listed
UNION ALL
SELECT
  true AS is_empty,
  NULL::text AS page_mode,
  NULL::uuid AS chapter_id,
  NULL::uuid AS project_id,
  NULL::text AS project_title,
  NULL::integer AS chapter_no,
  NULL::text AS chapter_title,
  NULL::text AS body,
  NULL::text AS summary,
  NULL::integer AS generation_version,
  NULL::text AS review_token,
  NULL::text AS status,
  NULL::boolean AS is_current,
  NULL::timestamptz AS created_at,
  NULL::timestamptz AS updated_at,
  NULL::integer AS consistency_score,
  NULL::integer AS readability_score,
  NULL::integer AS plot_score,
  NULL::integer AS commercial_score,
  NULL::integer AS total_score,
  '[]'::jsonb AS issues,
  '[]'::jsonb AS suggestions,
  NULL::text AS verdict,
  NULL::timestamptz AS review_created_at,
  NULL::uuid AS ai_run_id,
  NULL::text AS ai_run_model,
  NULL::text AS ai_run_prompt_version,
  NULL::integer AS ai_run_duration_ms,
  NULL::boolean AS ai_run_success,
  NULL::timestamptz AS ai_run_created_at,
  NULL::text AS ai_run_error_message,
  NULL::jsonb AS cross_chapter_transition_review,
  NULL::text AS latest_job_type,
  NULL::text AS latest_job_status,
  NULL::integer AS latest_job_attempt_count,
  NULL::text AS latest_job_error_message,
  NULL::timestamptz AS latest_job_updated_at,
  NULL::text AS notify_status,
  NULL::text AS remind_status,
  NULL::text AS review_detail_url,
  0::integer AS pending_fact_count,
  0::integer AS active_fact_count,
  0::integer AS inactive_fact_count,
  0::integer AS human_review_count,
  '[]'::jsonb AS human_reviews,
  0::integer AS block_revision_count,
  '[]'::jsonb AS block_revisions
WHERE NOT EXISTS (SELECT 1 FROM listed);`;

const detailReviewQuery = `-- Show one candidate chapter review detail.
WITH input AS (
  SELECT
    CASE
      WHEN $1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN $1::uuid
      ELSE NULL::uuid
    END AS chapter_id,
    NULLIF($2, '') AS review_token
), listed AS (
  ${reviewSelect}, input
  WHERE c.id = input.chapter_id
    AND c.review_token = input.review_token
    AND c.status = 'NEED_REVIEW'
    AND (co.id IS NULL OR c.created_at >= co.updated_at)
    AND NOT EXISTS (
      SELECT 1
      FROM novel_chapters newer
      WHERE newer.project_id = c.project_id
        AND newer.chapter_no = c.chapter_no
        AND newer.status = 'NEED_REVIEW'
        AND newer.id <> c.id
        AND (
          newer.generation_version > c.generation_version
          OR (
            newer.generation_version = c.generation_version
            AND COALESCE(newer.updated_at, newer.created_at) > COALESCE(c.updated_at, c.created_at)
          )
        )
    )
  LIMIT 1
)
SELECT false AS is_empty, 'DETAIL'::text AS page_mode, listed.*
FROM listed
UNION ALL
SELECT
  true AS is_empty,
  NULL::text AS page_mode,
  NULL::uuid AS chapter_id,
  NULL::uuid AS project_id,
  NULL::text AS project_title,
  NULL::integer AS chapter_no,
  NULL::text AS chapter_title,
  NULL::text AS body,
  NULL::text AS summary,
  NULL::integer AS generation_version,
  NULL::text AS review_token,
  NULL::text AS status,
  NULL::boolean AS is_current,
  NULL::timestamptz AS created_at,
  NULL::timestamptz AS updated_at,
  NULL::integer AS consistency_score,
  NULL::integer AS readability_score,
  NULL::integer AS plot_score,
  NULL::integer AS commercial_score,
  NULL::integer AS total_score,
  '[]'::jsonb AS issues,
  '[]'::jsonb AS suggestions,
  NULL::text AS verdict,
  NULL::timestamptz AS review_created_at,
  NULL::uuid AS ai_run_id,
  NULL::text AS ai_run_model,
  NULL::text AS ai_run_prompt_version,
  NULL::integer AS ai_run_duration_ms,
  NULL::boolean AS ai_run_success,
  NULL::timestamptz AS ai_run_created_at,
  NULL::text AS ai_run_error_message,
  NULL::jsonb AS cross_chapter_transition_review,
  NULL::text AS latest_job_type,
  NULL::text AS latest_job_status,
  NULL::integer AS latest_job_attempt_count,
  NULL::text AS latest_job_error_message,
  NULL::timestamptz AS latest_job_updated_at,
  NULL::text AS notify_status,
  NULL::text AS remind_status,
  NULL::text AS review_detail_url,
  0::integer AS pending_fact_count,
  0::integer AS active_fact_count,
  0::integer AS inactive_fact_count,
  0::integer AS human_review_count,
  '[]'::jsonb AS human_reviews,
  0::integer AS block_revision_count,
  '[]'::jsonb AS block_revisions
WHERE NOT EXISTS (SELECT 1 FROM listed);`;

const applyReviewActionQuery = `-- Apply one human novel review action.
SELECT *
FROM apply_novel_review_action(
  $1::uuid,
  $2,
  $3,
  NULLIF($4, ''),
  COALESCE(NULLIF($5, ''), 'local_user')
);`;

const applyReviewManualEditQuery = `-- Save a manual edit for one chapter currently waiting for review.
WITH result AS (
  SELECT *
  FROM apply_novel_review_manual_edit(
    $1::uuid,
    $2,
    NULLIF($3, ''),
    $4,
    NULLIF($5, ''),
    NULLIF($6, ''),
    COALESCE(NULLIF($7, ''), 'local_user'),
    $8
  )
)
SELECT result.*
FROM result;`;

const requestBlockRevisionQuery = `-- Create one local block revision request for a chapter currently waiting for review.
SELECT r.*, 'REQUEST_BLOCK_REVISION'::text AS action, $2 AS review_token
FROM request_novel_chapter_block_revision(
  $1::uuid,
  $2,
  $3,
  $4,
  $5,
  COALESCE(NULLIF($6::text, '')::integer, NULL),
  COALESCE(NULLIF($7::text, '')::integer, NULL),
	  NULLIF($8, ''),
	  NULLIF($9, ''),
	  COALESCE(NULLIF($10, ''), 'selection_only'),
	  COALESCE(NULLIF($11, ''), 'local_user'),
	  COALESCE(NULLIF($12::text, '')::integer, NULL),
	  COALESCE(NULLIF($13::text, '')::integer, NULL),
	  NULLIF($14, ''),
	  NULLIF($15, '')
	) r;`;

const applyBlockRevisionQuery = `-- Apply, regenerate, reject, or escalate one local block revision.
SELECT *
FROM apply_novel_chapter_block_revision(
  $1::uuid,
  $2,
  $3,
  NULLIF($4, ''),
  COALESCE(NULLIF($5, ''), 'local_user')
) r;`;

const startReviewAssistantQuery = `-- Validate and prepare one review assistant chat turn.
SELECT *
FROM start_novel_review_assistant_message(
  $1::uuid,
  $2,
  NULLIF($3, '')::uuid,
  $4,
  $5,
  NULLIF($6, ''),
  COALESCE(NULLIF($7::text, '')::integer, NULL),
  COALESCE(NULLIF($8::text, '')::integer, NULL),
  COALESCE(NULLIF($9::text, '')::integer, NULL),
  COALESCE(NULLIF($10::text, '')::integer, NULL),
  NULLIF($11, ''),
  NULLIF($12, ''),
  COALESCE(NULLIF($13, ''), 'local_user')
);`;

const finishReviewAssistantQuery = `-- Record one review assistant AI run and assistant response.
SELECT *
FROM finish_novel_review_assistant_message(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::uuid,
  $5,
  NULLIF($6, ''),
  NULLIF($7, ''),
  COALESCE(NULLIF($8, '')::jsonb, '{}'::jsonb),
  COALESCE(NULLIF($9, '')::jsonb, '{}'::jsonb),
  COALESCE(NULLIF($10, '')::jsonb, '{}'::jsonb),
  COALESCE(NULLIF($11::text, '')::boolean, FALSE),
  NULLIF($12, ''),
  NULLIF($13, '')::timestamptz,
  NULLIF($14, '')::timestamptz,
  COALESCE(NULLIF($15, ''), 'local_user')
);`;

const mergeReviewAssistantResponseCode = `// n8n Code node: Merge review assistant GLM response context.
const context = $('代码 - 构建审稿助手 GLM请求').first().json;
const response = $json;
return [{json: {...context, llm_response: response, llm_response_json: JSON.stringify(response)}}];`;

const mergeReviewAssistantErrorCode = `// n8n Code node: Merge review assistant GLM error context.
const context = $('代码 - 构建审稿助手 GLM请求').first().json;
const errorText = $json?.message || $json?.error?.message || $json?.error || '审稿助手模型调用失败';
const errorPayload = {error: errorText, raw_error: $json};
return [{
  json: {
    ...context,
    llm_response: errorPayload,
    llm_response_json: JSON.stringify(errorPayload),
    error_message: String(errorText),
  },
}];`;

const guardReviewAssistantContextCode = `// n8n Code node: Guard review assistant context before calling GLM.
const row = $json || {};
const success = row.success === true || row.success === 'true';
if (success) {
  return [{json: {...row, assistant_should_call_model: true}}];
}
const payload = {
  ok: false,
  thread_id: row.thread_id || '',
  mode: row.mode || 'continuity',
  answer: row.message || '审稿助手上下文不可用，请刷新页面后重试。',
  findings: [],
  suggestions: [],
  source_refs: [],
  suggested_actions: [],
};
return [{
  json: {
    ...row,
    assistant_should_call_model: false,
    response_status_code: row.result_code === 'NO_MATCH_OR_INVALID_STATE' ? 403 : 400,
    response_json: JSON.stringify(payload),
  },
}];`;

const prepareRewriteLaunchCode = `// n8n Code node: Prepare async rewrite launch after a human review action.
const row = $json || {};
const success = row.success === true || row.success === 'true';
const shouldLaunch = success && row.action === 'REQUEST_REWRITE' && row.rewrite_job_id;
return [{
  json: {
    ...row,
    should_launch_rewrite_worker: Boolean(shouldLaunch),
    job_id: row.rewrite_job_id || '',
  },
}];`;

const prepareReviewLaunchCode = `// n8n Code node: Prepare async AI review launch after a manual rerun action.
const row = $json || {};
const success = row.success === true || row.success === 'true';
const shouldLaunch = success && row.action === 'RERUN_REVIEW' && row.next_job_id;
return [{
  json: {
    ...row,
    should_launch_review_worker: Boolean(shouldLaunch),
    job_id: row.next_job_id || '',
  },
}];`;

const prepareBlockRevisionLaunchCode = `// n8n Code node: Prepare async block revision worker launch.
const row = $json || {};
const success = row.success === true || row.success === 'true';
const shouldLaunch = success && row.job_type === 'REVISE_CHAPTER_BLOCK' && row.job_id;
return [{
  json: {
    ...row,
    should_launch_block_revision_worker: Boolean(shouldLaunch),
    job_id: row.job_id || '',
  },
}];`;

const prepareBlockRevisionApplyLaunchCode = `// n8n Code node: Prepare async launch after a block revision apply action.
const row = $json || {};
const success = row.success === true || row.success === 'true';
return [{
  json: {
    ...row,
    should_launch_block_revision_worker: Boolean(success && row.job_type === 'REVISE_CHAPTER_BLOCK' && row.job_id),
    should_launch_rewrite_worker: Boolean(success && row.job_type === 'REWRITE_CHAPTER' && row.job_id),
    rewrite_job_id: row.job_type === 'REWRITE_CHAPTER' ? row.job_id : '',
    job_id: row.job_id || '',
  },
}];`;

const reviewWorkflow = workflowBase(
  'novelReviewV1Workflow16',
  '16_小说人工审核中心',
  [
    webhookNode('webhook-novel-review-list-16', 'Webhook - 小说审核列表', [-920, -320], 'GET', 'novel-review-list', 'novel-review-list-16'),
    postgresNode('postgres-list-review-chapters-16', '数据库 - 查询待审章节列表', [-700, -320], listReviewQuery),
    codeNode('code-render-review-list-16', '代码 - 生成小说审核页面', [-480, -320], code('n8n/code/novel_render_review_html.js')),
    respondNode('respond-review-list-16', '响应Webhook - 返回小说审核列表', [-260, -320], '={{ $json.html }}', 200, 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-review-detail-16', 'Webhook - 小说审核详情', [-920, 0], 'GET', 'novel-review-detail', 'novel-review-detail-16'),
    postgresNode(
      'postgres-detail-review-chapter-16',
      '数据库 - 查询待审章节详情',
      [-700, 0],
      detailReviewQuery,
      '={{ [ (($json.query || {}).chapter_id || ""), (($json.query || {}).review_token || ($json.query || {}).token || "") ] }}'
    ),
    codeNode('code-render-review-detail-16', '代码 - 生成小说审核详情页面', [-480, 0], code('n8n/code/novel_render_review_html.js')),
    respondNode('respond-review-detail-16', '响应Webhook - 返回小说审核详情', [-260, 0], '={{ $json.html }}', 200, 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-review-assistant-16', 'Webhook - 小说审稿助手', [-920, 180], 'POST', 'novel-review-assistant', 'novel-review-assistant-16'),
    codeNode('code-validate-review-assistant-16', '代码 - 校验小说审稿助手', [-700, 180], code('n8n/code/novel_validate_review_assistant_request.js')),
    postgresNode(
      'postgres-start-review-assistant-16',
      '数据库 - 准备审稿助手上下文',
      [-480, 180],
      startReviewAssistantQuery,
      '={{ [ $json.chapter_id, $json.review_token, $json.thread_id, $json.mode, $json.question, $json.selected_text, $json.paragraph_start, $json.paragraph_end, $json.selection_start_offset, $json.selection_end_offset, $json.anchor_prefix, $json.anchor_suffix, $json.reviewer ] }}'
    ),
    codeNode('code-guard-review-assistant-context-16', '代码 - 审稿助手上下文闸门', [-260, 180], guardReviewAssistantContextCode),
    ifNode('if-review-assistant-call-model-16', '条件判断 - 审稿助手需要调用模型', [-40, 180], '={{ $json.assistant_should_call_model }}', 'review-assistant-call-model'),
    codeNode('code-build-review-assistant-request-16', '代码 - 构建审稿助手 GLM请求', [180, 120], code('n8n/code/novel_build_review_assistant_glm_request.js')),
    httpGlmNode('http-glm-review-assistant-16', 'HTTP请求 - 调用GLM审稿助手', [400, 120], {continueErrorOutput: true}),
    codeNode('code-merge-review-assistant-response-16', '代码 - 合并审稿助手 GLM响应上下文', [620, 60], mergeReviewAssistantResponseCode),
    codeNode('code-merge-review-assistant-error-16', '代码 - 合并审稿助手 GLM错误上下文', [620, 180], mergeReviewAssistantErrorCode),
    codeNode('code-parse-review-assistant-response-16', '代码 - 解析审稿助手响应', [840, 120], code('n8n/code/novel_parse_review_assistant_json.js')),
    postgresNode(
      'postgres-finish-review-assistant-16',
      '数据库 - 记录审稿助手回答',
      [1060, 120],
      finishReviewAssistantQuery,
      '={{ [ $json.thread_id, $json.user_message_id, $json.project_id, $json.chapter_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify($json.llm_request_body), $json.llm_response_json, $json.parsed_payload_json, $json.assistant_success, $json.error_message, $json.ai_run_started_at, $json.ai_run_finished_at, $json.reviewer ] }}'
    ),
    respondNode('respond-review-assistant-16', '响应Webhook - 返回审稿助手结果', [1280, 180], '={{ $json.response_json }}', '={{ $json.response_status_code || 200 }}', 'application/json; charset=utf-8'),

    webhookNode('webhook-novel-review-action-16', 'Webhook - 小说审核动作', [-920, 340], 'POST', 'novel-review-action', 'novel-review-action-16'),
    codeNode('code-validate-review-action-16', '代码 - 校验小说审核动作', [-700, 340], code('n8n/code/novel_validate_review_action.js')),
    postgresNode(
      'postgres-apply-review-action-16',
      '数据库 - 执行小说审核动作',
      [-480, 340],
      applyReviewActionQuery,
      '={{ [ $json.chapter_id, $json.review_token, $json.action, $json.comment, $json.reviewer ] }}'
    ),
    codeNode('code-render-review-action-result-16', '代码 - 生成小说审核动作结果页', [-260, 340], code('n8n/code/novel_render_review_action_result.js')),
    respondNode('respond-review-action-16', '响应Webhook - 返回小说审核动作结果', [-40, 340], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),
    codeNode('code-prepare-rewrite-launch-16', '代码 - 准备异步启动重写任务', [-260, 520], prepareRewriteLaunchCode),
    ifNode('if-launch-rewrite-worker-16', '条件判断 - 需要启动重写任务', [-40, 520], '={{ $json.should_launch_rewrite_worker }}', 'launch-rewrite-worker'),
    executeWorkflowNode('execute-rewrite-worker-16', '执行子流程 - 异步重写章节', [180, 520], 'novelRewriteNotifyV1Workflow17'),
    codeNode('code-prepare-review-launch-16', '代码 - 准备异步启动智能审稿', [-260, 660], prepareReviewLaunchCode),
    ifNode('if-launch-review-worker-16', '条件判断 - 需要启动智能审稿', [-40, 660], '={{ $json.should_launch_review_worker }}', 'launch-review-worker'),
    executeWorkflowNode('execute-review-worker-16', '执行子流程 - 异步智能审稿', [180, 660], 'novelAiReviewV1Workflow15'),

    webhookNode('webhook-novel-review-manual-edit-16', 'Webhook - 小说审核人工改稿', [-920, 820], 'POST', 'novel-review-manual-edit', 'novel-review-manual-edit-16'),
    codeNode('code-validate-review-manual-edit-16', '代码 - 校验小说审核人工改稿', [-700, 820], code('n8n/code/novel_validate_review_manual_edit.js')),
    postgresNode(
      'postgres-apply-review-manual-edit-16',
      '数据库 - 保存审核人工改稿',
      [-480, 820],
      applyReviewManualEditQuery,
      '={{ [ $json.chapter_id, $json.review_token, $json.title, $json.body, $json.summary, $json.comment, $json.reviewer, $json.decision ] }}'
    ),
    codeNode('code-render-review-manual-edit-result-16', '代码 - 生成审核人工改稿结果页', [-260, 820], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-review-manual-edit-16', '响应Webhook - 返回审核人工改稿结果', [-40, 820], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-review-block-revise-16', 'Webhook - 小说审核局部修订', [-920, 1120], 'POST', 'novel-review-block-revise', 'novel-review-block-revise-16'),
    codeNode('code-validate-block-revision-request-16', '代码 - 校验局部修订请求', [-700, 1120], code('n8n/code/novel_validate_block_revision_request.js')),
    postgresNode(
      'postgres-request-block-revision-16',
      '数据库 - 创建局部修订任务',
      [-480, 1120],
      requestBlockRevisionQuery,
	      '={{ [ $json.chapter_id, $json.review_token, $json.action_type, $json.selected_text, $json.instruction, $json.paragraph_start, $json.paragraph_end, $json.before_context, $json.after_context, $json.range_lock, $json.reviewer, $json.selection_start_offset, $json.selection_end_offset, $json.anchor_prefix, $json.anchor_suffix ] }}'
	    ),
    codeNode('code-render-block-revision-request-result-16', '代码 - 生成局部修订请求结果页', [-260, 1120], code('n8n/code/novel_render_block_revision_result.js')),
    respondNode('respond-block-revision-request-16', '响应Webhook - 返回局部修订请求结果', [-40, 1120], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),
    codeNode('code-prepare-block-revision-launch-16', '代码 - 准备异步启动局部修订任务', [-260, 1300], prepareBlockRevisionLaunchCode),
    ifNode('if-launch-block-revision-worker-16', '条件判断 - 需要启动局部修订任务', [-40, 1300], '={{ $json.should_launch_block_revision_worker }}', 'launch-block-revision-worker'),
    executeWorkflowNode('execute-block-revision-worker-16', '执行子流程 - 异步局部修订', [180, 1300], 'novelBlockRevisionV1Workflow19'),

    webhookNode('webhook-novel-review-block-apply-16', 'Webhook - 小说审核局部修订确认', [-920, 1540], 'POST', 'novel-review-block-apply', 'novel-review-block-apply-16'),
    codeNode('code-validate-block-revision-apply-16', '代码 - 校验局部修订确认', [-700, 1540], code('n8n/code/novel_validate_block_revision_apply.js')),
    postgresNode(
      'postgres-apply-block-revision-16',
      '数据库 - 应用局部修订',
      [-480, 1540],
      applyBlockRevisionQuery,
      '={{ [ $json.revision_id, $json.review_token, $json.action, $json.replacement_text, $json.reviewer ] }}'
    ),
    codeNode('code-render-block-revision-apply-result-16', '代码 - 生成局部修订确认结果页', [-260, 1540], code('n8n/code/novel_render_block_revision_result.js')),
    respondNode('respond-block-revision-apply-16', '响应Webhook - 返回局部修订确认结果', [-40, 1540], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),
    codeNode('code-prepare-block-revision-apply-launch-16', '代码 - 准备确认后异步任务', [-260, 1720], prepareBlockRevisionApplyLaunchCode),
    ifNode('if-apply-launch-block-revision-worker-16', '条件判断 - 确认后需启动局部修订', [-40, 1700], '={{ $json.should_launch_block_revision_worker }}', 'apply-launch-block-revision-worker'),
    executeWorkflowNode('execute-apply-block-revision-worker-16', '执行子流程 - 确认后异步局部修订', [180, 1700], 'novelBlockRevisionV1Workflow19'),
    ifNode('if-apply-launch-rewrite-worker-16', '条件判断 - 确认后需启动重写', [-40, 1840], '={{ $json.should_launch_rewrite_worker }}', 'apply-launch-rewrite-worker'),
    executeWorkflowNode('execute-apply-rewrite-worker-16', '执行子流程 - 确认后异步重写', [180, 1840], 'novelRewriteNotifyV1Workflow17'),

    sticky('note-review-list-16', '说明 - 审核列表', [-920, -560], 'GET `/webhook/novel-review-list` 只展示 `NEED_REVIEW` 候选章节，不修改数据库。'),
    sticky('note-review-detail-16', '说明 - 审核详情', [-920, -160], 'GET `/webhook/novel-review-detail?chapter_id=...&review_token=...` 只展示详情，用于通知链接落点。'),
    sticky('note-review-assistant-16', '说明 - 审稿助手', [620, -40], 'POST `/webhook/novel-review-assistant` 接收章节、token、模式、问题和可选选区；读取 Bible/大纲/导演台/facts/审稿报告后即时返回 JSON 建议，只预填动作，不直接改正文。'),
    sticky('note-review-action-16', '说明 - 审核动作', [-920, 580], 'POST `/webhook/novel-review-action` 支持通过、要求重写、拒绝和手动重新审稿；要求重写会异步启动 17 号重写 worker，重新审稿会异步启动 15 号审稿 worker。'),
    sticky('note-review-block-revision-16', '说明 - 局部修订', [-920, 1340], 'POST `/webhook/novel-review-block-revise` 创建局部修订建议任务；POST `/webhook/novel-review-block-apply` 应用、修改后应用、重新生成、放弃或转为整章重写。应用后只保存新的待审候选稿，不自动审稿，方便一章多处连续修改。'),
  ],
  {
    'Webhook - 小说审核列表': {main: [[{node: '数据库 - 查询待审章节列表', type: 'main', index: 0}]]},
    '数据库 - 查询待审章节列表': {main: [[{node: '代码 - 生成小说审核页面', type: 'main', index: 0}]]},
    '代码 - 生成小说审核页面': {main: [[{node: '响应Webhook - 返回小说审核列表', type: 'main', index: 0}]]},

    'Webhook - 小说审核详情': {main: [[{node: '数据库 - 查询待审章节详情', type: 'main', index: 0}]]},
    '数据库 - 查询待审章节详情': {main: [[{node: '代码 - 生成小说审核详情页面', type: 'main', index: 0}]]},
    '代码 - 生成小说审核详情页面': {main: [[{node: '响应Webhook - 返回小说审核详情', type: 'main', index: 0}]]},

    'Webhook - 小说审稿助手': {main: [[{node: '代码 - 校验小说审稿助手', type: 'main', index: 0}]]},
    '代码 - 校验小说审稿助手': {main: [[{node: '数据库 - 准备审稿助手上下文', type: 'main', index: 0}]]},
    '数据库 - 准备审稿助手上下文': {main: [[{node: '代码 - 审稿助手上下文闸门', type: 'main', index: 0}]]},
    '代码 - 审稿助手上下文闸门': {main: [[{node: '条件判断 - 审稿助手需要调用模型', type: 'main', index: 0}]]},
    '条件判断 - 审稿助手需要调用模型': {main: [[{node: '代码 - 构建审稿助手 GLM请求', type: 'main', index: 0}], [{node: '响应Webhook - 返回审稿助手结果', type: 'main', index: 0}]]},
    '代码 - 构建审稿助手 GLM请求': {main: [[{node: 'HTTP请求 - 调用GLM审稿助手', type: 'main', index: 0}]]},
    'HTTP请求 - 调用GLM审稿助手': {main: [
      [{node: '代码 - 合并审稿助手 GLM响应上下文', type: 'main', index: 0}],
      [{node: '代码 - 合并审稿助手 GLM错误上下文', type: 'main', index: 0}],
    ]},
    '代码 - 合并审稿助手 GLM响应上下文': {main: [[{node: '代码 - 解析审稿助手响应', type: 'main', index: 0}]]},
    '代码 - 合并审稿助手 GLM错误上下文': {main: [[{node: '代码 - 解析审稿助手响应', type: 'main', index: 0}]]},
    '代码 - 解析审稿助手响应': {main: [[{node: '数据库 - 记录审稿助手回答', type: 'main', index: 0}]]},
    '数据库 - 记录审稿助手回答': {main: [[{node: '响应Webhook - 返回审稿助手结果', type: 'main', index: 0}]]},

    'Webhook - 小说审核动作': {main: [[{node: '代码 - 校验小说审核动作', type: 'main', index: 0}]]},
    '代码 - 校验小说审核动作': {main: [[{node: '数据库 - 执行小说审核动作', type: 'main', index: 0}]]},
    '数据库 - 执行小说审核动作': {main: [[
      {node: '代码 - 生成小说审核动作结果页', type: 'main', index: 0},
      {node: '代码 - 准备异步启动重写任务', type: 'main', index: 0},
      {node: '代码 - 准备异步启动智能审稿', type: 'main', index: 0},
    ]]},
    '代码 - 生成小说审核动作结果页': {main: [[{node: '响应Webhook - 返回小说审核动作结果', type: 'main', index: 0}]]},
    '代码 - 准备异步启动重写任务': {main: [[{node: '条件判断 - 需要启动重写任务', type: 'main', index: 0}]]},
    '条件判断 - 需要启动重写任务': {main: [[{node: '执行子流程 - 异步重写章节', type: 'main', index: 0}], []]},
    '代码 - 准备异步启动智能审稿': {main: [[{node: '条件判断 - 需要启动智能审稿', type: 'main', index: 0}]]},
    '条件判断 - 需要启动智能审稿': {main: [[{node: '执行子流程 - 异步智能审稿', type: 'main', index: 0}], []]},

    'Webhook - 小说审核人工改稿': {main: [[{node: '代码 - 校验小说审核人工改稿', type: 'main', index: 0}]]},
    '代码 - 校验小说审核人工改稿': {main: [[{node: '数据库 - 保存审核人工改稿', type: 'main', index: 0}]]},
    '数据库 - 保存审核人工改稿': {main: [[{node: '代码 - 生成审核人工改稿结果页', type: 'main', index: 0}]]},
    '代码 - 生成审核人工改稿结果页': {main: [[{node: '响应Webhook - 返回审核人工改稿结果', type: 'main', index: 0}]]},

    'Webhook - 小说审核局部修订': {main: [[{node: '代码 - 校验局部修订请求', type: 'main', index: 0}]]},
    '代码 - 校验局部修订请求': {main: [[{node: '数据库 - 创建局部修订任务', type: 'main', index: 0}]]},
    '数据库 - 创建局部修订任务': {main: [[
      {node: '代码 - 生成局部修订请求结果页', type: 'main', index: 0},
      {node: '代码 - 准备异步启动局部修订任务', type: 'main', index: 0},
    ]]},
    '代码 - 生成局部修订请求结果页': {main: [[{node: '响应Webhook - 返回局部修订请求结果', type: 'main', index: 0}]]},
    '代码 - 准备异步启动局部修订任务': {main: [[{node: '条件判断 - 需要启动局部修订任务', type: 'main', index: 0}]]},
    '条件判断 - 需要启动局部修订任务': {main: [[{node: '执行子流程 - 异步局部修订', type: 'main', index: 0}], []]},

    'Webhook - 小说审核局部修订确认': {main: [[{node: '代码 - 校验局部修订确认', type: 'main', index: 0}]]},
    '代码 - 校验局部修订确认': {main: [[{node: '数据库 - 应用局部修订', type: 'main', index: 0}]]},
    '数据库 - 应用局部修订': {main: [[
      {node: '代码 - 生成局部修订确认结果页', type: 'main', index: 0},
      {node: '代码 - 准备确认后异步任务', type: 'main', index: 0},
    ]]},
    '代码 - 生成局部修订确认结果页': {main: [[{node: '响应Webhook - 返回局部修订确认结果', type: 'main', index: 0}]]},
    '代码 - 准备确认后异步任务': {main: [[
      {node: '条件判断 - 确认后需启动局部修订', type: 'main', index: 0},
      {node: '条件判断 - 确认后需启动重写', type: 'main', index: 0},
    ]]},
    '条件判断 - 确认后需启动局部修订': {main: [[{node: '执行子流程 - 确认后异步局部修订', type: 'main', index: 0}], []]},
    '条件判断 - 确认后需启动重写': {main: [[{node: '执行子流程 - 确认后异步重写', type: 'main', index: 0}], []]},
  }
);

const outputs = [
  ['n8n/workflow/16_novel_review_workflow.json', reviewWorkflow],
  ['n8n/workflow/available/16_novel_review_workflow.json', reviewWorkflow],
];

for (const [relativePath, workflow] of outputs) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), {recursive: true});
  fs.writeFileSync(fullPath, `${JSON.stringify(workflow, null, 2)}\n`);
}

console.log(`Generated ${outputs.length} novel Phase 5 workflow files.`);
