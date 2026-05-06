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
  ['center', centerCode, ['小说工作台', '待办总览', '需要处理的项目', '打开项目列表', '去审核', '看队列', '看日报']],
  ['projectList', projectListCode, ['小说项目列表', 'filter-chip', 'data-project-filter', 'URLSearchParams', 'content-visibility: auto', 'focus-visible', 'th-help', 'data-tooltip', '打开项目', '去审核', '看队列', '看日报']],
  ['queue', queueCode, ['queue-filter', 'data-queue-filter', '查看错误详情', '错误详情', 'URLSearchParams', '@media (max-width: 1024px)', 'font-variant-numeric: tabular-nums']],
  ['daily', dailyCode, ['页内目录', '今日是否需要处理', '今日概览', '失败摘要', '较慢调用', '快照历史']],
  ['review', reviewCode, ['review-list-summary', 'review-detail-workspace', 'reader-body', 'decision-dock', 'side-drawer', 'manual-edit-drawer', 'data-review-manual-edit']],
]) {
  for (const marker of markers) {
    assert(code.includes(marker), `${name} renderer should include Phase 14 marker: ${marker}`);
  }
}

assert(!queueCode.includes('method="POST"'), 'queue status renderer must stay read-only');
assert(!dailyCode.includes('method="POST"'), 'daily report renderer must stay read-only');
assert(reviewCode.includes('method="POST"'), 'review renderer must keep POST action form for detail page');
assert(!/href=["'][^"']*novel-review-action/i.test(reviewCode), 'review renderer must not create GET review action links');

const rawVisibleEnums = /\b(SUCCESS|SUCCEEDED|SENT|PENDING|ACTIVE|INACTIVE|NOTIFY_REVIEW|MANUAL_REVIEW|REQUEST_REWRITE|SKIPPED_DISABLED|SKIPPED_NO_SENDKEY|GENERATE_BIBLE|GENERATE_OUTLINE|GENERATE_CHAPTER|REVIEW_CHAPTER|REWRITE_CHAPTER)\b/;

const centerRows = [{
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
  need_review_token: 'phase14-token',
  need_review_chapter_no: 4,
  updated_at: '2026-05-03T01:02:00.000Z',
}, {
  id: '33333333-3333-3333-3333-333333333333',
  title: '异常项目',
  genre: '悬疑',
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

const centerHtml = runCodeNode('n8n/code/novel_render_center_html.js', centerRows)[0].json.response_html;
const centerText = visibleText(centerHtml);
for (const expected of ['小说工作台', '待办总览', '待审核 1', '失败任务 1', '队列中 1', '已完结 1', '需要处理的项目', '打开项目列表', '去审核', '看队列', '看日报']) {
  assert(centerText.includes(expected), `center visible text should include: ${expected}`);
}
assert(!centerHtml.includes('data-project-filter'), 'workbench should not expose project-list filters');
assert(!rawVisibleEnums.test(centerText), `center visible text should not expose internal enums: ${centerText}`);

const projectListHtml = runCodeNode('n8n/code/novel_render_project_list_html.js', centerRows)[0].json.response_html;
const projectListText = visibleText(projectListHtml);
for (const expected of ['小说项目列表', '全部 3', '待审核 1', '有异常 1', '队列中 1', '已完结 1', '去审核', '看队列', '看日报', '查看概览']) {
  assert(projectListText.includes(expected), `project list visible text should include: ${expected}`);
}
assert(projectListHtml.includes('data-project-filter="review"'), 'project list page should expose review filter');
assert(projectListHtml.includes('data-filter-values="all review"'), 'project list rows/cards should include filter values');
assert(projectListHtml.includes('URLSearchParams'), 'project list filter should persist state in the URL');
assert(!rawVisibleEnums.test(projectListText), `project list visible text should not expose internal enums: ${projectListText}`);

const queueHtml = runCodeNode('n8n/code/novel_render_queue_status_html.js', [{
  is_empty: false,
  queue_total_count: 8,
  queue_waiting_count: 3,
  queue_running_count: 1,
  queue_failed_count: 2,
  queue_succeeded_today_count: 4,
  job_id: '55555555-5555-5555-5555-555555555555',
  project_title: '逆光回响',
  chapter_no: 4,
  chapter_title: '雨夜重逢',
  job_type: 'REVIEW_CHAPTER',
  status: 'FAILED',
  attempt_count: 2,
  max_attempts: 3,
  error_message: 'SERVERCHAN_SENDKEY is not configured',
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
  job_id: '66666666-6666-6666-6666-666666666666',
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
}])[0].json.response_html;
const queueText = visibleText(queueHtml);
for (const expected of ['只读筛选', '需要关注', '失败', '运行中', '待处理', '最近完成', '查看错误详情', '查看项目上下文', '复制错误', '提醒密钥未配置', '智能审稿', '发送审核提醒']) {
  assert(queueText.includes(expected), `queue visible text should include: ${expected}`);
}
assert(queueHtml.includes('data-queue-filter="failed"'), 'queue page should expose failed filter');
assert(queueHtml.includes('<details class="error-details"'), 'queue errors should be collapsible');
assert(queueHtml.includes('data-copy-text'), 'queue errors should support copying localized error details');
assert(!queueHtml.includes('method="POST"'), 'queue page must stay read-only without POST forms');
assert(!rawVisibleEnums.test(queueText), `queue visible text should not expose internal enums: ${queueText}`);

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
  waiting_job_count: 3,
  running_job_count: 1,
  failed_job_count: 2,
  need_review_count: 4,
  latest_failed_jobs: '[{"project_title":"逆光回响","chapter_no":4,"chapter_title":"雨夜重逢","job_type":"REVIEW_CHAPTER","status":"FAILED","error_message":"SERVERCHAN_SENDKEY is not configured","updated_at":"2026-05-03T01:00:00.000Z"}]',
  slow_ai_runs: '[{"project_title":"逆光回响","chapter_no":4,"run_type":"GENERATE_CHAPTER","success":true,"duration_ms":98765,"created_at":"2026-05-03T00:58:00.000Z"}]',
  snapshot_history: '[{"report_date":"2026-05-03","captured_at":"2026-05-03T02:00:00.000Z","today_job_total_count":12,"today_ai_run_count":6,"today_job_failed_count":2,"waiting_job_count":3,"need_review_count":4}]',
}])[0].json.response_html;
const dailyText = visibleText(dailyHtml);
for (const expected of ['页内目录', '今日概览', '失败摘要', '较慢调用', '快照历史', '今日是否需要处理', '今日需要处理', '先处理失败任务', '智能审稿', '生成章节']) {
  assert(dailyText.includes(expected), `daily visible text should include: ${expected}`);
}
assert(dailyHtml.includes('<details class="report-section" id="failed-summary" open'), 'failed summary should be expanded by default');
assert(dailyHtml.includes('<details class="report-section" id="slow-calls" open'), 'slow calls should be expanded by default');
assert(dailyHtml.includes('<details class="report-section" id="snapshot-history"'), 'snapshot history should be collapsible');
assert(!dailyHtml.includes('method="POST"'), 'daily report must stay read-only without POST forms');
assert(!rawVisibleEnums.test(dailyText), `daily visible text should not expose internal enums: ${dailyText}`);

const longBody = '列表页不应显示的长正文。'.repeat(80);
const reviewBaseRow = {
  chapter_id: '77777777-7777-7777-7777-777777777777',
  review_token: 'phase14-token',
  project_title: 'Phase 14 交互项目',
  chapter_no: 3,
  generation_version: 2,
  chapter_title: '运行灯亮起',
  body: longBody,
  summary: '这是候选稿摘要。',
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
  latest_job_type: 'NOTIFY_REVIEW',
  latest_job_status: 'SUCCEEDED',
  notify_status: 'SUCCEEDED',
  remind_status: 'SKIPPED_DISABLED',
  pending_fact_count: 2,
  active_fact_count: 1,
  inactive_fact_count: 3,
  human_review_count: 0,
  human_reviews: '[]',
  updated_at: '2026-05-03T00:02:00.000Z',
};

const reviewListHtml = runCodeNode('n8n/code/novel_render_review_html.js', [{...reviewBaseRow, page_mode: 'LIST'}])[0].json.html;
const reviewListText = visibleText(reviewListHtml);
for (const expected of ['待审摘要', '打开并决策', '查看首要问题和建议', '这是候选稿摘要。']) {
  assert(reviewListText.includes(expected), `review list visible text should include: ${expected}`);
}
assert(!reviewListText.includes('列表页不应显示的长正文'), 'review list should not render long body');
assert(!reviewListHtml.includes('method="POST"'), 'review list should not expose action forms');
assert(!/href=["'][^"']*novel-review-action/i.test(reviewListHtml), 'review list must not expose GET action links');

const reviewDetailHtml = runCodeNode('n8n/code/novel_render_review_html.js', [{...reviewBaseRow, page_mode: 'DETAIL'}])[0].json.html;
const reviewDetailText = visibleText(reviewDetailHtml);
for (const expected of ['审核内容', '人工决策', '审核依据', '连续性事实', '提交审核决策', '人工改稿', '打开智能审稿', '查看运行依据']) {
  assert(reviewDetailText.includes(expected), `review detail visible text should include: ${expected}`);
}
assert(reviewDetailHtml.includes('placeholder="通过可留空；要求重写即使留空，也会按智能审稿的问题与建议改稿；拒绝建议填写原因。"'), 'review detail should explain that rewrite uses AI review guidance by default');
assert(!reviewDetailHtml.includes('data-reader-action="expand"'), 'review detail should not keep the removed reader toolbar expand action');
assert(!reviewDetailHtml.includes('data-reader-action="collapse"'), 'review detail should not keep the removed reader toolbar collapse action');
assert(!reviewDetailText.includes('正文工具条'), 'review detail should not show the removed review body toolbar');
assert(reviewDetailHtml.includes('method="POST"'), 'review detail should keep POST action form');
assert(reviewDetailHtml.includes('window.confirm'), 'review detail should keep confirmation popup logic');
assert(reviewDetailHtml.includes('未填写人工补充意见，将按智能审稿的问题与建议重写'), 'rewrite empty comment warning should explain AI review guidance will be used');
assert(reviewDetailHtml.includes('你还没有填写审核意见'), 'reject empty comment warning should remain strong');
assert(reviewDetailHtml.includes('mobile-actions'), 'review detail should keep mobile review actions without exposing GET writes');
assert(reviewDetailHtml.includes('decision-banner'), 'review detail should highlight the recommended human action');
assert(reviewDetailHtml.includes('recommended-button'), 'review action buttons should visually mark the recommended action');
assert(!/href=["'][^"']*novel-review-action/i.test(reviewDetailHtml), 'review detail must not expose GET action links');
assert(!rawVisibleEnums.test(reviewDetailText), `review detail visible text should not expose internal enums: ${reviewDetailText}`);

console.log(JSON.stringify({
  result: 'phase14_frontend_interaction_tdd_passed',
  pages: ['小说工作台', '小说项目列表', '队列状态', '运行日报', '审核中心'],
  safety: '审核动作仍为POST，列表页无审核动作表单',
  displayLanguage: '内部枚举中文展示',
}, null, 2));
