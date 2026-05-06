#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const workflowFiles = [
  'n8n/workflow/16_novel_review_workflow.json',
  'n8n/workflow/available/16_novel_review_workflow.json',
];

function readWorkflow(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(fullPath), `Missing workflow file: ${relativePath}`);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function nodesByName(workflow) {
  return new Map((workflow.nodes || []).map((node) => [node.name, node]));
}

function nodesByType(workflow, type) {
  return (workflow.nodes || []).filter((node) => node.type === type);
}

function assertPostgresCredentials(workflow) {
  for (const node of nodesByType(workflow, 'n8n-nodes-base.postgres')) {
    assert.strictEqual(node.credentials?.postgres?.id, 'postgresVideoAgent', `${workflow.name}/${node.name} should use Postgres video_agent credential id`);
    assert.strictEqual(node.credentials?.postgres?.name, 'Postgres video_agent', `${workflow.name}/${node.name} should use Postgres video_agent credential name`);
  }
}

function assertNoUnsafePlaceholderComments(workflow) {
  for (const node of nodesByType(workflow, 'n8n-nodes-base.postgres')) {
    if (!node.parameters?.options?.queryReplacement) continue;
    assert(
      !/(^|\n)\s*--\s*\$\d+\b/.test(node.parameters.query || ''),
      `${workflow.name}/${node.name} must not mention queryReplacement placeholders in SQL comments`
    );
  }
}

function assertCodeSyntax(workflow) {
  for (const node of nodesByType(workflow, 'n8n-nodes-base.code')) {
    assert.doesNotThrow(() => {
      new Function('$json', '$input', '$env', 'require', '$', node.parameters.jsCode || '');
    }, `${workflow.name}/${node.name} has invalid JavaScript`);
  }
}

const workflows = Object.fromEntries(workflowFiles.map((file) => [file, readWorkflow(file)]));

for (const [file, workflow] of Object.entries(workflows)) {
  assert(workflow.name, `${file} missing workflow name`);
  assert(Array.isArray(workflow.nodes) && workflow.nodes.length > 0, `${file} should have nodes`);
  assert(workflow.connections && typeof workflow.connections === 'object', `${file} should have connections`);
  assertPostgresCredentials(workflow);
  assertNoUnsafePlaceholderComments(workflow);
  assertCodeSyntax(workflow);
}

assert.strictEqual(
  JSON.stringify(workflows['n8n/workflow/16_novel_review_workflow.json']),
  JSON.stringify(workflows['n8n/workflow/available/16_novel_review_workflow.json']),
  '16 root and available copies should match'
);

const review = workflows['n8n/workflow/16_novel_review_workflow.json'];
const nodes = nodesByName(review);
const webhooks = nodesByType(review, 'n8n-nodes-base.webhook');

function assertWebhook(name, method, webhookPath) {
  const node = nodes.get(name);
  assert(node, `Missing webhook node: ${name}`);
  assert.strictEqual(node.parameters.httpMethod, method, `${name} should use ${method}`);
  assert.strictEqual(node.parameters.path, webhookPath, `${name} should use path ${webhookPath}`);
  assert.strictEqual(node.parameters.responseMode, 'responseNode', `${name} should respond through response node`);
}

assert.strictEqual(webhooks.length, 4, '16 should expose list, detail, action, and manual edit webhooks');
assertWebhook('Webhook - 小说审核列表', 'GET', 'novel-review-list');
assertWebhook('Webhook - 小说审核详情', 'GET', 'novel-review-detail');
assertWebhook('Webhook - 小说审核动作', 'POST', 'novel-review-action');
assertWebhook('Webhook - 小说审核人工改稿', 'POST', 'novel-review-manual-edit');
assert(!webhooks.some((node) => node.parameters.path === 'novel-review-action' && node.parameters.httpMethod === 'GET'), 'novel-review-action must not be reachable by GET');
assert(!webhooks.some((node) => node.parameters.path === 'novel-review-manual-edit' && node.parameters.httpMethod === 'GET'), 'novel-review-manual-edit must not be reachable by GET');

