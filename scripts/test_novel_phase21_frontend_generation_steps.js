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
    Buffer,
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
    Buffer,
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

function workflowNode(workflow, name) {
  const node = workflow.nodes.find((item) => item.name === name);
  assert(node, `workflow should include node: ${name}`);
  return node;
}

function connectionTargets(workflow, name, outputIndex = 0) {
  return (workflow.connections?.[name]?.main?.[outputIndex] || []).map((connection) => connection.node);
}

const projectId = '21000000-0000-0000-0000-000000000001';

const createHtml = runListCodeNode('n8n/code/novel_render_project_create_result_html.js', [{
  success: true,
  id: projectId,
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  status: 'CREATED',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  generation_job_id: '21000000-0000-0000-0000-000000000011',
  job_type: 'GENERATE_BIBLE',
  job_status: 'PENDING',
}])[0].json.response_html;

assert(createHtml.includes('action="/webhook/novel-generate-bible-now"'), 'create result should provide POST action for starting Bible generation');
assert(createHtml.includes('启动设定集生成'), 'create result should show background Bible generation button');
assert(createHtml.includes('后台执行并刷新状态'), 'create result should explain that generation continues in the background without a second result page');
assert(createHtml.includes('fetch(form.action'), 'create result should start generation in-place instead of navigating to another result page');
assert(createHtml.includes("window.location.href = '/webhook/novel-project-detail?project_id="), 'create result should return users to the project console after starting generation');
assert(!/href=["'][^"']*novel-generate-bible-now/i.test(createHtml), 'Bible generation must not be exposed as GET link');
assert(visibleText(createHtml).includes('当前状态显示待生成设定集'), 'create result should explain queued-but-not-generated status');

const detailWithBibleJob = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: projectId,
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证前端推进生成。',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  current_chapter_no: 0,
  status: 'CREATED',
  bible: JSON.stringify({}),
  outlines: JSON.stringify([]),
  chapters: JSON.stringify([]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([
    {id: '21000000-0000-0000-0000-000000000021', job_type: 'GENERATE_BIBLE', status: 'PENDING', attempt_count: 0, updated_at: '2026-05-04T01:00:00.000Z'},
  ]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
}])[0].json.response_html;

const detailBibleText = visibleText(detailWithBibleJob);
assert(detailWithBibleJob.includes('action="/webhook/novel-generate-bible-now"'), 'project console should provide POST action for pending Bible job');
assert(detailBibleText.includes('启动设定集生成'), 'project console should tell users to start Bible generation');
assert(detailBibleText.includes('启动后台任务'), 'project console should distinguish background model execution from queue enqueueing');
assert(detailWithBibleJob.includes('fetch(form.action'), 'project console actions should submit in place and avoid secondary result pages');
assert(detailWithBibleJob.includes('window.location.reload()'), 'project console actions should reload current context after POST succeeds');
assert(!detailWithBibleJob.includes('action="/webhook/novel-project-continue"'), 'project console should avoid competing queue action while Bible start is pending');
assert(!detailBibleText.includes('排队下一步'), 'project console should not present queue enqueueing as a competing primary action while Bible start is pending');
assert(!/href=["'][^"']*novel-generate-bible-now/i.test(detailWithBibleJob), 'project console Bible generation must not be GET link');

const detailWithOutlineJob = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: projectId,
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证前端推进生成。',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  current_chapter_no: 0,
  status: 'BIBLE_READY',
  bible: JSON.stringify({story_core: '主角从低谷翻身。'}),
  outlines: JSON.stringify([]),
  chapters: JSON.stringify([]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([
    {id: '21000000-0000-0000-0000-000000000022', job_type: 'GENERATE_OUTLINE', status: 'PENDING', attempt_count: 0, updated_at: '2026-05-04T01:05:00.000Z'},
  ]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
}])[0].json.response_html;

assert(detailWithOutlineJob.includes('action="/webhook/novel-generate-outline-now"'), 'project console should provide POST action for pending outline job');
assert(visibleText(detailWithOutlineJob).includes('启动大纲生成'), 'project console should tell users to start outline generation');
assert(!detailWithOutlineJob.includes('action="/webhook/novel-project-continue"'), 'project console should avoid competing queue action while outline start is pending');
assert(!/href=["'][^"']*novel-generate-outline-now/i.test(detailWithOutlineJob), 'project console outline generation must not be GET link');

const detailWithOutlineJobAndStaleReview = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: projectId,
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证重跑后优先启动新大纲。',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  current_chapter_no: 1,
  status: 'BIBLE_READY',
  bible: JSON.stringify({story_core: '主角从低谷翻身。'}),
  outlines: JSON.stringify([{chapter_no: 1, title: '旧第一章', summary: '旧大纲', status: 'READY'}]),
  chapters: JSON.stringify([{id: '21000000-0000-0000-0000-000000000033', chapter_no: 1, title: '旧第一章', body: '旧候选正文', status: 'NEED_REVIEW'}]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([
    {id: '21000000-0000-0000-0000-000000000024', job_type: 'GENERATE_OUTLINE', status: 'PENDING', attempt_count: 0, updated_at: '2026-05-04T01:06:00.000Z'},
  ]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
}])[0].json.response_html;
const detailWithOutlineJobAndStaleReviewText = visibleText(detailWithOutlineJobAndStaleReview);
assert(detailWithOutlineJobAndStaleReviewText.includes('下一步动作区：启动大纲生成'), 'pending regeneration outline job should outrank stale review prompts');
assert(detailWithOutlineJobAndStaleReviewText.includes('旧待审章节仍保留 1 个'), 'project console should explain why old review is not the current next action');
assert(!detailWithOutlineJobAndStaleReviewText.includes('下一步动作区：先处理人工审核'), 'stale review should not override active regeneration flow');

const detailWithRunningOutlineJob = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: projectId,
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证重跑运行态。',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  current_chapter_no: 1,
  status: 'BIBLE_READY',
  bible: JSON.stringify({story_core: '主角从低谷翻身。'}),
  outlines: JSON.stringify([{chapter_no: 1, title: '旧第一章', summary: '旧大纲', status: 'READY'}]),
  chapters: JSON.stringify([{id: '21000000-0000-0000-0000-000000000034', chapter_no: 1, title: '旧第一章', body: '旧候选正文', status: 'NEED_REVIEW'}]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([
    {id: '21000000-0000-0000-0000-000000000025', job_type: 'GENERATE_OUTLINE', status: 'RUNNING', attempt_count: 1, updated_at: '2026-05-04T01:07:00.000Z'},
  ]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
}])[0].json.response_html;
const detailWithRunningOutlineJobText = visibleText(detailWithRunningOutlineJob);
assert(detailWithRunningOutlineJobText.includes('下一步动作区：大纲正在生成'), 'running regeneration outline job should show the concrete generation state');
assert(detailWithRunningOutlineJobText.includes('后台运行中'), 'running generation should be labeled as a background running task');
assert(!detailWithRunningOutlineJob.includes('action="/webhook/novel-project-continue"'), 'project console should not show continue queue action while generation is already running');
assert(!detailWithRunningOutlineJobText.includes('下一步动作区：等待队列推进'), 'running generation must not degrade to vague queue waiting copy');

const detailBibleViewWithAssets = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: projectId,
  requested_view: 'bible',
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证重跑入口。',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  current_chapter_no: 1,
  status: 'OUTLINE_READY',
  bible: JSON.stringify({story_core: '主角从低谷翻身。', main_character: {name: '林昼'}}),
	  outlines: JSON.stringify([{chapter_no: 1, title: '第一章', summary: '开局冲突', status: 'READY'}]),
	  director_cards: JSON.stringify([{id: '21000000-0000-0000-0000-000000000123', chapter_no: 1, version: 1, is_current: true, status: 'READY', source: 'AI', card_payload: {quality_gate: {pass: true, blocking_issues: []}, segment_plan: [{segment_no: 1}]}}]),
	  chapters: JSON.stringify([]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
}])[0].json.response_html;
const detailBibleAssetText = visibleText(detailBibleViewWithAssets);
assert(detailBibleViewWithAssets.includes('action="/webhook/novel-project-regenerate"'), 'Bible view should expose POST regeneration action');
assert(detailBibleViewWithAssets.includes('name="step" value="BIBLE"'), 'Bible regeneration form should submit Bible step');
assert(detailBibleViewWithAssets.includes('name="regenerate_prompt"'), 'Bible regeneration form should submit a new core idea prompt');
assert(detailBibleViewWithAssets.includes('data-open-dialog="regenerate-bible-drawer"'), 'Bible regeneration should be opened from a top-right button');
assert(detailBibleViewWithAssets.includes('class="side-dialog regenerate-dialog"'), 'Bible regeneration form should live in a right-side drawer dialog');
assert(!detailBibleViewWithAssets.includes('data-open-dialog="bible-edit-drawer"'), 'Bible edit should no longer use the old top-right all-fields button');
assert(!detailBibleViewWithAssets.includes('id="bible-edit-drawer"'), 'Bible edit should no longer render the old all-fields drawer');
for (const expected of ['核心摘要', '人物设定', '生成约束', 'class="side-dialog bible-card-dialog"', 'data-open-dialog="bible-card-story-core">打开详情</button>', 'class="bible-card-actions"', 'data-open-dialog="bible-edit-story-core"', 'class="side-dialog bible-field-edit-dialog"', '保存故事核心']) {
  assert(detailBibleViewWithAssets.includes(expected), `Bible workspace should expose grouped drawer cards: ${expected}`);
}
assert(detailBibleViewWithAssets.includes('.bible-card-actions button { width: 100%; height: 34px; min-height: 34px;'), 'Bible card action buttons should keep equal heights across cards');
assert(!/<section id="bible-section" aria-label="设定集">\s*<div class="section-title"><h2>设定集<\/h2>/.test(detailBibleViewWithAssets), 'Bible section body should not repeat the tab title');
assert(!detailBibleViewWithAssets.includes('<details class="action-detail danger-detail regenerate-detail">'), 'Bible regeneration should not use inline expanded details');
assert(
  detailBibleViewWithAssets.indexOf('data-open-dialog="regenerate-bible-drawer"') < detailBibleViewWithAssets.indexOf('id="bible-section"'),
  'Bible regeneration button should sit in the current tab header before the Bible section body'
);
assert(detailBibleAssetText.includes('重新生成设定集'), 'Bible view should label regeneration clearly');
assert(detailBibleAssetText.includes('更新核心创意并重排大纲'), 'Bible regeneration should explain impact');
assert(detailBibleAssetText.includes('新的核心创意 / 生成要求'), 'Bible regeneration should tell users the field affects generation');
assert(!/href=["'][^"']*novel-project-regenerate/i.test(detailBibleViewWithAssets), 'Bible regeneration must not be a GET link');

const detailOutlineViewWithAssets = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: projectId,
  requested_view: 'outline',
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证重跑入口。',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  current_chapter_no: 1,
  status: 'OUTLINE_READY',
  bible: JSON.stringify({story_core: '主角从低谷翻身。', main_character: {name: '林昼'}}),
  outlines: JSON.stringify([{chapter_no: 1, title: '第一章', summary: '开局冲突', status: 'READY'}]),
  chapters: JSON.stringify([{id: '21000000-0000-0000-0000-000000000031', chapter_no: 1, title: '第一章', body: '第一章正文', status: 'APPROVED', is_current: true}]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
}])[0].json.response_html;
const detailOutlineAssetText = visibleText(detailOutlineViewWithAssets);
assert(detailOutlineViewWithAssets.includes('action="/webhook/novel-project-regenerate"'), 'outline view should expose POST regeneration action');
assert(detailOutlineViewWithAssets.includes('name="step" value="OUTLINE"'), 'outline regeneration form should submit outline step');
assert(detailOutlineViewWithAssets.includes('data-open-dialog="regenerate-outline-drawer"'), 'outline regeneration should be opened from a top-right button');
assert(detailOutlineViewWithAssets.includes('class="side-dialog regenerate-dialog"'), 'outline regeneration form should live in a right-side drawer dialog');
assert(!detailOutlineViewWithAssets.includes('<details class="action-detail danger-detail regenerate-detail">'), 'outline regeneration should not use inline expanded details');
assert(
  detailOutlineViewWithAssets.indexOf('data-open-dialog="regenerate-outline-drawer"') < detailOutlineViewWithAssets.indexOf('id="catalog-section"'),
  'outline regeneration button should sit in the current tab header before the outline section body'
);
assert(detailOutlineViewWithAssets.includes('class="outline-workbench"'), 'outline view should render as an outline workbench');
assert(detailOutlineViewWithAssets.includes('class="outline-dashboard"'), 'outline workbench should expose a status strip before chapter panels');
assert(detailOutlineViewWithAssets.includes('data-chapter-filter="unwritten"'), 'outline workbench should expose unwritten filter');
assert(detailOutlineViewWithAssets.includes('data-chapter-filter="director-blocked"'), 'outline workbench should expose director blocker filter');
assert(detailOutlineViewWithAssets.includes('data-chapter-filter="no-director"'), 'outline workbench should expose no-director filter');
assert(detailOutlineViewWithAssets.includes('data-catalog-action="expand-all"'), 'outline workbench should expose expand-all controls');
assert(detailOutlineAssetText.includes('重新生成大纲'), 'outline view should label regeneration clearly');
assert(detailOutlineAssetText.includes('覆盖目录并保留章节'), 'outline regeneration should explain chapter preservation');
assert(!/href=["'][^"']*novel-project-regenerate/i.test(detailOutlineViewWithAssets), 'outline regeneration must not be a GET link');

const detailOutlineViewWithStaleRejectedChapter = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: projectId,
  requested_view: 'outline',
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证旧大纲正文不会污染新目录状态。',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  current_chapter_no: 0,
  status: 'OUTLINE_READY',
  bible: JSON.stringify({story_core: '主角从低谷翻身。'}),
  outlines: JSON.stringify([{id: '21000000-0000-0000-0000-000000000061', chapter_no: 1, title: '新第一章', summary: '新大纲', status: 'READY'}]),
  chapters: JSON.stringify([{
    id: '21000000-0000-0000-0000-000000000062',
    outline_id: '21000000-0000-0000-0000-000000000061',
    chapter_no: 1,
    title: '旧第一章候选稿',
    body: '旧正文',
    summary: '旧摘要',
    status: 'REJECTED',
    is_current: false,
    is_stale: true,
  }]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([{id: '21000000-0000-0000-0000-000000000063', job_type: 'GENERATE_CHAPTER', chapter_no: 1, status: 'PENDING'}]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
}])[0].json.response_html;
const detailOutlineStaleText = visibleText(detailOutlineViewWithStaleRejectedChapter);
assert(detailOutlineStaleText.includes('新第一章'), 'outline view should show the current regenerated outline title');
assert(detailOutlineStaleText.includes('未生成正文'), 'outline view should treat stale rejected chapter as not generated for the new outline');
assert(!detailOutlineStaleText.includes('已拒绝'), 'outline view should not surface stale rejected status as the new outline chapter state');
assert(!detailOutlineStaleText.includes('旧第一章候选稿'), 'outline view should not use stale chapter title for the regenerated outline card');

const detailChaptersViewWithStaleRejectedChapter = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: projectId,
  requested_view: 'chapters',
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证旧大纲正文进入历史区。',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  current_chapter_no: 0,
  status: 'OUTLINE_READY',
  bible: JSON.stringify({story_core: '主角从低谷翻身。'}),
  outlines: JSON.stringify([{id: '21000000-0000-0000-0000-000000000071', chapter_no: 1, title: '新第一章', summary: '新大纲', status: 'READY'}]),
  chapters: JSON.stringify([{
    id: '21000000-0000-0000-0000-000000000072',
    outline_id: '21000000-0000-0000-0000-000000000071',
    chapter_no: 1,
    title: '旧第一章候选稿',
    body: '旧正文',
    summary: '旧摘要',
    status: 'REJECTED',
    is_current: false,
    is_stale: true,
  }]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
}])[0].json.response_html;
const detailChaptersStaleText = visibleText(detailChaptersViewWithStaleRejectedChapter);
assert(detailChaptersStaleText.includes('当前大纲下暂无已写章节'), 'chapter view should keep stale content out of current chapter grid');
assert(detailChaptersStaleText.includes('旧大纲历史正文'), 'chapter view should keep stale content available in a history drill-down');
assert(detailChaptersStaleText.includes('不计入当前进度'), 'chapter view should explain stale content does not affect current progress');
assert(detailChaptersStaleText.includes('一键清理过期历史章节'), 'chapter view should expose one-click stale chapter cleanup');
assert(detailChaptersViewWithStaleRejectedChapter.includes('action="/webhook/novel-stale-chapters-cleanup"'), 'stale chapter cleanup should submit through POST');
assert(detailChaptersViewWithStaleRejectedChapter.includes('name="cleanup_action" value="CLEAR_STALE_CHAPTERS"'), 'stale chapter cleanup should submit the cleanup action');
assert(!/href=["'][^"']*novel-stale-chapters-cleanup/i.test(detailChaptersViewWithStaleRejectedChapter), 'stale chapter cleanup must not be a GET link');

const detailViewWithStaleReviewNotify = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: projectId,
  requested_view: 'overview',
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证拒绝后过期提醒不污染下一步动作。',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  current_chapter_no: 4,
  status: 'REVIEWING',
  bible: JSON.stringify({story_core: '主角从低谷翻身。'}),
  outlines: JSON.stringify([{chapter_no: 5, title: '第五章', summary: '候选稿待决策', status: 'READY'}]),
  chapters: JSON.stringify([{
    id: '21000000-0000-0000-0000-000000000081',
    chapter_no: 5,
    title: '已拒绝候选稿',
    body: '被拒绝的候选正文',
    summary: '已拒绝',
    status: 'REJECTED',
    is_current: false,
    generation_version: 3,
  }]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([{
    id: '21000000-0000-0000-0000-000000000082',
    chapter_id: '21000000-0000-0000-0000-000000000081',
    chapter_no: 5,
    job_type: 'NOTIFY_REVIEW',
    status: 'PENDING',
    updated_at: '2026-05-06T15:30:13.000Z',
    created_at: '2026-05-06T15:30:13.000Z',
  }]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
}])[0].json.response_html;
const staleReviewNotifyText = visibleText(detailViewWithStaleReviewNotify);
assert(staleReviewNotifyText.includes('下一步动作区：继续重写第 5 章'), 'rejected chapter should clearly offer same-chapter rewrite continuation');
assert(!staleReviewNotifyText.includes('下一步动作区：第 5 章审核提醒待发送'), 'rejected chapter notification should not be shown as pending review reminder');
assert(!staleReviewNotifyText.includes('下一步动作区：启动第 5 章导演台'), 'rejected chapter should not expose director planning as the primary creator-facing action');
assert(/队列中\s*0/.test(staleReviewNotifyText), 'stale review notification should not count as active queue work');

const detailViewWithRejectedRetryDirector = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: projectId,
  requested_view: 'overview',
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证拒绝后已排导演台时也显示继续重写。',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  current_chapter_no: 4,
  status: 'WRITING',
  bible: JSON.stringify({story_core: '主角从低谷翻身。'}),
  outlines: JSON.stringify([{chapter_no: 5, title: '第五章', summary: '候选稿待决策', status: 'READY'}]),
  chapters: JSON.stringify([{
    id: '21000000-0000-0000-0000-000000000083',
    chapter_no: 5,
    title: '已拒绝候选稿',
    body: '被拒绝的候选正文',
    summary: '已拒绝',
    status: 'REJECTED',
    is_current: false,
    generation_version: 3,
  }]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([{
    id: '21000000-0000-0000-0000-000000000084',
    chapter_no: 5,
    job_type: 'PLAN_CHAPTER_DIRECTOR',
    status: 'PENDING',
    payload: {trigger_source: 'chapter_rejected_retry'},
    updated_at: '2026-05-06T15:35:13.000Z',
    created_at: '2026-05-06T15:35:13.000Z',
  }]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
}])[0].json.response_html;
const rejectedRetryDirectorText = visibleText(detailViewWithRejectedRetryDirector);
assert(rejectedRetryDirectorText.includes('下一步动作区：继续重写第 5 章'), 'pending rejected retry director should be presented as continuing the chapter rewrite');
assert(rejectedRetryDirectorText.includes('继续重写第 5 章'), 'primary action should say continue rewriting the chapter');
assert(!rejectedRetryDirectorText.includes('下一步动作区：启动第 5 章导演台'), 'pending rejected retry director should not be the primary title');

