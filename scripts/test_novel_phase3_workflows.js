#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const workflowFiles = [
  'n8n/workflow/11_novel_center_workflow.json',
  'n8n/workflow/12_novel_bible_workflow.json',
  'n8n/workflow/13_novel_outline_workflow.json',
  'n8n/workflow/13b_novel_director_workflow.json',
  'n8n/workflow/available/11_novel_center_workflow.json',
  'n8n/workflow/available/12_novel_bible_workflow.json',
  'n8n/workflow/available/13_novel_outline_workflow.json',
  'n8n/workflow/available/13b_novel_director_workflow.json',
];

function readWorkflow(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(fullPath), `Missing workflow file: ${relativePath}`);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function nodesByName(workflow) {
  return new Map((workflow.nodes || []).map((node) => [node.name, node]));
}

function nodesByType(workflow, type) {
  return (workflow.nodes || []).filter((node) => node.type === type);
}

function assertPostgresCredentials(workflow) {
  for (const node of nodesByType(workflow, 'n8n-nodes-base.postgres')) {
    assert.strictEqual(node.credentials?.postgres?.id, 'postgresVideoAgent', `${workflow.name}/${node.name} should use Postgres video_agent credential id`);
    assert.strictEqual(node.credentials?.postgres?.name, 'Postgres video_agent', `${workflow.name}/${node.name} should use Postgres video_agent credential name`);
  }
}

function assertNoUnsafePlaceholderComments(workflow) {
  for (const node of nodesByType(workflow, 'n8n-nodes-base.postgres')) {
    if (!node.parameters?.options?.queryReplacement) continue;
    assert(
      !/(^|\n)\s*--\s*\$\d+\b/.test(node.parameters.query || ''),
      `${workflow.name}/${node.name} must not mention queryReplacement placeholders in SQL comments`
    );
  }
}

function assertCodeSyntax(workflow) {
  for (const node of nodesByType(workflow, 'n8n-nodes-base.code')) {
    assert.doesNotThrow(() => {
      // n8n Code nodes allow top-level return, so Function is a close local proxy.
      new Function('$json', '$input', '$env', 'require', '$', node.parameters.jsCode || '');
    }, `${workflow.name}/${node.name} has invalid JavaScript`);
  }
}

function assertNoDuplicateNames(workflow) {
  const names = (workflow.nodes || []).map((node) => node.name);
  assert.strictEqual(new Set(names).size, names.length, `${workflow.name} has duplicate node names`);
}

function assertConnectionsTargetExistingNodes(workflow) {
  const names = new Set((workflow.nodes || []).map((node) => node.name));
  for (const [sourceName, connection] of Object.entries(workflow.connections || {})) {
    assert(names.has(sourceName), `${workflow.name} connection source ${sourceName} should be a real node`);
    const outputs = connection.main || [];
    for (const branch of outputs) {
      for (const target of branch || []) {
        assert(names.has(target.node), `${workflow.name} connection target ${target.node} from ${sourceName} should be a real node`);
      }
    }
  }
}

const workflows = Object.fromEntries(workflowFiles.map((file) => [file, readWorkflow(file)]));

for (const [file, workflow] of Object.entries(workflows)) {
  assert(workflow.name, `${file} missing workflow name`);
  assert(Array.isArray(workflow.nodes) && workflow.nodes.length > 0, `${file} should have nodes`);
  assert(workflow.connections && typeof workflow.connections === 'object', `${file} should have connections`);
  assertNoDuplicateNames(workflow);
  assertConnectionsTargetExistingNodes(workflow);
  assertPostgresCredentials(workflow);
  assertNoUnsafePlaceholderComments(workflow);
  assertCodeSyntax(workflow);
}

for (const name of ['11_novel_center_workflow.json', '12_novel_bible_workflow.json', '13_novel_outline_workflow.json', '13b_novel_director_workflow.json']) {
  const root = JSON.stringify(workflows[`n8n/workflow/${name}`]);
  const available = JSON.stringify(workflows[`n8n/workflow/available/${name}`]);
  assert.strictEqual(root, available, `${name} root and available copies should match`);
}

