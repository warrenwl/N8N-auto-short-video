#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function nodesByName(workflow) {
  return new Map(workflow.nodes.map((node) => [node.name, node]));
}

const schema = read('sql/47_novel_schema.sql');
const functionsSql = read('sql/48_novel_functions.sql');
const reviewWorkflow = readJson('n8n/workflow/16_novel_review_workflow.json');
const blockWorkflow = readJson('n8n/workflow/19_novel_block_revision_workflow.json');
const reviewHtml = read('n8n/code/novel_render_review_html.js');
const blockBuilder = read('n8n/code/novel_build_block_revision_glm_request.js');
const blockParser = read('n8n/code/novel_parse_block_revision_json.js');

const reviewNodes = nodesByName(reviewWorkflow);
const blockNodes = nodesByName(blockWorkflow);

assert(schema.includes('REVISE_CHAPTER_BLOCK'), 'schema should allow REVISE_CHAPTER_BLOCK jobs and runs');
assert(schema.includes('CREATE TABLE IF NOT EXISTS novel_chapter_block_revisions'), 'schema should create block revision table');
assert(schema.includes("'SUGGESTED'") && schema.includes("'SUPERSEDED'"), 'schema should include block revision statuses');
assert(schema.includes('selection_start_offset') && schema.includes('anchor_prefix'), 'schema should store precise selection anchors');
assert(functionsSql.includes('request_novel_chapter_block_revision'), 'functions should create block revision request function');
assert(functionsSql.includes('apply_novel_chapter_block_revision'), 'functions should create block revision apply function');
assert(functionsSql.includes('AMBIGUOUS_ANCHOR'), 'functions should reject ambiguous repeated anchors');
assert(functionsSql.includes('substring(v_body FROM v_revision.selection_start_offset + 1'), 'apply function should validate offset anchors before replacement');
assert(functionsSql.includes('normalize_novel_anchor_text'), 'functions should tolerate safe whitespace differences around text anchors');
assert(functionsSql.includes('normalize_novel_body_newlines'), 'functions should align CRLF database bodies with browser LF selection offsets');
assert(functionsSql.includes('v_match_length'), 'apply function should replace the matched anchor span, not only selected text length');
assert(functionsSql.includes('apply_novel_review_manual_edit('), 'apply function should reuse manual edit candidate flow');
assert(functionsSql.includes('review_token TEXT') && functionsSql.includes('v_candidate.review_token'), 'manual edit flow should return the new candidate review token for in-page continuation');

assert(reviewNodes.has('Webhook - 小说审核局部修订'), '16 should expose block revise webhook');
assert(reviewNodes.has('Webhook - 小说审核局部修订确认'), '16 should expose block apply webhook');
assert(reviewNodes.get('执行子流程 - 异步局部修订')?.parameters?.workflowId === 'novelBlockRevisionV1Workflow19', '16 should launch workflow 19');
assert(reviewNodes.get('数据库 - 查询待审章节详情').parameters.query.includes('block_revisions'), 'detail query should include recent block revisions');

assert(blockWorkflow.id === 'novelBlockRevisionV1Workflow19', '19 workflow id should be stable');
assert(blockNodes.has('数据库 - 领取局部修订任务'), '19 should claim pending block revision jobs');
assert(blockNodes.has('HTTP请求 - 调用GLM局部修订'), '19 should call GLM for block revision');
assert(blockNodes.has('数据库 - 保存局部修订建议'), '19 should save suggestions without editing chapters');
assert(blockNodes.has('数据库 - 标记局部修订失败'), '19 should mark failed block revisions');
assert(blockNodes.get('数据库 - 记录局部修订 AI调用').parameters.query.includes('novel_ai_runs'), '19 should record successful AI runs');
assert(blockNodes.get('数据库 - 领取指定局部修订任务').parameters.query.includes('NULLIF($1::text'), '19 should tolerate empty Execute Workflow job_id');
assert(blockNodes.get('数据库 - 领取指定局部修订任务').parameters.query.includes('input.raw_job_id IS NULL'), '19 should fall back to queue claim when no job_id is passed');

