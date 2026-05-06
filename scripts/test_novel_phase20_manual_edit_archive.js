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

function runListCodeNode(relativePath, rows) {
  const source = read(relativePath);
  const script = new vm.Script(`(function() {\n${source}\n})()`, {filename: relativePath});
  const sandbox = {
    $input: {all: () => rows.map((json) => ({json}))},
    Intl,
    Date,
    Number,
    String,
    Array,
    JSON,
    encodeURIComponent,
    URLSearchParams,
  };
  vm.createContext(sandbox);
  return script.runInContext(sandbox);
}

function runSingleCodeNode(relativePath, json) {
  const source = read(relativePath);
  const script = new vm.Script(`(function() {\n${source}\n})()`, {filename: relativePath});
  const sandbox = {
    $json: json,
    Number,
    String,
    JSON,
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

const schema = read('sql/47_novel_schema.sql');
for (const marker of [
  "'ARCHIVED'",
  "'MANUAL_EDIT'",
  "'CHAPTER_MANUAL_EDIT_CREATED'",
  "'PROJECT_ARCHIVED'",
  "'PROJECT_RESTORED'",
]) {
  assert(schema.includes(marker), `schema should include Phase 20 marker ${marker}`);
}

const functionsSql = read('sql/48_novel_functions.sql');
for (const marker of [
  'create_novel_manual_chapter_candidate',
  'set_novel_project_archive_state',
  'MANUAL_CHAPTER_CANDIDATE_CREATED',
  'CONFIRM_TITLE_MISMATCH',
  'PROJECT_ARCHIVED',
]) {
  assert(functionsSql.includes(marker), `functions should include Phase 20 marker ${marker}`);
}

for (const generatorPath of [
  'scripts/generate_novel_phase3_workflows.js',
  'scripts/generate_novel_phase4_workflows.js',
  'scripts/generate_novel_phase6_workflows.js',
]) {
  assert(read(generatorPath).includes("p.status NOT IN ('PAUSED', 'ARCHIVED')"), `${generatorPath} should skip paused and archived projects`);
}

assert(read('scripts/generate_novel_phase3_workflows.js').includes('save_novel_chapter_manual_edit'), 'phase3 workflow should support direct in-place manual chapter saves');
assert(read('scripts/generate_novel_phase3_workflows.js').includes('create_novel_manual_chapter_candidate'), 'phase3 workflow should keep manual edit candidate review saves');

const workflow11 = readJson('n8n/workflow/11_novel_center_workflow.json');
const available11 = readJson('n8n/workflow/available/11_novel_center_workflow.json');
assert.strictEqual(JSON.stringify(workflow11), JSON.stringify(available11), '11 root and available workflow copies should match');

const nodes11 = new Map(workflow11.nodes.map((node) => [node.name, node]));
for (const [name, pathName] of [
  ['Webhook - 小说正文手动编辑', 'novel-chapter-manual-edit'],
  ['Webhook - 小说项目归档恢复', 'novel-project-archive-toggle'],
]) {
  assert.strictEqual(nodes11.get(name)?.parameters?.httpMethod, 'POST', `${name} must be POST`);
  assert.strictEqual(nodes11.get(name)?.parameters?.path, pathName, `${name} should use ${pathName}`);
}

const detailCode = read('n8n/code/novel_render_project_detail_html.js');
for (const marker of [
  '手动编辑正文',
  '保存为候选稿并送审',
  '直接保存',
  '归档项目',
  '恢复归档项目',
  '/webhook/novel-chapter-manual-edit',
  '/webhook/novel-project-archive-toggle',
]) {
  assert(detailCode.includes(marker), `project console should include Phase 20 marker: ${marker}`);
}

assert(!/href=["'][^"']*(novel-chapter-manual-edit|novel-project-archive-toggle)/i.test(detailCode), 'manual edit and archive actions must not be GET links');

const uuid = '19200000-0000-0000-0000-000000000001';
const chapterId = '19200000-0000-0000-0000-000000000021';
const detailRow = {
  is_empty: false,
  id: uuid,
  title: '第二十阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证正文编辑和归档。',
  target_total_chapters: 3,
  target_words_per_chapter: 1800,
  current_chapter_no: 1,
  status: 'WRITING',
  bible: JSON.stringify({story_core: '主角翻盘'}),
  outlines: JSON.stringify([
    {id: '19200000-0000-0000-0000-000000000011', chapter_no: 1, volume_no: 1, title: '旧城灯火', summary: '主角回城。', status: 'READY'},
  ]),
  chapters: JSON.stringify([
    {id: chapterId, chapter_no: 1, title: '旧城灯火', body: '第一章正式正文。', summary: '主角回城。', word_count: 1200, status: 'APPROVED', generation_version: 1, is_current: true, review_token: 'phase20-token', updated_at: '2026-05-03T01:00:00.000Z'},
  ]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([
    {event_type: 'CHAPTER_MANUAL_EDIT_CREATED', actor: 'phase20_test', comment: '手动调整正文', chapter_id: chapterId, created_at: '2026-05-03T01:10:00.000Z'},
    {event_type: 'PROJECT_ARCHIVED', actor: 'phase20_test', comment: '归档测试', created_at: '2026-05-03T01:11:00.000Z'},
  ]),
};

const detailOverviewText = visibleText(runListCodeNode('n8n/code/novel_render_project_detail_html.js', [detailRow])[0].json.response_html);
const detailChaptersText = visibleText(runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'chapters'}])[0].json.response_html);
const detailOpsText = visibleText(runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'ops'}])[0].json.response_html);

