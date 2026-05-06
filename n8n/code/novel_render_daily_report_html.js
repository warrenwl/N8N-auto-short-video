// n8n Code node: Render Novel Daily Report HTML
// Read-only daily report. It must not expose mutating forms or action links.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripChapterTitlePrefix(value, fallback = '') {
  const raw = String(value ?? '').trim();
  const fallbackText = String(fallback ?? '').trim();
  if (!raw) return fallbackText;
  const cleaned = raw
    .replace(/^第\s*(?:[0-9０-９]+|[一二三四五六七八九十百千万零〇两]+|[Xx]+)\s*章\s*[：:、，,.．。-]?\s*/, '')
    .trim();
  return cleaned || fallbackText || raw;
}

function parseJsonMaybe(value, fallback) {
  if (!value) return fallback;
  if (Array.isArray(value) || typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (error) {
    return fallback;
  }
}

function formatLocalTime(value) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatDuration(value) {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs < 0) return '未记录';
  if (durationMs >= 1000) return `${(durationMs / 1000).toFixed(1)} 秒`;
  return `${durationMs} 毫秒`;
}

const jobTypeLabel = {
  GENERATE_BIBLE: '生成设定集',
  GENERATE_OUTLINE: '生成大纲',
  PLAN_CHAPTER_DIRECTOR: '导演台规划',
  GENERATE_CHAPTER: '生成章节',
  REVIEW_CHAPTER: '智能审稿',
  REWRITE_CHAPTER: '重写章节',
  NOTIFY_REVIEW: '发送审核提醒',
};

const jobStatusLabel = {
  PENDING: '待处理',
  RUNNING: '运行中',
  SUCCEEDED: '已成功',
  FAILED: '已失败',
  CANCELLED: '已取消',
};

const runTypeLabel = {
  GENERATE_BIBLE: '生成设定集',
  GENERATE_OUTLINE: '生成大纲',
  PLAN_CHAPTER_DIRECTOR: '导演台规划',
  GENERATE_CHAPTER: '生成章节',
  REVIEW_CHAPTER: '智能审稿',
  REWRITE_CHAPTER: '重写章节',
};

const errorMessageLabel = {
  'SERVERCHAN_SENDKEY is not configured': '提醒密钥未配置',
  'Phase7 cancelled superseded candidate review': '候选稿已被新版本替代，旧审稿任务已取消',
};

function label(map, value, fallback) {
  if (!value) return fallback;
  return map[value] || fallback;
}

function localizeError(value) {
  if (!value) return '';
  const text = String(value);
  if (errorMessageLabel[text]) return errorMessageLabel[text];
  if (/[A-Za-z_]/.test(text)) return '原始错误已记录，请查看任务日志';
  return text;
}

function renderSidebar(current) {
  const links = [
    ['工作台', '/webhook/novel-center'],
    ['项目列表', '/webhook/novel-project-list'],
    ['创建项目', '/webhook/novel-project-new'],
    ['审核中心', '/webhook/novel-review-list'],
    ['队列状态', '/webhook/novel-queue-status'],
    ['运行日报', '/webhook/novel-daily-report'],
  ];
  return `
    <aside class="app-sidebar" aria-label="后台导航">
      <div class="brand"><span>创作中台</span><strong>小说后台</strong></div>
      <nav class="side-nav" aria-label="小说工作流导航">${links.map(([text, href]) => (
        text === current
          ? `<span class="active">${escapeHtml(text)}</span>`
          : `<a href="${href}">${escapeHtml(text)}</a>`
      )).join('')}</nav>
      <a class="side-primary" href="/webhook/novel-project-new">新建项目</a>
    </aside>`;
}

function metric(labelText, value, detail = '') {
  return `<div class="metric"><span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value ?? 0)}</strong>${detail ? `<em>${escapeHtml(detail)}</em>` : ''}</div>`;
}

