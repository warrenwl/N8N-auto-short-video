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

const centerCode = read('n8n/code/novel_render_center_html.js');
const projectListCode = read('n8n/code/novel_render_project_list_html.js');
const queueCode = read('n8n/code/novel_render_queue_status_html.js');
const dailyCode = read('n8n/code/novel_render_daily_report_html.js');
const reviewCode = read('n8n/code/novel_render_review_html.js');

for (const [name, code, markers] of [
  ['center', centerCode, ['当前建议操作', '创建新小说项目', '需要处理的项目', '打开项目列表', '审核中心', '队列状态', '运行日报']],
  ['projectList', projectListCode, ['小说项目列表', 'project-card', 'mobile-cards', 'th-help', '打开项目', '去审核', '看队列', '看日报']],
  ['queue', queueCode, ['需要关注', '最近完成', 'task-card', '待处理表示等待调度执行', '工作台', '项目列表', '审核中心', '运行日报']],
  ['daily', dailyCode, ['如何使用日报', '看失败摘要', '看较慢调用', '看快照历史', '快照记录', '工作台', '项目列表', '审核中心', '队列状态']],
  ['review', reviewCode, ['审核结论摘要', '推荐人工动作', 'mobile-actions', 'position: sticky', 'env(safe-area-inset-bottom)', 'focus-visible', 'window.confirm', '通过后会成为当前正式版本', '通过可留空', 'aria-label="审核意见"']],
]) {
  for (const marker of markers) {
    assert(code.includes(marker), `${name} renderer should include Phase 13 marker: ${marker}`);
  }
}

assert(!queueCode.includes('method="POST"'), 'queue status renderer must stay read-only');
assert(!dailyCode.includes('method="POST"'), 'daily report renderer must stay read-only');
assert(reviewCode.includes('method="POST"'), 'review renderer must keep POST action form');
assert(!/href=["'][^"']*novel-review-action/i.test(reviewCode), 'review renderer must not create GET review action links');

const rawVisibleEnums = /\b(SUCCESS|SUCCEEDED|SENT|PENDING|ACTIVE|INACTIVE|NOTIFY_REVIEW|MANUAL_REVIEW|REQUEST_REWRITE|SKIPPED_DISABLED|SKIPPED_NO_SENDKEY|GENERATE_BIBLE|GENERATE_OUTLINE|GENERATE_CHAPTER|REVIEW_CHAPTER|REWRITE_CHAPTER)\b/;

const centerHtml = runCodeNode('n8n/code/novel_render_center_html.js', [{
  id: '11111111-1111-1111-1111-111111111111',
  title: '逆光回响',
  genre: '都市逆袭',
  audience: '中文读者',
  target_total_chapters: 10,
  current_chapter_no: 3,
  status: 'WRITING',
  waiting_job_count: 0,
  running_job_count: 0,
  failed_job_count: 1,
  need_review_count: 0,
  approved_chapter_count: 3,
  latest_job_type: 'NOTIFY_REVIEW',
  latest_job_status: 'FAILED',
  latest_job_attempt_count: 2,
  latest_job_error_message: 'SERVERCHAN_SENDKEY is not configured',
  latest_job_updated_at: '2026-05-03T01:00:00.000Z',
  latest_ai_run_type: 'GENERATE_CHAPTER',
  latest_ai_success: true,
  latest_ai_duration_ms: 12345,
  latest_ai_created_at: '2026-05-03T00:59:00.000Z',
  updated_at: '2026-05-03T01:02:00.000Z',
}])[0].json.response_html;

const centerText = visibleText(centerHtml);
for (const expected of ['当前建议操作', '查看失败任务', '创建新小说项目', '需要处理的项目', '发送审核提醒', '生成章节', '提醒密钥未配置']) {
  assert(centerText.includes(expected), `center visible text should include: ${expected}`);
}
assert(!rawVisibleEnums.test(centerText), `center visible text should not expose internal enums: ${centerText}`);

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
}, {
  is_empty: false,
  queue_total_count: 8,
  queue_waiting_count: 3,
  queue_running_count: 1,
  queue_failed_count: 2,
  queue_succeeded_today_count: 4,
  job_id: '44444444-4444-4444-4444-444444444444',
  project_title: '逆光回响',
  chapter_no: 3,
  chapter_title: '旧稿清理',
  job_type: 'NOTIFY_REVIEW',
  status: 'SUCCEEDED',
  attempt_count: 1,
  max_attempts: 3,
  error_message: '',
  created_at: '2026-05-03T00:30:00.000Z',
  updated_at: '2026-05-03T00:40:00.000Z',
  latest_ai_run_type: null,
}])[0].json.response_html;