const detailFactsView = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: projectId,
  requested_view: 'facts',
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证事实库。',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  current_chapter_no: 1,
  status: 'WRITING',
  bible: JSON.stringify({story_core: '主角从低谷翻身。'}),
  outlines: JSON.stringify([{chapter_no: 1, title: '第一章', summary: '开局冲突', status: 'READY'}]),
  chapters: JSON.stringify([]),
  facts: JSON.stringify([{
    id: '21000000-0000-0000-0000-000000000041',
    fact_type: 'character',
    fact_key: '主角身份',
    fact_value: '林昼真实身份是失踪继承人。',
    source: 'ai',
    status: 'PENDING',
    chapter_no: 1,
    confidence: 0.8,
  }, {
    id: '21000000-0000-0000-0000-000000000042',
    fact_type: 'rule',
    fact_key: '旧规则',
    fact_value: '这条旧规则已经不再适用。',
    source: 'ai',
    status: 'INACTIVE',
    chapter_no: 1,
    confidence: 0.5,
  }]),
  jobs: JSON.stringify([]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
}])[0].json.response_html;
const detailFactsText = visibleText(detailFactsView);
assert(detailFactsText.includes('事实库是后续生成章节会读取的连续性记忆'), 'facts view should explain what the fact library is');
assert(detailFactsView.includes('action="/webhook/novel-project-fact-action"'), 'facts view should expose POST fact management forms');
assert(detailFactsView.includes('data-open-dialog="fact-create-drawer"'), 'facts view should open manual fact creation in a drawer');
assert(detailFactsView.includes('id="fact-create-drawer"'), 'facts view should render a right-side manual fact drawer');
assert(detailFactsView.includes('data-async-drawer-form'), 'manual fact creation should submit in-page instead of navigating to a result page');
assert(detailFactsView.includes('name="fact_action" value="CREATE"'), 'facts view should allow creating human facts');
assert(detailFactsView.includes('name="fact_action" value="UPDATE"'), 'facts view should allow editing facts');
assert(detailFactsView.includes('name="fact_action" value="ACTIVATE"'), 'pending facts should be activatable');
assert(detailFactsView.includes('name="fact_action" value="CLEAR_INACTIVE"'), 'facts view should allow clearing inactive facts');
assert(detailFactsText.includes('清理失效事实'), 'facts view should label inactive fact cleanup clearly');
assert(detailFactsText.includes('保存后会关闭抽屉并刷新事实库'), 'manual fact drawer should explain save-and-close behavior');
assert(!/href=["'][^"']*novel-project-fact-action/i.test(detailFactsView), 'fact management must not be a GET link');

const detailWithLegacyChapterJob = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: projectId,
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证旧章节任务不会绕过导演台。',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  current_chapter_no: 0,
  status: 'OUTLINE_READY',
  bible: JSON.stringify({story_core: '主角从低谷翻身。'}),
  outlines: JSON.stringify([{chapter_no: 1, title: '第一章', summary: '开局冲突', status: 'READY'}]),
  chapters: JSON.stringify([]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([
    {id: '21000000-0000-0000-0000-000000000073', job_type: 'GENERATE_CHAPTER', status: 'PENDING', chapter_no: 1, attempt_count: 0, updated_at: '2026-05-04T01:09:00.000Z'},
  ]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
}])[0].json.response_html;
const detailLegacyChapterText = visibleText(detailWithLegacyChapterJob);
assert(detailLegacyChapterText.includes('第 1 章等待导演台'), 'legacy chapter job without a ready director should be labeled as waiting for director planning');
assert(detailLegacyChapterText.includes('还没有 READY 导演台'), 'legacy chapter job should explain why chapter generation is blocked');
assert(detailWithLegacyChapterJob.includes('view=director'), 'legacy chapter job should link users to the director tab');
assert(!detailWithLegacyChapterJob.includes('action="/webhook/novel-generate-chapter-now"'), 'legacy chapter job must not expose chapter generation before a ready director card exists');

const detailWithChapterJob = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: projectId,
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证章节推进生成。',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  current_chapter_no: 0,
  status: 'OUTLINE_READY',
  bible: JSON.stringify({story_core: '主角从低谷翻身。'}),
  outlines: JSON.stringify([{chapter_no: 1, title: '第一章', summary: '开局冲突', status: 'READY'}]),
  director_cards: JSON.stringify([{
    id: '21000000-0000-0000-0000-000000000123',
    chapter_no: 1,
    version: 1,
    is_current: true,
    status: 'READY',
    source: 'AI',
    card_payload: {
      quality_gate: {pass: true, blocking_issues: []},
      segment_plan: [{segment_no: 1}],
    },
  }]),
  chapters: JSON.stringify([]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([
    {id: '21000000-0000-0000-0000-000000000023', job_type: 'GENERATE_CHAPTER', status: 'PENDING', chapter_no: 1, attempt_count: 0, updated_at: '2026-05-04T01:10:00.000Z'},
  ]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
}])[0].json.response_html;

