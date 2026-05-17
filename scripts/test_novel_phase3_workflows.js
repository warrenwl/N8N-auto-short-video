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
assert(centerNodes.has('Webhook - 小说已归档项目清理'), '11 should expose archived project cleanup endpoint');
assert(centerNodes.has('Webhook - 创建小说项目'), '11 should expose project create endpoint');
assert(centerNodes.has('Webhook - 小说创建页GLM助手'), '11 should expose create-page GLM assist endpoint');
assert(centerNodes.has('Webhook - 项目扩写剧情AI创意'), '11 should expose project expansion AI idea endpoint');
assert.strictEqual(centerNodes.get('Webhook - 小说工作台').parameters.httpMethod, 'GET');
assert.strictEqual(centerNodes.get('Webhook - 小说工作台').parameters.path, 'novel-center');
assert.strictEqual(centerNodes.get('Webhook - 小说项目列表').parameters.httpMethod, 'GET');
assert.strictEqual(centerNodes.get('Webhook - 小说项目列表').parameters.path, 'novel-project-list');
assert.strictEqual(centerNodes.get('Webhook - 小说已归档项目清理').parameters.httpMethod, 'POST');
assert.strictEqual(centerNodes.get('Webhook - 小说已归档项目清理').parameters.path, 'novel-archived-projects-cleanup');
assert(
  centerNodes.get('代码 - 校验已归档项目清理').parameters.jsCode.includes('CLEAR_ARCHIVED_PROJECTS') &&
    centerNodes.get('数据库 - 清理已归档项目').parameters.query.includes('clear_novel_archived_projects'),
  '11 archived project cleanup should validate POST and call the cleanup SQL function'
);
assert(
  centerNodes.get('数据库 - 查询小说项目列表').parameters.query.includes("WHEN j.status = 'RUNNING' THEN 0") &&
    centerNodes.get('数据库 - 查询小说项目列表').parameters.query.includes("WHEN j.status = 'PENDING' THEN 1"),
  '11 project list should prefer active queue jobs over recently cancelled notification jobs'
);
assert(
  centerNodes.get('数据库 - 查询小说项目列表').parameters.query.includes("j.job_type = 'NOTIFY_REVIEW'") &&
    centerNodes.get('数据库 - 查询小说项目列表').parameters.query.includes("nc.status = 'NEED_REVIEW'"),
  '11 project list should ignore stale active review notifications for chapters no longer awaiting review'
);
assert.strictEqual(centerNodes.get('Webhook - 创建小说项目').parameters.httpMethod, 'POST');
assert.strictEqual(centerNodes.get('Webhook - 创建小说项目').parameters.path, 'novel-project-create');
assert.strictEqual(centerNodes.get('Webhook - 小说创建页GLM助手').parameters.httpMethod, 'POST');
assert.strictEqual(centerNodes.get('Webhook - 小说创建页GLM助手').parameters.path, 'novel-project-ai-assist');
assert.strictEqual(centerNodes.get('Webhook - 项目扩写剧情AI创意').parameters.httpMethod, 'POST');
assert.strictEqual(centerNodes.get('Webhook - 项目扩写剧情AI创意').parameters.path, 'novel-project-expansion-ai-assist');
assert.strictEqual(centerNodes.get('HTTP请求 - 调用GLM生成创建页灵感').parameters.method, 'POST');
assert(
  String(centerNodes.get('HTTP请求 - 调用GLM生成创建页灵感').parameters.headerParameters.parameters[0].value).includes('GLM_API_KEY'),
  '11 create-page GLM assist should use GLM_API_KEY'
);
assert.strictEqual(centerNodes.get('HTTP请求 - 调用GLM生成创建页灵感').onError, 'continueErrorOutput');
assert.strictEqual(centerNodes.get('代码 - 解析创建页GLM助手响应').onError, 'continueErrorOutput');
assert(
  centerNodes.get('代码 - 构建创建页 GLM助手请求').parameters.jsCode.includes('diversityBrief') &&
    centerNodes.get('代码 - 构建创建页 GLM助手请求').parameters.jsCode.includes('genreInstruction') &&
    centerNodes.get('代码 - 构建创建页 GLM助手请求').parameters.jsCode.includes('previous_ai_premise') &&
    centerNodes.get('代码 - 构建创建页 GLM助手请求').parameters.jsCode.includes('creative_direction') &&
    centerNodes.get('代码 - 构建创建页 GLM助手请求').parameters.jsCode.includes('【创意建议方向】') &&
    centerNodes.get('代码 - 构建创建页 GLM助手请求').parameters.jsCode.includes('最高内容约束') &&
    centerNodes.get('代码 - 构建创建页 GLM助手请求').parameters.jsCode.includes('creative_direction_applied'),
  '11 create-page GLM assist should include direction lock, diversity, and previous-output avoidance in the prompt'
);
assert.strictEqual(
  centerNodes.get('响应Webhook - 返回创建页GLM助手结果').parameters.options.responseHeaders.entries[0].value,
  'application/json; charset=utf-8',
  '11 create-page GLM assist should return JSON'
);
assert.strictEqual(centerNodes.get('HTTP请求 - 调用GLM生成扩写剧情设计').parameters.method, 'POST');
assert.strictEqual(centerNodes.get('HTTP请求 - 调用GLM生成扩写剧情设计').onError, 'continueErrorOutput');
assert.strictEqual(centerNodes.get('代码 - 解析扩写剧情AI响应').onError, 'continueErrorOutput');
assert(
  centerNodes.get('数据库 - 读取扩写剧情AI创意上下文').parameters.query.includes('novel_bibles') &&
    centerNodes.get('数据库 - 读取扩写剧情AI创意上下文').parameters.query.includes('approved_chapters') &&
    centerNodes.get('数据库 - 读取扩写剧情AI创意上下文').parameters.query.includes('continuity_facts'),
  '11 project expansion AI idea should read Bible, approved chapters, and active facts'
);
assert(
  centerNodes.get('代码 - 构建扩写剧情 AI创意请求').parameters.jsCode.includes('PROJECT_EXPANSION_ASSIST') &&
    centerNodes.get('代码 - 构建扩写剧情 AI创意请求').parameters.jsCode.includes('【用户粗略要求】') &&
    centerNodes.get('代码 - 构建扩写剧情 AI创意请求').parameters.jsCode.includes('【当前设定集】'),
  '11 project expansion AI idea should build a project-aware creative prompt'
);
assert.strictEqual(
  centerNodes.get('响应Webhook - 返回扩写剧情AI结果').parameters.options.responseHeaders.entries[0].value,
  'application/json; charset=utf-8',
  '11 project expansion AI idea should return JSON'
);
assert.strictEqual(centerNodes.get('Webhook - 小说事实库操作').parameters.httpMethod, 'POST');
assert.strictEqual(centerNodes.get('Webhook - 小说事实库操作').parameters.path, 'novel-project-fact-action');
assert.strictEqual(centerNodes.get('Webhook - 小说设定集补丁操作').parameters.httpMethod, 'POST');
assert.strictEqual(centerNodes.get('Webhook - 小说设定集补丁操作').parameters.path, 'novel-bible-patch-action');
assert.strictEqual(centerNodes.get('Webhook - 小说过期历史章节清理').parameters.httpMethod, 'POST');
assert.strictEqual(centerNodes.get('Webhook - 小说过期历史章节清理').parameters.path, 'novel-stale-chapters-cleanup');
assert(
  centerNodes.get('数据库 - 创建小说项目并创建创作母本任务').parameters.query.includes('GENERATE_STORY_TREATMENT'),
  '11 project create query should enqueue GENERATE_STORY_TREATMENT'
);
assert(
  centerNodes.get('数据库 - 创建小说项目并创建创作母本任务').parameters.query.includes('novel_projects'),
  '11 project create query should insert novel_projects'
);
assert(
  centerNodes.get('数据库 - 创建小说项目重跑任务').parameters.query.includes('request_novel_project_regeneration') &&
    centerNodes.get('数据库 - 创建小说项目重跑任务').parameters.query.includes('$5'),
  '11 project regeneration should pass the new Bible core idea prompt into SQL'
);
assert(
  centerNodes.get('数据库 - 保存小说事实库操作').parameters.query.includes('manage_novel_project_fact') &&
    centerNodes.get('数据库 - 保存小说事实库操作').parameters.options.queryReplacement.includes('$json.fact_action') &&
    centerNodes.get('数据库 - 保存小说事实库操作').parameters.query.includes("NULLIF($7::text, '')::integer"),
  '11 fact management should validate and persist project facts through POST, with blank chapter numbers coerced to null'
);
assert(
  centerNodes.get('数据库 - 处理小说设定集补丁').parameters.query.includes('manage_novel_bible_patch') &&
    centerNodes.get('数据库 - 处理小说设定集补丁').parameters.options.queryReplacement.includes('$json.patch_action'),
  '11 Bible patch management should apply, reject, or regenerate patches through POST'
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
assert.strictEqual(centerNodes.get('Webhook - 小说模型任务检查并恢复').parameters.httpMethod, 'POST');
assert.strictEqual(centerNodes.get('Webhook - 小说模型任务检查并恢复').parameters.path, 'novel-job-recover');
assert(
  centerNodes.get('数据库 - 校验并恢复模型任务').parameters.query.includes("GENERATE_STORY_TREATMENT") &&
    centerNodes.get('数据库 - 校验并恢复模型任务').parameters.query.includes("REWRITE_CHAPTER") &&
    centerNodes.get('数据库 - 校验并恢复模型任务').parameters.query.includes("j.status IN ('PENDING', 'RUNNING', 'FAILED')") &&
    centerNodes.get('数据库 - 校验并恢复模型任务').parameters.query.includes("INTERVAL '6 minutes'") &&
    centerNodes.get('数据库 - 校验并恢复模型任务').parameters.query.includes('GLM_JOB_RECOVERED') &&
    centerNodes.get('数据库 - 校验并恢复模型任务').parameters.query.includes('GLM_JOB_STILL_RUNNING') &&
    centerNodes.get('数据库 - 校验并恢复模型任务').parameters.query.includes('GLM_JOB_START_REQUESTED'),
  '11 should expose a POST-only generic recovery action for pending/running/failed GLM jobs'
);
assert(
  centerNodes.has('执行子流程 - 异步启动工作流12') &&
    centerNodes.get('执行子流程 - 异步启动工作流12').parameters.workflowId === 'novelBibleV1Workflow12' &&
    centerNodes.has('执行子流程 - 异步启动工作流13') &&
    centerNodes.get('执行子流程 - 异步启动工作流13').parameters.workflowId === 'novelOutlineV1Workflow13' &&
    centerNodes.has('执行子流程 - 异步启动工作流13B') &&
    centerNodes.get('执行子流程 - 异步启动工作流13B').parameters.workflowId === 'novelDirectorV1Workflow13B' &&
    centerNodes.has('执行子流程 - 异步启动工作流14') &&
    centerNodes.get('执行子流程 - 异步启动工作流14').parameters.workflowId === 'novelChapterV1Workflow14' &&
    centerNodes.has('执行子流程 - 异步启动工作流15') &&
    centerNodes.get('执行子流程 - 异步启动工作流15').parameters.workflowId === 'novelAiReviewV1Workflow15' &&
    centerNodes.has('执行子流程 - 异步启动工作流17') &&
    centerNodes.get('执行子流程 - 异步启动工作流17').parameters.workflowId === 'novelRewriteNotifyV1Workflow17',
  '11 generic GLM recovery should route to all worker workflows asynchronously'
);
assert(
  centerNodes.get('数据库 - 查询小说项目详情').parameters.query.includes("'is_stale'") &&
    centerNodes.get('数据库 - 查询小说项目详情').parameters.query.includes('c.created_at < co.updated_at') &&
    centerNodes.get('数据库 - 查询小说项目详情').parameters.query.includes('novel_bible_patches') &&
    centerNodes.get('数据库 - 查询小说项目详情').parameters.query.includes('novel_story_treatments') &&
    centerNodes.get('数据库 - 查询小说项目详情').parameters.query.includes('story_treatment') &&
    centerNodes.get('数据库 - 查询小说项目详情').parameters.query.includes("WHEN t.id IS NULL THEN '{}'::jsonb"),
  '11 project detail should mark stale chapters and read pending Bible patches plus non-empty story treatment'
);
assert(
  centerNodes.get('数据库 - 保存小说大纲').parameters.query.includes('update_novel_outline_manual') &&
    centerNodes.get('数据库 - 保存小说大纲').parameters.query.includes('$12') &&
    centerNodes.get('数据库 - 保存小说大纲').parameters.query.includes('$13') &&
    centerNodes.get('数据库 - 保存小说大纲').parameters.options.queryReplacement.includes('scene_beats_json') &&
    centerNodes.get('数据库 - 保存小说大纲').parameters.options.queryReplacement.includes('reader_questions_json'),
  '11 manual outline update should persist editable scene beats and reader questions'
);
assert(
  centerNodes.get('数据库 - 查询小说项目详情').parameters.query.includes("j.job_type = 'NOTIFY_REVIEW'") &&
    centerNodes.get('数据库 - 查询小说项目详情').parameters.query.includes("nc.status = 'NEED_REVIEW'"),
  '11 project detail should exclude stale active review notifications from actionable jobs'
);
assert(
  centerNodes.get('数据库 - 查询小说队列状态').parameters.query.includes('WITH input AS') &&
    centerNodes.get('数据库 - 查询小说队列状态').parameters.query.includes('scoped_jobs') &&
    centerNodes.get('数据库 - 查询小说队列状态').parameters.options.queryReplacement.includes('project_id') &&
    centerNodes.get('数据库 - 查询小说队列状态').parameters.query.includes("j.job_type = 'NOTIFY_REVIEW'") &&
    centerNodes.get('数据库 - 查询小说队列状态').parameters.query.includes("nc.status = 'NEED_REVIEW'"),
  '11 queue status should filter both counts and rows by project_id when opened from a project'
);

const bible = workflows['n8n/workflow/12_novel_bible_workflow.json'];
const bibleNodes = nodesByName(bible);
assert(nodesByType(bible, 'n8n-nodes-base.manualTrigger').length >= 3, '12 should have manual triggers for story treatment, Bible, and Bible patch queues');
assert(
  bibleNodes.get('数据库 - 领取指定GENERATE_STORY_TREATMENT任务').parameters.query.includes("j.job_type = 'GENERATE_STORY_TREATMENT'") &&
    bibleNodes.get('数据库 - 领取指定GENERATE_STORY_TREATMENT任务').parameters.query.includes('j.id = (SELECT job_id FROM input)') &&
    bibleNodes.get('数据库 - 领取指定GENERATE_STORY_TREATMENT任务').parameters.query.includes('FOR UPDATE SKIP LOCKED') &&
    bibleNodes.get('数据库 - 领取指定GENERATE_BIBLE任务').parameters.query.includes("j.job_type = 'GENERATE_BIBLE'") &&
    bibleNodes.get('数据库 - 领取指定GENERATE_BIBLE_PATCH任务').parameters.query.includes("j.job_type = 'GENERATE_BIBLE_PATCH'"),
  '12 should support Execute Workflow trigger claiming by job_id for treatment/Bible/Bible patch'
);
assert(
  bibleNodes.get('数据库 - 领取GENERATE_STORY_TREATMENT任务').parameters.query.includes('FOR UPDATE SKIP LOCKED') &&
    bibleNodes.get('数据库 - 领取GENERATE_STORY_TREATMENT任务').parameters.query.includes('GENERATE_STORY_TREATMENT'),
  '12 should claim GENERATE_STORY_TREATMENT jobs with FOR UPDATE SKIP LOCKED'
);
assert(
  bibleNodes.get('数据库 - 写入创作母本并创建Bible任务').parameters.query.includes('novel_story_treatments') &&
    bibleNodes.get('数据库 - 写入创作母本并创建Bible任务').parameters.query.includes('STORY_TREATMENT_UPDATED') &&
    bibleNodes.get('数据库 - 写入创作母本并创建Bible任务').parameters.query.includes('GENERATE_BIBLE'),
  '12 should persist story treatment and enqueue Bible generation'
);
assert.strictEqual(bibleNodes.get('Webhook - 前端立即生成创作母本').parameters.httpMethod, 'POST');
assert.strictEqual(bibleNodes.get('Webhook - 前端立即生成创作母本').parameters.path, 'novel-generate-treatment-now');
assert(
  bibleNodes.get('数据库 - 前端领取GENERATE_STORY_TREATMENT任务').parameters.query.includes('front_immediate_missing') &&
    bibleNodes.get('数据库 - 前端领取GENERATE_STORY_TREATMENT任务').parameters.query.includes('front_immediate_regenerate') &&
    bibleNodes.get('数据库 - 前端领取GENERATE_STORY_TREATMENT任务').parameters.query.includes('request_novel_project_regeneration') &&
    bibleNodes.get('数据库 - 前端领取GENERATE_STORY_TREATMENT任务').parameters.query.includes('novel_story_treatments') &&
    bibleNodes.get('数据库 - 前端领取GENERATE_STORY_TREATMENT任务').parameters.options.queryReplacement.includes('$json.regenerate_existing') &&
    bibleNodes.get('数据库 - 前端领取GENERATE_STORY_TREATMENT任务').parameters.query.includes('GENERATE_STORY_TREATMENT'),
  '12 front treatment start should create-and-claim missing jobs and immediately regenerate existing treatments'
);
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
    bibleNodes.get('数据库 - 读取Bible生成上下文').parameters.query.includes('AS premise') &&
    bibleNodes.get('数据库 - 读取Bible生成上下文').parameters.query.includes('novel_story_treatments') &&
    bibleNodes.get('数据库 - 读取Bible生成上下文').parameters.query.includes('story_treatment'),
  '12 Bible generation context should use regenerated prompts and the story treatment when present'
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
  bibleNodes.get('数据库 - 写入Bible并创建大纲任务').parameters.query.includes('organizations') &&
    bibleNodes.get('数据库 - 写入Bible并创建大纲任务').parameters.query.includes('plot_constraints') &&
    bibleNodes.get('数据库 - 写入Bible并创建大纲任务').parameters.options.queryReplacement.includes('organizations_json'),
  '12 should persist generated organizations, locations, plot constraints, and expansion notes into Bible'
);
assert(
  bibleNodes.get('数据库 - 写入创作母本并创建Bible任务').parameters.query.includes('full_chain_regenerate') &&
    bibleNodes.get('数据库 - 写入Bible并创建大纲任务').parameters.query.includes('full_outline_regenerate') &&
    bibleNodes.get('数据库 - 写入Bible并创建大纲任务').parameters.options.queryReplacement.includes('job_expansion_scope'),
  '12 should propagate full-chain and expansion-scope strategy from treatment/Bible jobs to downstream outline jobs'
);
assert(
  bibleNodes.get('数据库 - 标记Bible任务成功').parameters.query.includes('SUCCEEDED'),
  '12 should mark job succeeded'
);
assert(
  bibleNodes.get('数据库 - 领取GENERATE_BIBLE_PATCH任务').parameters.query.includes('GENERATE_BIBLE_PATCH') &&
    bibleNodes.get('数据库 - 读取Bible补丁生成上下文').parameters.query.includes('approved_chapters') &&
    bibleNodes.get('数据库 - 读取Bible补丁生成上下文').parameters.query.includes('continuity_facts') &&
    bibleNodes.get('代码 - 构建Bible补丁 GLM请求').parameters.jsCode.includes('bible_patch') &&
    bibleNodes.get('数据库 - 保存Bible补丁待确认').parameters.query.includes('novel_bible_patches') &&
    bibleNodes.get('数据库 - 保存Bible补丁待确认').parameters.query.includes('BIBLE_PATCH_CREATED'),
  '12 should generate confirmable expansion Bible patches with approved text and active facts as guardrails'
);
assert.strictEqual(bibleNodes.get('Webhook - 前端立即生成设定集补丁').parameters.httpMethod, 'POST');
assert.strictEqual(bibleNodes.get('Webhook - 前端立即生成设定集补丁').parameters.path, 'novel-generate-bible-patch-now');
assert(
  bibleNodes.get('数据库 - 前端保存Bible补丁待确认').parameters.query.includes('novel_bible_patches') &&
    bibleNodes.get('代码 - 生成前端设定集补丁结果页').parameters.jsCode.includes('扩写设定补丁'),
  '12 front-end Bible patch trigger should save a pending patch and return a localized result page'
);

