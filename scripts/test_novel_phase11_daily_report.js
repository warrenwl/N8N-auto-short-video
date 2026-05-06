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

const workflow = readJson('n8n/workflow/11_novel_center_workflow.json');
const available = readJson('n8n/workflow/available/11_novel_center_workflow.json');
assert.strictEqual(JSON.stringify(workflow), JSON.stringify(available), '11 root and available workflow copies should match');

const nodes = nodesByName(workflow);
const webhooks = nodesByType(workflow, 'n8n-nodes-base.webhook');

assert.strictEqual(nodes.get('Webhook - 小说运行日报')?.parameters?.httpMethod, 'GET', 'daily report page must be GET');
assert.strictEqual(nodes.get('Webhook - 小说运行日报')?.parameters?.path, 'novel-daily-report', 'daily report path should be novel-daily-report');
assert(!webhooks.some((node) => node.parameters.path === 'novel-daily-report' && node.parameters.httpMethod !== 'GET'), 'daily report must not expose mutating methods');

const reportQuery = nodes.get('数据库 - 查询小说运行日报')?.parameters?.query || '';
for (const expected of [
  'report_date',
  'today_job_total_count',
  'today_job_succeeded_count',
  'today_job_failed_count',
  'today_ai_run_count',
  'today_ai_success_count',
  'today_ai_failed_count',
  'avg_ai_duration_ms',
  'waiting_job_count',
  'running_job_count',
  'need_review_count',
  'latest_failed_jobs',
  'novel_generation_jobs',
  'novel_ai_runs',
  'novel_chapters',
]) {
  assert(reportQuery.includes(expected), `daily report query should expose: ${expected}`);
}

const centerCode = read('n8n/code/novel_render_center_html.js');
const queueCode = read('n8n/code/novel_render_queue_status_html.js');
for (const [name, code] of [['center', centerCode], ['queue', queueCode]]) {
  assert(code.includes('运行日报'), `${name} page should link to daily report with Chinese text`);
  assert(code.includes('/webhook/novel-daily-report'), `${name} page should link to daily report URL`);
}

const reportCode = read('n8n/code/novel_render_daily_report_html.js');
for (const expected of ['小说运行日报', '只读日报', '调度策略', '今日任务', '模型调用', '失败摘要', '待人工审核', '建议每十分钟执行一轮队列']) {
  assert(reportCode.includes(expected), `daily report renderer should include Chinese marker: ${expected}`);
}
assert(!reportCode.includes('Bible'), 'daily report renderer should not use visible English word Bible');
assert(!reportCode.includes('AI '), 'daily report renderer should not use visible English label AI');

const forbiddenVisibleTokens = /\b(PENDING|RUNNING|SUCCEEDED|FAILED|CANCELLED|GENERATE_BIBLE|GENERATE_OUTLINE|GENERATE_CHAPTER|REVIEW_CHAPTER|REWRITE_CHAPTER|NOTIFY_REVIEW|CREATED|BIBLE_READY|OUTLINE_READY|WRITING|REVIEWING|PAUSED|COMPLETED|Bible|AI)\b/;

const html = runCodeNode('n8n/code/novel_render_daily_report_html.js', [{
  is_empty: false,
  report_date: '2026-05-03',
  today_job_total_count: 12,
  today_job_succeeded_count: 8,
  today_job_failed_count: 2,
  today_job_cancelled_count: 1,
  today_ai_run_count: 6,
  today_ai_success_count: 5,
  today_ai_failed_count: 1,
  avg_ai_duration_ms: 45678,
  max_ai_duration_ms: 98765,
  waiting_job_count: 3,
  running_job_count: 1,
  failed_job_count: 2,
  need_review_count: 4,
  active_project_count: 5,
  completed_project_count: 2,
  latest_failed_jobs: '[{"project_title":"逆光回响","chapter_no":4,"chapter_title":"雨夜重逢","job_type":"REVIEW_CHAPTER","status":"FAILED","error_message":"模型返回为空","updated_at":"2026-05-03T01:00:00.000Z"}]',
  slow_ai_runs: '[{"project_title":"逆光回响","chapter_no":4,"run_type":"GENERATE_CHAPTER","success":true,"duration_ms":98765,"created_at":"2026-05-03T00:58:00.000Z"}]',
}])[0].json.response_html;

const text = visibleText(html);
for (const expected of ['小说运行日报', '只读日报', '调度策略', '今日任务', '模型调用', '失败摘要', '智能审稿', '生成章节', '已失败', '建议每十分钟执行一轮队列']) {
  assert(text.includes(expected), `daily report visible text should include Chinese text: ${expected}`);
}
assert(!forbiddenVisibleTokens.test(text), `daily report visible text should not expose raw English status/type: ${text}`);
assert(!html.includes('method="POST"'), 'daily report must not expose POST forms');

const runbook = read('docs/novel_workflow/运行手册.md');
assert(runbook.includes('Phase 11 只读运行日报'), 'runbook should document Phase 11 daily report');
assert(runbook.includes('/webhook/novel-daily-report'), 'runbook should document daily report URL');
assert(runbook.includes('建议每十分钟执行一轮队列'), 'runbook should document scheduling strategy in Chinese');

console.log(JSON.stringify({
  result: 'phase11_daily_report_tdd_passed',
  report: 'GET /webhook/novel-daily-report',
  displayLanguage: '状态与任务类型中文展示',
}, null, 2));
