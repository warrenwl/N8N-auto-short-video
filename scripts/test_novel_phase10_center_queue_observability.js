#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function nodesByName(workflow) {
  return new Map((workflow.nodes || []).map((node) => [node.name, node]));
}

function nodesByType(workflow, type) {
  return (workflow.nodes || []).filter((node) => node.type === type);
}

function runCodeNode(relativePath, rows) {
  const source = read(relativePath);
  const script = new vm.Script(`(function() {\n${source}\n})()`, {filename: relativePath});
  const sandbox = {
    $input: {
      all: () => rows.map((json) => ({json})),
    },
    Intl,
    Date,
    Number,
    String,
    Array,
    JSON,
    encodeURIComponent,
  };
  vm.createContext(sandbox);
  return script.runInContext(sandbox);
}

function visibleText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const rawWorkflow = readJson('n8n/workflow/11_novel_center_workflow.json');
const availableWorkflow = readJson('n8n/workflow/available/11_novel_center_workflow.json');
assert.strictEqual(
  JSON.stringify(rawWorkflow),
  JSON.stringify(availableWorkflow),
  '11 root and available workflow copies should match'
);

const nodes = nodesByName(rawWorkflow);
const webhooks = nodesByType(rawWorkflow, 'n8n-nodes-base.webhook');

assert.strictEqual(nodes.get('Webhook - 小说工作台')?.parameters?.httpMethod, 'GET', 'workbench must stay read-only GET');
assert.strictEqual(nodes.get('Webhook - 小说项目列表')?.parameters?.httpMethod, 'GET', 'project list must stay read-only GET');
assert.strictEqual(nodes.get('Webhook - 创建小说项目')?.parameters?.httpMethod, 'POST', 'project create must stay POST');
assert.strictEqual(nodes.get('Webhook - 小说队列状态')?.parameters?.httpMethod, 'GET', 'queue status page must be GET');
assert.strictEqual(nodes.get('Webhook - 小说队列状态')?.parameters?.path, 'novel-queue-status', 'queue status path should be novel-queue-status');
assert(!webhooks.some((node) => node.parameters.path === 'novel-queue-status' && node.parameters.httpMethod !== 'GET'), 'queue status must not expose mutating methods');

const projectQuery = nodes.get('数据库 - 查询小说项目列表')?.parameters?.query || '';
for (const expected of [
  'latest_job_type',
  'latest_job_status',
  'waiting_job_count',
  'running_job_count',
  'failed_job_count',
  'need_review_chapter_id',
  'need_review_token',
  'latest_ai_run_type',
  'latest_ai_duration_ms',
  'novel_generation_jobs',
  'novel_ai_runs',
]) {
  assert(projectQuery.includes(expected), `project center query should expose: ${expected}`);
}

const queueQuery = nodes.get('数据库 - 查询小说队列状态')?.parameters?.query || '';
for (const expected of [
  'novel_generation_jobs',
  'novel_projects',
  'novel_chapters',
  'novel_ai_runs',
  'queue_total_count',
  'queue_waiting_count',
  'queue_running_count',
  'queue_failed_count',
]) {
  assert(queueQuery.includes(expected), `queue status query should expose: ${expected}`);
}

const centerCode = read('n8n/code/novel_render_center_html.js');
for (const expected of ['队列状态', '最近任务', '最近调用', '失败任务', '需要处理的项目', '生成设定集']) {
  assert(centerCode.includes(expected), `center renderer should include Chinese marker: ${expected}`);
}
assert(!centerCode.includes('Bible'), 'center renderer should not use visible English word Bible');
assert(!centerCode.includes('AI '), 'center renderer should not use visible English label AI');

const queueCode = read('n8n/code/novel_render_queue_status_html.js');
for (const expected of ['小说队列状态', '只读页面', '待处理', '运行中', '已失败', '生成设定集', '智能审稿']) {
  assert(queueCode.includes(expected), `queue renderer should include Chinese marker: ${expected}`);
}
assert(!queueCode.includes('Bible'), 'queue renderer should not use visible English word Bible');
assert(!queueCode.includes('AI '), 'queue renderer should not use visible English label AI');

