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
    URLSearchParams,
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

const workflow11 = readJson('n8n/workflow/11_novel_center_workflow.json');
const workflow11Available = readJson('n8n/workflow/available/11_novel_center_workflow.json');
assert.strictEqual(JSON.stringify(workflow11), JSON.stringify(workflow11Available), '11 root and available workflow copies should match');

const workflow16 = readJson('n8n/workflow/16_novel_review_workflow.json');
const workflow16Available = readJson('n8n/workflow/available/16_novel_review_workflow.json');
assert.strictEqual(JSON.stringify(workflow16), JSON.stringify(workflow16Available), '16 root and available workflow copies should match');

const workflowNodes = new Map(workflow11.nodes.map((node) => [node.name, node]));
assert.strictEqual(workflowNodes.get('Webhook - 小说工作台')?.parameters?.httpMethod, 'GET', 'workbench webhook must be GET');
assert.strictEqual(workflowNodes.get('Webhook - 小说工作台')?.parameters?.path, 'novel-center', 'workbench should keep existing entry path');
assert.strictEqual(workflowNodes.get('Webhook - 小说项目列表')?.parameters?.httpMethod, 'GET', 'project list webhook must be GET');
assert.strictEqual(workflowNodes.get('Webhook - 小说项目列表')?.parameters?.path, 'novel-project-list', 'project list should have its own path');

const centerCode = read('n8n/code/novel_render_center_html.js');
const projectListCode = read('n8n/code/novel_render_project_list_html.js');
const queueCode = read('n8n/code/novel_render_queue_status_html.js');
const dailyCode = read('n8n/code/novel_render_daily_report_html.js');
const reviewCode = read('n8n/code/novel_render_review_html.js');

for (const [name, code, markers] of [
  ['center', centerCode, ['小说工作台', '待办总览', '需要处理的项目', '打开项目列表', '创建新小说项目']],
  ['projectList', projectListCode, ['小说项目列表', 'th-help', 'data-project-filter', '查看概览', '打开项目', '去审核', '看队列', '看日报']],
  ['queue', queueCode, ['project_id', '项目筛选', '清除项目筛选', 'data-project-id']],
  ['daily', dailyCode, ['工作台', '项目列表', '审核中心', '队列状态']],
  ['review', reviewCode, ['工作台', '项目列表', '审核中心', '队列状态']],
]) {
  for (const marker of markers) {
    assert(code.includes(marker), `${name} renderer should include Phase 15 marker: ${marker}`);
  }
}