const queueText = visibleText(queueHtml);
for (const expected of ['需要关注', '最近完成', '任务卡片', '待处理表示等待调度执行', '生成设定集', '发送审核提醒', '智能审稿']) {
  assert(queueText.includes(expected), `queue visible text should include: ${expected}`);
}
assert(!rawVisibleEnums.test(queueText), `queue visible text should not expose internal enums: ${queueText}`);
assert(!queueHtml.includes('method="POST"'), 'queue page must not expose POST forms');

const dailyHtml = runCodeNode('n8n/code/novel_render_daily_report_html.js', [{
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
  latest_failed_jobs: '[{"project_title":"逆光回响","chapter_no":4,"chapter_title":"雨夜重逢","job_type":"REVIEW_CHAPTER","status":"FAILED","error_message":"SERVERCHAN_SENDKEY is not configured","updated_at":"2026-05-03T01:00:00.000Z"}]',
  slow_ai_runs: '[{"project_title":"逆光回响","chapter_no":4,"run_type":"GENERATE_CHAPTER","success":true,"duration_ms":98765,"created_at":"2026-05-03T00:58:00.000Z"}]',
  snapshot_history: '[{"report_date":"2026-05-03","captured_at":"2026-05-03T02:00:00.000Z","today_job_total_count":12,"today_ai_run_count":6,"today_job_failed_count":2,"waiting_job_count":3,"need_review_count":4}]',
}])[0].json.response_html;

const dailyText = visibleText(dailyHtml);
for (const expected of ['如何使用日报', '看失败摘要', '看较慢调用', '看快照历史', '快照记录', '智能审稿', '生成章节', '提醒密钥未配置']) {
  assert(dailyText.includes(expected), `daily visible text should include: ${expected}`);
}
assert(!rawVisibleEnums.test(dailyText), `daily visible text should not expose internal enums: ${dailyText}`);
assert(!dailyHtml.includes('method="POST"'), 'daily report must not expose POST forms');

const reviewHtml = runCodeNode('n8n/code/novel_render_review_html.js', [{
  chapter_id: '99999999-9999-9999-9999-999999999999',
  review_token: 'phase13-token',
  project_title: 'Phase 13 可用性项目',
  chapter_no: 3,
  generation_version: 2,
  chapter_title: '运行灯亮起',
  body: '这是一章用于审核中心可用性验收的候选稿。',
  status: 'NEED_REVIEW',
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
  human_reviews: '[{"action":"REQUEST_REWRITE","reviewer":"phase13_tdd","comment":"测试人工记录展示","created_at":"2026-05-03T00:01:00.000Z"}]',
  updated_at: '2026-05-03T00:02:00.000Z',
}])[0].json.html;

const reviewText = visibleText(reviewHtml);
for (const expected of ['审核结论摘要', '推荐人工动作', '建议人工复核', '需人工判断', '发送审核提醒', '已成功', '已跳过提醒', '候选事实 2', '已激活 1', '已失效 3', '要求重写', '提交审核决策']) {
  assert(reviewText.includes(expected), `review visible text should include: ${expected}`);
}
assert(reviewHtml.includes('placeholder="通过可留空；要求重写即使留空，也会按智能审稿的问题与建议改稿；拒绝建议填写原因。"'), 'review detail should explain rewrite uses AI review guidance by default');
assert(!rawVisibleEnums.test(reviewText), `review visible text should not expose internal enums: ${reviewText}`);
assert(reviewHtml.includes('method="POST"'), 'review actions must keep POST forms');
assert(!/href=["'][^"']*novel-review-action/i.test(reviewHtml), 'rendered review actions must not be GET links');
assert(reviewHtml.includes('window.confirm'), 'review page should include confirmation popup logic');
assert(reviewHtml.includes('mobile-actions'), 'review page should include mobile sticky actions');

console.log(JSON.stringify({
  result: 'phase13_frontend_usability_tdd_passed',
  pages: ['工作台', '项目列表', '队列状态', '运行日报', '审核中心'],
  safety: '审核动作仍为POST且带确认弹窗',
  displayLanguage: '内部枚举中文展示',
}, null, 2));
