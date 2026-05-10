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
      all: () => rows.map((row) => ({json: row})),
    },
    Intl,
    Date,
    Number,
    String,
    Array,
    JSON,
    Blob: function Blob() {},
    URL,
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

const workflow17 = readJson('n8n/workflow/17_novel_rewrite_notify_workflow.json');
const workflow17Available = readJson('n8n/workflow/available/17_novel_rewrite_notify_workflow.json');
assert.strictEqual(JSON.stringify(workflow17), JSON.stringify(workflow17Available), '17 root and available workflow copies should match');

const workflowNodes = new Map(workflow11.nodes.map((node) => [node.name, node]));
for (const [name, method, pathName] of [
  ['Webhook - 小说继续写作', 'POST', 'novel-project-continue'],
  ['Webhook - 小说章节重写申请', 'POST', 'novel-chapter-rewrite-request'],
  ['Webhook - 小说审核提醒重发', 'POST', 'novel-review-remind'],
]) {
  assert.strictEqual(workflowNodes.get(name)?.parameters?.httpMethod, method, `${name} must use ${method}`);
  assert.strictEqual(workflowNodes.get(name)?.parameters?.path, pathName, `${name} should expose ${pathName}`);
}

for (const name of [
  '代码 - 校验小说继续写作',
  '代码 - 校验小说章节重写申请',
  '代码 - 校验小说审核提醒重发',
  '代码 - 生成小说项目操作结果页',
  '数据库 - 继续小说项目',
  '数据库 - 创建正式章节重写任务',
  '数据库 - 创建审核提醒任务',
]) {
  assert(workflowNodes.has(name), `workflow 11 should include node: ${name}`);
}

const workflow17Text = JSON.stringify(workflow17);
assert(workflow17Text.includes("original.status IN ('APPROVED', 'PUBLISHED')"), 'rewrite workflow should read approved current chapter rewrite jobs');
assert(workflow17Text.includes("j.payload->>'rewrite_source'"), 'rewrite workflow should distinguish approved-current rewrite jobs');

const detailCode = read('n8n/code/novel_render_project_detail_html.js');
for (const marker of [
  '小说项目控制台',
  '当前建议操作',
  '设定集',
  '大纲与目录',
  '章节正文与版本',
  '审稿报告',
  '人工审核记录',
  '连续性事实',
  '模型调用日志',
  '失败原因',
  '导出全文 Markdown',
  '继续写作',
  '申请重写此章',
  '重新发送提醒',
  '复制审核链接',
  'chapter-panel',
  'catalog-panel',
  'chapter-drawer-panel',
]) {
  assert(detailCode.includes(marker), `project console renderer should include marker: ${marker}`);
}