assert(
  nodes.get('数据库 - 查询待审章节列表').parameters.query.includes("c.status = 'NEED_REVIEW'"),
  'review list should only query NEED_REVIEW candidate chapters'
);
assert(
  nodes.get('数据库 - 查询待审章节列表').parameters.query.includes('LEFT JOIN novel_chapter_outlines co') &&
    nodes.get('数据库 - 查询待审章节列表').parameters.query.includes('c.created_at >= co.updated_at'),
  'review list should hide chapters generated before the current outline update'
);
assert(
  nodes.get('数据库 - 查询待审章节列表').parameters.query.includes('newer.generation_version > c.generation_version') &&
    nodes.get('数据库 - 查询待审章节详情').parameters.query.includes('newer.generation_version > c.generation_version'),
  'review list and detail should hide older same-chapter review candidates when a newer one exists'
);
assert(
  nodes.get('数据库 - 查询待审章节列表').parameters.query.includes('review_token'),
  'review list should include review_token for POST forms'
);
assert(
  nodes.get('数据库 - 查询待审章节详情').parameters.query.includes('review_token ='),
  'review detail should validate review_token'
);
assert(
  nodes.get('数据库 - 查询待审章节详情').parameters.query.includes("ai.parsed_payload->'cross_chapter_transition_review'") &&
    nodes.get('数据库 - 查询待审章节列表').parameters.query.includes("ai.parsed_payload->'cross_chapter_transition_review'") &&
    nodes.get('数据库 - 查询待审章节详情').parameters.query.includes('NULL::jsonb AS cross_chapter_transition_review') &&
    nodes.get('数据库 - 查询待审章节列表').parameters.query.includes('NULL::jsonb AS cross_chapter_transition_review'),
  'review pages should expose AI cross-chapter transition analysis from the stored AI run payload'
);
assert(
  nodes.get('数据库 - 查询待审章节详情').parameters.query.includes('c.created_at >= co.updated_at'),
  'review detail should reject stale review links from old outlines'
);

