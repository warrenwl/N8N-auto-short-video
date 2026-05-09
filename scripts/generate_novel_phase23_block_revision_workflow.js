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

const claimBlockRevisionQuery = `-- Claim one pending REVISE_CHAPTER_BLOCK job.
WITH claimed AS (
  SELECT j.id
  FROM novel_generation_jobs j
  JOIN novel_projects p ON p.id = j.project_id
  JOIN novel_chapters c ON c.id = j.chapter_id
  JOIN novel_chapter_block_revisions br ON br.job_id = j.id
  WHERE j.job_type = 'REVISE_CHAPTER_BLOCK'
    AND j.status = 'PENDING'
    AND j.attempt_count < j.max_attempts
    AND c.status = 'NEED_REVIEW'
    AND br.status IN ('PENDING', 'FAILED')
    AND p.status NOT IN ('PAUSED', 'ARCHIVED')
  ORDER BY j.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
), updated_job AS (
  UPDATE novel_generation_jobs j
  SET
    status = 'RUNNING',
    started_at = NOW(),
    attempt_count = attempt_count + 1,
    error_message = NULL,
    updated_at = NOW()
  FROM claimed
  WHERE j.id = claimed.id
  RETURNING j.*
), updated_revision AS (
  UPDATE novel_chapter_block_revisions br
  SET
    status = 'RUNNING',
    error_message = NULL,
    updated_at = NOW()
  FROM updated_job j
  WHERE br.job_id = j.id
  RETURNING br.id AS revision_id
)
SELECT
  updated_job.*,
  (SELECT revision_id FROM updated_revision LIMIT 1) AS revision_id
FROM updated_job;`;

const claimInputBlockRevisionQuery = `-- Claim a specific REVISE_CHAPTER_BLOCK job passed by Execute Workflow.
WITH input AS (
  SELECT
    NULLIF($1::text, '') AS raw_job_id
), claimed AS (
  SELECT j.id
  FROM novel_generation_jobs j
  JOIN input ON true
  JOIN novel_projects p ON p.id = j.project_id
  JOIN novel_chapters c ON c.id = j.chapter_id
  JOIN novel_chapter_block_revisions br ON br.job_id = j.id
  WHERE j.job_type = 'REVISE_CHAPTER_BLOCK'
    AND j.status = 'PENDING'
    AND j.attempt_count < j.max_attempts
    AND c.status = 'NEED_REVIEW'
    AND br.status IN ('PENDING', 'FAILED')
    AND p.status NOT IN ('PAUSED', 'ARCHIVED')
    AND (
      input.raw_job_id IS NULL
      OR (
        input.raw_job_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND j.id = input.raw_job_id::uuid
      )
    )
  ORDER BY j.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
), updated_job AS (
  UPDATE novel_generation_jobs j
  SET
    status = 'RUNNING',
    started_at = NOW(),
    attempt_count = attempt_count + 1,
    error_message = NULL,
    updated_at = NOW()
  FROM claimed
  WHERE j.id = claimed.id
  RETURNING j.*
), updated_revision AS (
  UPDATE novel_chapter_block_revisions br
  SET
    status = 'RUNNING',
    error_message = NULL,
    updated_at = NOW()
  FROM updated_job j
  WHERE br.job_id = j.id
  RETURNING br.id AS revision_id
)
SELECT
  updated_job.*,
  (SELECT revision_id FROM updated_revision LIMIT 1) AS revision_id
FROM updated_job;`;

