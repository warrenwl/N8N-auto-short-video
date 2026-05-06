#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const workflowFiles = [
  'n8n/workflow/17_novel_rewrite_notify_workflow.json',
  'n8n/workflow/18_novel_auto_recovery_workflow.json',
  'n8n/workflow/available/17_novel_rewrite_notify_workflow.json',
  'n8n/workflow/available/18_novel_auto_recovery_workflow.json',
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
      new Function('$json', '$input', '$env', 'require', '$', node.parameters.jsCode || '');
    }, `${workflow.name}/${node.name} has invalid JavaScript`);
  }
}

const workflows = Object.fromEntries(workflowFiles.map((file) => [file, readWorkflow(file)]));

for (const [file, workflow] of Object.entries(workflows)) {
  assert(workflow.name, `${file} missing workflow name`);
  assert(Array.isArray(workflow.nodes) && workflow.nodes.length > 0, `${file} should have nodes`);
  assert(workflow.connections && typeof workflow.connections === 'object', `${file} should have connections`);
  assertPostgresCredentials(workflow);
  assertNoUnsafePlaceholderComments(workflow);
  assertCodeSyntax(workflow);
}

for (const name of ['17_novel_rewrite_notify_workflow.json', '18_novel_auto_recovery_workflow.json']) {
  assert.strictEqual(
    JSON.stringify(workflows[`n8n/workflow/${name}`]),
    JSON.stringify(workflows[`n8n/workflow/available/${name}`]),
    `${name} root and available copies should match`
  );
}

