#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

const workflowFiles = [
  'n8n/workflow/14_novel_chapter_workflow.json',
  'n8n/workflow/15_novel_ai_review_workflow.json',
  'n8n/workflow/available/14_novel_chapter_workflow.json',
  'n8n/workflow/available/15_novel_ai_review_workflow.json',
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

for (const name of ['14_novel_chapter_workflow.json', '15_novel_ai_review_workflow.json']) {
  const root = JSON.stringify(workflows[`n8n/workflow/${name}`]);
  const available = JSON.stringify(workflows[`n8n/workflow/available/${name}`]);
  assert.strictEqual(root, available, `${name} root and available copies should match`);
}

const chapter = workflows['n8n/workflow/14_novel_chapter_workflow.json'];
const chapterNodes = nodesByName(chapter);
assert(nodesByType(chapter, 'n8n-nodes-base.manualTrigger').length >= 1, '14 should have manual trigger');
assert.strictEqual(
  chapterNodes.get('触发器 - 后台执行章节生成').parameters.inputSource,
  'passthrough',
  '14 async chapter worker should accept the claimed job row'
);
assert.strictEqual(
  chapterNodes.get('Webhook - 前端立即生成章节').parameters.httpMethod,
  'POST',
  '14 should expose POST-only front-end chapter generation'
);
assert.strictEqual(
  chapterNodes.get('Webhook - 前端立即生成章节').parameters.path,
  'novel-generate-chapter-now',
  '14 chapter generation webhook should match project console form'
);
assert(
  chapterNodes.get('数据库 - 领取GENERATE_CHAPTER任务').parameters.query.includes('FOR UPDATE') &&
    chapterNodes.get('数据库 - 领取GENERATE_CHAPTER任务').parameters.query.includes('SKIP LOCKED'),
  '14 should claim jobs with FOR UPDATE SKIP LOCKED'
);
assert(
  chapter.connections['触发器 - 后台执行章节生成']?.main?.[0]?.[0]?.node === '数据库 - 读取章节生成上下文',
  '14 async trigger branch should reuse upstream claimed job context directly instead of re-claiming'
);
assert(
  !chapterNodes.has('数据库 - 领取指定GENERATE_CHAPTER任务'),
  '14 should not include an async re-claim node that can double-claim the same job'
);
assert(
  chapterNodes.get('数据库 - 领取GENERATE_CHAPTER任务').parameters.query.includes('GENERATE_CHAPTER'),
  '14 should claim GENERATE_CHAPTER'
);
assert(
  chapterNodes.get('数据库 - 领取GENERATE_CHAPTER任务').parameters.query.includes('current_director_card_id') &&
    chapterNodes.get('数据库 - 领取GENERATE_CHAPTER任务').parameters.query.includes("jsonb_build_object('director_card_id', claimed.current_director_card_id)") &&
    !chapterNodes.get('数据库 - 领取GENERATE_CHAPTER任务').parameters.query.includes("(j.payload->>'director_card_id')::uuid"),
  '14 background chapter claim should rebind stale queued jobs to the current READY director card'
);
const chapterSegmentHttpNames = [...chapterNodes.keys()]
  .filter((name) => /^HTTP请求 - 调用GLM生成章节第\d+段$/.test(name))
  .sort((a, b) => Number(a.match(/第(\d+)段/)[1]) - Number(b.match(/第(\d+)段/)[1]));
assert.deepStrictEqual(
  chapterSegmentHttpNames,
  [1, 2, 3, 4, 5, 6, 7].map((segmentNo) => `HTTP请求 - 调用GLM生成章节第${segmentNo}段`),
  '14 should provide a seven-segment upper bound for dynamic long-chapter generation'
);
for (const nodeName of chapterSegmentHttpNames) {
  assert.strictEqual(chapterNodes.get(nodeName).parameters.method, 'POST');
  assert(
    chapterNodes.get(nodeName).parameters.options.timeout >= 900000,
    '14 segmented chapter generation should allow model calls to run past five minutes'
  );
  assert.strictEqual(
    chapterNodes.get(nodeName).onError,
    'continueErrorOutput',
    '14 segmented chapter GLM nodes should route transport errors to a retry/failure write-back'
  );
}
assert(
  chapterNodes.get('代码 - 构建章节第1段 GLM请求').parameters.jsCode.includes('chapter_segment') &&
    chapterNodes.get('代码 - 构建章节第7段 GLM请求').parameters.jsCode.includes('segmentCountForTarget') &&
    chapterNodes.get('代码 - 构建章节第7段 GLM请求').parameters.jsCode.includes('has_more_segments'),
  '14 should split chapter writing into dynamic short segment prompts'
);
assert(
  chapterNodes.get('数据库 - 读取章节生成上下文').parameters.query.includes('previous_chapter_ending') &&
    chapterNodes.get('代码 - 构建章节第1段 GLM请求').parameters.jsCode.includes('【开场承接硬规则】'),
  '14 should feed the previous chapter ending into segment 1 and require an opening bridge'
);
assert(
  chapterNodes.get('数据库 - 记录章节第1段 AI调用').parameters.query.includes('novel_ai_runs') &&
    chapterNodes.get('数据库 - 记录章节第7段 AI调用').parameters.query.includes('novel_ai_runs'),
  '14 should record successful GENERATE_CHAPTER segment AI runs'
);
assert(
  chapterNodes.get('数据库 - 写入候选章节并创建审稿任务').parameters.query.includes('create_novel_chapter_version'),
  '14 should use create_novel_chapter_version'
);
assert(
  chapterNodes.get('数据库 - 写入候选章节并创建审稿任务').parameters.query.includes('FALSE'),
  '14 generated candidates must not become current'
);
assert(
  chapterNodes.get('数据库 - 写入候选章节Facts').parameters.query.includes('PENDING'),
  '14 should insert new AI facts as PENDING'
);
assert(
  chapterNodes.get('数据库 - 写入候选章节Facts').parameters.query.includes('jsonb_array_elements'),
  '14 should bulk insert facts from parsed new_facts_json'
);
assert(
  chapterNodes.get('代码 - 准备异步启动AI审稿').parameters.jsCode.includes('review_job_id'),
  '14 should prepare the AI review job created after chapter generation'
);
assert.strictEqual(
  chapterNodes.get('执行子流程 - 异步AI审稿').parameters.workflowId,
  'novelAiReviewV1Workflow15',
  '14 should launch AI review after writing a generated candidate'
);
assert(
  chapterNodes.get('数据库 - 标记章节生成任务成功').parameters.query.includes('SUCCEEDED'),
  '14 should mark generation job succeeded'
);
assert(
  chapterNodes.get('数据库 - 标记章节生成尝试失败').parameters.query.includes("THEN 'FAILED'") &&
    chapterNodes.get('数据库 - 标记章节生成尝试失败').parameters.query.includes("ELSE 'PENDING'"),
  '14 should mark failed chapter attempts as retryable or exhausted instead of leaving RUNNING jobs'
);
assert(
  chapterNodes.get('数据库 - 记录章节 AI调用失败').parameters.query.includes('novel_ai_runs'),
  '14 should record failed GENERATE_CHAPTER AI runs for queue and daily report visibility'
);
assert(
  chapterNodes.get('数据库 - 前端领取GENERATE_CHAPTER任务').parameters.query.includes('ORDER BY j.chapter_no ASC'),
  '14 front-end chapter start should claim the earliest pending chapter for that project'
);
assert(
  chapterNodes.get('数据库 - 前端领取GENERATE_CHAPTER任务').parameters.query.includes('current_director_card_id') &&
    chapterNodes.get('数据库 - 前端领取GENERATE_CHAPTER任务').parameters.query.includes("jsonb_build_object('director_card_id', claimed.current_director_card_id, 'trigger_source', 'front_immediate')") &&
    !chapterNodes.get('数据库 - 前端领取GENERATE_CHAPTER任务').parameters.query.includes("(j.payload->>'director_card_id')::uuid"),
  '14 front-end chapter start should not deadlock when a pending job references a superseded director card'
);
assert.strictEqual(
  chapterNodes.get('执行子流程 - 异步生成章节').parameters.workflowId,
  'novelChapterV1Workflow14',
  '14 front-end chapter start should delegate model work to the chapter worker'
);
assert.strictEqual(
  chapterNodes.get('执行子流程 - 异步生成章节').parameters.options.waitForSubWorkflow,
  false,
  '14 front-end chapter start should not block the POST response on model completion'
);
assert.deepStrictEqual(
  (chapter.connections?.['触发器 - 后台执行章节生成']?.main?.[0] || []).map((connection) => connection.node),
  ['数据库 - 读取章节生成上下文'],
  '14 async chapter worker should reuse the upstream claimed job directly'
);
assert.deepStrictEqual(
  (chapter.connections?.['HTTP请求 - 调用GLM生成章节第1段']?.main?.[1] || []).map((connection) => connection.node),
  ['代码 - 合并章节第1段 GLM错误上下文'],
  '14 chapter segment 1 GLM error output should preserve model error context'
);
assert.deepStrictEqual(
  (chapter.connections?.['HTTP请求 - 调用GLM生成章节第2段']?.main?.[1] || []).map((connection) => connection.node),
  ['代码 - 合并章节第2段 GLM错误上下文'],
  '14 chapter segment 2 GLM error output should preserve model error context'
);
assert.deepStrictEqual(
  (chapter.connections?.['HTTP请求 - 调用GLM生成章节第7段']?.main?.[1] || []).map((connection) => connection.node),
  ['代码 - 合并章节第7段 GLM错误上下文'],
  '14 chapter segment 7 GLM error output should preserve model error context'
);
assert.deepStrictEqual(
  (chapter.connections?.['代码 - 合并章节第1段 GLM错误上下文']?.main?.[0] || []).map((connection) => connection.node),
  ['数据库 - 记录章节 AI调用失败'],
  '14 chapter GLM errors should be written to the AI run log'
);
assert.deepStrictEqual(
  (chapter.connections?.['条件判断 - 章节第1段解析成功']?.main?.[0] || []).map((connection) => connection.node),
  ['数据库 - 记录章节第1段 AI调用', '条件判断 - 章节第1段还需继续'],
  '14 should only decide whether to continue after segment 1 parses successfully'
);
assert.deepStrictEqual(
  (chapter.connections?.['条件判断 - 章节第1段还需继续']?.main?.[0] || []).map((connection) => connection.node),
  ['代码 - 构建章节第2段 GLM请求'],
  '14 should build segment 2 only when the dynamic plan says more slices are needed'
);
assert.deepStrictEqual(
  (chapter.connections?.['条件判断 - 章节第1段还需继续']?.main?.[1] || []).map((connection) => connection.node),
  ['代码 - 合并章节分段为候选章'],
  '14 should combine immediately for one-slice short chapters'
);
assert.deepStrictEqual(
  (chapter.connections?.['条件判断 - 章节第2段解析成功']?.main?.[0] || []).map((connection) => connection.node),
  ['数据库 - 记录章节第2段 AI调用', '条件判断 - 章节第2段还需继续'],
  '14 should continue or combine after segment 2 according to the dynamic plan'
);
assert.deepStrictEqual(
  (chapter.connections?.['条件判断 - 章节第7段解析成功']?.main?.[0] || []).map((connection) => connection.node),
  ['数据库 - 记录章节第7段 AI调用', '代码 - 合并章节分段为候选章'],
  '14 should combine after the seventh slice, which is the safety upper bound'
);
assert(
  chapterNodes.get('代码 - 合并章节分段为候选章').parameters.jsCode.includes('generated_segments') &&
    chapterNodes.get('代码 - 合并章节分段为候选章').parameters.jsCode.includes('chapter_body_base64'),
  '14 should combine all generated short segments into the final candidate chapter payload'
);
assert.deepStrictEqual(
  (chapter.connections?.['数据库 - 写入候选章节并创建审稿任务']?.main?.[0] || []).map((connection) => connection.node),
  ['数据库 - 写入候选章节Facts', '代码 - 准备异步启动AI审稿'],
  '14 should persist facts and launch AI review after saving a candidate chapter'
);
assert.deepStrictEqual(
  (chapter.connections?.['数据库 - 记录章节 AI调用失败']?.main?.[0] || []).map((connection) => connection.node),
  ['数据库 - 标记章节生成尝试失败'],
  '14 chapter GLM errors should write job retry/failure status after logging the failed run'
);
assert.deepStrictEqual(
  (chapter.connections?.['条件判断 - 前端章节任务已领取']?.main?.[0] || []).map((connection) => connection.node),
  ['代码 - 生成前端章节生成结果页', '执行子流程 - 异步生成章节'],
  '14 chapter claim success should respond and launch model work asynchronously'
);

const review = workflows['n8n/workflow/15_novel_ai_review_workflow.json'];
const reviewNodes = nodesByName(review);
assert(nodesByType(review, 'n8n-nodes-base.manualTrigger').length >= 1, '15 should have manual trigger');
assert.strictEqual(
  reviewNodes.get('触发器 - 后台执行AI审稿').parameters.inputSource,
  'passthrough',
  '15 should accept async launches from chapter/rewrite workflows'
);
assert(
  reviewNodes.get('数据库 - 领取指定REVIEW_CHAPTER任务').parameters.query.includes("j.job_type = 'REVIEW_CHAPTER'") &&
    reviewNodes.get('数据库 - 领取指定REVIEW_CHAPTER任务').parameters.query.includes('j.id = (SELECT job_id FROM input)') &&
    reviewNodes.get('数据库 - 领取指定REVIEW_CHAPTER任务').parameters.query.includes('FOR UPDATE SKIP LOCKED'),
  '15 should claim the REVIEW_CHAPTER job created upstream when launched as a subworkflow'
);
assert(
  reviewNodes.get('数据库 - 领取REVIEW_CHAPTER任务').parameters.query.includes('FOR UPDATE SKIP LOCKED'),
  '15 should claim jobs with FOR UPDATE SKIP LOCKED'
);
assert(
  reviewNodes.get('数据库 - 领取REVIEW_CHAPTER任务').parameters.query.includes('REVIEW_CHAPTER'),
  '15 should claim REVIEW_CHAPTER'
);
assert(
  reviewNodes.get('数据库 - 读取审稿上下文').parameters.query.includes('chapter_no < c.chapter_no'),
  '15 review context should exclude same-chapter AI facts'
);
assert(
  reviewNodes.get('数据库 - 读取审稿上下文').parameters.query.includes('p.target_words_per_chapter'),
  '15 review context should pass target words into prompt constraints'
);
assert(
  reviewNodes.get('数据库 - 读取审稿上下文').parameters.query.includes('c.word_count AS chapter_word_count') &&
    reviewNodes.get('数据库 - 读取审稿上下文').parameters.query.includes('length(c.body) AS chapter_body_chars'),
  '15 review context should pass authoritative chapter length stats into prompt constraints'
);
assert(
  reviewNodes.get('数据库 - 读取审稿上下文').parameters.query.includes('previous_chapter_ending') &&
    reviewNodes.get('数据库 - 读取审稿上下文').parameters.query.includes('director.card_payload AS director_card'),
  '15 review context should pass previous ending and current director card for cross-chapter review'
);
assert(
  reviewNodes.get('代码 - 构建审稿 GLM请求').parameters.jsCode.includes('chapter_word_count') &&
    reviewNodes.get('代码 - 构建审稿 GLM请求').parameters.jsCode.includes('target_word_lower_bound') &&
    reviewNodes.get('代码 - 构建审稿 GLM请求').parameters.jsCode.includes('【跨章承接审稿】'),
  '15 review request builder should expose DB word count, allowed range, and transition analysis to the review prompt'
);
assert.strictEqual(reviewNodes.get('HTTP请求 - 调用GLM审稿').parameters.method, 'POST');
assert.strictEqual(
  reviewNodes.get('HTTP请求 - 调用GLM审稿').onError,
  'continueErrorOutput',
  '15 review GLM transport errors should route to a retry/failure write-back'
);
assert.strictEqual(
  reviewNodes.get('代码 - 解析审稿 GLM响应').onError,
  'continueErrorOutput',
  '15 review parse errors should route to a retry/failure write-back'
);
assert(
  reviewNodes.get('数据库 - 记录审稿 AI调用').parameters.query.includes('novel_ai_runs'),
  '15 should record REVIEW_CHAPTER AI run'
);
assert(
  reviewNodes.get('数据库 - 记录审稿 AI调用失败').parameters.query.includes('novel_ai_runs'),
  '15 should record failed REVIEW_CHAPTER AI runs for observability'
);
assert(
  reviewNodes.get('数据库 - 写入审稿报告并进入待人工审核').parameters.query.includes('novel_review_reports'),
  '15 should write review report'
);
assert(
  reviewNodes.get('数据库 - 写入审稿报告并进入待人工审核').parameters.query.includes('ai_run_id'),
  '15 review report should link ai_run_id'
);
assert(
  reviewNodes.get('数据库 - 写入审稿报告并进入待人工审核').parameters.query.includes('NEED_REVIEW'),
  '15 should move chapter to NEED_REVIEW'
);
assert(
  reviewNodes.get('数据库 - 写入审稿报告并进入待人工审核').parameters.query.includes('SUPERSEDED') &&
    reviewNodes.get('数据库 - 写入审稿报告并进入待人工审核').parameters.query.includes('cancelled_superseded_notifications'),
  '15 should supersede older same-chapter review candidates when a newer candidate enters review'
);
assert(
  reviewNodes.get('数据库 - 写入审稿报告并进入待人工审核').parameters.query.includes('NOTIFY_REVIEW'),
  '15 should create NOTIFY_REVIEW job'
);
assert(
  reviewNodes.get('数据库 - 标记审稿任务成功').parameters.options.queryReplacement.includes('代码 - 解析审稿 GLM响应') &&
    reviewNodes.get('数据库 - 标记审稿任务成功').parameters.options.queryReplacement.includes('job_id'),
  '15 should mark the claimed review job succeeded regardless of manual or async claim'
);
assert(
  reviewNodes.get('数据库 - 标记审稿尝试失败').parameters.query.includes("THEN 'FAILED'") &&
    reviewNodes.get('数据库 - 标记审稿尝试失败').parameters.query.includes("ELSE 'PENDING'") &&
    reviewNodes.get('数据库 - 标记审稿尝试失败').parameters.query.includes('智能审稿模型调用失败'),
  '15 should retry or fail exhausted review attempts instead of leaving RUNNING jobs'
);
assert.deepStrictEqual(
  (review.connections?.['HTTP请求 - 调用GLM审稿']?.main?.[1] || []).map((connection) => connection.node),
  ['代码 - 合并审稿 GLM错误上下文'],
  '15 review GLM error output should preserve model error context'
);
assert.deepStrictEqual(
  (review.connections?.['代码 - 解析审稿 GLM响应']?.main?.[1] || []).map((connection) => connection.node),
  ['代码 - 合并审稿解析错误上下文'],
  '15 review parse errors should preserve response context'
);
assert.deepStrictEqual(
  (review.connections?.['数据库 - 记录审稿 AI调用失败']?.main?.[0] || []).map((connection) => connection.node),
  ['数据库 - 标记审稿尝试失败'],
  '15 review failures should write job retry/failure status after logging the failed run'
);

console.log(JSON.stringify({
  result: 'phase4_workflow_static_tdd_passed',
  workflowCount: workflowFiles.length,
  chapterClaim: 'GENERATE_CHAPTER + FOR UPDATE SKIP LOCKED',
  reviewClaim: 'REVIEW_CHAPTER + FOR UPDATE SKIP LOCKED',
  candidateCurrent: false,
  factsStatus: 'PENDING',
  reviewStatus: 'NEED_REVIEW',
}, null, 2));
