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

function nodesByName(workflow) {
  return new Map((workflow.nodes || []).map((node) => [node.name, node]));
}

function nodesByType(workflow, type) {
  return (workflow.nodes || []).filter((node) => node.type === type);
}

function runCodeNode(relativePath, json) {
  const source = read(relativePath);
  const sandbox = {
    $json: json,
    $env: {
      NOVEL_GENERATION_CONFIG_PATH: path.join(repoRoot, 'config/novel_generation_config.jsonc'),
    },
    $input: {
      first: () => ({json}),
      all: () => [{json}],
    },
    require,
    console,
    Date,
    Intl,
    JSON,
    Number,
    String,
    Array,
    Object,
  };
  vm.createContext(sandbox);
  const script = new vm.Script(`(function() {\n${source}\n})()`, {filename: relativePath});
  return script.runInContext(sandbox);
}

const schema = read('sql/47_novel_schema.sql');
const functionsSql = read('sql/48_novel_functions.sql');
const config = read('config/novel_generation_config.jsonc');
const workflow = readJson('n8n/workflow/16_novel_review_workflow.json');
const availableWorkflow = readJson('n8n/workflow/available/16_novel_review_workflow.json');
const renderCode = read('n8n/code/novel_render_review_html.js');
const nodes = nodesByName(workflow);

assert.strictEqual(JSON.stringify(workflow), JSON.stringify(availableWorkflow), '16 root and available workflow copies should match');
assert(schema.includes('CREATE TABLE IF NOT EXISTS novel_review_assistant_threads'), 'schema should create assistant threads');
assert(schema.includes('CREATE TABLE IF NOT EXISTS novel_review_assistant_messages'), 'schema should create assistant messages');
assert(schema.includes("'REVIEW_ASSISTANT'"), 'schema should allow REVIEW_ASSISTANT ai runs');
assert(functionsSql.includes('start_novel_review_assistant_message'), 'functions should validate token and prepare assistant context');
assert(functionsSql.includes('finish_novel_review_assistant_message'), 'functions should record assistant response and ai run');
assert(functionsSql.includes('c.review_token = p_review_token'), 'assistant start should verify chapter_id + review_token');
assert(functionsSql.includes('novel_review_assistant_messages'), 'assistant functions should persist messages');
assert(config.includes('"review_assistant"'), 'config should include review_assistant prompt settings');

const webhooks = nodesByType(workflow, 'n8n-nodes-base.webhook');
const assistantWebhook = nodes.get('Webhook - 小说审稿助手');
assert(assistantWebhook, '16 should expose review assistant webhook');
assert.strictEqual(assistantWebhook.parameters.httpMethod, 'POST', 'assistant webhook must be POST');
assert.strictEqual(assistantWebhook.parameters.path, 'novel-review-assistant', 'assistant webhook path mismatch');
assert(!webhooks.some((node) => node.parameters.path === 'novel-review-assistant' && node.parameters.httpMethod === 'GET'), 'assistant must not be reachable by GET');

assert(nodes.get('代码 - 校验小说审稿助手'), 'workflow should validate assistant requests');
assert(nodes.get('数据库 - 准备审稿助手上下文')?.parameters.query.includes('start_novel_review_assistant_message'), 'workflow should prepare assistant context through SQL function');
assert(nodes.get('代码 - 审稿助手上下文闸门')?.parameters.jsCode.includes('assistant_should_call_model'), 'workflow should guard token/context failures before GLM');
assert(nodes.get('代码 - 构建审稿助手 GLM请求'), 'workflow should build assistant GLM request');
assert(nodes.get('HTTP请求 - 调用GLM审稿助手')?.parameters.jsonBody.includes('llm_request_body'), 'workflow should call GLM with assistant request body');
assert(nodes.get('数据库 - 记录审稿助手回答')?.parameters.query.includes('finish_novel_review_assistant_message'), 'workflow should record assistant result through SQL function');
assert(nodes.get('响应Webhook - 返回审稿助手结果')?.parameters.options.responseHeaders.entries[0].value.includes('application/json'), 'assistant response should be JSON');

assert.deepStrictEqual(
  (workflow.connections?.['条件判断 - 审稿助手需要调用模型']?.main || []).map((branch) => branch.map((connection) => connection.node)),
  [['代码 - 构建审稿助手 GLM请求'], ['响应Webhook - 返回审稿助手结果']],
  'assistant workflow should return preflight failures without calling GLM'
);
assert.deepStrictEqual(
  (workflow.connections?.['HTTP请求 - 调用GLM审稿助手']?.main || []).map((branch) => branch.map((connection) => connection.node)),
  [['代码 - 合并审稿助手 GLM响应上下文'], ['代码 - 合并审稿助手 GLM错误上下文']],
  'assistant workflow should route GLM success and error into parser'
);
assert.deepStrictEqual(
  (workflow.connections?.['数据库 - 记录审稿助手回答']?.main?.[0] || []).map((connection) => connection.node),
  ['响应Webhook - 返回审稿助手结果'],
  'assistant workflow should respond after persistence'
);