function failedJobItems(value) {
  const jobs = parseJsonMaybe(value, []);
  if (!jobs.length) return '<li>今日暂无失败任务</li>';
  return jobs.slice(0, 8).map((job) => {
    const title = job.project_title || '未命名项目';
    const chapter = job.chapter_no ? `第 ${job.chapter_no} 章 ${stripChapterTitlePrefix(job.chapter_title || '')}` : '项目级任务';
    const type = label(jobTypeLabel, job.job_type, '未知任务');
    const status = label(jobStatusLabel, job.status, '未知状态');
    const time = formatLocalTime(job.updated_at);
    const error = localizeError(job.error_message);
    return `<li><strong>${escapeHtml(title)} / ${escapeHtml(chapter)}</strong><span>${escapeHtml(type)} / ${escapeHtml(status)} / ${escapeHtml(time)}</span>${error ? `<p>${escapeHtml(error)}</p>` : ''}</li>`;
  }).join('');
}

function slowRunItems(value) {
  const runs = parseJsonMaybe(value, []);
  if (!runs.length) return '<li>今日暂无模型调用记录</li>';
  return runs.slice(0, 8).map((run) => {
    const title = run.project_title || '未命名项目';
    const chapter = run.chapter_no ? `第 ${run.chapter_no} 章` : '项目级调用';
    const type = label(runTypeLabel, run.run_type, '未知调用');
    const result = run.success === true ? '成功' : run.success === false ? '失败' : '未记录';
    return `<li><strong>${escapeHtml(title)} / ${escapeHtml(chapter)}</strong><span>${escapeHtml(type)} / ${escapeHtml(result)} / ${escapeHtml(formatDuration(run.duration_ms))} / ${escapeHtml(formatLocalTime(run.created_at))}</span></li>`;
  }).join('');
}

function snapshotItems(value) {
  const snapshots = parseJsonMaybe(value, []);
  if (!snapshots.length) return '<li>暂无快照历史</li>';
  return snapshots.slice(0, 7).map((snapshot) => {
    const date = snapshot.report_date || '未知日期';
    const capturedAt = formatLocalTime(snapshot.captured_at);
    const jobs = Number(snapshot.today_job_total_count || 0);
    const failed = Number(snapshot.today_job_failed_count || 0);
    const calls = Number(snapshot.today_ai_run_count || 0);
    const waiting = Number(snapshot.waiting_job_count || 0);
    const needReview = Number(snapshot.need_review_count || 0);
    return `<li><strong>快照记录 ${escapeHtml(date)}</strong><span>最近保存时间 ${escapeHtml(capturedAt)} / 任务数 ${escapeHtml(jobs)} / 模型调用 ${escapeHtml(calls)} / 失败数 ${escapeHtml(failed)} / 待处理 ${escapeHtml(waiting)} / 待审数 ${escapeHtml(needReview)}</span></li>`;
  }).join('');
}

function handlingAdvice(row) {
  const failed = Number(row.failed_job_count || row.today_job_failed_count || 0);
  const review = Number(row.need_review_count || 0);
  const backlog = Number(row.waiting_job_count || 0) + Number(row.running_job_count || 0);
  if (failed > 0) return `今日需要处理：先处理失败任务 ${failed} 个，再确认是否需要自动恢复。`;
  if (review > 0) return `今日需要处理：有 ${review} 个章节待人工审核，建议先进入审核中心。`;
  if (backlog > 0) return `今日需要处理：队列中还有 ${backlog} 个任务，建议观察调度进度。`;
  return '今日无需立即处理：没有失败任务、待审章节或队列积压。';
}

const rows = $input.all().map((item) => item.json || {}).filter((row) => !row.is_empty);
const row = rows[0] || {};
const hasFailed = Number(row.failed_job_count || row.today_job_failed_count || 0) > 0;
const hasReview = Number(row.need_review_count || 0) > 0;
const hasBacklog = Number(row.waiting_job_count || 0) + Number(row.running_job_count || 0) > 0;
const primaryDailyHref = hasFailed
  ? '/webhook/novel-queue-status?filter=failed'
  : (hasReview ? '/webhook/novel-review-list' : (hasBacklog ? '/webhook/novel-queue-status' : '/webhook/novel-project-list'));
