#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(fullPath), `Missing Phase 8 artifact: ${relativePath}`);
  return fs.readFileSync(fullPath, 'utf8');
}

function stripJsonComments(text) {
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const runner = read('scripts/run_novel_queue_once.sh');
assert(runner.includes('novelBibleV1Workflow12'), 'runner should execute workflow 12');
assert(runner.includes('novelOutlineV1Workflow13'), 'runner should execute workflow 13');
assert(runner.includes('novelDirectorV1Workflow13B'), 'runner should execute workflow 13B director planning');
assert(runner.includes('novelChapterV1Workflow14'), 'runner should execute workflow 14');
assert(runner.includes('novelAiReviewV1Workflow15'), 'runner should execute workflow 15');
assert(runner.includes('novelRewriteNotifyV1Workflow17'), 'runner should execute workflow 17');
assert(runner.includes('novelAutoRecoveryV1Workflow18'), 'runner should execute workflow 18');
assert(runner.includes('NOVEL_DISABLE_SERVERCHAN'), 'runner should default to safe notification disabling unless explicitly overridden');
assert(!runner.includes('GLM_API_BASE_URL=http://host.docker.internal:18080'), 'runner must not force the local mock GLM endpoint');
assert(runner.includes('trap'), 'runner should restart n8n via trap after CLI execution');

const dryRun = execFileSync(path.join(repoRoot, 'scripts/run_novel_queue_once.sh'), ['--dry-run'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
assert(dryRun.includes('docker compose run --rm n8n execute --id=novelBibleV1Workflow12'), 'dry-run should show workflow 12 command');
assert(dryRun.includes('docker compose run --rm n8n execute --id=novelDirectorV1Workflow13B'), 'dry-run should show workflow 13B command');
assert(dryRun.includes('NOVEL_DISABLE_SERVERCHAN=true'), 'dry-run should show ServerChan disabled by default');
assert(!dryRun.includes('host.docker.internal:18080'), 'dry-run should not show mock GLM endpoint');

const realNotifyDryRun = execFileSync(path.join(repoRoot, 'scripts/run_novel_queue_once.sh'), ['--dry-run', '--real-notify'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
assert(!realNotifyDryRun.includes('NOVEL_DISABLE_SERVERCHAN=true'), '--real-notify should not disable ServerChan');

const runbook = read('docs/novel_workflow/运行手册.md');
assert(runbook.includes('Phase 8'), 'runbook should mention Phase 8');
assert(runbook.includes('scripts/run_novel_queue_once.sh'), 'runbook should document the queue runner');
assert(runbook.includes('13B PLAN_CHAPTER_DIRECTOR'), 'runbook should document director planning in the queue order');
assert(runbook.includes('NOVEL_DISABLE_SERVERCHAN=true'), 'runbook should document safe notification disabling');
assert(runbook.includes('POST /webhook/novel-review-action'), 'runbook should keep human review on POST action');
assert(runbook.includes('不要设置 GLM_API_BASE_URL=http://host.docker.internal:18080'), 'runbook should warn not to use mock GLM in real runs');
assert(runbook.includes('真实重写 smoke'), 'runbook should include the real rewrite smoke procedure');
assert(runbook.includes('crontab'), 'runbook should include a scheduling example');

const novelConfig = read('config/novel_generation_config.jsonc');
const parsedNovelConfig = JSON.parse(stripJsonComments(novelConfig));
const rewritePrompt = parsedNovelConfig.user_prompt_templates?.rewrite || '';
assert(rewritePrompt, 'novel config should include rewrite prompt');
assert(rewritePrompt.includes('\\\"new_facts\\\":[{\\\"fact_type\\\":\\\"other\\\"'), 'rewrite prompt should require structured new_facts instead of an empty array');
assert(!rewritePrompt.includes('\\\"new_facts\\\":[]'), 'rewrite prompt should not encourage empty new_facts');

const phasePlan = read('docs/novel_workflow/实施计划.md');
assert(phasePlan.includes('Phase 8'), 'implementation plan should include Phase 8');
assert(phasePlan.includes('真实重写 smoke'), 'Phase 8 plan should mention real rewrite smoke');

console.log(JSON.stringify({
  result: 'phase8_ops_static_tdd_passed',
  runner: 'scripts/run_novel_queue_once.sh',
  runbook: 'docs/novel_workflow/运行手册.md',
  defaultNotificationMode: 'NOVEL_DISABLE_SERVERCHAN=true',
}, null, 2));