assert(renderCode.includes('review-assistant-panel'), 'review detail should render assistant panel');
assert(renderCode.includes('/webhook/novel-review-assistant'), 'review detail should post to assistant webhook');
assert(renderCode.includes('data-selection-assistant'), 'selection toolbar should support asking assistant about selected text');
assert(renderCode.includes('renderAssistantResult'), 'review detail should render assistant JSON responses');
assert(renderCode.includes('create_block_revision'), 'assistant actions should be able to prefill block revision');
assert(renderCode.includes('record_human_note'), 'assistant actions should be able to prefill human review note');
assert(renderCode.includes('create_fact_draft'), 'assistant actions should expose fact draft copying');
assert(renderCode.includes('bridgeLabels') && renderCode.includes('.slice(0, 3)'), 'assistant actions should stay limited to the three bridge actions');

const validRequest = runCodeNode('n8n/code/novel_validate_review_assistant_request.js', {
  body: {
    chapter_id: '11111111-1111-1111-1111-111111111111',
    review_token: 'token',
    mode: 'selection_advice',
    question: '这段怎么改？',
    selected_text: '许青没有解释，只把文件塞给他。',
    paragraph_start: '2',
    selection_start_offset: '12',
  },
})[0].json;
assert.strictEqual(validRequest.mode, 'selection_advice');
assert.strictEqual(validRequest.paragraph_start, 2);
assert.strictEqual(validRequest.selection_start_offset, 12);

for (const mode of ['continuity', 'selection_advice', 'design_reference']) {
  const built = runCodeNode('n8n/code/novel_build_review_assistant_glm_request.js', {
    success: true,
    thread_id: '22222222-2222-2222-2222-222222222222',
    user_message_id: '33333333-3333-3333-3333-333333333333',
    project_id: '44444444-4444-4444-4444-444444444444',
    chapter_id: '11111111-1111-1111-1111-111111111111',
    review_token: 'token',
    mode,
    question: '合理吗？',
    selected_text: mode === 'selection_advice' ? '许青没有解释，只把文件塞给他。' : '',
    novel_title: '测试小说',
    genre: '都市逆袭',
    audience: '男频爽文读者',
    style: '节奏快',
    chapter_no: 1,
    chapter_title: '雨夜对峙',
    chapter_body: '林澈站在雨里，突然断定周霆就是幕后人。许青没有解释，只把文件塞给他。',
    novel_bible: {story_core: '反击'},
    outline_context: {summary: '雨夜对峙'},
    director_card: {causal_chain: {trigger: '文件'}},
    continuity_facts: [{fact_key: '周霆', fact_value: '幕后施压'}],
    review_report: {issues: [{description: '动机不足'}]},
  })[0].json;
  assert.strictEqual(built.run_type, 'REVIEW_ASSISTANT');
  assert.strictEqual(built.llm_request_body.response_format.type, 'json_object');
  assert(built.llm_request_body.messages[1].content.includes('"suggested_actions"'), `builder should request action JSON for ${mode}`);
  assert(built.llm_request_body.messages[1].content.includes('【当前正文】'), `builder should include chapter body for ${mode}`);
}

const parsed = runCodeNode('n8n/code/novel_parse_review_assistant_json.js', {
  thread_id: '22222222-2222-2222-2222-222222222222',
  mode: 'continuity',
  llm_response: {
    choices: [{
      message: {
        content: JSON.stringify({
          answer: '动机不足。',
          findings: [{type: 'consistency', severity: 'medium', description: '许青交出文件缺少动机'}],
          suggestions: [{title: '补动机', detail: '加一句许青的压力来源'}],
          source_refs: [{source_type: 'chapter', label: '选区', quote: '许青没有解释'}],
          suggested_actions: [{action_type: 'create_block_revision', label: '转为局部修订', instruction: '补足许青动机'}],
        }),
      },
    }],
  },
})[0].json;
assert.strictEqual(parsed.assistant_success, true);
assert.strictEqual(parsed.parsed_payload.ok, true);
assert.strictEqual(parsed.parsed_payload.suggested_actions[0].action_type, 'create_block_revision');

const invalid = runCodeNode('n8n/code/novel_parse_review_assistant_json.js', {
  thread_id: '22222222-2222-2222-2222-222222222222',
  mode: 'continuity',
  llm_response: {choices: [{message: {content: 'not json'}}]},
})[0].json;
assert.strictEqual(invalid.assistant_success, false);
assert.strictEqual(invalid.parsed_payload.ok, false);
assert.strictEqual(invalid.response_status_code, 502);

console.log(JSON.stringify({
  result: 'phase24_review_assistant_static_and_code_tdd_passed',
  webhook: 'POST /webhook/novel-review-assistant',
  modes: ['continuity', 'selection_advice', 'design_reference'],
}, null, 2));
