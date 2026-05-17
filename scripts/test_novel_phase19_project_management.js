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

const commonWidth = 'main { width: min(1240px, calc(100vw - 32px)); margin: 24px auto 48px; }';
for (const renderer of [
  'n8n/code/novel_render_center_html.js',
  'n8n/code/novel_render_project_list_html.js',
  'n8n/code/novel_render_project_create_html.js',
  'n8n/code/novel_render_review_html.js',
  'n8n/code/novel_render_queue_status_html.js',
  'n8n/code/novel_render_daily_report_html.js',
]) {
  assert(read(renderer).includes(commonWidth), `${renderer} should use the unified main width`);
}

for (const [workflowNo, workflowName] of [
  ['11', 'center'],
  ['14', 'chapter'],
  ['15', 'ai_review'],
  ['16', 'review'],
  ['17', 'rewrite_notify'],
]) {
  const root = readJson(`n8n/workflow/${workflowNo}_novel_${workflowName}_workflow.json`);
  const available = readJson(`n8n/workflow/available/${workflowNo}_novel_${workflowName}_workflow.json`);
  assert.strictEqual(JSON.stringify(root), JSON.stringify(available), `${workflowNo} root and available workflow copies should match`);
}

const workflow11 = readJson('n8n/workflow/11_novel_center_workflow.json');
const nodes11 = new Map(workflow11.nodes.map((node) => [node.name, node]));

for (const [name, pathName] of [
  ['Webhook - 小说设定集编辑', 'novel-bible-update'],
  ['Webhook - 小说设定集补丁操作', 'novel-bible-patch-action'],
  ['Webhook - 小说大纲编辑', 'novel-outline-update'],
  ['Webhook - 小说项目目标修改', 'novel-project-targets-update'],
  ['Webhook - 项目扩写剧情AI创意', 'novel-project-expansion-ai-assist'],
  ['Webhook - 小说项目暂停恢复', 'novel-project-status-toggle'],
  ['Webhook - 小说已归档项目清理', 'novel-archived-projects-cleanup'],
]) {
  assert.strictEqual(nodes11.get(name)?.parameters?.httpMethod, 'POST', `${name} must be POST`);
  assert.strictEqual(nodes11.get(name)?.parameters?.path, pathName, `${name} should use ${pathName}`);
}

const detailCode = read('n8n/code/novel_render_project_detail_html.js');
const projectListCode = read('n8n/code/novel_render_project_list_html.js');
for (const marker of [
  '一键清理已归档项目',
  '/webhook/novel-archived-projects-cleanup',
  'CLEAR_ARCHIVED_PROJECTS',
]) {
  assert(projectListCode.includes(marker), `project list should include archived cleanup marker: ${marker}`);
}
for (const marker of [
  'bible-card-actions',
  '编辑本章大纲',
  '项目目标与扩写计划',
  'select name="target_words_per_chapter"',
  'textarea name="expansion_request"',
  'data-ai-expansion',
  'AI创意',
  '/webhook/novel-project-expansion-ai-assist',
  'data-expansion-ai-feedback',
  'select name="expansion_scope"',
  '只追加新章节',
  '保留约束',
  '扩写设定补丁',
  '/webhook/novel-bible-patch-action',
  '深度长章 4000 字',
  '字数越高，导演台分段数和生成耗时通常也会增加',
  '暂停项目',
  '恢复项目',
  '归档项目',
  'data-confirm-title',
  '项目操作记录',
  '/webhook/novel-bible-update',
  '/webhook/novel-outline-update',
  '/webhook/novel-project-targets-update',
  '/webhook/novel-project-status-toggle',
]) {
  assert(detailCode.includes(marker), `project console should include Phase 19 marker: ${marker}`);
}