const primaryDailyLabel = hasFailed
  ? '查看失败任务'
  : (hasReview ? '进入审核中心' : (hasBacklog ? '观察队列' : '查看项目列表'));

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>小说运行日报</title>
  <style>
    :root { color-scheme: light; --bg:#f6f7f9; --panel:#fff; --ink:#182230; --muted:#667085; --line:#d8dee8; --accent:#1f7a5c; --accent-soft:#edf8f3; --danger:#b42318; --warn:#a76508; --warn-soft:#fff7e8; }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-tap-highlight-color: rgba(31, 122, 92, .14); }
    .app-shell { min-height: 100vh; display: grid; grid-template-columns: 220px minmax(0, 1fr); }
    .app-sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 16px; padding: 22px 16px; border-right: 1px solid var(--line); background: #fff; }
    .brand { display: grid; gap: 3px; padding: 0 4px 12px; border-bottom: 1px solid var(--line); }
    .brand span { color: var(--muted); font-size: 11px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
    .brand strong { font-size: 20px; line-height: 1.2; }
    .side-nav { display: grid; gap: 4px; }
    .side-nav a, .side-nav span { min-height: 38px; display: flex; align-items: center; border-radius: 8px; padding: 0 10px; color: #344054; text-decoration: none; font-weight: 750; }
    .side-nav a:hover, .side-nav .active { color: var(--accent); background: var(--accent-soft); }
    .side-primary { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; margin-top: auto; background: var(--accent); color: #fff; text-decoration: none; font-weight: 800; }
    main { width: min(1240px, calc(100vw - 32px)); margin: 24px auto 48px; }
    .app-shell > main { width: auto; max-width: none; margin: 24px 16px 48px; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: end; margin-bottom: 18px; }
    .page-context { position: sticky; top: 0; z-index: 70; margin-bottom: 18px; padding: 14px 0 12px; background: rgba(246, 247, 249, .97); border-bottom: 1px solid rgba(216, 222, 232, .92); backdrop-filter: blur(10px); }
    .page-context header { margin-bottom: 0; }
    h1 { margin: 0; font-size: 28px; text-wrap: balance; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    .ops-kicker { margin: 0 0 6px; color: var(--muted); font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    .muted { color: var(--muted); margin: 6px 0 0; }
    nav { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    a { color: var(--accent); text-decoration: none; font-weight: 650; }
    nav a { white-space: nowrap; }
    .toc { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; margin-bottom: 18px; }
    .toc strong { display: block; margin-bottom: 10px; }
    .toc-links { display: flex; gap: 10px; flex-wrap: wrap; }
    .toc-links a { min-height: 36px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 12px; background: #fff; touch-action: manipulation; }
    .toc-links a:hover { border-color: var(--accent); background: var(--accent-soft); }
    .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
    .metric, section, details { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
    .metric { padding: 14px; }
    .metric span { display: block; color: var(--muted); font-size: 13px; }
    .metric strong { display: block; margin-top: 6px; font-size: 24px; font-variant-numeric: tabular-nums; }
    .metric em { display: block; margin-top: 4px; color: var(--muted); font-style: normal; font-size: 12px; line-height: 1.45; }
    section { padding: 16px; margin-bottom: 18px; }
    .handling { background: var(--warn-soft); border-color: #f0c36a; }
    .handling p { margin: 0; color: #6f4e08; line-height: 1.7; font-weight: 650; }
    .handling-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
    .handling-actions a { min-height: 38px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 12px; background: #fff; color: var(--accent); text-decoration: none; font-weight: 750; }
    .handling-actions a.primary { color: #fff; background: var(--accent); border-color: var(--accent); }
    .howto { background: var(--accent-soft); border-color: #b9e3d4; }
    .howto ol { margin: 0; padding-left: 20px; color: #225447; line-height: 1.7; }
    details.report-section { margin-bottom: 18px; overflow: hidden; content-visibility: auto; contain-intrinsic-size: 220px; }
    details.report-section summary { cursor: pointer; padding: 16px; font-size: 18px; font-weight: 750; }
    details.report-section ul, details.report-section .strategy-body { padding: 0 16px 16px; }
    ul { margin: 0; padding-left: 18px; }
    li { margin-bottom: 12px; }
    li span { display: block; color: var(--muted); margin-top: 3px; font-size: 13px; }
    li p { margin: 4px 0 0; color: var(--danger); font-size: 13px; }
    .strategy-body p { margin: 0 0 8px; color: var(--muted); line-height: 1.7; }
    a:focus-visible, summary:focus-visible { outline: 3px solid #8fd4bd; outline-offset: 2px; }
    @media (max-width: 820px) {
      main, .app-shell > main { width: min(100% - 24px, 1240px); margin: 16px auto 48px; }
      .app-shell { display: block; }
      .app-sidebar { position: static; height: auto; padding: 12px; border-right: 0; border-bottom: 1px solid var(--line); }
      .brand { display: none; }
      .side-nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
      .side-nav a, .side-nav span { white-space: nowrap; }
      .side-primary { display: none; }
      header { display: block; }
      nav { margin-top: 12px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
      .metrics { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="app-shell">
  ${renderSidebar('运行日报')}
  <main>
    <div class="page-context">
    <header>
      <div>
        <p class="ops-kicker">运行日报</p>
        <h1>小说运行日报</h1>
        <p class="muted">只读日报，统计日期：${escapeHtml(row.report_date || '今日')}</p>
      </div>
    </header>
    </div>

    <div class="toc" aria-label="页内目录">
      <strong>页内目录</strong>
      <div class="toc-links">
        <a href="#today-overview">今日概览</a>
        <a href="#failed-summary">失败摘要</a>
        <a href="#slow-calls">较慢调用</a>
        <a href="#snapshot-history">快照历史</a>
      </div>
    </div>

    <div class="metrics" id="today-overview">
      ${metric('今日任务', row.today_job_total_count || 0, `成功 ${row.today_job_succeeded_count || 0} / 失败 ${row.today_job_failed_count || 0} / 取消 ${row.today_job_cancelled_count || 0}`)}
      ${metric('模型调用', row.today_ai_run_count || 0, `成功 ${row.today_ai_success_count || 0} / 失败 ${row.today_ai_failed_count || 0}`)}
      ${metric('队列积压', Number(row.waiting_job_count || 0) + Number(row.running_job_count || 0), `待处理 ${row.waiting_job_count || 0} / 运行中 ${row.running_job_count || 0}`)}
      ${metric('待人工审核', row.need_review_count || 0, `失败任务 ${row.failed_job_count || 0}`)}
    </div>

    <section class="handling" aria-label="今日是否需要处理">
      <p class="ops-kicker">Daily Verdict</p>
      <h2>今日处理结论 / 今日是否需要处理</h2>
      <p>${escapeHtml(handlingAdvice(row))}</p>
      <div class="handling-actions">
        <a class="primary" href="${escapeHtml(primaryDailyHref)}">${escapeHtml(primaryDailyLabel)}</a>
        <a href="/webhook/novel-center">返回工作台</a>
        <a href="/webhook/novel-queue-status">队列状态</a>
      </div>
    </section>

    <section class="howto">
      <h2>如何使用日报</h2>
      <ol>
        <li>先看失败摘要，确认是否需要自动恢复或查看日志。</li>
        <li>再看较慢调用，判断真实模型耗时是否异常。</li>
        <li>最后看快照历史，比较今天运行变化。</li>
      </ol>
    </section>

    <details class="report-section" id="failed-summary" open>
      <summary>失败摘要</summary>
      <ul>${failedJobItems(row.latest_failed_jobs)}</ul>
    </details>

    <details class="report-section" id="slow-calls" open>
      <summary>较慢调用</summary>
      <ul>${slowRunItems(row.slow_ai_runs)}</ul>
    </details>

    <details class="report-section" id="snapshot-history">
      <summary>快照历史</summary>
      <ul>${snapshotItems(row.snapshot_history)}</ul>
    </details>

    <details class="report-section" id="strategy-section" open>
      <summary>调度策略</summary>
      <div class="strategy-body">
        <p>建议每十分钟执行一轮队列，先处理生成设定集、生成大纲、生成章节和智能审稿，再处理重写章节、发送审核提醒和自动恢复。</p>
        <p>默认禁用外部提醒；只有明确需要外发提醒时才开启真实提醒。</p>
        <p>日报页面只做观察，不提供重试、取消或审核动作。</p>
        <p>保存方式：在命令行执行 scripts/snapshot_novel_daily_report.sh，可把当天日报保存为快照。</p>
      </div>
    </details>
  </main>
  </div>
</body>
</html>`;

return [{json: {response_html: html}}];