const detailChapterText = visibleText(detailWithChapterJob);
assert(detailWithChapterJob.includes('action="/webhook/novel-generate-chapter-now"'), 'project console should provide POST action for pending chapter job');
assert(detailChapterText.includes('启动第 1 章生成'), 'project console should tell users to start the pending chapter generation');
assert(detailChapterText.includes('生成候选稿后会进入智能审稿队列'), 'project console should explain where chapter generation leads next');
assert(detailWithChapterJob.includes('操作已完成'), 'project console should show inline completion feedback before refreshing');
assert(!detailWithChapterJob.includes('action="/webhook/novel-project-continue"'), 'project console should avoid queue enqueueing while chapter start is pending');
assert(!/href=["'][^"']*novel-generate-chapter-now/i.test(detailWithChapterJob), 'project console chapter generation must not be GET link');

const detailWithReviewJob = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: projectId,
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证智能审稿队列显示。',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  current_chapter_no: 1,
  status: 'WRITING',
  bible: JSON.stringify({story_core: '主角从低谷翻身。'}),
  outlines: JSON.stringify([{chapter_no: 1, title: '第一章', summary: '开局冲突', status: 'READY'}]),
  chapters: JSON.stringify([{id: '21000000-0000-0000-0000-000000000035', chapter_no: 1, title: '新候选稿', body: '候选正文', status: 'DRAFT_READY'}]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([
    {id: '21000000-0000-0000-0000-000000000026', job_type: 'REVIEW_CHAPTER', status: 'PENDING', chapter_no: 1, attempt_count: 0, updated_at: '2026-05-04T01:11:00.000Z'},
  ]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
}])[0].json.response_html;
const detailWithReviewJobText = visibleText(detailWithReviewJob);
assert(detailWithReviewJobText.includes('下一步动作区：第 1 章等待智能审稿'), 'pending review job should show the concrete review queue state');
assert(detailWithReviewJobText.includes('候选稿已经生成，智能审稿任务正在等待后台队列领取'), 'pending review job should explain the current handoff');
assert(!detailWithReviewJob.includes('action="/webhook/novel-project-continue"'), 'project console should not show continue queue action while review is pending');
assert(!detailWithReviewJobText.includes('下一步动作区：等待队列推进'), 'pending review must not degrade to vague queue waiting copy');

const detailWithRewriteJob = runListCodeNode('n8n/code/novel_render_project_detail_html.js', [{
  is_empty: false,
  id: projectId,
  title: '第二十一阶段项目',
  genre: '都市逆袭',
  audience: '中文读者',
  style: '节奏快',
  premise: '验证重写队列显示。',
  target_total_chapters: 5,
  target_words_per_chapter: 1600,
  current_chapter_no: 1,
  status: 'REVIEWING',
  bible: JSON.stringify({story_core: '主角从低谷翻身。'}),
  outlines: JSON.stringify([{chapter_no: 2, title: '第二章', summary: '升级冲突', status: 'READY'}]),
  chapters: JSON.stringify([{id: '21000000-0000-0000-0000-000000000036', chapter_no: 2, title: '旧候选稿', body: '候选正文', status: 'REWRITE_REQUESTED'}]),
  facts: JSON.stringify([]),
  jobs: JSON.stringify([
    {id: '21000000-0000-0000-0000-000000000027', job_type: 'REWRITE_CHAPTER', status: 'RUNNING', chapter_no: 2, attempt_count: 1, updated_at: '2026-05-04T01:12:00.000Z'},
  ]),
  ai_runs: JSON.stringify([]),
  project_events: JSON.stringify([]),
}])[0].json.response_html;
const detailWithRewriteJobText = visibleText(detailWithRewriteJob);
assert(detailWithRewriteJobText.includes('下一步动作区：第 2 章正在重写'), 'running rewrite job should show the concrete rewrite state');
assert(detailWithRewriteJobText.includes('章节重写模型调用正在后台执行'), 'running rewrite job should explain what the background task is doing');
assert(!detailWithRewriteJob.includes('action="/webhook/novel-project-continue"'), 'project console should not show continue queue action while rewrite is running');
assert(!detailWithRewriteJobText.includes('下一步动作区：等待队列推进'), 'running rewrite must not degrade to vague queue waiting copy');

const validation = runSingleCodeNode('n8n/code/novel_validate_project_generation_step.js', {
  body: {
    project_id: projectId,
    step: 'outline',
  },
})[0].json;
assert.strictEqual(validation.project_id, projectId, 'generation validator should preserve project id');
assert.strictEqual(validation.requested_step, 'GENERATE_OUTLINE', 'generation validator should normalize outline step');
const chapterValidation = runSingleCodeNode('n8n/code/novel_validate_project_generation_step.js', {
  body: {
    project_id: projectId,
    step: 'chapter',
  },
})[0].json;
assert.strictEqual(chapterValidation.requested_step, 'GENERATE_CHAPTER', 'generation validator should normalize chapter step');
assert.throws(
  () => runSingleCodeNode('n8n/code/novel_validate_project_generation_step.js', {query: {project_id: projectId}}),
  /POST body/,
  'generation validator should reject query-only submissions'
);
const regenerateValidation = runSingleCodeNode('n8n/code/novel_validate_project_regenerate.js', {
  body: {
    project_id: projectId,
    step: '大纲',
    comment: '按新提示词重跑',
  },
})[0].json;
assert.strictEqual(regenerateValidation.project_id, projectId, 'regenerate validator should preserve project id');
assert.strictEqual(regenerateValidation.step, 'OUTLINE', 'regenerate validator should normalize outline step');
assert.strictEqual(regenerateValidation.action, 'REGENERATE_OUTLINE', 'regenerate validator should expose action for result rendering');
const regenerateBibleValidation = runSingleCodeNode('n8n/code/novel_validate_project_regenerate.js', {
  body: {
    project_id: projectId,
    step: '设定集',
    regenerate_prompt: '一女主三男主，前期甜宠，后期身份揭露转虐恋。',
  },
})[0].json;
assert.strictEqual(regenerateBibleValidation.step, 'BIBLE', 'regenerate validator should normalize Bible step');
assert.strictEqual(regenerateBibleValidation.regenerate_prompt, '一女主三男主，前期甜宠，后期身份揭露转虐恋。', 'Bible regenerate should preserve the new core idea prompt');
assert.strictEqual(regenerateBibleValidation.action, 'REGENERATE_BIBLE', 'Bible regenerate should expose action for result rendering');

const createFactValidation = runSingleCodeNode('n8n/code/novel_validate_project_fact_action.js', {
  body: {
    project_id: projectId,
    fact_action: 'CREATE',
    fact_type: 'relationship',
    fact_key: '女主与义父',
    fact_value: '义父是女主仇家，但前期以保护者身份出现。',
    status: 'ACTIVE',
  },
})[0].json;
assert.strictEqual(createFactValidation.fact_action, 'CREATE', 'fact validation should normalize create action');
assert.strictEqual(createFactValidation.action, 'CREATE_FACT', 'fact validation should expose result action label');
assert.strictEqual(createFactValidation.fact_value, '义父是女主仇家，但前期以保护者身份出现。', 'fact validation should preserve fact content');

const clearFactValidation = runSingleCodeNode('n8n/code/novel_validate_project_fact_action.js', {
  body: {
    project_id: projectId,
    fact_action: 'CLEAR_INACTIVE',
  },
})[0].json;
assert.strictEqual(clearFactValidation.fact_action, 'CLEAR_INACTIVE', 'fact validation should normalize inactive cleanup action');
assert.strictEqual(clearFactValidation.action, 'CLEAR_INACTIVE_FACTS', 'fact cleanup validation should expose a result action label');
assert.throws(
  () => runSingleCodeNode('n8n/code/novel_validate_project_regenerate.js', {query: {project_id: projectId}}),
  /POST body/,
  'regenerate validator should reject query-only submissions'
);

const resultHtml = runSingleCodeNode('n8n/code/novel_render_generation_step_result.js', {
  project_id: projectId,
  job_type: 'GENERATE_BIBLE',
  status: 'RUNNING',
})[0].json.response_html;
assert(visibleText(resultHtml).includes('设定集生成已启动'), 'generation result should render Bible background start in Chinese');
assert(!resultHtml.includes('action="/webhook/novel-generate-outline-now"'), 'Bible start result should not offer another model call before completion');
assert(visibleText(resultHtml).includes('后台执行中'), 'generation result should show background execution mode');
assert(visibleText(resultHtml).includes('查看队列'), 'generation result should guide users to queue status');
assert(visibleText(resultHtml).includes('页面会自动跳到队列状态'), 'generation result should explain automatic queue redirect');
assert(!/\b(GENERATE_BIBLE|GENERATE_OUTLINE|SUCCEEDED|PENDING)\b/.test(visibleText(resultHtml)), 'generation result should not expose internal enums in visible text');

const biblePatchResultHtml = runSingleCodeNode('n8n/code/novel_render_generation_step_result.js', {
  project_id: projectId,
  job_type: 'GENERATE_BIBLE_PATCH',
  status: 'RUNNING',
})[0].json.response_html;
const biblePatchResultText = visibleText(biblePatchResultHtml);
assert(biblePatchResultText.includes('扩写设定补丁生成已启动'), 'generation result should render Bible patch background start in Chinese');
assert(biblePatchResultText.includes('待确认补丁'), 'Bible patch result should explain the manual confirmation handoff');
assert(!/\b(GENERATE_BIBLE_PATCH|SUCCEEDED|PENDING)\b/.test(biblePatchResultText), 'Bible patch result should not expose internal enums in visible text');

const noClaimHtml = runSingleCodeNode('n8n/code/novel_render_generation_step_result.js', {
  project_id: projectId,
  job_type: 'GENERATE_BIBLE',
  claim_success: false,
  claim_reason: 'JOB_NOT_FOUND_OR_ALREADY_CLAIMED',
})[0].json.response_html;
const noClaimText = visibleText(noClaimHtml);
assert(noClaimText.includes('未开始模型调用'), 'no-claim generation result should clearly say no model call started');
assert(noClaimText.includes('没有可立即执行的待处理任务'), 'no-claim generation result should explain missing or already-claimed job');
assert(noClaimText.includes('未调用模型'), 'no-claim result should show non-mutating execution mode');
assert(!noClaimHtml.includes('action="/webhook/novel-generate-outline-now"'), 'no-claim Bible result should not offer next model call');
assert(!/\bJOB_NOT_FOUND_OR_ALREADY_CLAIMED\b/.test(noClaimText), 'no-claim visible text should not expose internal reason enum');

const chapterResultHtml = runSingleCodeNode('n8n/code/novel_render_generation_step_result.js', {
  project_id: projectId,
  job_type: 'GENERATE_CHAPTER',
  chapter_no: 1,
  status: 'RUNNING',
})[0].json.response_html;
const chapterResultText = visibleText(chapterResultHtml);
assert(chapterResultText.includes('第 1 章生成已启动'), 'generation result should render chapter background start in Chinese');
assert(chapterResultText.includes('审稿完成后再到审核中心处理'), 'chapter generation result should explain the review handoff');
assert(!/\b(GENERATE_CHAPTER|SUCCEEDED|PENDING)\b/.test(chapterResultText), 'chapter generation result should not expose internal enums in visible text');

const workflow12 = readJson('n8n/workflow/12_novel_bible_workflow.json');
const workflow13 = readJson('n8n/workflow/13_novel_outline_workflow.json');
const workflow14 = readJson('n8n/workflow/14_novel_chapter_workflow.json');
const workflow11 = readJson('n8n/workflow/11_novel_center_workflow.json');
assert.strictEqual(workflowNode(workflow11, 'Webhook - 小说项目重新生成').parameters.httpMethod, 'POST', 'project regeneration webhook must be POST');
assert.strictEqual(workflowNode(workflow11, 'Webhook - 小说项目重新生成').parameters.path, 'novel-project-regenerate', 'project regeneration webhook path should match page form');
assert.deepStrictEqual(
  connectionTargets(workflow11, 'Webhook - 小说项目重新生成'),
  ['代码 - 校验小说项目重新生成'],
  'project regeneration webhook should validate before touching DB'
);
assert.strictEqual(workflowNode(workflow12, 'Webhook - 前端立即生成设定集').parameters.httpMethod, 'POST', 'Bible direct generation webhook must be POST');
assert.strictEqual(workflowNode(workflow12, 'Webhook - 前端立即生成设定集').parameters.path, 'novel-generate-bible-now', 'Bible direct generation webhook path should match page form');
assert.strictEqual(workflowNode(workflow12, 'Webhook - 前端立即生成设定集补丁').parameters.httpMethod, 'POST', 'Bible patch direct generation webhook must be POST');
assert.strictEqual(workflowNode(workflow12, 'Webhook - 前端立即生成设定集补丁').parameters.path, 'novel-generate-bible-patch-now', 'Bible patch direct generation webhook path should match page form');
assert.strictEqual(workflowNode(workflow13, 'Webhook - 前端立即生成大纲').parameters.httpMethod, 'POST', 'outline direct generation webhook must be POST');
assert.strictEqual(workflowNode(workflow13, 'Webhook - 前端立即生成大纲').parameters.path, 'novel-generate-outline-now', 'outline direct generation webhook path should match page form');
assert.strictEqual(workflowNode(workflow14, 'Webhook - 前端立即生成章节').parameters.httpMethod, 'POST', 'chapter direct generation webhook must be POST');
assert.strictEqual(workflowNode(workflow14, 'Webhook - 前端立即生成章节').parameters.path, 'novel-generate-chapter-now', 'chapter direct generation webhook path should match page form');
assert(workflowNode(workflow12, '条件判断 - 前端设定集任务已领取'), 'Bible direct generation should branch on claim result before calling GLM');
assert(workflowNode(workflow12, '条件判断 - 前端设定集补丁任务已领取'), 'Bible patch direct generation should branch on claim result before calling GLM');
assert(workflowNode(workflow13, '条件判断 - 前端大纲任务已领取'), 'outline direct generation should branch on claim result before calling GLM');
assert(workflowNode(workflow14, '条件判断 - 前端章节任务已领取'), 'chapter direct generation should branch on claim result before calling GLM');
assert.deepStrictEqual(
  connectionTargets(workflow12, '条件判断 - 前端设定集任务已领取', 0),
  ['代码 - 生成前端设定集生成结果页', '数据库 - 读取前端Bible生成上下文'],
  'Bible claim success should respond first and continue the model branch in the background'
);
assert.deepStrictEqual(
  connectionTargets(workflow12, '条件判断 - 前端设定集补丁任务已领取', 0),
  ['代码 - 生成前端设定集补丁结果页', '数据库 - 读取前端Bible补丁生成上下文'],
  'Bible patch claim success should respond first and continue the model branch in the background'
);
assert.deepStrictEqual(
  connectionTargets(workflow13, '条件判断 - 前端大纲任务已领取', 0),
  ['代码 - 生成前端大纲生成结果页', '数据库 - 读取前端大纲生成上下文'],
  'outline claim success should respond first and continue the model branch in the background'
);
assert.deepStrictEqual(
  connectionTargets(workflow14, '条件判断 - 前端章节任务已领取', 0),
  ['代码 - 生成前端章节生成结果页', '执行子流程 - 异步生成章节'],
  'chapter claim success should respond first and launch the segmented model branch asynchronously'
);
assert(!connectionTargets(workflow12, '数据库 - 标记前端Bible任务成功').includes('代码 - 生成前端设定集生成结果页'), 'Bible success marker should not be on the browser response path');
assert(!connectionTargets(workflow12, '数据库 - 标记前端Bible补丁任务成功').includes('代码 - 生成前端设定集补丁结果页'), 'Bible patch success marker should not be on the browser response path');
assert(!connectionTargets(workflow13, '数据库 - 标记前端大纲任务成功').includes('代码 - 生成前端大纲生成结果页'), 'outline success marker should not be on the browser response path');
assert(!connectionTargets(workflow14, '数据库 - 标记章节生成任务成功').includes('代码 - 生成前端章节生成结果页'), 'chapter success marker should not be on the browser response path');

console.log(JSON.stringify({
  ok: true,
  phase: 21,
  checks: [
    '创建结果页可以启动后台设定集生成',
    '项目控制台按当前待处理任务显示后台启动入口',
    '设定集和大纲生成入口只走 POST',
    '章节生成入口也只走 POST 并从项目页直接处理',
    '前端区分排队补齐和后台执行状态',
    '按钮操作提交后刷新当前上下文',
    '设定集和大纲可以从二级页重新生成',
    '事实库解释清楚并支持 POST 人工维护',
  ],
}, null, 2));