const readBlockRevisionContextQuery = `-- Read context for one block revision.
SELECT
  p.id AS project_id,
  p.title AS novel_title,
  p.genre,
  p.audience,
  p.style,
  p.target_words_per_chapter,
  j.id AS job_id,
  'REVISE_CHAPTER_BLOCK'::text AS run_type,
  original.id AS chapter_id,
  original.id AS original_chapter_id,
  original.chapter_no,
  original.title AS chapter_title,
  original.body AS chapter_body,
  original.summary AS chapter_summary,
  original.generation_version AS original_generation_version,
  br.id AS revision_id,
  br.action_type,
  br.range_lock,
  br.paragraph_start,
  br.paragraph_end,
  br.selection_start_offset,
  br.selection_end_offset,
  br.anchor_prefix,
  br.anchor_suffix,
  br.selected_text,
  br.before_context,
  br.after_context,
  br.instruction,
  o.id AS outline_id,
  o.title AS outline_title,
  o.summary AS outline_summary,
  o.chapter_goal,
  o.conflict_point,
  o.emotional_point,
  o.hook,
  director.id AS director_card_id,
  director.version AS director_card_version,
  director.card_payload AS director_card,
  jsonb_build_object(
    'world_setting', b.world_setting,
    'story_core', b.story_core,
    'main_character', b.main_character,
    'supporting_characters', b.supporting_characters,
    'villain_setting', b.villain_setting,
    'power_system', b.power_system,
    'tone_rules', b.tone_rules,
    'forbidden_rules', b.forbidden_rules,
    'selling_points', b.selling_points
  ) AS novel_bible,
  COALESCE(facts.continuity_facts, '[]'::jsonb) AS continuity_facts
FROM novel_generation_jobs j
JOIN novel_chapter_block_revisions br ON br.job_id = j.id
JOIN novel_chapters original ON original.id = br.chapter_id
JOIN novel_projects p ON p.id = original.project_id
JOIN novel_bibles b ON b.project_id = p.id
LEFT JOIN novel_chapter_outlines o ON o.project_id = p.id AND o.chapter_no = original.chapter_no
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
        OR chapter_no <= original.chapter_no
        OR source = 'human'
      )
    ORDER BY created_at DESC
    LIMIT 80
  ) picked
) facts ON true
WHERE j.id = $1::uuid
  AND j.project_id = $2::uuid
  AND j.chapter_id = $3::uuid
  AND br.id = $4::uuid
  AND j.job_type = 'REVISE_CHAPTER_BLOCK'
  AND j.status = 'RUNNING'
  AND br.status = 'RUNNING'
  AND original.status = 'NEED_REVIEW';`;

const recordAiRunQuery = `-- Record one block revision AI run.
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

const markBlockRevisionSuggestedQuery = `-- Save the AI suggestion to the block revision record.
SELECT *
FROM mark_novel_chapter_block_revision_suggested(
  $1::uuid,
  $2::uuid,
  $3,
  NULLIF($4, ''),
  COALESCE(NULLIF($5, '')::jsonb, '[]'::jsonb),
  COALESCE(NULLIF($6::text, '')::boolean, FALSE),
  COALESCE(NULLIF($7, '')::jsonb, '{}'::jsonb)
);`;

const markBlockRevisionFailedQuery = `-- Mark the block revision record failed.
SELECT *
FROM mark_novel_chapter_block_revision_failed(
  $1::uuid,
  $2::uuid,
  $3
);`;

const markJobSucceededQuery = `-- Mark a block revision job succeeded.
UPDATE novel_generation_jobs
SET
  status = 'SUCCEEDED',
  error_message = NULL,
  finished_at = NOW(),
  updated_at = NOW()
WHERE id = $1::uuid
RETURNING *;`;

const markJobFailedQuery = `-- Mark a block revision job failed.
UPDATE novel_generation_jobs
SET
  status = 'FAILED',
  error_message = COALESCE(NULLIF($2, ''), '局部修订任务失败'),
  finished_at = NOW(),
  updated_at = NOW()
WHERE id = $1::uuid
RETURNING *;`;

const mergeBlockRevisionResponseCode = `// n8n Code node: Merge Block Revision GLM Response Context
const context = $('代码 - 构建局部修订 GLM请求').first().json;
const response = $json;
return [{json: {...context, llm_response: response}}];`;

const mergeBlockRevisionErrorCode = `// n8n Code node: Merge Block Revision GLM Error Context
const context = $('代码 - 构建局部修订 GLM请求').first().json;
const errorPayload = $json || {};
const errorMessage = errorPayload.error?.message
  || errorPayload.message
  || errorPayload.error?.description
  || errorPayload.description
  || '局部修订模型调用失败';