const center = workflows['n8n/workflow/11_novel_center_workflow.json'];
const centerNodes = nodesByName(center);
assert(centerNodes.has('Webhook - 小说工作台'), '11 should expose novel workbench page');
assert(centerNodes.has('Webhook - 小说项目列表'), '11 should expose novel project list page');
assert(centerNodes.has('Webhook - 创建小说项目'), '11 should expose project create endpoint');
assert.strictEqual(centerNodes.get('Webhook - 小说工作台').parameters.httpMethod, 'GET');
assert.strictEqual(centerNodes.get('Webhook - 小说工作台').parameters.path, 'novel-center');
assert.strictEqual(centerNodes.get('Webhook - 小说项目列表').parameters.httpMethod, 'GET');
assert.strictEqual(centerNodes.get('Webhook - 小说项目列表').parameters.path, 'novel-project-list');
assert.strictEqual(centerNodes.get('Webhook - 创建小说项目').parameters.httpMethod, 'POST');
assert.strictEqual(centerNodes.get('Webhook - 创建小说项目').parameters.path, 'novel-project-create');
assert.strictEqual(centerNodes.get('Webhook - 小说事实库操作').parameters.httpMethod, 'POST');
assert.strictEqual(centerNodes.get('Webhook - 小说事实库操作').parameters.path, 'novel-project-fact-action');
assert.strictEqual(centerNodes.get('Webhook - 小说过期历史章节清理').parameters.httpMethod, 'POST');
assert.strictEqual(centerNodes.get('Webhook - 小说过期历史章节清理').parameters.path, 'novel-stale-chapters-cleanup');
assert(
  centerNodes.get('数据库 - 创建小说项目并创建Bible任务').parameters.query.includes('GENERATE_BIBLE'),
  '11 project create query should enqueue GENERATE_BIBLE'
);
assert(
  centerNodes.get('数据库 - 创建小说项目并创建Bible任务').parameters.query.includes('novel_projects'),
  '11 project create query should insert novel_projects'
);
assert(
  centerNodes.get('数据库 - 创建小说项目重跑任务').parameters.query.includes('request_novel_project_regeneration') &&
    centerNodes.get('数据库 - 创建小说项目重跑任务').parameters.query.includes('$5'),
  '11 project regeneration should pass the new Bible core idea prompt into SQL'
);
assert(
  centerNodes.get('数据库 - 保存小说事实库操作').parameters.query.includes('manage_novel_project_fact') &&
    centerNodes.get('数据库 - 保存小说事实库操作').parameters.options.queryReplacement.includes('$json.fact_action'),
  '11 fact management should validate and persist project facts through POST'
);
assert(
  centerNodes.get('数据库 - 清理过期历史章节').parameters.query.includes('clear_novel_stale_chapters') &&
    centerNodes.get('数据库 - 清理过期历史章节').parameters.options.queryReplacement.includes('$json.project_id'),
  '11 should clear stale chapter history through a POST-only project action'
);
assert(
  centerNodes.get('数据库 - 保存人工正文编辑').parameters.query.includes('save_novel_chapter_manual_edit') &&
    centerNodes.get('数据库 - 保存人工正文编辑').parameters.query.includes('create_novel_manual_chapter_candidate'),
  '11 manual chapter edit should support both direct save and candidate review saves'
);
assert(
  centerNodes.has('执行子流程 - 异步重写正式章节') &&
    centerNodes.get('执行子流程 - 异步重写正式章节').parameters.workflowId === 'novelRewriteNotifyV1Workflow17',
  '11 approved-current rewrite requests should immediately launch workflow 17 asynchronously'
);
assert.strictEqual(centerNodes.get('Webhook - 小说重写任务启动').parameters.httpMethod, 'POST');
assert.strictEqual(centerNodes.get('Webhook - 小说重写任务启动').parameters.path, 'novel-rewrite-start');
assert(
  centerNodes.get('数据库 - 校验待执行重写任务').parameters.query.includes("j.job_type = 'REWRITE_CHAPTER'") &&
    centerNodes.get('数据库 - 校验待执行重写任务').parameters.query.includes("j.status IN ('PENDING', 'RUNNING')") &&
    centerNodes.get('数据库 - 校验待执行重写任务').parameters.query.includes("status = 'PENDING'") &&
    centerNodes.get('数据库 - 校验待执行重写任务').parameters.query.includes("INTERVAL '6 minutes'") &&
    centerNodes.get('数据库 - 校验待执行重写任务').parameters.query.includes('REWRITE_WORKER_RECOVERED') &&
    centerNodes.get('数据库 - 校验待执行重写任务').parameters.query.includes('REWRITE_JOB_STILL_RUNNING') &&
    centerNodes.get('数据库 - 校验待执行重写任务').parameters.query.includes('REWRITE_WORKER_START_REQUESTED'),
  '11 should expose a POST-only recovery action for pending or stale running rewrite jobs'
);
assert(
  centerNodes.has('执行子流程 - 异步启动待执行重写') &&
    centerNodes.get('执行子流程 - 异步启动待执行重写').parameters.workflowId === 'novelRewriteNotifyV1Workflow17',
  '11 pending rewrite recovery should launch workflow 17 asynchronously'
);
assert(
  centerNodes.get('数据库 - 查询小说项目详情').parameters.query.includes("'is_stale'") &&
    centerNodes.get('数据库 - 查询小说项目详情').parameters.query.includes('c.created_at < co.updated_at'),
  '11 project detail should mark chapters generated before the current outline update as stale'
);
assert(
  centerNodes.get('数据库 - 查询小说队列状态').parameters.query.includes('WITH input AS') &&
    centerNodes.get('数据库 - 查询小说队列状态').parameters.query.includes('scoped_jobs') &&
    centerNodes.get('数据库 - 查询小说队列状态').parameters.options.queryReplacement.includes('project_id'),
  '11 queue status should filter both counts and rows by project_id when opened from a project'
);