assert(!centerCode.includes('data-project-filter'), 'workbench should not own the full project-list filter');
assert(!centerCode.includes('<table>'), 'workbench should not render the full desktop project table');
assert(!projectListCode.includes('method="POST"'), 'project list must stay read-only without POST forms');
assert(!queueCode.includes('method="POST"'), 'queue status must stay read-only without POST forms');
assert(!dailyCode.includes('method="POST"'), 'daily report must stay read-only without POST forms');
assert(reviewCode.includes('method="POST"'), 'review detail must keep POST action forms');
assert(!/href=["'][^"']*novel-review-action/i.test(reviewCode), 'review renderer must not create GET review action links');

const rawVisibleEnums = /\b(SUCCESS|SUCCEEDED|SENT|PENDING|ACTIVE|INACTIVE|NOTIFY_REVIEW|MANUAL_REVIEW|REQUEST_REWRITE|SKIPPED_DISABLED|SKIPPED_NO_SENDKEY|GENERATE_BIBLE|GENERATE_OUTLINE|GENERATE_CHAPTER|REVIEW_CHAPTER|REWRITE_CHAPTER)\b/;

const projectRows = [{
  id: '11111111-1111-1111-1111-111111111111',
  title: '待审项目',
  genre: '都市逆袭',
  audience: '中文读者',
  target_total_chapters: 10,
  current_chapter_no: 3,
  status: 'REVIEWING',
  waiting_job_count: 0,
  running_job_count: 0,
  failed_job_count: 0,
  need_review_count: 1,
  approved_chapter_count: 3,
  latest_job_type: 'NOTIFY_REVIEW',
  latest_job_status: 'SUCCEEDED',
  latest_ai_run_type: 'GENERATE_CHAPTER',
  latest_ai_success: true,
  latest_ai_duration_ms: 12345,
  need_review_chapter_id: '22222222-2222-2222-2222-222222222222',
  need_review_token: 'phase15-token',
  need_review_chapter_no: 4,
  need_review_chapter_title: '雨夜重逢',
  updated_at: '2026-05-03T01:02:00.000Z',
}, {
  id: '33333333-3333-3333-3333-333333333333',
  title: '异常项目',
  genre: '悬疑',
  audience: '中文读者',
  target_total_chapters: 8,
  current_chapter_no: 1,
  status: 'WRITING',
  waiting_job_count: 2,
  running_job_count: 1,
  failed_job_count: 1,
  need_review_count: 0,
  approved_chapter_count: 1,
  latest_job_type: 'REVIEW_CHAPTER',
  latest_job_status: 'FAILED',
  latest_job_error_message: 'SERVERCHAN_SENDKEY is not configured',
  latest_ai_run_type: 'REVIEW_CHAPTER',
  latest_ai_success: false,
  latest_ai_duration_ms: 34567,
  updated_at: '2026-05-03T01:03:00.000Z',
}, {
  id: '44444444-4444-4444-4444-444444444444',
  title: '完结项目',
  genre: '奇幻',
  audience: '中文读者',
  target_total_chapters: 3,
  current_chapter_no: 3,
  status: 'COMPLETED',
  waiting_job_count: 0,
  running_job_count: 0,
  failed_job_count: 0,
  need_review_count: 0,
  approved_chapter_count: 3,
  updated_at: '2026-05-03T01:04:00.000Z',
}];

const centerHtml = runCodeNode('n8n/code/novel_render_center_html.js', projectRows)[0].json.response_html;
const centerText = visibleText(centerHtml);
for (const expected of ['小说工作台', '待办总览', '需要处理的项目', '打开项目列表', '创建新小说项目', '第 4 章待审', '看队列']) {
  assert(centerText.includes(expected), `workbench visible text should include: ${expected}`);
}
assert(centerHtml.includes('/webhook/novel-project-list'), 'workbench should link to independent project list');
assert(centerHtml.includes('/webhook/novel-review-detail?chapter_id=22222222-2222-2222-2222-222222222222&review_token=phase15-token'), 'workbench should link directly to pending review detail');
assert(!centerHtml.includes('data-project-filter'), 'workbench should not render project filters');
assert(!rawVisibleEnums.test(centerText), `workbench visible text should not expose internal enums: ${centerText}`);

const projectListHtml = runCodeNode('n8n/code/novel_render_project_list_html.js', projectRows)[0].json.response_html;
const projectListText = visibleText(projectListHtml);
for (const expected of ['小说项目列表', '全部 3', '待审核 1', '有异常 1', '队列中 1', '已完结 1', '打开项目', '去审核', '看队列', '看日报', '查看概览', '提醒密钥未配置']) {
  assert(projectListText.includes(expected), `project list visible text should include: ${expected}`);
}
assert(projectListHtml.includes('data-project-filter="review"'), 'project list should own project filters');
assert(projectListHtml.includes('data-filter-values="all review"'), 'project list rows/cards should include filter values');
assert(projectListHtml.includes('/webhook/novel-review-detail?chapter_id=22222222-2222-2222-2222-222222222222&review_token=phase15-token'), 'project list should link directly to review detail');
assert(projectListHtml.includes('/webhook/novel-queue-status?project_id=33333333-3333-3333-3333-333333333333'), 'project list should link directly to project-filtered queue view');
assert(!projectListHtml.includes('method="POST"'), 'project list should not contain POST forms');
assert(!rawVisibleEnums.test(projectListText), `project list visible text should not expose internal enums: ${projectListText}`);

const queueHtml = runCodeNode('n8n/code/novel_render_queue_status_html.js', [{
  is_empty: false,
  queue_total_count: 8,
  queue_waiting_count: 3,
  queue_running_count: 1,
  queue_failed_count: 2,
  queue_succeeded_today_count: 4,
  job_id: '55555555-5555-5555-5555-555555555555',
  project_id: '33333333-3333-3333-3333-333333333333',
  project_title: '异常项目',
  chapter_no: 4,
  chapter_title: '雨夜重逢',
  job_type: 'REVIEW_CHAPTER',
  status: 'FAILED',
  attempt_count: 2,
  max_attempts: 3,
  error_message: 'SERVERCHAN_SENDKEY is not configured',
  created_at: '2026-05-03T01:00:00.000Z',
  updated_at: '2026-05-03T01:00:00.000Z',
}])[0].json.response_html;
const queueText = visibleText(queueHtml);
assert(queueHtml.includes('data-project-id="33333333-3333-3333-3333-333333333333"'), 'queue items should expose project id for URL filtering');
assert(queueText.includes('项目筛选'), 'queue page should explain project filtering');
assert(queueText.includes('清除项目筛选'), 'queue page should offer clearing project filter');
assert(!rawVisibleEnums.test(queueText), `queue visible text should not expose internal enums: ${queueText}`);

console.log(JSON.stringify({
  ok: true,
  phase: 15,
  checks: [
    '工作台与项目列表分离',
    '项目列表直接跳转审核和项目队列',
    '队列页支持项目参数只读筛选',
    '审核动作仍只走 POST',
    '页面状态和任务类型中文展示',
  ],
}, null, 2));