assert(!/href=["'][^"']*novel-project-continue/i.test(detailCode), 'continue action must not be exposed as GET link');
assert(!/href=["'][^"']*novel-project-regenerate/i.test(detailCode), 'project regeneration action must not be exposed as GET link');
assert(!/href=["'][^"']*novel-chapter-rewrite-request/i.test(detailCode), 'chapter rewrite action must not be exposed as GET link');
assert(!/href=["'][^"']*novel-review-remind/i.test(detailCode), 'review remind action must not be exposed as GET link');

for (const [file, body] of [
  ['n8n/code/novel_validate_project_continue.js', {body: {project_id: '11111111-1111-1111-1111-111111111111', comment: '继续'}}],
  ['n8n/code/novel_validate_chapter_rewrite_request.js', {body: {chapter_id: '22222222-2222-2222-2222-222222222222', review_token: 'token', comment: '强化冲突'}}],
  ['n8n/code/novel_validate_review_remind.js', {body: {chapter_id: '22222222-2222-2222-2222-222222222222', review_token: 'token'}}],
]) {
  const result = runCodeNode(file, [], body);
  assert.strictEqual(result.length, 1, `${file} should return one item`);
}

for (const file of [
  'n8n/code/novel_validate_project_continue.js',
  'n8n/code/novel_validate_chapter_rewrite_request.js',
  'n8n/code/novel_validate_review_remind.js',
]) {
  assert.throws(() => runCodeNode(file, [], {query: {id: 'x'}}), /POST body/, `${file} should reject query-only GET style input`);
}

const detailRow = {
  is_empty: false,
  id: '11111111-1111-1111-1111-111111111111',
  title: '控制台项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '主角逆袭。',
  target_total_chapters: 3,
  target_words_per_chapter: 1800,
  current_chapter_no: 1,
  status: 'WRITING',
  bible: {
    story_core: '主角在旧城重新崛起。',
    world_setting: '现代都市。',
    main_character: {name: '陆明', identity: '旧城修表师', goal: '翻身', growth_arc: '学会承担'},
    supporting_characters: [{name: '许青', role: '盟友', motivation: '寻找真相'}],
    villain_setting: [{name: '赵衡', role: '阻碍', motivation: '控制旧城'}],
    power_system: '鉴宝能力',
    relationship_map: [{关系: '旧友'}],
    tone_rules: '短句、强冲突',
    forbidden_rules: '不突然跳章',
    selling_points: ['逆袭', '爽点'],
  },
  outlines: JSON.stringify([
    {chapter_no: 1, volume_no: 1, title: '旧城灯火', summary: '主角回到旧城。', chapter_goal: '建立目标', conflict_point: '家族压力', emotional_point: '压抑', hook: '神秘来电', status: 'READY'},
    {chapter_no: 2, volume_no: 1, title: '雨夜重逢', summary: '旧人重逢。', chapter_goal: '推进冲突', conflict_point: '误会爆发', emotional_point: '拉扯', hook: '证据出现', status: 'READY'},
  ]),
  chapters: JSON.stringify([
    {
      id: '22222222-2222-2222-2222-222222222222',
      chapter_no: 1,
      title: '旧城灯火',
      body: '第一章正文。',
      summary: '主角回到旧城并发现线索。',
      word_count: 1200,
      status: 'APPROVED',
      generation_version: 1,
      is_current: true,
      review_token: 'approved-token',
      latest_review_report: {id: 'r1', total_score: 88, consistency_score: 90, readability_score: 86, plot_score: 87, commercial_score: 89, verdict: 'PASS', issues: [], suggestions: ['保留钩子']},
      human_reviews: [{action: 'APPROVE', comment: '通过', reviewer: 'local_user', created_at: '2026-05-03T01:00:00.000Z'}],
      ai_runs: [{run_type: 'REVIEW_CHAPTER', model: 'glm-5.1', success: true, duration_ms: 1200, created_at: '2026-05-03T01:00:00.000Z'}],
      updated_at: '2026-05-03T01:00:00.000Z',
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      chapter_no: 2,
      title: '雨夜重逢',
      body: '第二章候选正文。',
      summary: '旧人重逢。',
      word_count: 1300,
      status: 'NEED_REVIEW',
      generation_version: 1,
      is_current: false,
      review_token: 'review-token',
      latest_review_report: {id: 'r2', total_score: 72, verdict: 'MANUAL_REVIEW', issues: ['节奏略慢'], suggestions: ['加快冲突']},
      human_reviews: [],
      ai_runs: [],
      updated_at: '2026-05-03T01:10:00.000Z',
    },
  ]),
  facts: JSON.stringify([
    {fact_type: 'character', fact_key: '陆明', fact_value: '主角，目标是翻身。', source: 'ai', confidence: 0.9, status: 'ACTIVE', chapter_no: 1},
    {fact_type: 'foreshadowing', fact_key: '神秘来电', fact_value: '第二章继续回收。', source: 'ai', confidence: 0.8, status: 'PENDING', chapter_no: 2},
  ]),
  ai_runs: JSON.stringify([
    {run_type: 'GENERATE_CHAPTER', model: 'glm-5.1', success: true, duration_ms: 2200, chapter_no: 1, created_at: '2026-05-03T01:00:00.000Z'},
  ]),
  jobs: JSON.stringify([
    {job_type: 'GENERATE_CHAPTER', status: 'FAILED', chapter_no: 3, attempt_count: 3, error_message: '测试失败原因', updated_at: '2026-05-03T01:20:00.000Z'},
  ]),
};

const detailHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'chapters'}])[0].json.response_html;
const detailText = visibleText(detailHtml);
for (const expected of [
  '小说项目控制台',
  '章节正文与版本',
  '申请重写此章',
  '重新发送提醒',
  '复制审核链接',
  '审稿报告',
  '人工审核记录',
  '章节模型调用',
  '第一章正文',
]) {
  assert(detailText.includes(expected), `project console chapter view visible text should include: ${expected}`);
}
for (const expected of ['chapter-action-dialog', 'chapter-edit-dialog', 'chapter-body-dialog', 'chapter-info-dialog']) {
  assert(detailHtml.includes(expected), `project console chapter view should expose drawer class: ${expected}`);
}

const detailBibleHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'bible'}])[0].json.response_html;
const detailBibleText = visibleText(detailBibleHtml);
for (const expected of ['设定集', '故事核心', '主角设定']) {
  assert(detailBibleText.includes(expected), `project console bible view visible text should include: ${expected}`);
}
for (const expected of ['<dt>姓名</dt>', '<dt>身份</dt>', '<dt>目标</dt>', '<dt>成长线</dt>', '<dt>定位</dt>', '<dt>动机</dt>']) {
  assert(detailBibleHtml.includes(expected), `project console bible view should localize structured field: ${expected}`);
}
assert(!detailBibleHtml.includes('<dt>name</dt>'), 'project console bible view should not show English JSON keys in display cards');
assert(!detailBibleHtml.includes('<li>{&quot;'), 'project console bible view should not render array objects as raw JSON list items');
assert(!detailBibleHtml.includes('主角设定 JSON'), 'project console bible edit labels should avoid raw JSON wording');

const detailFactsText = visibleText(runCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'facts'}])[0].json.response_html);
assert(detailFactsText.includes('连续性事实'), 'project console facts view should include continuity facts');

