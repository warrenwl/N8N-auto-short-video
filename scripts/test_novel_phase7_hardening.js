#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(fullPath), `Missing required Phase 7 file: ${relativePath}`);
  return fs.readFileSync(fullPath, 'utf8');
}

function readWorkflow(relativePath) {
  return JSON.parse(read(relativePath));
}

function nodesByName(workflow) {
  return new Map((workflow.nodes || []).map((node) => [node.name, node]));
}

const notifyCode = read('n8n/code/novel_build_review_notification.js');
assert(
  notifyCode.includes('NOVEL_DISABLE_SERVERCHAN'),
  'notification builder should support NOVEL_DISABLE_SERVERCHAN for real-GLM smoke tests'
);
assert(
  notifyCode.includes('SERVERCHAN_DISABLED'),
  'notification builder should expose a disabled reminder status'
);
assert(
  !notifyCode.includes('action=approve') && !notifyCode.includes('action=reject'),
  'notification builder must not contain direct review action links'
);

for (const workflowPath of [
  'n8n/workflow/17_novel_rewrite_notify_workflow.json',
  'n8n/workflow/available/17_novel_rewrite_notify_workflow.json',
]) {
  const workflow = readWorkflow(workflowPath);
  const notifyNode = nodesByName(workflow).get('代码 - 构建小说审核提醒');
  assert(notifyNode, `${workflowPath} should include notification builder node`);
  const jsCode = notifyNode.parameters?.jsCode || '';
  assert(jsCode.includes('NOVEL_DISABLE_SERVERCHAN'), `${workflowPath} should embed ServerChan disable support`);
  assert(jsCode.includes('/webhook/novel-review-detail'), `${workflowPath} should still send detail links`);
  assert(!jsCode.includes('action=approve'), `${workflowPath} must not embed approve links`);
}

const preflight = read('scripts/test_novel_phase7_real_glm_preflight.js');
assert(preflight.includes('maskSecret'), 'real GLM preflight should mask secrets in output');
assert(preflight.includes('response_format'), 'real GLM preflight should request JSON output');
assert(preflight.includes('choices'), 'real GLM preflight should validate OpenAI-compatible choices');
assert(preflight.includes('JSON.parse'), 'real GLM preflight should parse returned JSON content');
assert(!/GLM_API_KEY\s*=\s*['"][^'"]+['"]/.test(preflight), 'preflight must not hardcode API keys');

const parser = read('n8n/code/novel_parse_glm_json.js');
assert(
  parser.includes('chapter_body_base64'),
  'parser should expose base64 chapter fields so long real GLM text cannot break SQL query replacement'
);
assert(
  parser.includes('allowedFactTypes') && parser.includes("return allowedFactTypes.has"),
  'parser should normalize unknown real-GLM fact_type values to a CHECK-safe fallback'
);

const plan = read('docs/novel_workflow/实施计划.md');
assert(plan.includes('Phase 7'), 'implementation plan should include Phase 7');
assert(plan.includes('真实 GLM'), 'implementation plan should describe real GLM smoke test');

const availableReadme = read('n8n/workflow/available/README.md');
assert(availableReadme.includes('NOVEL_DISABLE_SERVERCHAN'), 'available workflow README should document disabling ServerChan for smoke tests');

for (const workflowPath of [
  'n8n/workflow/14_novel_chapter_workflow.json',
  'n8n/workflow/available/14_novel_chapter_workflow.json',
  'n8n/workflow/17_novel_rewrite_notify_workflow.json',
  'n8n/workflow/available/17_novel_rewrite_notify_workflow.json',
]) {
  const workflowText = read(workflowPath);
  assert(workflowText.includes('decode(COALESCE(NULLIF($5'), `${workflowPath} should decode base64 chapter title`);
  assert(workflowText.includes('chapter_body_base64'), `${workflowPath} should pass base64 chapter body`);
}

for (const workflowPath of [
  'n8n/workflow/12_novel_bible_workflow.json',
  'n8n/workflow/13_novel_outline_workflow.json',
  'n8n/workflow/14_novel_chapter_workflow.json',
  'n8n/workflow/15_novel_ai_review_workflow.json',
  'n8n/workflow/17_novel_rewrite_notify_workflow.json',
]) {
  const workflowText = read(workflowPath);
  assert(
    workflowText.includes('error_message = NULL'),
    `${workflowPath} should clear stale error_message when a retried job succeeds`
  );
}

console.log(JSON.stringify({
  result: 'phase7_hardening_static_tdd_passed',
  serverchanDisableEnv: 'NOVEL_DISABLE_SERVERCHAN',
  realGlmPreflight: 'scripts/test_novel_phase7_real_glm_preflight.js',
}, null, 2));