assert(!/href=["'][^"']*(novel-bible-update|novel-outline-update|novel-project-targets-update|novel-project-status-toggle)/i.test(detailCode), 'project management actions must not be exposed as GET links');

for (const workflowPath of [
  'n8n/workflow/12_novel_bible_workflow.json',
  'n8n/workflow/13_novel_outline_workflow.json',
  'n8n/workflow/14_novel_chapter_workflow.json',
  'n8n/workflow/15_novel_ai_review_workflow.json',
  'n8n/workflow/17_novel_rewrite_notify_workflow.json',
]) {
  assert(read(workflowPath).includes("p.status NOT IN ('PAUSED', 'ARCHIVED')"), `${workflowPath} should skip paused and archived projects when claiming queue jobs`);
}

const uuid = '19190000-0000-0000-0000-000000000001';
const outlineId = '19190000-0000-0000-0000-000000000011';
const detailRow = {
  is_empty: false,
  id: uuid,
  title: '第十九阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证管理表单。',
  target_total_chapters: 4,
  target_words_per_chapter: 1800,
  current_chapter_no: 1,
  status: 'WRITING',
  bible: JSON.stringify({
    id: '19190000-0000-0000-0000-000000000012',
    world_setting: '城市旧巷',
    story_core: '主角翻盘',
    main_character: {名字: '林川'},
    supporting_characters: [{名字: '阿宁'}],
    villain_setting: [{名字: '沈老板'}],
    power_system: '鉴宝能力有限制',
    relationship_map: [{关系: '盟友'}],
    organizations: [{name: '沈氏商会', type: '商会', leader: '沈老板'}],
    locations: [{name: '旧货街', story_function: '冲突发生地'}],
    plot_constraints: [{constraint: '第3章前不能揭露商会后台'}],
    expansion_notes: '后续扩写商会线。',
    tone_rules: '紧凑',
    forbidden_rules: '不跳设定',
    selling_points: ['反转'],
  }),
  outlines: JSON.stringify([
    {id: outlineId, chapter_no: 1, volume_no: 1, title: '旧城灯火', summary: '主角回城。', chapter_goal: '建立目标', conflict_point: '压力', emotional_point: '压抑', hook: '来电', status: 'READY'},
  ]),
  chapters: JSON.stringify([
    {id: '19190000-0000-0000-0000-000000000021', chapter_no: 1, title: '旧城灯火', body: '第一章正文。', summary: '主角回城。', word_count: 1200, status: 'APPROVED', generation_version: 1, is_current: true, review_token: 'phase19-token', updated_at: '2026-05-03T01:00:00.000Z'},
  ]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([]),
  bible_patches: JSON.stringify([
    {
      id: '19190000-0000-0000-0000-000000000031',
      status: 'PENDING',
      expansion_request: '新增商会线。',
      expansion_scope: 'append_only',
      patch_payload: {
        summary: '补商会组织。',
        new_organizations: [{name: '沈氏商会', type: '商会', leader: '沈老板'}],
        plot_constraints: [{constraint: '第3章前不能揭露商会后台'}],
      },
      risk_notes: [],
      created_at: '2026-05-03T01:12:00.000Z',
    },
  ]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([
    {event_type: 'BIBLE_UPDATED', actor: 'phase19_test', comment: '补充主角动机', created_at: '2026-05-03T01:10:00.000Z'},
    {event_type: 'PROJECT_TARGET_UPDATED', actor: 'phase19_test', comment: '扩展章节', created_at: '2026-05-03T01:11:00.000Z'},
  ]),
};

const detailOverviewText = visibleText(runListCodeNode('n8n/code/novel_render_project_detail_html.js', [detailRow])[0].json.response_html);
const detailBibleHtml = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'bible'}])[0].json.response_html;
const detailBibleText = visibleText(detailBibleHtml);
const detailBibleAppliedPatchHtml = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  ...detailRow,
  requested_view: 'bible',
  bible_patches: JSON.stringify([
    {
      id: '19190000-0000-0000-0000-000000000032',
      status: 'APPLIED',
      expansion_request: '已合并商会线。',
      expansion_scope: 'append_only',
      patch_payload: {summary: '已合并进正式设定集。'},
      created_at: '2026-05-03T01:20:00.000Z',
    },
  ]),
}])[0].json.response_html;
const detailOutlineText = visibleText(runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'outline'}])[0].json.response_html);
const detailOpsHtml = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{...detailRow, requested_view: 'ops'}])[0].json.response_html;
const detailOpsText = visibleText(detailOpsHtml);
const combinedDetailText = [detailOverviewText, detailBibleText, detailOutlineText, detailOpsText].join(' ');