const bible = workflows['n8n/workflow/12_novel_bible_workflow.json'];
const bibleNodes = nodesByName(bible);
assert(nodesByType(bible, 'n8n-nodes-base.manualTrigger').length >= 1, '12 should have manual trigger');
assert(
  bibleNodes.get('数据库 - 领取GENERATE_BIBLE任务').parameters.query.includes('FOR UPDATE SKIP LOCKED'),
  '12 should claim jobs with FOR UPDATE SKIP LOCKED'
);
assert(
  bibleNodes.get('数据库 - 领取GENERATE_BIBLE任务').parameters.query.includes('GENERATE_BIBLE'),
  '12 should claim GENERATE_BIBLE'
);
assert(
  bibleNodes.get('数据库 - 读取Bible生成上下文').parameters.query.includes("payload->>'regenerate_prompt'") &&
    bibleNodes.get('数据库 - 读取Bible生成上下文').parameters.query.includes('COALESCE') &&
    bibleNodes.get('数据库 - 读取Bible生成上下文').parameters.query.includes('AS premise'),
  '12 Bible generation context should use the regenerated core idea prompt when present'
);
assert.strictEqual(bibleNodes.get('HTTP请求 - 调用GLM生成Bible').parameters.method, 'POST');
assert(
  String(bibleNodes.get('HTTP请求 - 调用GLM生成Bible').parameters.headerParameters.parameters[0].value).includes('GLM_API_KEY'),
  '12 HTTP node should use GLM_API_KEY'
);
assert(
  bibleNodes.get('数据库 - 记录Bible AI调用').parameters.query.includes('novel_ai_runs'),
  '12 should record AI run'
);
assert(
  bibleNodes.get('数据库 - 写入Bible并创建大纲任务').parameters.query.includes('GENERATE_OUTLINE'),
  '12 should enqueue GENERATE_OUTLINE'
);
assert(
  bibleNodes.get('数据库 - 标记Bible任务成功').parameters.query.includes('SUCCEEDED'),
  '12 should mark job succeeded'
);

const outline = workflows['n8n/workflow/13_novel_outline_workflow.json'];
const outlineNodes = nodesByName(outline);
assert(nodesByType(outline, 'n8n-nodes-base.manualTrigger').length >= 1, '13 should have manual trigger');
assert(
  outlineNodes.get('数据库 - 领取GENERATE_OUTLINE任务').parameters.query.includes('FOR UPDATE SKIP LOCKED'),
  '13 should claim jobs with FOR UPDATE SKIP LOCKED'
);
assert(
  outlineNodes.get('数据库 - 领取GENERATE_OUTLINE任务').parameters.query.includes('GENERATE_OUTLINE'),
  '13 should claim GENERATE_OUTLINE'
);
assert.strictEqual(outlineNodes.get('HTTP请求 - 调用GLM生成大纲').parameters.method, 'POST');
assert(
  outlineNodes.get('数据库 - 记录大纲 AI调用').parameters.query.includes('novel_ai_runs'),
  '13 should record AI run'
);
assert(
  outlineNodes.get('数据库 - 写入大纲并创建第1章任务').parameters.query.includes('jsonb_array_elements'),
  '13 should bulk upsert outline chapters from JSON'
);
assert(
  outlineNodes.get('数据库 - 写入大纲并创建第1章任务').parameters.query.includes('PLAN_CHAPTER_DIRECTOR'),
  '13 should enqueue first PLAN_CHAPTER_DIRECTOR job'
);
assert(
  outlineNodes.get('数据库 - 标记大纲任务成功').parameters.query.includes('SUCCEEDED'),
  '13 should mark job succeeded'
);

