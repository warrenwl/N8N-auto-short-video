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

assert.strictEqual(webhooks.length, 7, '16 should expose list, detail, assistant, action, manual edit, and block revision webhooks');
assertWebhook('Webhook - 小说审核列表', 'GET', 'novel-review-list');
assertWebhook('Webhook - 小说审核详情', 'GET', 'novel-review-detail');
assertWebhook('Webhook - 小说审稿助手', 'POST', 'novel-review-assistant');
assertWebhook('Webhook - 小说审核动作', 'POST', 'novel-review-action');
assertWebhook('Webhook - 小说审核人工改稿', 'POST', 'novel-review-manual-edit');
assertWebhook('Webhook - 小说审核局部修订', 'POST', 'novel-review-block-revise');
assertWebhook('Webhook - 小说审核局部修订确认', 'POST', 'novel-review-block-apply');
assert(!webhooks.some((node) => node.parameters.path === 'novel-review-assistant' && node.parameters.httpMethod === 'GET'), 'novel-review-assistant must not be reachable by GET');
assert(!webhooks.some((node) => node.parameters.path === 'novel-review-action' && node.parameters.httpMethod === 'GET'), 'novel-review-action must not be reachable by GET');
assert(!webhooks.some((node) => node.parameters.path === 'novel-review-manual-edit' && node.parameters.httpMethod === 'GET'), 'novel-review-manual-edit must not be reachable by GET');
assert(!webhooks.some((node) => node.parameters.path === 'novel-review-block-revise' && node.parameters.httpMethod === 'GET'), 'novel-review-block-revise must not be reachable by GET');
assert(!webhooks.some((node) => node.parameters.path === 'novel-review-block-apply' && node.parameters.httpMethod === 'GET'), 'novel-review-block-apply must not be reachable by GET');

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
assert(renderCode.includes('/webhook/novel-review-assistant'), 'review assistant target missing');
assert(renderCode.includes('/webhook/novel-review-manual-edit'), 'review manual edit target missing');
assert(renderCode.includes('/webhook/novel-review-block-revise'), 'review block revision request target missing');
assert(renderCode.includes('/webhook/novel-review-block-apply'), 'review block revision apply target missing');
assert(renderCode.includes('人工改稿'), 'review detail should expose manual edit drawer');
assert(renderCode.includes('data-block-reader'), 'review detail should render paragraph reader for block revision');
assert(renderCode.includes('data-selection-toolbar'), 'review detail should expose selection toolbar for block revision');
assert(renderCode.includes('跨章承接分析'), 'review detail should show cross-chapter transition analysis');
assert(renderCode.includes('data-review-manual-edit'), 'review detail should submit manual edit through inline drawer form');
assert(renderCode.includes('review-assistant-panel') && renderCode.includes('data-selection-assistant'), 'review detail should expose the assistant side panel and selection ask action');
assert(renderCode.includes('syncSelectionContext') && renderCode.includes('data-selection-manual-edit'), 'review detail should share selection across assistant/revision and keep a compact selection toolbar');
assert(renderCode.includes('block-flow-steps') && renderCode.includes('block-revision-group'), 'block revision workbench should use grouped four-step layout');
assert(renderCode.includes('data-polish-block-instruction') && renderCode.includes('data-block-risk-assistant'), 'block revision workbench should bridge instruction polishing and continuity risk checks to assistant');
assert(renderCode.includes('launcher-rerun-form') && renderCode.includes('rerun-review-button'), 'review detail should expose rerun review as a top-level launcher action');
assert(!renderCode.includes('改稿与依据'), 'review decision drawer should not keep duplicate support actions');
assert(renderCode.includes('保存继续修改'), 'review detail should allow saving manual edits without smart review');
assert(renderCode.includes('data-inline-edit-form'), 'review detail should support double-click inline paragraph editing');
assert(renderCode.includes("decision', 'save_only"), 'inline paragraph edits should save without smart review');
assert(!renderCode.includes('确认保存这段修改'), 'inline save-only edits should not show a second confirmation dialog');
assert(renderCode.includes('review-paragraph-${paragraphNo}') && renderCode.includes('rememberReviewSaveScroll') && renderCode.includes('restoreReviewSaveScroll'), 'inline save-only edits should restore the reader position without animated anchor scrolling');
assert(renderCode.includes('paragraphNoFromTextareaCaret') && renderCode.includes('viewportTop'), 'manual body saves should restore the paragraph around the edit caret');
assert(!renderCode.includes('scroll-behavior: smooth'), 'review detail saves should not trigger animated page scrolling');
assert(renderCode.includes('保存并重新审稿'), 'review detail should allow edited text to go back through smart review');
assert(renderCode.includes('改稿并直接通过'), 'review detail should allow direct approval after manual edit');
assert(renderCode.includes("form.dataset.pendingDecision || 'save_only'"), 'manual edit submit should default to save-only instead of resubmit');
assert(renderCode.includes("form.getAttribute('action')"), 'review forms should read the HTML action attribute instead of the form.action property shadowed by action buttons');
assert(renderCode.includes('fetch(formPostUrl(form)'), 'review forms should submit inline and avoid secondary result pages in the browser');
assert(renderCode.includes("window.location.href = targetHref"), 'review forms should navigate to the correct post-action target after successful action');
assert(!/href=["'][^"']*(novel-review-action|novel-review-manual-edit)/i.test(renderCode), 'review actions must not be GET links');
assert(!/href=["'][^"']*(novel-review-block-revise|novel-review-block-apply)/i.test(renderCode), 'block revision actions must not be GET links');

const validateCode = nodes.get('代码 - 校验小说审核动作').parameters.jsCode;
assert(validateCode.includes('审核动作必须通过 POST body 提交'), 'action validator should reject non-POST body input');
assert(validateCode.includes('review_token'), 'action validator should require review_token');

const manualValidateCode = nodes.get('代码 - 校验小说审核人工改稿').parameters.jsCode;
assert(manualValidateCode.includes('审核改稿必须通过 POST body 提交'), 'manual edit validator should reject non-POST body input');
assert(manualValidateCode.includes('review_token'), 'manual edit validator should require review_token');
assert(manualValidateCode.includes('RESUBMIT') && manualValidateCode.includes('SAVE_ONLY') && manualValidateCode.includes('APPROVE'), 'manual edit validator should normalize save-only, submit, and approve decisions');
assert(manualValidateCode.includes("body.manual_decision || 'save_only'"), 'manual edit validator should default missing decisions to save-only');

const actionQuery = nodes.get('数据库 - 执行小说审核动作').parameters.query;
assert(actionQuery.includes('apply_novel_review_action'), 'action workflow should call apply_novel_review_action');
assert(actionQuery.includes('$1::uuid'), 'action workflow should pass chapter_id as uuid parameter');
assert(actionQuery.includes('$2'), 'action workflow should pass review_token as parameter');

const manualEditQuery = nodes.get('数据库 - 保存审核人工改稿').parameters.query;
assert(manualEditQuery.includes('apply_novel_review_manual_edit'), 'manual edit workflow should call apply_novel_review_manual_edit');
assert(manualEditQuery.includes('$1::uuid'), 'manual edit workflow should pass chapter_id as uuid parameter');
assert(manualEditQuery.includes('$8'), 'manual edit workflow should pass manual decision as a parameter');
assert(manualEditQuery.includes('SELECT result.*'), 'manual edit workflow should return the function result including the new candidate review token');

const blockRequestQuery = nodes.get('数据库 - 创建局部修订任务').parameters.query;
assert(blockRequestQuery.includes('request_novel_chapter_block_revision'), 'block revision workflow should create a block revision request');
assert(blockRequestQuery.includes('$1::uuid') && blockRequestQuery.includes('$15'), 'block revision request should pass typed anchor parameters');

const blockApplyQuery = nodes.get('数据库 - 应用局部修订').parameters.query;
assert(blockApplyQuery.includes('apply_novel_chapter_block_revision'), 'block revision apply workflow should call apply function');
assert(blockApplyQuery.includes('$1::uuid') && blockApplyQuery.includes('$5'), 'block revision apply should pass typed parameters');
assert(
  blockApplyQuery.includes('SELECT *') && blockApplyQuery.includes('apply_novel_chapter_block_revision'),
  'block revision apply should rely on the SQL function result, including the current review token'
);

const resultCode = nodes.get('代码 - 生成小说审核动作结果页').parameters.jsCode;
assert(resultCode.includes('小说审核操作成功'), 'action result page should show success state');
assert(resultCode.includes('小说审核操作未生效'), 'action result page should show no-op/failure state');
assert(
  resultCode.includes('后台重写任务会立即启动'),
  'rewrite action result should make the async rewrite launch visible to the user'
);
assert(
  resultCode.includes('智能审稿任务'),
  'rerun review action result should tell the user that AI review was queued'
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
const prepareReviewCode = nodes.get('代码 - 准备异步启动智能审稿').parameters.jsCode;
assert(
  prepareReviewCode.includes('RERUN_REVIEW') &&
    prepareReviewCode.includes('next_job_id') &&
    prepareReviewCode.includes('should_launch_review_worker'),
  '16 should prepare an async review worker launch only for manual rerun requests'
);
assert.strictEqual(
  nodes.get('执行子流程 - 异步智能审稿').parameters.workflowId,
  'novelAiReviewV1Workflow15',
  '16 should launch the AI review worker after creating a rerun review job'
);
assert.strictEqual(
  nodes.get('执行子流程 - 异步智能审稿').parameters.options.waitForSubWorkflow,
  false,
  '16 should not block the review action response on an AI review rerun'
);
assert.deepStrictEqual(
  (review.connections?.['数据库 - 执行小说审核动作']?.main?.[0] || []).map((connection) => connection.node),
  ['代码 - 生成小说审核动作结果页', '代码 - 准备异步启动重写任务', '代码 - 准备异步启动智能审稿'],
  '16 should return the action result and launch follow-up workers in parallel'
);
assert.deepStrictEqual(
  (review.connections?.['条件判断 - 需要启动重写任务']?.main?.[0] || []).map((connection) => connection.node),
  ['执行子流程 - 异步重写章节'],
  '16 should execute workflow 17 only when a rewrite job was created'
);
assert.deepStrictEqual(
  (review.connections?.['条件判断 - 需要启动智能审稿']?.main?.[0] || []).map((connection) => connection.node),
  ['执行子流程 - 异步智能审稿'],
  '16 should execute workflow 15 only when a rerun review job was created'
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
assert.deepStrictEqual(
  (review.connections?.['数据库 - 创建局部修订任务']?.main?.[0] || []).map((connection) => connection.node),
  ['代码 - 生成局部修订请求结果页', '代码 - 准备异步启动局部修订任务'],
  '16 should return block request result and launch worker in parallel'
);
assert.strictEqual(
  nodes.get('执行子流程 - 异步局部修订').parameters.workflowId,
  'novelBlockRevisionV1Workflow19',
  '16 should launch workflow 19 after creating a block revision job'
);
assert.deepStrictEqual(
  (review.connections?.['数据库 - 应用局部修订']?.main?.[0] || []).map((connection) => connection.node),
  ['代码 - 生成局部修订确认结果页', '代码 - 准备确认后异步任务'],
  '16 should return block apply result and prepare follow-up workers'
);

console.log(JSON.stringify({
  result: 'phase5_workflow_static_tdd_passed',
  workflowCount: workflowFiles.length,
  listWebhook: 'GET /webhook/novel-review-list',
  detailWebhook: 'GET /webhook/novel-review-detail',
  assistantWebhook: 'POST /webhook/novel-review-assistant',
  actionWebhook: 'POST /webhook/novel-review-action',
  manualEditWebhook: 'POST /webhook/novel-review-manual-edit',
  blockRevisionWebhook: 'POST /webhook/novel-review-block-revise',
  blockApplyWebhook: 'POST /webhook/novel-review-block-apply',
  actionSql: 'apply_novel_review_action',
}, null, 2));