assert(reviewHtml.includes('data-block-reader'), 'review page should render selectable paragraph reader');
assert(reviewHtml.includes('data-selection-toolbar'), 'review page should render selection toolbar');
assert(reviewHtml.includes('data-selection-manual-edit'), 'selection toolbar should keep only high-frequency assistant/revision/manual edit actions');
assert(reviewHtml.includes('syncSelectionContext'), 'review page should share the current selection between assistant and block revision');
assert(reviewHtml.includes('data-block-selection-start') && reviewHtml.includes('data-block-anchor-prefix'), 'review page should submit precise selection anchors');
assert(reviewHtml.includes('anchorAroundSelection(reader, selectionStartOffset, selectionEndOffset)'), 'review page should build anchors from full chapter body offsets');
assert(reviewHtml.includes('block-diff'), 'review page should render local revision diff');
assert(reviewHtml.includes('block-panel-body'), 'review page should render block revision in a wide bottom workbench');
assert(reviewHtml.includes('block-flow-steps'), 'block revision workbench should show the four-step flow');
assert(reviewHtml.includes('const liveRevisionCount = revisions.filter'), 'block revision workbench should distinguish running jobs from completed suggestions');
assert(reviewHtml.includes('const readyRevisionCount = revisions.filter'), 'block revision workbench should detect completed suggestions');
assert(reviewHtml.includes('const initialPanelOpen = activeRevisionCount > 0'), 'block revision workbench should open by default while jobs are running or suggestions need confirmation');
assert(reviewHtml.includes('aria-expanded="${initialPanelOpen ? \'true\' : \'false\'}"'), 'block revision rail should advertise the state that matches active revision work');
assert(reviewHtml.includes('`待确认 ${readyRevisionCount}`'), 'completed block revision suggestions should be visible in the rail state');
assert(reviewHtml.includes('liveBlockCards.map((card) => card.closest'), 'live block revision cards should force their workbench open during auto-refresh');
assert(reviewHtml.includes("'已选 ' + scope + ' / ' + actionName"), 'block revision rail should show the selected paragraph scope in its status bar');
assert(reviewHtml.includes('block-revision-group'), 'block revision results should be grouped by status');
assert(reviewHtml.includes('data-polish-block-instruction'), 'block revision form should offer assistant instruction polishing');
assert(reviewHtml.includes('data-block-risk-assistant'), 'block risk warnings should bridge to assistant impact checks');
assert(reviewHtml.includes('block-secondary-actions'), 'block revision cards should tuck secondary actions behind details');
assert(reviewHtml.includes('mobile-workbench-switcher'), 'mobile detail page should expose assistant/revision workbench switcher');
assert(reviewHtml.includes('data-block-card-paragraph') && reviewHtml.includes('blockCardParagraph'), 'block revision apply should restore around the affected paragraph');
assert(reviewHtml.includes('</article>\n    ${blockRevisionPanel(row, id)}'), 'block revision workbench should live outside the review decision drawer');
assert(!reviewHtml.includes('decision-dock'), 'review actions should live in the drawer, not a right-side dock');
assert(reviewHtml.includes('/webhook/novel-review-block-revise'), 'review page should post block revise requests');
assert(!reviewHtml.includes('确认提交这条局部修订要求'), 'creating a block suggestion should not show a second confirm dialog');
assert(reviewHtml.includes('/webhook/novel-review-block-apply'), 'review page should post block apply actions');
assert(reviewHtml.includes('data-revise-paragraph'), 'review page should support paragraph-level mobile revision');
assert(read('n8n/code/novel_validate_block_revision_request.js').includes("replace(/\\r\\n/g, '\\n')"), 'block request validator should normalize CRLF form newlines');
assert(blockBuilder.includes('"replacement_text"') && blockBuilder.includes('只输出局部结果'), 'block prompt should request local JSON only');
assert(blockParser.includes('block_revision_parse_success: false'), 'block parser should convert invalid JSON into failure payload');

console.log('Phase23 block revision static checks passed.');
