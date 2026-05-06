#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {execFileSync} = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(fullPath), `Missing Phase 12 artifact: ${relativePath}`);
  return fs.readFileSync(fullPath, 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function nodesByName(workflow) {
  return new Map((workflow.nodes || []).map((node) => [node.name, node]));
}

function runCodeNode(relativePath, rows) {
  const source = read(relativePath);
  const script = new vm.Script(`(function() {\n${source}\n})()`, {filename: relativePath});
  const sandbox = {
    $input: {
      all: () => rows.map((json) => ({json})),
    },
    Intl,
    Date,
    Number,
    String,
    Array,
    JSON,
    encodeURIComponent,
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

const schema = read('sql/47_novel_schema.sql');
assert(schema.includes('CREATE TABLE IF NOT EXISTS novel_daily_report_snapshots'), 'schema should create daily report snapshot table');
assert(schema.includes('UNIQUE(report_date)'), 'snapshot table should keep one row per report date');
assert(schema.includes('idx_novel_daily_report_snapshots_captured_at'), 'snapshot table should index captured_at');

const functionsSql = read('sql/48_novel_functions.sql');
assert(functionsSql.includes('CREATE OR REPLACE FUNCTION upsert_novel_daily_report_snapshot'), 'functions should expose snapshot upsert function');
assert(functionsSql.includes('novel_daily_report_snapshots'), 'snapshot function should write snapshot table');
assert(functionsSql.includes('ON CONFLICT (report_date) DO UPDATE'), 'snapshot function should be idempotent per date');

const workflow = readJson('n8n/workflow/11_novel_center_workflow.json');
const availableWorkflow = readJson('n8n/workflow/available/11_novel_center_workflow.json');
assert.strictEqual(JSON.stringify(workflow), JSON.stringify(availableWorkflow), '11 root and available workflow copies should match');
const dailyQuery = nodesByName(workflow).get('数据库 - 查询小说运行日报')?.parameters?.query || '';
assert(dailyQuery.includes('novel_daily_report_snapshots'), 'daily report query should read snapshot history');
assert(dailyQuery.includes('snapshot_history'), 'daily report query should expose snapshot_history');

const dailyCode = read('n8n/code/novel_render_daily_report_html.js');
for (const expected of ['快照历史', '最近保存', '保存方式', 'scripts/snapshot_novel_daily_report.sh']) {
  assert(dailyCode.includes(expected), `daily report renderer should include snapshot marker: ${expected}`);
}
assert(!dailyCode.includes('method="POST"'), 'daily report renderer must not expose POST forms');

const forbiddenVisibleTokens = /\b(PENDING|RUNNING|SUCCEEDED|FAILED|CANCELLED|GENERATE_BIBLE|GENERATE_OUTLINE|GENERATE_CHAPTER|REVIEW_CHAPTER|REWRITE_CHAPTER|NOTIFY_REVIEW|CREATED|BIBLE_READY|OUTLINE_READY|WRITING|REVIEWING|PAUSED|COMPLETED|Bible|AI)\b/;
const html = runCodeNode('n8n/code/novel_render_daily_report_html.js', [{
  is_empty: false,
  report_date: '2026-05-03',
  today_job_total_count: 12,
  today_job_succeeded_count: 9,
  today_job_failed_count: 1,
  today_job_cancelled_count: 0,
  today_ai_run_count: 7,
  today_ai_success_count: 6,
  today_ai_failed_count: 1,
  waiting_job_count: 2,
  running_job_count: 0,
  failed_job_count: 1,
  need_review_count: 3,
  latest_failed_jobs: '[]',
  slow_ai_runs: '[]',
  snapshot_history: '[{"report_date":"2026-05-03","captured_at":"2026-05-03T08:00:00.000Z","today_job_total_count":12,"today_job_failed_count":1,"today_ai_run_count":7,"waiting_job_count":2,"failed_job_count":1,"need_review_count":3}]',
}])[0].json.response_html;
const text = visibleText(html);
for (const expected of ['小说运行日报', '快照历史', '最近保存', '保存方式', '今日任务']) {
  assert(text.includes(expected), `daily report visible text should include: ${expected}`);
}
assert(!forbiddenVisibleTokens.test(text), `daily report visible text should not expose raw English status/type: ${text}`);
assert(!html.includes('method="POST"'), 'daily report HTML must not expose POST forms');

const snapshotRunner = read('scripts/snapshot_novel_daily_report.sh');
assert(snapshotRunner.includes('upsert_novel_daily_report_snapshot'), 'snapshot runner should call snapshot function');
assert(snapshotRunner.includes('--dry-run'), 'snapshot runner should support dry-run');
const snapshotDryRun = execFileSync(path.join(repoRoot, 'scripts/snapshot_novel_daily_report.sh'), ['--dry-run'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
assert(snapshotDryRun.includes('upsert_novel_daily_report_snapshot'), 'snapshot dry-run should show snapshot SQL');

const longformRunner = read('scripts/run_novel_longform_smoke.sh');
assert(longformRunner.includes('TARGET_CHAPTERS="${TARGET_CHAPTERS:-3}"'), 'longform smoke should default to three chapters');
assert(longformRunner.includes('scripts/run_novel_queue_once.sh'), 'longform smoke should reuse queue runner');
assert(longformRunner.includes('NOVEL_DISABLE_SERVERCHAN=true'), 'longform smoke should keep notifications disabled by default');
assert(longformRunner.includes('apply_novel_review_action'), 'longform smoke should auto-approve via review function');
assert(longformRunner.includes('snapshot_novel_daily_report.sh'), 'longform smoke should save a daily snapshot');
assert(!longformRunner.includes('host.docker.internal:18080'), 'longform smoke must not force mock GLM endpoint');
const longformDryRun = execFileSync(path.join(repoRoot, 'scripts/run_novel_longform_smoke.sh'), ['--dry-run'], {
  cwd: repoRoot,
  encoding: 'utf8',
});
assert(longformDryRun.includes('目标章节数：3'), 'longform dry-run should show target chapter count in Chinese');
assert(longformDryRun.includes('通知默认禁用'), 'longform dry-run should show safe notification mode in Chinese');
assert(!longformDryRun.includes('host.docker.internal:18080'), 'longform dry-run should not show mock GLM endpoint');

const runbook = read('docs/novel_workflow/运行手册.md');
assert(runbook.includes('Phase 12 日报快照与长篇压测'), 'runbook should document Phase 12');
assert(runbook.includes('scripts/snapshot_novel_daily_report.sh'), 'runbook should document snapshot runner');
assert(runbook.includes('scripts/run_novel_longform_smoke.sh'), 'runbook should document longform smoke runner');

console.log(JSON.stringify({
  result: 'phase12_snapshot_longform_static_tdd_passed',
  snapshotRunner: 'scripts/snapshot_novel_daily_report.sh',
  longformRunner: 'scripts/run_novel_longform_smoke.sh',
  displayLanguage: '状态与任务类型中文展示',
}, null, 2));
