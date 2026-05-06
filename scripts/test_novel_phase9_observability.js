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

function runCodeNode(relativePath, inputItems) {
  const source = read(relativePath);
  const script = new vm.Script(`(function() {\n${source}\n})()`, {filename: relativePath});
  const sandbox = {
    $input: {
      all: () => inputItems.map((json) => ({json})),
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

const workflow = readJson('n8n/workflow/16_novel_review_workflow.json');
const availableWorkflow = readJson('n8n/workflow/available/16_novel_review_workflow.json');
assert.strictEqual(
  JSON.stringify(workflow),
  JSON.stringify(availableWorkflow),
  '16 root and available workflow copies should match'
);

const nodes = new Map((workflow.nodes || []).map((node) => [node.name, node]));
const listQuery = nodes.get('数据库 - 查询待审章节列表')?.parameters?.query || '';
const detailQuery = nodes.get('数据库 - 查询待审章节详情')?.parameters?.query || '';
const combinedQuery = `${listQuery}\n${detailQuery}`;

for (const expected of [
  'novel_ai_runs',
  'novel_generation_jobs',
  'novel_continuity_facts',
  'novel_human_reviews',
  'ai_run_model',
  'ai_run_duration_ms',
  'latest_job_type',
  'latest_job_status',
  'notify_status',
  'remind_status',
  'pending_fact_count',
  'active_fact_count',
  'human_reviews',
]) {
  assert(combinedQuery.includes(expected), `review workflow query should expose observability field/table: ${expected}`);
}

assert(combinedQuery.includes("c.status = 'NEED_REVIEW'"), 'review list should still only show candidate NEED_REVIEW chapters');
assert(combinedQuery.includes('c.review_token = input.review_token'), 'review detail should still validate review_token');

const renderCode = read('n8n/code/novel_render_review_html.js');
for (const expected of [
  '运行观察',
  '模型调用',
  '任务状态',
  '通知状态',
  '事实库',
  '人工记录',
  'duration_ms',
  'remind_status',
  'human_reviews',
]) {
  assert(renderCode.includes(expected), `review renderer should include observability UI marker: ${expected}`);
}
assert(renderCode.includes('method="POST"'), 'review action forms must still use POST');
assert(!/href=["'][^"']*novel-review-action/i.test(renderCode), 'review actions must not be GET links');
assert(renderCode.includes('window.confirm'), 'review action forms should keep confirmation protection');

const html = runCodeNode('n8n/code/novel_render_review_html.js', [{
  chapter_id: '99999999-9999-9999-9999-999999999999',
  review_token: 'phase9-token',
  project_title: 'Phase 9 可观测性项目',
  chapter_no: 3,
  generation_version: 2,
  chapter_title: '运行灯亮起',
  body: '这是一章用于审核中心可观测性验收的候选稿。',
  total_score: 82,
  consistency_score: 80,
  readability_score: 84,
  plot_score: 81,
  commercial_score: 83,
  verdict: 'MANUAL_REVIEW',
  issues: '[{"type":"节奏","description":"需要人工确认节奏。"}]',
  suggestions: '["保留冲突，但加强尾钩。"]',
  ai_run_model: 'glm-4.5',
  ai_run_prompt_version: 'novel-review-v1',
  ai_run_duration_ms: 12345,
  ai_run_success: true,
  ai_run_created_at: '2026-05-03T00:00:00.000Z',
  latest_job_type: 'NOTIFY_REVIEW',
  latest_job_status: 'SUCCEEDED',
  latest_job_attempt_count: 1,
  notify_status: 'SUCCEEDED',
  remind_status: 'SKIPPED_DISABLED',
  pending_fact_count: 2,
  active_fact_count: 1,
  inactive_fact_count: 3,
  human_review_count: 1,
  human_reviews: '[{"action":"REQUEST_REWRITE","reviewer":"phase9_tdd","comment":"测试人工记录展示","created_at":"2026-05-03T00:01:00.000Z"}]',
  updated_at: '2026-05-03T00:02:00.000Z',
}])[0].json.html;

for (const expected of [
  '运行观察',
  '模型调用',
  'glm-4.5',
  '12.3 秒',
  '任务状态',
  '发送审核提醒',
  '通知状态',
  '已跳过提醒',
  '事实库',
  '候选事实 2',
  '人工记录',
  '要求重写',
  'method="POST"',
]) {
  assert(html.includes(expected), `rendered review HTML should contain: ${expected}`);
}
assert(html.includes('window.confirm'), 'review HTML should include confirmation popup logic');
assert(!/href=["'][^"']*novel-review-action/i.test(html), 'rendered review actions must not be GET links');

const runbook = read('docs/novel_workflow/运行手册.md');
assert(runbook.includes('Phase 9 可观测性'), 'runbook should document Phase 9 observability checks');
assert(runbook.includes('/webhook/novel-review-list'), 'runbook should keep review list entry');
assert(runbook.includes('novel_ai_runs'), 'runbook should document AI run inspection');
assert(runbook.includes('novel_generation_jobs'), 'runbook should document job inspection');

console.log(JSON.stringify({
  result: 'phase9_observability_tdd_passed',
  workflow: '16_小说人工审核中心',
  pageMarkers: ['运行观察', '模型调用', '任务状态', '通知状态', '事实库', '人工记录'],
}, null, 2));