for (const expected of ['小说项目控制台', '标题设置', '项目目标与扩写计划', '暂停项目']) {
  assert(detailOverviewText.includes(expected), `project console overview visible text should include: ${expected}`);
}
const detailOverviewHtml = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [detailRow])[0].json.response_html;
assert(
  detailOverviewHtml.indexOf('<summary><span>标题设置</span>') < detailOverviewHtml.indexOf('<summary><span>项目目标与扩写计划</span>'),
  'project title controls should be isolated before project target controls'
);
assert(detailOverviewHtml.includes('<button type="submit">保存标题设置</button>'), 'project console should expose a separate title settings submit');
assert(detailOverviewHtml.includes('项目标题请在“标题设置”里单独修改'), 'project target form should direct title edits to the separate title settings block');
assert(detailOverviewHtml.includes('action="/webhook/novel-project-archive-toggle"'), 'project console should expose archive through POST form');
assert(detailOverviewHtml.includes('data-confirm-title="第十九阶段项目"'), 'archive form should carry the exact title for client-side confirmation');
assert(detailOverviewHtml.includes('name="confirm_title" autocomplete="off" required'), 'archive confirmation input should be required before submit');
assert(detailOverviewHtml.includes('必须完整输入项目名'), 'archive form should explain placeholder is not enough');
assert(detailBibleHtml.includes('data-open-dialog="bible-edit-story-core"'), 'project console bible view should expose per-setting Bible edit buttons on cards');
assert(detailBibleHtml.includes('class="side-dialog bible-field-edit-dialog"'), 'project console bible view should open per-setting Bible edit drawers');
assert(detailBibleText.includes('扩写设定补丁待确认') && detailBibleHtml.includes('/webhook/novel-bible-patch-action'), 'project console Bible view should expose confirmable expansion Bible patches');
assert(!detailBibleAppliedPatchHtml.includes('id="bible-patch-section"'), 'project console Bible view should not show historical applied patches above the current Bible');
assert(detailOutlineText.includes('编辑本章大纲'), 'project console outline view should expose outline edit forms');
for (const expected of ['项目操作记录', '设定集已编辑', '项目目标已修改']) {
  assert(detailOpsText.includes(expected), `project console ops view should include: ${expected}`);
}
assert(detailOpsHtml.includes('<option value="1800" selected>当前 1800 字（自定义）</option>'), 'project ops should preserve custom current word target when it is not in the dropdown preset list');

const rawVisibleEnums = /\b(BIBLE_UPDATED|BIBLE_PATCH_CREATED|OUTLINE_UPDATED|PROJECT_TARGET_UPDATED|PROJECT_PAUSED|PROJECT_RESUMED|PAUSE|RESUME|CREATED|GENERATE_BIBLE|GENERATE_BIBLE_PATCH|GENERATE_OUTLINE|PENDING|RUNNING|SUCCEEDED|FAILED)\b/;
assert(!rawVisibleEnums.test(combinedDetailText), `project console visible text should not expose internal enums: ${combinedDetailText}`);

const bibleValidation = runSingleCodeNode('n8n/code/novel_validate_bible_update.js', {
  body: {
    project_id: uuid,
    world_setting: '世界',
    story_core: '核心',
    main_character_json: '{"名字":"林川"}',
    supporting_characters_json: '[]',
    villain_setting_json: '[]',
    relationship_map_json: '[]',
    organizations_json: '[{"名称":"沈氏商会","负责人":"沈老板"}]',
    locations_json: '[{"名称":"旧货街","剧情功能":"冲突发生地"}]',
    plot_constraints_json: '[{"约束":"第3章前不能揭露商会后台"}]',
    expansion_notes: '后续扩写商会线。',
    selling_points_json: '[]',
  },
})[0].json;
assert.strictEqual(bibleValidation.project_id, uuid, 'Bible validator should accept POST body');
assert.strictEqual(JSON.parse(bibleValidation.organizations_json)[0].leader, '沈老板', 'Bible validator should normalize organizations');
assert.strictEqual(JSON.parse(bibleValidation.locations_json)[0].story_function, '冲突发生地', 'Bible validator should normalize locations');
assert.strictEqual(JSON.parse(bibleValidation.plot_constraints_json)[0].constraint, '第3章前不能揭露商会后台', 'Bible validator should normalize plot constraints');
assert.throws(
  () => runSingleCodeNode('n8n/code/novel_validate_bible_update.js', {query: {project_id: uuid}}),
  /POST body/,
  'Bible validator should reject query-only submissions'
);