const forbiddenVisibleTokens = /\b(PENDING|RUNNING|SUCCEEDED|FAILED|CANCELLED|GENERATE_BIBLE|GENERATE_OUTLINE|GENERATE_CHAPTER|REVIEW_CHAPTER|REWRITE_CHAPTER|NOTIFY_REVIEW|CREATED|BIBLE_READY|OUTLINE_READY|WRITING|REVIEWING|PAUSED|COMPLETED|Bible|AI)\b/;

const centerHtml = runCodeNode('n8n/code/novel_render_center_html.js', [{
  id: '11111111-1111-1111-1111-111111111111',
  title: '逆光回响',
  genre: '都市逆袭',
  audience: '中文读者',
  target_total_chapters: 10,
  current_chapter_no: 3,
  status: 'WRITING',
  waiting_job_count: 2,
  running_job_count: 1,
  failed_job_count: 1,
  need_review_count: 1,
  approved_chapter_count: 3,
  latest_job_type: 'REVIEW_CHAPTER',
  latest_job_status: 'FAILED',
  latest_job_attempt_count: 2,
  latest_job_error_message: '模型返回为空',
  latest_job_updated_at: '2026-05-03T01:00:00.000Z',
  latest_ai_run_type: 'GENERATE_CHAPTER',
  latest_ai_success: true,
  latest_ai_duration_ms: 12345,
  latest_ai_created_at: '2026-05-03T00:59:00.000Z',
  need_review_chapter_id: '22222222-2222-2222-2222-222222222222',
  need_review_token: 'phase10-token',
  need_review_chapter_no: 4,
  need_review_chapter_title: '雨夜重逢',
  updated_at: '2026-05-03T01:02:00.000Z',
}])[0].json.response_html;
const centerText = visibleText(centerHtml);
for (const expected of ['小说工作台', '队列状态', '最近任务', '智能审稿', '已失败', '最近调用', '生成章节', '需要处理的项目']) {
  assert(centerText.includes(expected), `center page visible text should include Chinese text: ${expected}`);
}
assert(!forbiddenVisibleTokens.test(centerText), `center page visible text should not expose raw English status/type: ${centerText}`);

const queueHtml = runCodeNode('n8n/code/novel_render_queue_status_html.js', [{
  is_empty: false,
  queue_total_count: 8,
  queue_waiting_count: 3,
  queue_running_count: 1,
  queue_failed_count: 2,
  queue_succeeded_today_count: 4,
  job_id: '33333333-3333-3333-3333-333333333333',
  project_title: '逆光回响',
  chapter_no: 4,
  chapter_title: '雨夜重逢',
  job_type: 'GENERATE_BIBLE',
  status: 'PENDING',
  attempt_count: 0,
  max_attempts: 3,
  error_message: '',
  created_at: '2026-05-03T01:00:00.000Z',
  updated_at: '2026-05-03T01:00:00.000Z',
  latest_ai_run_type: 'REVIEW_CHAPTER',
  latest_ai_success: false,
  latest_ai_duration_ms: 45678,
}])[0].json.response_html;
const queueText = visibleText(queueHtml);
for (const expected of ['小说队列状态', '只读页面', '待处理', '生成设定集', '智能审稿', '最近调用']) {
  assert(queueText.includes(expected), `queue page visible text should include Chinese text: ${expected}`);
}
assert(!forbiddenVisibleTokens.test(queueText), `queue page visible text should not expose raw English status/type: ${queueText}`);
assert(!queueHtml.includes('method="POST"'), 'queue status page must not expose POST forms');

const runbook = read('docs/novel_workflow/运行手册.md');
assert(runbook.includes('Phase 10 只读队列状态页'), 'runbook should document Phase 10 queue status page');
assert(runbook.includes('/webhook/novel-queue-status'), 'runbook should document queue status URL');

console.log(JSON.stringify({
  result: 'phase10_center_queue_observability_tdd_passed',
  center: 'GET /webhook/novel-center',
  queue: 'GET /webhook/novel-queue-status',
  displayLanguage: '状态与任务类型中文展示',
}, null, 2));