const director = workflows['n8n/workflow/13b_novel_director_workflow.json'];
const directorNodes = nodesByName(director);
assert(nodesByType(director, 'n8n-nodes-base.manualTrigger').length >= 1, '13B should have manual trigger');
assert(
  directorNodes.get('数据库 - 领取PLAN_CHAPTER_DIRECTOR任务').parameters.query.includes('FOR UPDATE SKIP LOCKED'),
  '13B should claim jobs with FOR UPDATE SKIP LOCKED'
);
assert(
  directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('chapter_segment_total') &&
    directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('WHEN p.target_words_per_chapter <= 4500 THEN 4'),
  '13B should compute director segment count with the current chapter split strategy'
);
assert(
  directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('novel_plot_threads') &&
    directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('recent_review_issues'),
  '13B should read plot ledger and recent review issues into the director context'
);
assert(
  directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('previous_chapter_ending') &&
    directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('previous_transition_modes'),
  '13B should read previous chapter ending and recent transition modes into director planning'
);
assert.strictEqual(directorNodes.get('HTTP请求 - 调用GLM生成导演台').parameters.method, 'POST');
assert(
  directorNodes.get('代码 - 解析导演台 GLM响应').parameters.jsCode.includes('segment_plan 数量必须等于正文分段数'),
  '13B should enforce segment_plan length against chapter_segment_total'
);
assert(
  directorNodes.get('代码 - 构建导演台 GLM请求').parameters.jsCode.includes('【跨章镜头调度】') &&
    directorNodes.get('代码 - 解析导演台 GLM响应').parameters.jsCode.includes('cross_chapter_transition'),
  '13B should require and preserve cross-chapter transition planning'
);
assert(
  directorNodes.get('数据库 - 保存导演台并按闸门排正文').parameters.query.includes("card.status = 'READY'") &&
    directorNodes.get('数据库 - 保存导演台并按闸门排正文').parameters.query.includes('GENERATE_CHAPTER') &&
    directorNodes.get('数据库 - 保存导演台并按闸门排正文').parameters.query.includes('novel_chapters c'),
  '13B should enqueue chapter generation only after the quality gate is READY and no chapter candidate already exists'
);
assert(
  directorNodes.has('数据库 - 取消旧当前导演台版本') &&
    directorNodes.get('数据库 - 取消旧当前导演台版本').parameters.query.includes('SET is_current = FALSE') &&
    directorNodes.get('数据库 - 保存导演台并按闸门排正文').parameters.query.includes('TRUE,') &&
    directorNodes.has('数据库 - 取消旧当前手动导演台版本') &&
    directorNodes.get('数据库 - 取消旧当前手动导演台版本').parameters.query.includes('SET is_current = FALSE') &&
    directorNodes.get('数据库 - 取消旧当前手动导演台版本').parameters.query.includes('CASE WHEN d.status IN') &&
    directorNodes.get('数据库 - 保存手动导演台版本').parameters.query.includes('TRUE,'),
  '13B should supersede old current cards in a separate DB step before inserting the new current version'
);
assert(
  directorNodes.get('数据库 - 保存手动导演台版本').parameters.query.includes('target_words_per_chapter <= 4500 THEN 4') &&
    directorNodes.get('数据库 - 保存手动导演台版本').parameters.query.includes('fact_source_audit') &&
    directorNodes.get('数据库 - 保存手动导演台版本').parameters.query.includes('segment_count <> manual_checks.expected_segments') &&
    directorNodes.get('数据库 - 保存手动导演台版本').parameters.query.includes('仍需调整'),
  '13B should re-check manual director saves for gate status, fact source audit, and segment plan count'
);

console.log(JSON.stringify({
  result: 'phase3_workflow_static_tdd_passed',
  workflowCount: workflowFiles.length,
  centerWebhook: 'GET /webhook/novel-center',
  projectCreateWebhook: 'POST /webhook/novel-project-create',
  bibleClaim: 'GENERATE_BIBLE + FOR UPDATE SKIP LOCKED',
  outlineClaim: 'GENERATE_OUTLINE + FOR UPDATE SKIP LOCKED',
}, null, 2));