const rewrite = workflows['n8n/workflow/17_novel_rewrite_notify_workflow.json'];
const rewriteNodes = nodesByName(rewrite);
assert(nodesByType(rewrite, 'n8n-nodes-base.manualTrigger').length >= 2, '17 should have manual triggers for rewrite and notify lanes');
assert.strictEqual(
  rewriteNodes.get('触发器 - 后台执行重写任务').parameters.inputSource,
  'passthrough',
  '17 should accept async launches from the review action workflow'
);
assert(
  rewriteNodes.get('数据库 - 领取指定REWRITE_CHAPTER任务').parameters.query.includes("j.job_type = 'REWRITE_CHAPTER'") &&
    rewriteNodes.get('数据库 - 领取指定REWRITE_CHAPTER任务').parameters.query.includes('$1::text') &&
    rewriteNodes.get('数据库 - 领取指定REWRITE_CHAPTER任务').parameters.query.includes('j.id = (SELECT job_id FROM input)') &&
    rewriteNodes.get('数据库 - 领取指定REWRITE_CHAPTER任务').parameters.query.includes('FOR UPDATE SKIP LOCKED') &&
    rewriteNodes.get('数据库 - 领取指定REWRITE_CHAPTER任务').parameters.query.includes('error_message = NULL'),
  '17 should safely claim and clear stale errors for the rewrite job created by a project-console launch'
);
assert(
  rewriteNodes.get('数据库 - 领取REWRITE_CHAPTER任务').parameters.query.includes('FOR UPDATE SKIP LOCKED') &&
    rewriteNodes.get('数据库 - 领取REWRITE_CHAPTER任务').parameters.query.includes('error_message = NULL'),
  '17 should claim REWRITE_CHAPTER with SKIP LOCKED and clear stale errors before retrying'
);
assert(
  rewriteNodes.get('数据库 - 读取重写上下文').parameters.query.includes("original.status = 'REWRITE_REQUESTED'"),
  '17 should only rewrite REWRITE_REQUESTED original chapters'
);
assert(
  rewriteNodes.get('数据库 - 读取重写上下文').parameters.query.includes("j.payload->>'review_report_id'") &&
    rewriteNodes.get('数据库 - 读取重写上下文').parameters.query.includes("report.id = (j.payload->>'review_report_id')::uuid") &&
    rewriteNodes.get('数据库 - 读取重写上下文').parameters.query.includes("j.payload->'review_issues'") &&
    rewriteNodes.get('数据库 - 读取重写上下文').parameters.query.includes("j.payload->'review_suggestions'"),
  '17 should lock rewrite context to the review report captured when rewrite was requested'
);
assert(
  rewriteNodes.get('数据库 - 读取重写上下文').parameters.query.includes('chapter_no < original.chapter_no'),
  '17 rewrite context should exclude same-chapter old AI facts'
);
assert(
  rewriteNodes.get('数据库 - 读取重写上下文').parameters.query.includes('novel_chapter_director_cards') &&
    rewriteNodes.get('数据库 - 读取重写上下文').parameters.query.includes('director.card_payload AS director_card') &&
    rewriteNodes.get('数据库 - 读取重写上下文').parameters.query.includes("d.status = 'READY'"),
  '17 rewrite context should inject the current READY director card into rewrite prompts'
);
assert.strictEqual(rewriteNodes.get('HTTP请求 - 调用GLM重写章节').parameters.method, 'POST');
assert.strictEqual(
  rewriteNodes.get('HTTP请求 - 调用GLM重写章节').onError,
  'continueErrorOutput',
  '17 rewrite GLM node should route transport errors to retry/failure write-back'
);
assert(
  rewriteNodes.get('数据库 - 记录重写 AI调用').parameters.query.includes('REWRITE_CHAPTER'),
  '17 should record REWRITE_CHAPTER ai run'
);
assert(
  rewriteNodes.get('数据库 - 记录重写 AI调用失败').parameters.query.includes('novel_ai_runs'),
  '17 should record failed REWRITE_CHAPTER AI runs'
);
assert(
  rewriteNodes.get('数据库 - 标记重写尝试失败').parameters.query.includes("ELSE 'PENDING'") &&
    rewriteNodes.get('数据库 - 标记重写尝试失败').parameters.query.includes("THEN 'FAILED'"),
  '17 should return failed rewrite attempts to PENDING until retries are exhausted'
);
assert(
  rewriteNodes.get('数据库 - 写入重写候选章节并创建审稿任务').parameters.query.includes('create_novel_chapter_version'),
  '17 should create a new chapter version'
);
assert(
  rewriteNodes.get('数据库 - 写入重写候选章节并创建审稿任务').parameters.query.includes('FALSE'),
  '17 rewritten candidate must not become current'
);
assert(
  rewriteNodes.get('数据库 - 写入重写候选章节Facts').parameters.query.includes('PENDING'),
  '17 rewritten facts must be PENDING'
);
assert(
  rewriteNodes.get('数据库 - 标记重写任务成功').parameters.options.queryReplacement.includes('代码 - 解析重写 GLM响应') &&
    rewriteNodes.get('数据库 - 标记重写任务成功').parameters.options.queryReplacement.includes('job_id'),
  '17 should mark the claimed rewrite job succeeded regardless of whether it was claimed manually or by async input'
);
assert(
  rewriteNodes.get('代码 - 准备异步启动重写审稿').parameters.jsCode.includes('review_job_id'),
  '17 should prepare the AI review job created after rewrite'
);
assert.strictEqual(
  rewriteNodes.get('执行子流程 - 异步AI审稿').parameters.workflowId,
  'novelAiReviewV1Workflow15',
  '17 should launch AI review after writing a rewritten candidate'
);
assert(
  rewriteNodes.get('数据库 - 领取NOTIFY_REVIEW任务').parameters.query.includes('NOTIFY_REVIEW'),
  '17 should claim NOTIFY_REVIEW'
);
assert(
  rewriteNodes.get('数据库 - 领取NOTIFY_REVIEW任务').parameters.query.includes("c.status = 'NEED_REVIEW'"),
  '17 should only claim notify jobs whose chapter is still NEED_REVIEW'
);
const notifyCode = rewriteNodes.get('代码 - 构建小说审核提醒').parameters.jsCode;
assert(notifyCode.includes('/webhook/novel-review-detail'), 'notification should link to review detail');
assert(!notifyCode.includes('action=approve'), 'notification must not include approve action links');
assert(!notifyCode.includes('action=reject'), 'notification must not include reject action links');
assert(
  rewriteNodes.get('数据库 - 标记审核提醒任务成功').parameters.query.includes('SUCCEEDED'),
  '17 should mark NOTIFY_REVIEW succeeded'
);
assert.deepStrictEqual(
  (rewrite.connections?.['触发器 - 后台执行重写任务']?.main?.[0] || []).map((connection) => connection.node),
  ['数据库 - 领取指定REWRITE_CHAPTER任务'],
  '17 async trigger should route into the specific rewrite claim lane'
);
assert.deepStrictEqual(
  (rewrite.connections?.['数据库 - 领取指定REWRITE_CHAPTER任务']?.main?.[0] || []).map((connection) => connection.node),
  ['数据库 - 读取重写上下文'],
  '17 async claim should reuse the normal rewrite execution path'
);
assert.deepStrictEqual(
  (rewrite.connections?.['数据库 - 写入重写候选章节并创建审稿任务']?.main?.[0] || []).map((connection) => connection.node),
  ['数据库 - 写入重写候选章节Facts', '代码 - 准备异步启动重写审稿'],
  '17 should persist rewrite facts and launch AI review after saving the candidate'
);
assert.deepStrictEqual(
  (rewrite.connections?.['HTTP请求 - 调用GLM重写章节']?.main?.[1] || []).map((connection) => connection.node),
  ['代码 - 合并重写 GLM错误上下文'],
  '17 rewrite GLM error output should preserve error context'
);
assert.deepStrictEqual(
  (rewrite.connections?.['代码 - 合并重写 GLM错误上下文']?.main?.[0] || []).map((connection) => connection.node),
  ['数据库 - 记录重写 AI调用失败'],
  '17 rewrite GLM errors should be logged'
);
assert.deepStrictEqual(
  (rewrite.connections?.['数据库 - 记录重写 AI调用失败']?.main?.[0] || []).map((connection) => connection.node),
  ['数据库 - 标记重写尝试失败'],
  '17 rewrite GLM errors should write retry/failure status'
);