const detailOpsText = visibleText(runCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'ops'}])[0].json.response_html);
for (const expected of ['模型调用日志', '失败原因']) {
  assert(detailOpsText.includes(expected), `project console ops view visible text should include: ${expected}`);
}

const detailExportText = visibleText(runCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'export'}])[0].json.response_html);
assert(detailExportText.includes('导出全文 Markdown'), 'project console export view should include Markdown export');

for (const action of [
  'action="/webhook/novel-chapter-rewrite-request"',
  'action="/webhook/novel-review-remind"',
]) {
  assert(detailHtml.includes('method="POST"'), 'project console should include POST forms');
  assert(detailHtml.includes(action), `project console should include ${action}`);
}
const detailIdleHtml = runCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  ...detailRow,
  jobs: JSON.stringify([]),
  chapters: JSON.stringify([JSON.parse(detailRow.chapters)[0]]),
}])[0].json.response_html;
assert(detailIdleHtml.includes('action="/webhook/novel-project-continue"'), 'project console should show continue form when no review/failure/running blocker exists');
assert(!/\b(APPROVED|NEED_REVIEW|GENERATE_CHAPTER|REVIEW_CHAPTER|PENDING|ACTIVE|MANUAL_REVIEW|PASS)\b/.test([detailText, detailBibleText, detailFactsText, detailOpsText, detailExportText].join(' ')), 'project console visible text should not expose internal enums');

const resultHtml = runCodeNode('n8n/code/novel_render_project_action_result.js', [], {
  success: true,
  result_code: 'CHAPTER_JOB_CREATED',
  action: 'CONTINUE_PROJECT',
  project_id: '11111111-1111-1111-1111-111111111111',
  project_status: 'WRITING',
  job_type: 'GENERATE_CHAPTER',
  chapter_no: 2,
  job_id: '44444444-4444-4444-4444-444444444444',
  message: '已创建第 2 章生成任务。',
})[0].json.response_html;

assert(resultHtml.includes('操作已提交'), 'project action result should render success page');
assert(visibleText(resultHtml).includes('已创建章节生成任务'), 'project action result should localize result code');
assert(!/\b(CHAPTER_JOB_CREATED|CONTINUE_PROJECT|WRITING|GENERATE_CHAPTER)\b/.test(visibleText(resultHtml)), 'project action result visible text should not expose internal enums');

console.log(JSON.stringify({
  ok: true,
  phase: 18,
  checks: [
    '项目控制台展示设定集大纲章节版本审稿事实日志',
    '继续写作和重写申请只走 POST',
    '重新发送提醒只走 POST',
    '正式章节重写不改旧正式版本',
    '页面可导出当前正式版本 Markdown',
  ],
}, null, 2));