const renderCode = nodes.get('代码 - 生成小说审核页面').parameters.jsCode;
assert(renderCode.includes('method="POST"'), 'review forms must use POST');
assert(renderCode.includes('/webhook/novel-review-action'), 'review action target missing');
assert(renderCode.includes('/webhook/novel-review-manual-edit'), 'review manual edit target missing');
assert(renderCode.includes('人工改稿'), 'review detail should expose manual edit drawer');
assert(renderCode.includes('跨章承接分析'), 'review detail should show cross-chapter transition analysis');
assert(renderCode.includes('data-review-manual-edit'), 'review detail should submit manual edit through inline drawer form');
assert(renderCode.includes('保存改稿并送审'), 'review detail should allow edited text to go back through smart review');
assert(renderCode.includes('改稿并直接通过'), 'review detail should allow direct approval after manual edit');
assert(renderCode.includes("form.getAttribute('action')"), 'review forms should read the HTML action attribute instead of the form.action property shadowed by action buttons');
assert(renderCode.includes('fetch(formPostUrl(form)'), 'review forms should submit inline and avoid secondary result pages in the browser');
assert(renderCode.includes("window.location.href = '/webhook/novel-review-list'"), 'review forms should return to the review list after successful action');
assert(!/href=["'][^"']*(novel-review-action|novel-review-manual-edit)/i.test(renderCode), 'review actions must not be GET links');

const validateCode = nodes.get('代码 - 校验小说审核动作').parameters.jsCode;
assert(validateCode.includes('审核动作必须通过 POST body 提交'), 'action validator should reject non-POST body input');
assert(validateCode.includes('review_token'), 'action validator should require review_token');

const manualValidateCode = nodes.get('代码 - 校验小说审核人工改稿').parameters.jsCode;
assert(manualValidateCode.includes('审核改稿必须通过 POST body 提交'), 'manual edit validator should reject non-POST body input');
assert(manualValidateCode.includes('review_token'), 'manual edit validator should require review_token');
assert(manualValidateCode.includes('RESUBMIT') && manualValidateCode.includes('APPROVE'), 'manual edit validator should normalize submit and approve decisions');

const actionQuery = nodes.get('数据库 - 执行小说审核动作').parameters.query;
assert(actionQuery.includes('apply_novel_review_action'), 'action workflow should call apply_novel_review_action');
assert(actionQuery.includes('$1::uuid'), 'action workflow should pass chapter_id as uuid parameter');
assert(actionQuery.includes('$2'), 'action workflow should pass review_token as parameter');

const manualEditQuery = nodes.get('数据库 - 保存审核人工改稿').parameters.query;
assert(manualEditQuery.includes('apply_novel_review_manual_edit'), 'manual edit workflow should call apply_novel_review_manual_edit');
assert(manualEditQuery.includes('$1::uuid'), 'manual edit workflow should pass chapter_id as uuid parameter');
assert(manualEditQuery.includes('$8'), 'manual edit workflow should pass manual decision as a parameter');

const resultCode = nodes.get('代码 - 生成小说审核动作结果页').parameters.jsCode;
assert(resultCode.includes('小说审核操作成功'), 'action result page should show success state');
assert(resultCode.includes('小说审核操作未生效'), 'action result page should show no-op/failure state');
assert(
  resultCode.includes('后台重写任务会立即启动'),
  'rewrite action result should make the async rewrite launch visible to the user'
);

const prepareRewriteCode = nodes.get('代码 - 准备异步启动重写任务').parameters.jsCode;
assert(
  prepareRewriteCode.includes('REQUEST_REWRITE') &&
    prepareRewriteCode.includes('rewrite_job_id') &&
    prepareRewriteCode.includes('should_launch_rewrite_worker'),
  '16 should prepare an async rewrite worker launch only for successful rewrite requests'
);
assert.strictEqual(
  nodes.get('执行子流程 - 异步重写章节').parameters.workflowId,
  'novelRewriteNotifyV1Workflow17',
  '16 should launch the rewrite/notify worker after creating a rewrite job'
);
assert.strictEqual(
  nodes.get('执行子流程 - 异步重写章节').parameters.options.waitForSubWorkflow,
  false,
  '16 should not block the review action response on a model rewrite'
);
assert.deepStrictEqual(
  (review.connections?.['数据库 - 执行小说审核动作']?.main?.[0] || []).map((connection) => connection.node),
  ['代码 - 生成小说审核动作结果页', '代码 - 准备异步启动重写任务'],
  '16 should return the action result and launch rewrite in parallel'
);
assert.deepStrictEqual(
  (review.connections?.['条件判断 - 需要启动重写任务']?.main?.[0] || []).map((connection) => connection.node),
  ['执行子流程 - 异步重写章节'],
  '16 should execute workflow 17 only when a rewrite job was created'
);
assert.deepStrictEqual(
  (review.connections?.['Webhook - 小说审核人工改稿']?.main?.[0] || []).map((connection) => connection.node),
  ['代码 - 校验小说审核人工改稿'],
  '16 should route manual edit POST into its validator'
);
assert.deepStrictEqual(
  (review.connections?.['数据库 - 保存审核人工改稿']?.main?.[0] || []).map((connection) => connection.node),
  ['代码 - 生成审核人工改稿结果页'],
  '16 should render a result response for manual edits as a POST fallback'
);

console.log(JSON.stringify({
  result: 'phase5_workflow_static_tdd_passed',
  workflowCount: workflowFiles.length,
  listWebhook: 'GET /webhook/novel-review-list',
  detailWebhook: 'GET /webhook/novel-review-detail',
  actionWebhook: 'POST /webhook/novel-review-action',
  manualEditWebhook: 'POST /webhook/novel-review-manual-edit',
  actionSql: 'apply_novel_review_action',
}, null, 2));