const outline = workflows['n8n/workflow/13_novel_outline_workflow.json'];
const outlineNodes = nodesByName(outline);
assert(nodesByType(outline, 'n8n-nodes-base.manualTrigger').length >= 1, '13 should have manual trigger');
assert(
  outlineNodes.get('数据库 - 领取指定GENERATE_OUTLINE任务').parameters.query.includes("j.job_type = 'GENERATE_OUTLINE'") &&
    outlineNodes.get('数据库 - 领取指定GENERATE_OUTLINE任务').parameters.query.includes('j.id = (SELECT job_id FROM input)') &&
    outlineNodes.get('数据库 - 领取指定GENERATE_OUTLINE任务').parameters.query.includes('FOR UPDATE SKIP LOCKED'),
  '13 should support Execute Workflow trigger claiming by job_id'
);
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
  outlineNodes.get('数据库 - 读取大纲生成上下文').parameters.query.includes('expansion_request') &&
  outlineNodes.get('数据库 - 读取大纲生成上下文').parameters.query.includes('existing_outlines') &&
    outlineNodes.get('数据库 - 读取大纲生成上下文').parameters.query.includes('approved_chapters') &&
    outlineNodes.get('数据库 - 读取大纲生成上下文').parameters.query.includes('story_treatment') &&
    outlineNodes.get('数据库 - 读取大纲生成上下文').parameters.query.includes('scene_beats') &&
    outlineNodes.get('数据库 - 读取大纲生成上下文').parameters.query.includes('reader_questions') &&
    outlineNodes.get('数据库 - 读取大纲生成上下文').parameters.query.includes('organizations') &&
    outlineNodes.get('数据库 - 读取大纲生成上下文').parameters.query.includes('plot_constraints') &&
    outlineNodes.get('数据库 - 读取大纲生成上下文').parameters.query.includes('outline_request_comment') &&
    outlineNodes.get('数据库 - 读取大纲生成上下文').parameters.query.includes('effective_expansion_scope') &&
    outlineNodes.get('数据库 - 读取大纲生成上下文').parameters.query.includes('full_outline_regenerate'),
  '13 should pass expansion plan, new Bible fields, existing outlines, and approved chapter summaries into outline generation'
);
assert(
  outlineNodes.get('代码 - 构建大纲 GLM请求').parameters.jsCode.includes('【项目扩写计划】') &&
    outlineNodes.get('代码 - 构建大纲 GLM请求').parameters.jsCode.includes('不要重写已经存在的章节') &&
    outlineNodes.get('代码 - 构建大纲 GLM请求').parameters.jsCode.includes('【大纲覆盖范围规则】') &&
    outlineNodes.get('代码 - 构建大纲 GLM请求').parameters.jsCode.includes('旧结局表述') &&
    outlineNodes.get('代码 - 构建大纲 GLM请求').parameters.jsCode.includes('节奏分层释放'),
  '13 outline prompt builder should include expansion-plan guardrails'
);
assert(
  outlineNodes.get('代码 - 解析大纲 GLM响应').parameters.jsCode.includes('大纲章节覆盖不足') &&
    outlineNodes.get('代码 - 解析大纲 GLM响应').parameters.jsCode.includes('target_total_chapters') &&
    outlineNodes.get('代码 - 解析大纲 GLM响应').parameters.jsCode.includes('大纲提前完结风险'),
  '13 outline parser should reject expansion outputs that do not reach the target chapter count or end early'
);
assert(
  outlineNodes.get('数据库 - 记录大纲 AI调用').parameters.query.includes('novel_ai_runs'),
  '13 should record AI run'
);
assert(
  outlineNodes.get('数据库 - 写入大纲并创建第1章任务').parameters.query.includes('jsonb_array_elements'),
  '13 should bulk upsert outline chapters from JSON'
);
assert(
  outlineNodes.get('数据库 - 写入大纲并创建第1章任务').parameters.query.includes('scene_beats') &&
    outlineNodes.get('数据库 - 写入大纲并创建第1章任务').parameters.query.includes('reader_questions'),
  '13 should persist chapter scene beats and reader questions from outline JSON'
);
assert(
  outlineNodes.get('数据库 - 写入大纲并创建第1章任务').parameters.query.includes('expansion_scope') &&
    outlineNodes.get('数据库 - 写入大纲并创建第1章任务').parameters.query.includes('full_outline_regenerate') &&
    outlineNodes.get('数据库 - 写入大纲并创建第1章任务').parameters.query.includes("i.expansion_scope <> 'append_only'") &&
    outlineNodes.get('数据库 - 写入大纲并创建第1章任务').parameters.query.includes("approved.status IN ('APPROVED', 'PUBLISHED')") &&
    outlineNodes.get('数据库 - 写入大纲并创建第1章任务').parameters.options.queryReplacement.includes('full_outline_regenerate'),
  '13 should route append-only, rewrite-unwritten, and full-outline regeneration into distinct outline write strategies'
);
assert(
  outlineNodes.get('数据库 - 写入大纲并创建第1章任务').parameters.query.includes('PLAN_CHAPTER_DIRECTOR'),
  '13 should enqueue first PLAN_CHAPTER_DIRECTOR job'
);
assert(
  outlineNodes.get('数据库 - 写入大纲并创建第1章任务').parameters.query.includes('superseded_directors') &&
    outlineNodes.get('数据库 - 写入大纲并创建第1章任务').parameters.query.includes("status = 'SUPERSEDED'") &&
    outlineNodes.get('数据库 - 写入大纲并创建第1章任务').parameters.query.includes('cancelled_downstream_jobs'),
  '13 should retire stale director cards and cancel stale downstream jobs when generated outlines overwrite chapters'
);
assert(
  outlineNodes.get('数据库 - 写入大纲并创建第1章任务').parameters.query.includes('MIN(chapter_no) AS first_chapter_no'),
  '13 should start director planning from the first chapter actually written by the expansion scope'
);
assert(
  outlineNodes.get('数据库 - 标记大纲任务成功').parameters.query.includes('SUCCEEDED'),
  '13 should mark job succeeded'
);