return [{json: {
  ...context,
  llm_response: errorPayload,
  llm_response_json: JSON.stringify(errorPayload),
  parsed_payload_json: '{}',
  error_message: String(errorMessage),
  ai_run_finished_at: new Date().toISOString(),
}}];`;

const blockRevisionWorkflow = workflowBase(
  'novelBlockRevisionV1Workflow19',
  '19_小说审核局部修订Worker',
  [
    executeWorkflowTriggerNode('execute-trigger-block-revision-19', '触发器 - 后台执行局部修订', [-1040, -460]),
    postgresNode(
      'postgres-claim-input-block-revision-19',
      '数据库 - 领取指定局部修订任务',
      [-820, -460],
      claimInputBlockRevisionQuery,
      '={{ [ $json.job_id || "" ] }}'
    ),

    manualNode('manual-block-revision-19', '手动触发 - 局部修订', [-1040, -280]),
    postgresNode('postgres-claim-block-revision-19', '数据库 - 领取局部修订任务', [-820, -280], claimBlockRevisionQuery),

    postgresNode(
      'postgres-read-block-revision-context-19',
      '数据库 - 读取局部修订上下文',
      [-600, -280],
      readBlockRevisionContextQuery,
      '={{ [ $json.job_id || $json.id, $json.project_id, $json.chapter_id, $json.revision_id ] }}'
    ),
    codeNode('code-build-block-revision-request-19', '代码 - 构建局部修订 GLM请求', [-380, -280], code('n8n/code/novel_build_block_revision_glm_request.js')),
    httpGlmNode('http-glm-block-revision-19', 'HTTP请求 - 调用GLM局部修订', [-160, -280], {continueErrorOutput: true}),
    codeNode('code-merge-block-revision-response-19', '代码 - 合并局部修订 GLM响应上下文', [60, -280], mergeBlockRevisionResponseCode),
    codeNode('code-merge-block-revision-error-19', '代码 - 合并局部修订 GLM错误上下文', [60, -20], mergeBlockRevisionErrorCode),
    codeNode('code-parse-block-revision-response-19', '代码 - 解析局部修订 GLM响应', [280, -280], code('n8n/code/novel_parse_block_revision_json.js')),
    ifNode('if-block-revision-parse-success-19', '条件判断 - 局部修订解析成功', [500, -280], '={{ $json.block_revision_parse_success }}', 'block-revision-parse-success'),

    postgresNode(
      'postgres-record-block-revision-ai-run-19',
      '数据库 - 记录局部修订 AI调用',
      [720, -360],
      recordAiRunQuery,
      '={{ [ $json.project_id, $json.original_chapter_id || $json.chapter_id, $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify($json.llm_request_body), $json.llm_response_json, $json.parsed_payload_json, true, "", $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
    ),
    postgresNode(
      'postgres-record-block-revision-ai-run-failed-19',
      '数据库 - 记录局部修订 AI调用失败',
      [720, -80],
      recordAiRunQuery,
      '={{ [ $json.project_id, $json.original_chapter_id || $json.chapter_id, $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify($json.llm_request_body), $json.llm_response_json, $json.parsed_payload_json, false, $json.error_message, $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
    ),
    postgresNode(
      'postgres-record-block-revision-http-ai-run-failed-19',
      '数据库 - 记录局部修订调用失败AI',
      [500, 120],
      recordAiRunQuery,
      '={{ [ $json.project_id, $json.original_chapter_id || $json.chapter_id, $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify($json.llm_request_body), $json.llm_response_json, $json.parsed_payload_json, false, $json.error_message, $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
    ),
    postgresNode(
      'postgres-save-block-revision-suggestion-19',
      '数据库 - 保存局部修订建议',
      [940, -360],
      markBlockRevisionSuggestedQuery,
      '={{ [ $("代码 - 解析局部修订 GLM响应").first().json.revision_id, $("代码 - 解析局部修订 GLM响应").first().json.job_id, $("代码 - 解析局部修订 GLM响应").first().json.replacement_text, $("代码 - 解析局部修订 GLM响应").first().json.change_summary, $("代码 - 解析局部修订 GLM响应").first().json.instruction_checklist_json, $("代码 - 解析局部修订 GLM响应").first().json.affects_later_text, $("代码 - 解析局部修订 GLM响应").first().json.parsed_payload_json ] }}'
    ),
    postgresNode(
      'postgres-mark-block-revision-failed-19',
      '数据库 - 标记局部修订失败',
      [940, -80],
      markBlockRevisionFailedQuery,
      '={{ [ $("代码 - 解析局部修订 GLM响应").first().json.revision_id || $json.revision_id, $("代码 - 解析局部修订 GLM响应").first().json.job_id || $json.job_id, $("代码 - 解析局部修订 GLM响应").first().json.error_message || $json.error_message ] }}'
    ),
    postgresNode(
      'postgres-mark-block-revision-http-failed-19',
      '数据库 - 标记局部修订调用失败',
      [500, -20],
      markBlockRevisionFailedQuery,
      '={{ [ $json.revision_id, $json.job_id, $json.error_message ] }}'
    ),
    postgresNode('postgres-mark-block-revision-success-19', '数据库 - 标记局部修订任务成功', [1160, -360], markJobSucceededQuery, '={{ [ $("代码 - 解析局部修订 GLM响应").first().json.job_id ] }}'),
    postgresNode('postgres-mark-block-revision-job-failed-19', '数据库 - 标记局部修订任务失败', [1160, -80], markJobFailedQuery, '={{ [ $("代码 - 解析局部修订 GLM响应").first().json.job_id || $json.job_id, $("代码 - 解析局部修订 GLM响应").first().json.error_message || $json.error_message ] }}'),
    postgresNode('postgres-mark-block-revision-http-job-failed-19', '数据库 - 标记局部修订调用任务失败', [720, -20], markJobFailedQuery, '={{ [ $json.job_id, $json.error_message ] }}'),

    sticky('note-block-revision-19', '说明 - 局部修订 worker', [-1040, -520], '领取 `REVISE_CHAPTER_BLOCK`，基于选区、上下文、Bible、事实和导演台生成局部建议。AI 输出只写入 `novel_chapter_block_revisions`，不直接改章节。'),
  ],
  {
    '触发器 - 后台执行局部修订': {main: [[{node: '数据库 - 领取指定局部修订任务', type: 'main', index: 0}]]},
    '数据库 - 领取指定局部修订任务': {main: [[{node: '数据库 - 读取局部修订上下文', type: 'main', index: 0}]]},

    '手动触发 - 局部修订': {main: [[{node: '数据库 - 领取局部修订任务', type: 'main', index: 0}]]},
    '数据库 - 领取局部修订任务': {main: [[{node: '数据库 - 读取局部修订上下文', type: 'main', index: 0}]]},

    '数据库 - 读取局部修订上下文': {main: [[{node: '代码 - 构建局部修订 GLM请求', type: 'main', index: 0}]]},
    '代码 - 构建局部修订 GLM请求': {main: [[{node: 'HTTP请求 - 调用GLM局部修订', type: 'main', index: 0}]]},
    'HTTP请求 - 调用GLM局部修订': {main: [[{node: '代码 - 合并局部修订 GLM响应上下文', type: 'main', index: 0}], [{node: '代码 - 合并局部修订 GLM错误上下文', type: 'main', index: 0}]]},
    '代码 - 合并局部修订 GLM响应上下文': {main: [[{node: '代码 - 解析局部修订 GLM响应', type: 'main', index: 0}]]},
    '代码 - 合并局部修订 GLM错误上下文': {main: [[
      {node: '数据库 - 记录局部修订调用失败AI', type: 'main', index: 0},
      {node: '数据库 - 标记局部修订调用失败', type: 'main', index: 0},
      {node: '数据库 - 标记局部修订调用任务失败', type: 'main', index: 0},
    ]]},
    '代码 - 解析局部修订 GLM响应': {main: [[{node: '条件判断 - 局部修订解析成功', type: 'main', index: 0}]]},
    '条件判断 - 局部修订解析成功': {main: [[{node: '数据库 - 记录局部修订 AI调用', type: 'main', index: 0}], [{node: '数据库 - 记录局部修订 AI调用失败', type: 'main', index: 0}]]},
    '数据库 - 记录局部修订 AI调用': {main: [[{node: '数据库 - 保存局部修订建议', type: 'main', index: 0}]]},
    '数据库 - 保存局部修订建议': {main: [[{node: '数据库 - 标记局部修订任务成功', type: 'main', index: 0}]]},
    '数据库 - 记录局部修订 AI调用失败': {main: [[{node: '数据库 - 标记局部修订失败', type: 'main', index: 0}]]},
    '数据库 - 标记局部修订失败': {main: [[{node: '数据库 - 标记局部修订任务失败', type: 'main', index: 0}]]},
  }
);

const outputs = [
  ['n8n/workflow/19_novel_block_revision_workflow.json', blockRevisionWorkflow],
  ['n8n/workflow/available/19_novel_block_revision_workflow.json', blockRevisionWorkflow],
];

for (const [relativePath, workflow] of outputs) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), {recursive: true});
  fs.writeFileSync(fullPath, `${JSON.stringify(workflow, null, 2)}\n`);
  console.log(`Generated ${relativePath}`);
}