const outlineValidation = runSingleCodeNode('n8n/code/novel_validate_outline_update.js', {
  body: {project_id: uuid, outline_id: outlineId, volume_no: '1', title: '新标题'},
})[0].json;
assert.strictEqual(outlineValidation.outline_id, outlineId, 'Outline validator should accept POST body');

const targetValidation = runSingleCodeNode('n8n/code/novel_validate_project_targets_update.js', {
  body: {
    project_id: uuid,
    target_total_chapters: '8',
    target_words_per_chapter: '2000',
    expansion_request: '新增女主身世线和反派商会。',
    expansion_scope: '重排未写章节',
    expansion_constraints: '已批准正文不改；已激活事实不破坏。',
  },
})[0].json;
assert.strictEqual(targetValidation.target_total_chapters, 8, 'Target validator should parse chapter target');
assert.strictEqual(targetValidation.expansion_scope, 'rewrite_unwritten', 'Target validator should normalize expansion scope');
assert(targetValidation.expansion_request.includes('女主身世线'), 'Target validator should preserve expansion requirements');

const biblePatchValidation = runSingleCodeNode('n8n/code/novel_validate_bible_patch_action.js', {
  body: {
    patch_id: '19190000-0000-0000-0000-000000000031',
    patch_action: '重新生成',
    comment: '冲突较多',
    reviewer: 'phase19_test',
  },
})[0].json;
assert.strictEqual(biblePatchValidation.patch_action, 'REGENERATE', 'Bible patch validator should normalize regenerate action');

const pauseValidation = runSingleCodeNode('n8n/code/novel_validate_project_status_toggle.js', {
  body: {project_id: uuid, desired_action: 'pause'},
})[0].json;
assert.strictEqual(pauseValidation.desired_action, 'PAUSE', 'Pause validator should normalize action');

const archiveValidation = runSingleCodeNode('n8n/code/novel_validate_project_archive_toggle.js', {
  body: {project_id: uuid, desired_action: 'archive', confirm_title: '第十九阶段项目'},
})[0].json;
assert.strictEqual(archiveValidation.desired_action, 'ARCHIVE', 'Archive validator should normalize action');
const blankArchiveValidation = runSingleCodeNode('n8n/code/novel_validate_project_archive_toggle.js', {
  body: {project_id: uuid, desired_action: 'archive', confirm_title: ''},
})[0].json;
assert.strictEqual(blankArchiveValidation.confirm_title, '', 'Archive validator should pass blank title to SQL for friendly result rendering');

const archivedCleanupValidation = runSingleCodeNode('n8n/code/novel_validate_archived_projects_cleanup.js', {
  body: {cleanup_action: '清理已归档项目', reviewer: 'phase19_test'},
})[0].json;
assert.strictEqual(archivedCleanupValidation.cleanup_action, 'CLEAR_ARCHIVED_PROJECTS', 'Archived project cleanup validator should normalize action');
assert.strictEqual(archivedCleanupValidation.action, 'CLEAR_ARCHIVED_PROJECTS', 'Archived project cleanup should expose a result action label');

console.log(JSON.stringify({
  ok: true,
  phase: 19,
  checks: [
    '六个入口页面主宽度一致',
    '项目控制台包含设定集大纲目标和暂停恢复表单',
    '项目管理动作只走 POST',
    '暂停项目后队列领取会跳过',
    '项目操作记录中文展示',
  ],
}, null, 2));