const director = workflows['n8n/workflow/13b_novel_director_workflow.json'];
const directorNodes = nodesByName(director);
assert(nodesByType(director, 'n8n-nodes-base.manualTrigger').length >= 1, '13B should have manual trigger');
assert(
  directorNodes.get('数据库 - 领取指定PLAN_CHAPTER_DIRECTOR任务').parameters.query.includes("j.job_type = 'PLAN_CHAPTER_DIRECTOR'") &&
    directorNodes.get('数据库 - 领取指定PLAN_CHAPTER_DIRECTOR任务').parameters.query.includes('j.id = (SELECT job_id FROM input)') &&
    directorNodes.get('数据库 - 领取指定PLAN_CHAPTER_DIRECTOR任务').parameters.query.includes('FOR UPDATE SKIP LOCKED'),
  '13B should support Execute Workflow trigger claiming by job_id'
);
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
  directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('director_repair_context') &&
    directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('current_blocking_issues') &&
    directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes("d.status = 'NEEDS_REVIEW'"),
  '13B should feed current NEEDS_REVIEW director blockers back into repair regeneration'
);
assert(
  directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('previous_chapter_ending') &&
    directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('previous_transition_modes') &&
    directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('scene_beats') &&
    directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('reader_questions'),
  '13B should read previous transitions and outline scene beats into director planning'
);
assert(
  directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('expansion_request') &&
    directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('expansion_scope') &&
    directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('expansion_constraints') &&
    directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('organizations') &&
    directorNodes.get('数据库 - 读取导演台上下文').parameters.query.includes('plot_constraints') &&
    directorNodes.get('代码 - 构建导演台 GLM请求').parameters.jsCode.includes('【项目扩写计划】'),
  '13B should pass the project expansion plan and expanded Bible fields into director planning prompts'
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
    directorNodes.get('数据库 - 保存导演台并按闸门排正文').parameters.query.includes('novel_chapters c') &&
    directorNodes.get('数据库 - 保存导演台并按闸门排正文').parameters.query.includes('pending_chapter_job') &&
    directorNodes.get('数据库 - 保存导演台并按闸门排正文').parameters.query.includes('runnable_chapter_job'),
  '13B should enqueue or relink chapter generation only after the quality gate is READY and no chapter candidate already exists'
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
    directorNodes.get('数据库 - 保存手动导演台版本').parameters.query.includes('仍需调整') &&
    directorNodes.get('数据库 - 保存手动导演台版本').parameters.query.includes('relink_pending_chapter_jobs'),
  '13B should re-check manual director saves for gate status, fact source audit, segment plan count, and relink pending chapter jobs'
);
assert(
  directorNodes.get('数据库 - 按导演台创建正文任务').parameters.query.includes('pending_job') &&
    directorNodes.get('数据库 - 按导演台创建正文任务').parameters.query.includes('runnable_job') &&
    directorNodes.get('数据库 - 按导演台创建正文任务').parameters.query.includes('director_manual_start'),
  '13B manual chapter start should reuse and relink an existing pending chapter job for the current director card'
);

console.log(JSON.stringify({
  result: 'phase3_workflow_static_tdd_passed',
  workflowCount: workflowFiles.length,
  centerWebhook: 'GET /webhook/novel-center',
  projectCreateWebhook: 'POST /webhook/novel-project-create',
  bibleClaim: 'GENERATE_BIBLE + FOR UPDATE SKIP LOCKED',
  biblePatchClaim: 'GENERATE_BIBLE_PATCH + FOR UPDATE SKIP LOCKED',
  outlineClaim: 'GENERATE_OUTLINE + FOR UPDATE SKIP LOCKED',
}, null, 2));