assert(detailOverviewText.includes('归档项目'), 'project console overview should expose archive action');
for (const expected of ['手动编辑正文', '保存为候选稿并送审', '直接保存']) {
  assert(detailChaptersText.includes(expected), `project console chapter view visible text should include: ${expected}`);
}
for (const expected of ['正文候选稿已创建', '项目已归档']) {
  assert(detailOpsText.includes(expected), `project console ops view visible text should include: ${expected}`);
}

const rawVisibleEnums = /\b(CHAPTER_MANUAL_EDIT_CREATED|PROJECT_ARCHIVED|PROJECT_RESTORED|MANUAL_CHAPTER_CANDIDATE_CREATED|ARCHIVED|MANUAL_EDIT_CHAPTER|ARCHIVE_PROJECT|RESTORE_PROJECT|REVIEW_CHAPTER|APPROVED)\b/;
const combinedDetailText = [detailOverviewText, detailChaptersText, detailOpsText].join(' ');
assert(!rawVisibleEnums.test(combinedDetailText), `project console visible text should not expose internal enums: ${combinedDetailText}`);

const manualValidation = runSingleCodeNode('n8n/code/novel_validate_chapter_manual_edit.js', {
  body: {
    chapter_id: chapterId,
    review_token: 'phase20-token',
    title: '新标题',
    summary: '新摘要',
    body: '新正文',
    comment: '手动修改',
  },
})[0].json;
assert.strictEqual(manualValidation.action, 'MANUAL_EDIT_CHAPTER', 'manual edit validator should normalize action');
assert.strictEqual(manualValidation.body, '新正文', 'manual edit validator should preserve body');
assert.strictEqual(manualValidation.edit_mode, 'CANDIDATE_REVIEW', 'manual edit validator should default to candidate review saves');
const manualDirectValidation = runSingleCodeNode('n8n/code/novel_validate_chapter_manual_edit.js', {
  body: {
    chapter_id: chapterId,
    review_token: 'phase20-token',
    title: '新标题',
    body: '新正文',
    edit_mode: 'direct_save',
  },
})[0].json;
assert.strictEqual(manualDirectValidation.edit_mode, 'DIRECT_SAVE', 'manual edit validator should support direct saves');
assert.throws(
  () => runSingleCodeNode('n8n/code/novel_validate_chapter_manual_edit.js', {query: {chapter_id: chapterId}}),
  /POST body/,
  'manual edit validator should reject query-only submissions'
);

const archiveValidation = runSingleCodeNode('n8n/code/novel_validate_project_archive_toggle.js', {
  body: {
    project_id: uuid,
    desired_action: 'delete',
    confirm_title: '第二十阶段项目',
  },
})[0].json;
assert.strictEqual(archiveValidation.desired_action, 'ARCHIVE', 'archive validator should normalize delete to archive');
assert.strictEqual(archiveValidation.action, 'ARCHIVE_PROJECT', 'archive validator should emit archive action');

const restoreValidation = runSingleCodeNode('n8n/code/novel_validate_project_archive_toggle.js', {
  body: {
    project_id: uuid,
    desired_action: 'restore',
  },
})[0].json;
assert.strictEqual(restoreValidation.desired_action, 'RESTORE', 'archive validator should accept restore without title confirmation');

console.log(JSON.stringify({
  ok: true,
  phase: 20,
  checks: [
    '正文手动编辑只走 POST',
    '手动正文支持直接保存与候选送审',
    '项目归档是软删除并只走 POST',
    '归档项目会被队列领取跳过',
    '项目控制台中文展示新增操作',
  ],
}, null, 2));
