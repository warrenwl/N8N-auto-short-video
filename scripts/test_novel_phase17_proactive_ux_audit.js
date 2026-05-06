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

function assertFile(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), `${relativePath} should exist`);
  return read(relativePath);
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

const workflowNodes = new Map(workflow11.nodes.map((node) => [node.name, node]));
assert(workflowNodes.has('代码 - 生成小说创建结果页'), 'create action should render a human friendly result page');
const createRespond = workflowNodes.get('响应Webhook - 返回创建项目结果');
assert.strictEqual(createRespond?.parameters?.responseBody, '={{ $json.response_html }}', 'create action response should use rendered html');
assert.strictEqual(
  createRespond?.parameters?.options?.responseHeaders?.entries?.[0]?.value,
  'text/html; charset=utf-8',
  'create action should respond with html for browser form submissions'
);

const createPageCode = read('n8n/code/novel_render_project_create_html.js');
assert(createPageCode.includes('autocomplete="off"'), 'create form should avoid accidental password manager/autofill noise');
assert(createPageCode.includes('inputmode="numeric"'), 'number fields should bring up numeric keyboards on mobile');
assert(!/placeholder="[^"]*(?<!…)"/.test(createPageCode), 'create page placeholders should use Chinese examples ending with ellipsis');

const createResultCode = assertFile('n8n/code/novel_render_project_create_result_html.js');
for (const marker of ['创建项目成功', '查看项目控制台', '查看队列', '返回工作台', '查看项目列表']) {
  assert(createResultCode.includes(marker), `create result renderer should include: ${marker}`);
}

const createResultHtml = runCodeNode('n8n/code/novel_render_project_create_result_html.js', [{
  success: true,
  id: '22222222-2222-2222-2222-222222222222',
  title: '主动体验复查项目',
  genre: '都市逆袭',
  status: 'CREATED',
  target_total_chapters: 12,
  target_words_per_chapter: 1800,
  generation_job_id: '33333333-3333-3333-3333-333333333333',
  job_type: 'GENERATE_BIBLE',
  job_status: 'PENDING',
  response_status_code: 201,
}])[0].json.response_html;
const createResultText = visibleText(createResultHtml);
for (const expected of ['创建项目成功', '主动体验复查项目', '已创建设定集生成任务', '启动设定集生成', '查看项目控制台', '查看队列']) {
  assert(createResultText.includes(expected), `create result visible text should include: ${expected}`);
}
assert(createResultHtml.includes('/webhook/novel-project-detail?project_id=22222222-2222-2222-2222-222222222222'), 'create result should link to project detail');
assert(createResultHtml.includes('/webhook/novel-queue-status?project_id=22222222-2222-2222-2222-222222222222'), 'create result should link to filtered queue');
assert(!/\b(CREATED|GENERATE_BIBLE|PENDING|NOVEL_PROJECT_CREATED)\b/.test(createResultText), 'create result visible text should not expose internal enums');

const detailCode = read('n8n/code/novel_render_project_detail_html.js');
assert(detailCode.includes('正文工具条'), 'project detail should include a body reading toolbar');
assert(detailCode.includes('data-body-action="expand-all"'), 'project detail should include expand all body action');
assert(detailCode.includes('data-body-action="collapse-all"'), 'project detail should include collapse all body action');
assert(detailCode.includes('data-json-field'), 'project detail should validate Bible JSON fields before submit');
assert(detailCode.includes('data-format-json'), 'project detail should provide JSON formatting for Bible edits');
assert(detailCode.includes('sticky-jump-section'), 'project detail should keep long-page section navigation reachable');
assert(detailCode.includes('breadcrumbs'), 'project detail should show hierarchy breadcrumbs');
assert(detailCode.includes('viewConfig'), 'project detail should support second-level project views');
assert(detailCode.includes('.written-section .reader-toolbar { position: sticky'), 'project detail should keep the body toolbar sticky while reading');
assert(detailCode.includes('content-visibility: auto'), 'project detail should reduce rendering pressure for long chapter/fact lists');
assert(detailCode.includes('font-variant-numeric: tabular-nums'), 'project detail should keep numeric metrics visually stable');
assert(!detailCode.includes('<details class="chapter-body" open>'), 'chapter bodies should be collapsed by default for long novels');

const detailHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: '22222222-2222-2222-2222-222222222222',
  requested_view: 'chapters',
  title: '主动体验复查项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '主角逆袭。',
  target_total_chapters: 2,
  target_words_per_chapter: 1800,
  current_chapter_no: 1,
  status: 'WRITING',
  outlines: JSON.stringify([
    {chapter_no: 1, volume_no: 1, title: '旧城灯火', summary: '主角回到旧城。', chapter_goal: '建立目标', conflict_point: '家族压力', emotional_point: '压抑', hook: '神秘来电', status: 'READY'},
    {chapter_no: 2, volume_no: 1, title: '雨夜重逢', summary: '旧人重逢。', chapter_goal: '推进冲突', conflict_point: '误会爆发', emotional_point: '拉扯', hook: '证据出现', status: 'READY'}
  ]),
  chapters: JSON.stringify([
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      chapter_no: 1,
      title: '旧城灯火',
      body: '第一章正文。',
      summary: '主角回到旧城并发现线索。',
      word_count: 1200,
      status: 'APPROVED',
      generation_version: 1,
      is_current: true,
      updated_at: '2026-05-03T01:00:00.000Z',
      ai_runs: [{run_type: 'GENERATE_CHAPTER', model: 'glm-5.1', success: true, duration_ms: 2300, created_at: '2026-05-03T00:59:00.000Z'}],
      latest_review_report: {id: 'rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr', total_score: 88, verdict: 'PASS'}
    }
  ]),
}])[0].json.response_html;
const detailText = visibleText(detailHtml);
assert(detailText.includes('正文工具条'), 'project detail visible text should expose the reading toolbar');
assert(detailText.includes('展开全部正文'), 'project detail should allow expanding all chapter bodies');
assert(detailText.includes('收起全部正文'), 'project detail should allow collapsing all chapter bodies');
assert(detailText.includes('最近模型调用'), 'project detail should show chapter-local model evidence');
assert(detailText.includes('智能审稿：审稿总分 88'), 'project detail should show chapter-local review score evidence');
assert(!/<details class="chapter-body"\s+open>/i.test(detailHtml), 'rendered chapter bodies should not be open by default');
assert(detailHtml.includes('method="POST"'), 'project detail now includes safe project action POST forms');
assert(!/href=["'][^"']*(novel-project-continue|novel-chapter-rewrite-request|novel-review-remind)/i.test(detailHtml), 'project detail should not expose project actions as GET links');

const detailOverviewHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: '22222222-2222-2222-2222-222222222222',
  title: '主动体验复查项目',
  status: 'WRITING',
  target_total_chapters: 2,
  chapters: '[]',
  outlines: '[]',
  jobs: '[]',
}])[0].json.response_html;
const detailOverviewText = visibleText(detailOverviewHtml);
assert(detailOverviewText.includes('项目资产入口'), 'project detail overview should simplify the first screen');
assert(!detailOverviewText.includes('正文工具条'), 'project detail overview should keep chapter operations in a second-level view');

const detailOpsHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: '22222222-2222-2222-2222-222222222222',
  requested_view: 'ops',
  title: '主动体验复查项目',
  status: 'WRITING',
  target_total_chapters: 2,
  chapters: '[]',
  outlines: '[]',
  jobs: '[]',
  ai_runs: '[]',
  project_events: '[]',
}])[0].json.response_html;
assert(visibleText(detailOpsHtml).includes('运行日志（展开查看模型调用、失败原因和最近任务）'), 'project detail ops view should expose deep logs only when selected');

console.log(JSON.stringify({
  ok: true,
  phase: 17,
  checks: [
    '创建项目提交后返回中文结果页',
    '创建结果页提供项目控制台和队列下一步入口',
    '创建页移动端输入和自动完成更稳',
    '项目详情正文默认收起',
    '项目详情提供正文工具条',
  ],
}, null, 2));
