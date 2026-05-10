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

function runCodeNode(relativePath, rows, json = {}) {
  const source = read(relativePath);
  const script = new vm.Script(`(function() {\n${source}\n})()`, {filename: relativePath});
  const sandbox = {
    $json: json,
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

const workflowNodes = new Map(workflow11.nodes.map((node) => [node.name, node]));
assert.strictEqual(workflowNodes.get('Webhook - 小说工作台')?.parameters?.httpMethod, 'GET', 'workbench must stay GET');
assert.strictEqual(workflowNodes.get('Webhook - 小说项目列表')?.parameters?.httpMethod, 'GET', 'project list must stay GET');
assert.strictEqual(workflowNodes.get('Webhook - 小说创建页面')?.parameters?.httpMethod, 'GET', 'project create page must be GET');
assert.strictEqual(workflowNodes.get('Webhook - 小说创建页面')?.parameters?.path, 'novel-project-new', 'project create page path should be novel-project-new');
assert.strictEqual(workflowNodes.get('Webhook - 小说创建页GLM助手')?.parameters?.httpMethod, 'POST', 'project create AI assist endpoint must be POST');
assert.strictEqual(workflowNodes.get('Webhook - 小说创建页GLM助手')?.parameters?.path, 'novel-project-ai-assist', 'project create AI assist path should be novel-project-ai-assist');
assert.strictEqual(workflowNodes.get('Webhook - 小说项目详情')?.parameters?.httpMethod, 'GET', 'project detail must be GET');
assert.strictEqual(workflowNodes.get('Webhook - 小说项目详情')?.parameters?.path, 'novel-project-detail', 'project detail path should be novel-project-detail');
assert.strictEqual(workflowNodes.get('Webhook - 创建小说项目')?.parameters?.httpMethod, 'POST', 'project create action must stay POST');

const centerCode = read('n8n/code/novel_render_center_html.js');
const createCode = read('n8n/code/novel_render_project_create_html.js');
const createAssistValidateCode = read('n8n/code/novel_validate_project_ai_assist.js');
const createAssistBuildCode = read('n8n/code/novel_build_project_ai_assist_glm_request.js');
const projectListCode = read('n8n/code/novel_render_project_list_html.js');
const detailCode = read('n8n/code/novel_render_project_detail_html.js');
const queueCode = read('n8n/code/novel_render_queue_status_html.js');
const reviewCode = read('n8n/code/novel_render_review_html.js');

for (const [name, code, markers] of [
  ['center', centerCode, ['小说工作台', '创建项目', '/webhook/novel-project-new']],
  ['create', createCode, ['创建新小说项目', 'method="POST"', '/webhook/novel-project-create', '返回工作台']],
  ['projectList', projectListCode, ['打开项目', '/webhook/novel-project-detail?project_id=', 'th-help']],
  ['detail', detailCode, ['小说项目控制台', '章节目录', '已写章节', '章节正文', '目录筛选', '未写', '导演台阻断', 'data-chapter-filter', 'projectViewHref', 'view-tabs', 'outline-workbench', 'catalog-panel', 'chapter-panel', 'chapter-drawer-panel']],
  ['queue', queueCode, ['创建项目', '项目列表']],
  ['review', reviewCode, ['创建项目', '项目列表']],
]) {
  for (const marker of markers) {
    assert(code.includes(marker), `${name} renderer should include Phase 16 marker: ${marker}`);
  }
}

assert(!centerCode.includes('method="POST"'), 'workbench should no longer contain the create project POST form');
assert(createCode.includes('method="POST"'), 'create page should contain the POST create form');
assert(projectListCode.includes('action="/webhook/novel-archived-projects-cleanup"'), 'project list should expose archived project cleanup through POST');
assert(detailCode.includes('method="POST"'), 'project detail/catalog now includes safe project action POST forms');
assert(!/href=["'][^"']*(novel-project-continue|novel-project-regenerate|novel-chapter-rewrite-request|novel-review-remind)/i.test(detailCode), 'project detail must not expose project actions as GET links');
assert(!queueCode.includes('method="POST"'), 'queue status must stay read-only');
assert(reviewCode.includes('method="POST"'), 'review detail must keep POST action forms');
assert(!/href=["'][^"']*novel-review-action/i.test(reviewCode), 'review renderer must not create GET review action links');

const rawVisibleEnums = /\b(SUCCESS|SUCCEEDED|SENT|PENDING|ACTIVE|INACTIVE|NOTIFY_REVIEW|MANUAL_REVIEW|REQUEST_REWRITE|SKIPPED_DISABLED|SKIPPED_NO_SENDKEY|GENERATE_BIBLE|GENERATE_OUTLINE|GENERATE_CHAPTER|REVIEW_CHAPTER|REWRITE_CHAPTER|DRAFT_READY|NEED_REVIEW|APPROVED|PUBLISHED|REJECTED|FAILED)\b/;

const projectRows = [{
  id: '11111111-1111-1111-1111-111111111111',
  title: '目录项目',
  genre: '都市逆袭',
  audience: '中文读者',
  target_total_chapters: 10,
  current_chapter_no: 2,
  status: 'WRITING',
  waiting_job_count: 0,
  running_job_count: 0,
  failed_job_count: 0,
  need_review_count: 0,
  approved_chapter_count: 2,
  latest_job_type: 'GENERATE_CHAPTER',
  latest_job_status: 'SUCCEEDED',
  updated_at: '2026-05-03T01:02:00.000Z',
}];

const centerHtml = runCodeNode('n8n/code/novel_render_center_html.js', projectRows)[0].json.response_html;
const centerText = visibleText(centerHtml);
assert(centerText.includes('创建新小说项目'), 'workbench should still guide users to create projects');
assert(centerHtml.includes('/webhook/novel-project-new'), 'workbench create link should point to independent create page');
assert(!centerHtml.includes('method="POST"'), 'workbench should not contain POST create form');
assert(!rawVisibleEnums.test(centerText), `workbench visible text should not expose internal enums: ${centerText}`);

const createHtml = runCodeNode('n8n/code/novel_render_project_create_html.js', [])[0].json.response_html;
const createText = visibleText(createHtml);
for (const expected of ['创建新小说项目', '小说标题', 'AI标题', '创意建议方向', '核心创意', 'AI创意', '提交创建', '返回工作台', '查看项目列表']) {
  assert(createText.includes(expected), `create page visible text should include: ${expected}`);
}
assert(createHtml.includes('method="POST" action="/webhook/novel-project-create"'), 'create page should submit to POST action');
assert(createHtml.includes('type="button" data-ai-title'), 'AI title helper should be a non-submit button');
assert(createHtml.includes('type="button" data-ai-idea'), 'AI idea helper should be a non-submit button');
assert(createHtml.includes('textarea name="creative_direction"'), 'create page should expose optional creative direction above premise');
assert(createHtml.includes('/webhook/novel-project-ai-assist') && createHtml.includes('fetch(assistUrl'), 'create page AI buttons should call the GLM assist webhook');
assert(!createHtml.includes('buildIdea()') && !createHtml.includes('buildTitle()'), 'create page should not fake AI with local title/idea builders');
assert(createHtml.includes('data-ai-feedback'), 'create page should show GLM assist request feedback');
assert(createHtml.includes('directionInput') && createHtml.includes('creative_direction') && createHtml.includes('assist_nonce') && createHtml.includes('previous_ai_title') && createHtml.includes('aiGenerated'), 'create page should send creative direction, vary GLM requests, and avoid anchoring on previous AI output');
assert(createAssistValidateCode.includes('creative_direction'), 'create-page AI assist validator should preserve creative direction');
assert(createAssistBuildCode.includes('creativeDirection') && createAssistBuildCode.includes('【创意建议方向】') && createAssistBuildCode.includes('genreInstruction') && createAssistBuildCode.includes('diversityBrief') && createAssistBuildCode.includes('top_p'), 'create-page GLM assist prompt should inject optional direction and genre-specific diversity controls');
const directedAssist = runCodeNode('n8n/code/novel_validate_project_ai_assist.js', [], {
  body: {
    assist_type: 'idea',
    creative_direction: '一女主三男主，甜宠开头，虐恋结尾，身世线缓慢揭示。',
    genre: '现代言情',
  },
})[0].json;
assert.strictEqual(directedAssist.creative_direction, '一女主三男主，甜宠开头，虐恋结尾，身世线缓慢揭示。', 'validator should return creative direction');
const directedPromptJson = runCodeNode('n8n/code/novel_build_project_ai_assist_glm_request.js', [], directedAssist)[0].json;
const directedPrompt = JSON.parse(directedPromptJson.prompt_messages_json).find((message) => message.role === 'user').content;
assert(directedPrompt.includes('【创意建议方向】') && directedPrompt.includes('一女主三男主'), 'idea prompt should include non-empty creative direction');
assert(directedPrompt.includes('最高内容约束') && directedPrompt.includes('最终自检'), 'idea prompt should treat creative direction as a hard priority');
assert.strictEqual(directedPromptJson.creative_direction_applied, true, 'directed idea prompt should mark creative direction as applied');
assert.strictEqual(directedPromptJson.llm_request_body.temperature, 0.72, 'directed idea prompt should lower temperature for adherence');
const randomPromptJson = runCodeNode('n8n/code/novel_build_project_ai_assist_glm_request.js', [], {...directedAssist, creative_direction: ''})[0].json;
const randomPrompt = JSON.parse(randomPromptJson.prompt_messages_json).find((message) => message.role === 'user').content;
assert(!randomPrompt.includes('【创意建议方向】'), 'idea prompt without creative direction should keep the random-generation prompt clean');
assert.strictEqual(randomPromptJson.creative_direction_applied, false, 'random idea prompt should not mark creative direction as applied');
assert.strictEqual(randomPromptJson.llm_request_body.temperature, 0.98, 'random idea prompt should keep high-temperature idea generation');
const titlePromptJson = runCodeNode('n8n/code/novel_build_project_ai_assist_glm_request.js', [], {...directedAssist, assist_type: 'title'})[0].json;
const titlePrompt = JSON.parse(titlePromptJson.prompt_messages_json).find((message) => message.role === 'user').content;
assert(!titlePrompt.includes('【创意建议方向】'), 'title assist should not be constrained by creative direction');
assert.strictEqual(titlePromptJson.creative_direction_applied, false, 'title assist should not mark creative direction as applied');
for (const expected of [
  'select name="genre"',
  'select name="audience"',
  'select name="style"',
  'select name="target_words_per_chapter"',
  '玄幻升级',
  '现代言情',
  '男频爽文读者',
  '女频情感读者',
  '节奏快、冲突强、章末留钩子',
  '常规 2000 字',
]) {
  assert(createHtml.includes(expected), `create page should provide preset dropdown option: ${expected}`);
}
assert(!rawVisibleEnums.test(createText), `create page visible text should not expose internal enums: ${createText}`);

const projectListHtml = runCodeNode('n8n/code/novel_render_project_list_html.js', projectRows)[0].json.response_html;
const projectListText = visibleText(projectListHtml);
assert(projectListText.includes('打开项目'), 'project list should expose project console action');
assert(projectListText.includes('一键清理已归档项目'), 'project list should expose archived project cleanup action');
assert(projectListHtml.includes('“打开项目”就是查看控制台，可继续查看设定、大纲、正文、事实、日志和导出。'), 'project list should explain the project console action in the operation header tooltip');
assert(projectListHtml.includes('/webhook/novel-project-detail?project_id=11111111-1111-1111-1111-111111111111'), 'project list should link to project detail/catalog');
assert(projectListHtml.includes('method="POST" action="/webhook/novel-archived-projects-cleanup"'), 'project list archived cleanup should submit through POST');
assert(!/href=["'][^"']*novel-archived-projects-cleanup/i.test(projectListHtml), 'project list archived cleanup must not be a GET link');
assert(!rawVisibleEnums.test(projectListText), `project list visible text should not expose internal enums: ${projectListText}`);

const detailRow = {
  is_empty: false,
  id: '11111111-1111-1111-1111-111111111111',
  title: '目录项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '主角逆袭。',
  target_total_chapters: 3,
  target_words_per_chapter: 2000,
  current_chapter_no: 2,
  status: 'WRITING',
  updated_at: '2026-05-03T01:02:00.000Z',
  outlines: JSON.stringify([
    {chapter_no: 1, volume_no: 1, title: '旧城灯火', summary: '主角回到旧城。', chapter_goal: '建立目标', conflict_point: '家族压力', emotional_point: '压抑', hook: '神秘来电', status: 'READY'},
    {chapter_no: 2, volume_no: 1, title: '雨夜重逢', summary: '旧人重逢。', chapter_goal: '推进冲突', conflict_point: '误会爆发', emotional_point: '拉扯', hook: '证据出现', status: 'READY'},
    {chapter_no: 3, volume_no: 1, title: '暗线浮出', summary: '反派露面。', chapter_goal: '抬高风险', conflict_point: '被迫选择', emotional_point: '紧张', hook: '身份反转', status: 'PLANNED'}
  ]),
  chapters: JSON.stringify([
    {id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', chapter_no: 1, title: '旧城灯火', body: '第一章正文。', summary: '主角回到旧城并发现线索。', word_count: 1200, status: 'APPROVED', generation_version: 1, is_current: true, updated_at: '2026-05-03T01:00:00.000Z'},
    {id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', chapter_no: 2, title: '雨夜重逢', body: '第二章候选正文。', summary: '旧人重逢并留下钩子。', word_count: 1300, status: 'NEED_REVIEW', generation_version: 2, is_current: false, review_token: 'phase16-token', updated_at: '2026-05-03T01:01:00.000Z'}
  ]),
};

const detailHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [detailRow])[0].json.response_html;
const detailText = visibleText(detailHtml);
for (const expected of ['小说项目控制台', '目录项目', '项目总览', '项目资产入口', '最近章节', '查看章节', '查看大纲']) {
  assert(detailText.includes(expected), `project detail overview visible text should include: ${expected}`);
}
assert(!detailText.includes('第一章正文'), 'project detail overview should not render long chapter bodies');
assert(detailHtml.includes('/webhook/novel-project-detail?project_id=11111111-1111-1111-1111-111111111111&amp;view=chapters'), 'project detail overview should link to chapter drill-down view');

const detailOutlineHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'outline'}])[0].json.response_html;
const detailOutlineText = visibleText(detailOutlineHtml);
for (const expected of ['大纲与目录', '目录筛选', '未写', '已写', '导演台阻断', '无导演台', '第 1 章', '旧城灯火', '第 2 章', '待人工审核']) {
  assert(detailOutlineText.includes(expected), `project detail outline visible text should include: ${expected}`);
}
assert(detailOutlineHtml.includes('data-chapter-filter="written"'), 'project detail outline view should expose written chapter filter');
assert(detailOutlineHtml.includes('data-chapter-filter="unwritten"'), 'project detail outline view should expose unwritten chapter filter');
assert(detailOutlineHtml.includes('data-chapter-filter="director-blocked"'), 'project detail outline view should expose director-blocked chapter filter');
assert(detailOutlineHtml.includes('.filter-chip[aria-pressed="true"]'), 'project detail outline filters should have a visible selected state');
assert(detailOutlineHtml.includes('class="catalog-item catalog-panel"'), 'project detail outline cards should render as collapsible panels');
assert(detailOutlineHtml.includes('.catalog-grid, .chapter-grid { display: grid; grid-template-columns: minmax(0, 1fr);'), 'project detail outline and chapter views should use a one-column panel list');
assert(detailOutlineHtml.includes('class="outline-dashboard"'), 'project detail outline view should show the outline status strip');
assert(detailOutlineHtml.includes('data-catalog-action="expand-all"'), 'project detail outline view should expose expand-all for outline panels');
assert(!/<details[^>]*data-chapter-values="all written current"[^>]* open/.test(detailOutlineHtml), 'outline panels should keep generated chapters collapsed by default');

const detailChaptersHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'chapters'}])[0].json.response_html;
const detailChaptersText = visibleText(detailChaptersHtml);
for (const expected of ['章节正文与版本', '正文工具条', '第一章正文', '第二章候选正文', '去审核']) {
  assert(detailChaptersText.includes(expected), `project detail chapter visible text should include: ${expected}`);
}
assert(detailChaptersHtml.includes('class="chapter-card chapter-panel'), 'project detail chapter cards should render as collapsible panels');
assert(!/<details id="chapter-1"[^>]* open/.test(detailChaptersHtml), 'approved current chapter panels should stay collapsed as one-row panels by default');
assert(/<details id="chapter-2"[^>]* open/.test(detailChaptersHtml), 'pending review chapter panels should open by default');
for (const expected of ['章节正文抽屉', '审稿报告抽屉', '人工审核记录抽屉', '章节模型调用抽屉', 'chapter-drawer-panel']) {
  assert(detailChaptersHtml.includes(expected), `project detail chapter view should expose drawer marker: ${expected}`);
}
assert(detailChaptersHtml.includes('/webhook/novel-review-detail?chapter_id=bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb&review_token=phase16-token'), 'project detail chapter view should link pending chapter to review detail');
assert(detailHtml.includes('method="POST"'), 'project detail should contain safe project action POST forms');
assert(!/href=["'][^"']*(novel-project-continue|novel-project-regenerate|novel-chapter-rewrite-request|novel-review-remind)/i.test(detailHtml), 'project detail should not contain GET project action links');
assert(!rawVisibleEnums.test(detailText), `project detail visible text should not expose internal enums: ${detailText}`);

console.log(JSON.stringify({
  ok: true,
  phase: 16,
  checks: [
    '创建项目页独立',
    '工作台不再包含创建表单',
    '项目列表直达项目控制台',
    '项目控制台展示目录和已写正文',
    '审核动作仍只走 POST',
  ],
}, null, 2));
