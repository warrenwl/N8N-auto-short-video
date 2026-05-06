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
  COALESCE(human.human_reviews, '[]'::jsonb) AS human_reviews
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
) human ON true`;

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
  '[]'::jsonb AS human_reviews
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
  '[]'::jsonb AS human_reviews
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
);`;

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

    webhookNode('webhook-novel-review-manual-edit-16', 'Webhook - 小说审核人工改稿', [-920, 760], 'POST', 'novel-review-manual-edit', 'novel-review-manual-edit-16'),
    codeNode('code-validate-review-manual-edit-16', '代码 - 校验小说审核人工改稿', [-700, 760], code('n8n/code/novel_validate_review_manual_edit.js')),
    postgresNode(
      'postgres-apply-review-manual-edit-16',
      '数据库 - 保存审核人工改稿',
      [-480, 760],
      applyReviewManualEditQuery,
      '={{ [ $json.chapter_id, $json.review_token, $json.title, $json.body, $json.summary, $json.comment, $json.reviewer, $json.decision ] }}'
    ),
    codeNode('code-render-review-manual-edit-result-16', '代码 - 生成审核人工改稿结果页', [-260, 760], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-review-manual-edit-16', '响应Webhook - 返回审核人工改稿结果', [-40, 760], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    sticky('note-review-list-16', '说明 - 审核列表', [-920, -560], 'GET `/webhook/novel-review-list` 只展示 `NEED_REVIEW` 候选章节，不修改数据库。'),
    sticky('note-review-detail-16', '说明 - 审核详情', [-920, -160], 'GET `/webhook/novel-review-detail?chapter_id=...&review_token=...` 只展示详情，用于通知链接落点。'),
    sticky('note-review-action-16', '说明 - 审核动作', [-920, 580], 'POST `/webhook/novel-review-action` 才能通过、要求重写或拒绝；POST `/webhook/novel-review-manual-edit` 用于待审详情里的人工改稿。要求重写成功后会立即异步启动 17 号重写 worker。'),
  ],
  {
    'Webhook - 小说审核列表': {main: [[{node: '数据库 - 查询待审章节列表', type: 'main', index: 0}]]},
    '数据库 - 查询待审章节列表': {main: [[{node: '代码 - 生成小说审核页面', type: 'main', index: 0}]]},
    '代码 - 生成小说审核页面': {main: [[{node: '响应Webhook - 返回小说审核列表', type: 'main', index: 0}]]},

    'Webhook - 小说审核详情': {main: [[{node: '数据库 - 查询待审章节详情', type: 'main', index: 0}]]},
    '数据库 - 查询待审章节详情': {main: [[{node: '代码 - 生成小说审核详情页面', type: 'main', index: 0}]]},
    '代码 - 生成小说审核详情页面': {main: [[{node: '响应Webhook - 返回小说审核详情', type: 'main', index: 0}]]},

    'Webhook - 小说审核动作': {main: [[{node: '代码 - 校验小说审核动作', type: 'main', index: 0}]]},
    '代码 - 校验小说审核动作': {main: [[{node: '数据库 - 执行小说审核动作', type: 'main', index: 0}]]},
    '数据库 - 执行小说审核动作': {main: [[
      {node: '代码 - 生成小说审核动作结果页', type: 'main', index: 0},
      {node: '代码 - 准备异步启动重写任务', type: 'main', index: 0},
    ]]},
    '代码 - 生成小说审核动作结果页': {main: [[{node: '响应Webhook - 返回小说审核动作结果', type: 'main', index: 0}]]},
    '代码 - 准备异步启动重写任务': {main: [[{node: '条件判断 - 需要启动重写任务', type: 'main', index: 0}]]},
    '条件判断 - 需要启动重写任务': {main: [[{node: '执行子流程 - 异步重写章节', type: 'main', index: 0}], []]},

    'Webhook - 小说审核人工改稿': {main: [[{node: '代码 - 校验小说审核人工改稿', type: 'main', index: 0}]]},
    '代码 - 校验小说审核人工改稿': {main: [[{node: '数据库 - 保存审核人工改稿', type: 'main', index: 0}]]},
    '数据库 - 保存审核人工改稿': {main: [[{node: '代码 - 生成审核人工改稿结果页', type: 'main', index: 0}]]},
    '代码 - 生成审核人工改稿结果页': {main: [[{node: '响应Webhook - 返回审核人工改稿结果', type: 'main', index: 0}]]},
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