const recovery = workflows['n8n/workflow/18_novel_auto_recovery_workflow.json'];
const recoveryNodes = nodesByName(recovery);
assert(nodesByType(recovery, 'n8n-nodes-base.scheduleTrigger').length >= 1, '18 should have a schedule trigger');
assert(nodesByType(recovery, 'n8n-nodes-base.manualTrigger').length >= 1, '18 should allow manual execution');
const recoveryQuery = recoveryNodes.get('数据库 - 小说任务自动恢复').parameters.query;
assert(recoveryQuery.includes('FOR UPDATE SKIP LOCKED'), '18 should lock stale jobs with SKIP LOCKED');
assert(recoveryQuery.includes("job_type = 'REVIEW_CHAPTER'"), '18 should handle REVIEW_CHAPTER failures');
assert(recoveryQuery.includes("job_type = 'REWRITE_CHAPTER'"), '18 should handle REWRITE_CHAPTER failures');
assert(recoveryQuery.includes("status = 'FAILED'"), '18 should mark exhausted jobs FAILED');
assert(recoveryQuery.includes("status = 'PENDING'"), '18 should retry non-exhausted jobs by returning to PENDING');
assert(
  recoveryQuery.includes("GENERATE_BIBLE', 'GENERATE_OUTLINE', 'PLAN_CHAPTER_DIRECTOR') THEN INTERVAL '6 minutes'"),
  '18 should recover crashed project-level and director planning jobs shortly after the HTTP timeout boundary'
);
assert(
  recoveryQuery.includes("j.job_type IN ('REVIEW_CHAPTER', 'REWRITE_CHAPTER') THEN INTERVAL '6 minutes'"),
  '18 should recover stuck AI review and rewrite jobs shortly after their HTTP timeout boundary'
);
assert(
  recoveryNodes.get('数据库 - 补齐下一章任务').parameters.query.includes('p.current_chapter_no + 1'),
  '18 should repair missing next chapter job'
);
assert(
  recoveryNodes.get('数据库 - 补齐下一章任务').parameters.query.includes('PLAN_CHAPTER_DIRECTOR') &&
    recoveryNodes.get('数据库 - 补齐下一章任务').parameters.query.includes('novel_chapter_director_cards') &&
    recoveryNodes.get('数据库 - 补齐下一章任务').parameters.query.includes("status = 'READY'"),
  '18 should repair the director-first next-chapter chain and only enqueue chapter jobs after READY director cards'
);
assert(
  recoveryQuery.includes('OBSOLETE_CHAPTER_GENERATION_CANCELLED') &&
    recoveryNodes.get('数据库 - 补齐下一章任务').parameters.query.includes('novel_chapters c') &&
    recoveryNodes.get('数据库 - 补齐下一章任务').parameters.query.includes("c.status IN ('DRAFT_READY', 'AI_REVIEWED', 'NEED_REVIEW', 'APPROVED', 'PUBLISHED', 'REWRITE_REQUESTED')"),
  '18 should not leave or repair duplicate next-chapter generation jobs when the chapter already has a candidate'
);
assert(
  recoveryQuery.includes('OBSOLETE_NOTIFY_CANCELLED'),
  '18 should cancel obsolete notify jobs for chapters no longer waiting for review'
);
assert(
  recoveryNodes.get('代码 - 汇总小说自动恢复结果').parameters.jsCode.includes('novel_auto_recovery_summary'),
  '18 should summarize recovery output'
);

console.log(JSON.stringify({
  result: 'phase6_workflow_static_tdd_passed',
  workflowCount: workflowFiles.length,
  rewriteWorkflow: '17_novel_rewrite_notify_workflow',
  recoveryWorkflow: '18_novel_auto_recovery_workflow',
  notificationRule: 'detail link only',
}, null, 2));
