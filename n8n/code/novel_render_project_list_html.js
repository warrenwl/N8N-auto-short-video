// n8n Code node: Render Novel Project List HTML
// Read-only project inventory with project-level navigation actions.

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

const projectStatusLabel = {
  CREATED: '待生成设定集',
  BIBLE_READY: '设定集已完成',
  OUTLINE_READY: '大纲已完成',
  WRITING: '写作中',
  REVIEWING: '待人工审核',
  PAUSED: '已暂停',
  ARCHIVED: '已归档',
  COMPLETED: '已完结',
  FAILED: '已失败',
};

const jobTypeLabel = {
  GENERATE_BIBLE: '生成设定集',
  GENERATE_OUTLINE: '生成大纲',
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
  if (/[A-Za-z_]/.test(text)) return '原始错误已记录，请查看队列日志';
  return text;
}

function statusBadge(status) {
  const raw = String(status || '');
  const klass = raw === 'FAILED'
    ? 'bad'
    : raw === 'RUNNING'
      ? 'warn'
      : raw === 'SUCCEEDED' || raw === 'COMPLETED'
        ? 'good'
        : 'muted';
  return `<span class="badge ${klass}">${escapeHtml(label(jobStatusLabel, raw, '未知状态'))}</span>`;
}

function projectBadge(status) {
  const raw = String(status || '');
  const klass = raw === 'FAILED'
    ? 'bad'
    : raw === 'REVIEWING' || raw === 'WRITING'
      ? 'warn'
      : raw === 'COMPLETED'
        ? 'good'
        : 'muted';
  return `<span class="badge ${klass}">${escapeHtml(label(projectStatusLabel, raw, '未知状态'))}</span>`;
}

function liveProjectBadge(row) {
  const base = String(row.status || '');
  if (['PAUSED', 'ARCHIVED', 'COMPLETED', 'FAILED'].includes(base)) return projectBadge(base);
  const jobType = String(row.latest_job_type || '');
  const jobStatus = String(row.latest_job_status || '');
  const active = Number(row.running_job_count || 0) + Number(row.waiting_job_count || 0) > 0;
  if (Number(row.need_review_count || 0) > 0 && jobType === 'NOTIFY_REVIEW') return projectBadge('REVIEWING');
  if (!active || !['RUNNING', 'PENDING'].includes(jobStatus)) return projectBadge(base);
  const labels = {
    GENERATE_BIBLE: jobStatus === 'RUNNING' ? '设定集生成中' : '设定集待启动',
    GENERATE_OUTLINE: jobStatus === 'RUNNING' ? '大纲生成中' : '大纲待启动',
    GENERATE_CHAPTER: jobStatus === 'RUNNING' ? '章节生成中' : '章节待启动',
    REVIEW_CHAPTER: jobStatus === 'RUNNING' ? '智能审稿中' : '等待智能审稿',
    REWRITE_CHAPTER: jobStatus === 'RUNNING' ? '重写中' : '重写待执行',
    NOTIFY_REVIEW: jobStatus === 'RUNNING' ? '提醒发送中' : '提醒待发送',
  };
  const klass = jobStatus === 'RUNNING' ? 'warn' : 'muted';
  return `<span class="badge ${klass}" title="基础状态：${escapeHtml(label(projectStatusLabel, base, base || '未知状态'))}">${escapeHtml(labels[jobType] || '队列处理中')}</span>`;
}

function successLabel(value) {
  if (value === true) return '成功';
  if (value === false) return '失败';
  return '未记录';
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

function reviewHref(row) {
  if (!row.need_review_chapter_id || !row.need_review_token) return '';
  return `/webhook/novel-review-detail?chapter_id=${encodeURIComponent(row.need_review_chapter_id)}&review_token=${encodeURIComponent(row.need_review_token)}`;
}

function queueHref(row) {
  if (!row.id) return '/webhook/novel-queue-status';
  return `/webhook/novel-queue-status?project_id=${encodeURIComponent(row.id)}`;
}

function detailHref(row, view = '') {
  if (!row.id) return '/webhook/novel-project-list';
  const viewParam = view ? `&view=${encodeURIComponent(view)}` : '';
  return `/webhook/novel-project-detail?project_id=${encodeURIComponent(row.id)}${viewParam}`;
}

function reviewAction(row) {
  const href = reviewHref(row);
  if (!href) return '<span class="disabled-action">暂无待审</span>';
  const title = row.need_review_chapter_no ? `第 ${escapeHtml(row.need_review_chapter_no)} 章` : '待审章节';
  return `<a href="${href}">去审核 ${title}</a>`;
}

const projectActionHelpText = '“打开项目”就是查看控制台，可继续查看设定、大纲、正文、事实、日志和导出。';

function projectActions(row) {
  return `
    <div class="row-actions" aria-label="项目操作入口">
      <a href="${detailHref(row)}">打开项目</a>
      ${hasReview(row) ? reviewAction(row) : '<span class="disabled-action">暂无待审</span>'}
      <a href="${queueHref(row)}">看队列</a>
      <a href="${detailHref(row, 'ops')}">看日志</a>
      <a href="/webhook/novel-daily-report#today-overview">看日报</a>
    </div>`;
}

function latestJobHtml(row) {
  if (!row.latest_job_type) return '<span class="muted">暂无任务记录</span>';
  const error = localizeError(row.latest_job_error_message);
  return `
    <strong>最近任务</strong>
    <span>${escapeHtml(label(jobTypeLabel, row.latest_job_type, '未知任务'))} ${statusBadge(row.latest_job_status)}</span>
    ${error ? `<span class="error">${escapeHtml(error)}</span>` : ''}
  `;
}

function latestCallHtml(row) {
  if (!row.latest_ai_run_type) return '<span class="muted">暂无调用记录</span>';
  const error = localizeError(row.latest_ai_error_message);
  return `
    <strong>最近调用</strong>
    <span>${escapeHtml(label(runTypeLabel, row.latest_ai_run_type, '未知调用'))} / ${escapeHtml(successLabel(row.latest_ai_success))} / ${escapeHtml(formatDuration(row.latest_ai_duration_ms))}</span>
    ${error ? `<span class="error">${escapeHtml(error)}</span>` : ''}
  `;
}

function projectProgress(row) {
  return `${Number(row.current_chapter_no || 0)} / ${Number(row.target_total_chapters || 0)}`;
}

function queueSummary(row) {
  return `待处理 ${Number(row.waiting_job_count || 0)} / 运行中 ${Number(row.running_job_count || 0)} / 失败任务 ${Number(row.failed_job_count || 0)}`;
}

function hasReview(row) {
  return Boolean(row.need_review_chapter_id && row.need_review_token) || Number(row.need_review_count || 0) > 0;
}

function hasIssue(row) {
  return Number(row.failed_job_count || 0) > 0 || row.status === 'FAILED' || row.latest_job_status === 'FAILED';
}

function hasQueue(row) {
  return Number(row.waiting_job_count || 0) + Number(row.running_job_count || 0) > 0;
}

function canContinue(row) {
  return !hasReview(row)
    && !hasIssue(row)
    && !hasQueue(row)
    && !['COMPLETED', 'ARCHIVED', 'PAUSED'].includes(String(row.status || ''));
}

function nextAction(row) {
  if (hasReview(row)) return {label: '处理审核', detail: row.need_review_chapter_no ? `第 ${row.need_review_chapter_no} 章待审` : '有章节等待人工判断', tone: 'warn', href: reviewHref(row)};
  if (hasIssue(row)) return {label: '排查失败', detail: '先看队列和运行日志，确认失败原因', tone: 'bad', href: detailHref(row, 'ops')};
  if (hasQueue(row)) return {label: '观察队列', detail: queueSummary(row), tone: 'queued', href: queueHref(row)};
  if (canContinue(row)) return {label: '继续写作', detail: '没有待审、失败或队列阻塞', tone: 'good', href: detailHref(row)};
  if (row.status === 'PAUSED') return {label: '已暂停', detail: '恢复后才会继续进入队列', tone: 'muted', href: detailHref(row)};
  if (row.status === 'ARCHIVED') return {label: '已归档', detail: '需要恢复归档后再处理', tone: 'muted', href: detailHref(row)};
  if (row.status === 'COMPLETED') return {label: '整理成稿', detail: '可进入导出视图查看全文', tone: 'good', href: detailHref(row, 'export')};
  return {label: '查看项目', detail: '进入项目指挥台确认状态', tone: 'muted', href: detailHref(row)};
}

function nextActionHtml(row) {
  const action = nextAction(row);
  return `<a class="next-step ${escapeHtml(action.tone)}" href="${escapeHtml(action.href || detailHref(row))}"><strong>${escapeHtml(action.label)}</strong><span>${escapeHtml(action.detail)}</span></a>`;
}

function projectFilterValues(row) {
  const values = ['all'];
  if (hasReview(row)) values.push('review');
  if (hasIssue(row)) values.push('issue');
  if (hasQueue(row)) values.push('queued');
  if (row.status === 'PAUSED') values.push('paused');
  if (row.status === 'COMPLETED') values.push('completed');
  if (row.status === 'ARCHIVED') values.push('archived');
  return values.join(' ');
}

function todoCounts(rows) {
  return rows.reduce((acc, row) => {
    if (hasReview(row)) acc.review += Math.max(1, Number(row.need_review_count || 0));
    acc.failed += Number(row.failed_job_count || 0);
    if (hasIssue(row) && Number(row.failed_job_count || 0) === 0) acc.failed += 1;
    if (hasQueue(row)) acc.queued += 1;
    if (row.status === 'PAUSED') acc.paused += 1;
    if (row.status === 'COMPLETED') acc.completed += 1;
    if (row.status === 'ARCHIVED') acc.archived += 1;
    return acc;
  }, {review: 0, failed: 0, queued: 0, paused: 0, completed: 0, archived: 0});
}

function filterButton(value, text, count) {
  return `<button class="filter-chip" type="button" data-project-filter="${escapeHtml(value)}" aria-pressed="false">${escapeHtml(`${text} ${count}`)}</button>`;
}

function overviewDetails(row) {
  const failed = Number(row.failed_job_count || 0);
  return `
    <details class="project-overview">
      <summary>查看概览与运行细节</summary>
      <dl>
        <dt>队列</dt><dd>${escapeHtml(queueSummary(row))}</dd>
        <dt>待审</dt><dd>${hasReview(row) ? `第 ${escapeHtml(row.need_review_chapter_no || '')} 章 ${escapeHtml(stripChapterTitlePrefix(row.need_review_chapter_title || ''))}` : '暂无待审章节'}</dd>
        <dt>异常</dt><dd>${failed > 0 ? `<span class="error">失败任务 ${escapeHtml(failed)}</span>` : '暂无失败任务'}</dd>
        <dt>最近任务</dt><dd>${latestJobHtml(row)}</dd>
        <dt>最近调用</dt><dd>${latestCallHtml(row)}</dd>
        <dt>更新时间</dt><dd>${escapeHtml(formatLocalTime(row.updated_at || row.created_at))}</dd>
      </dl>
    </details>`;
}

const rows = $input.all()
  .map((item) => item.json || {})
  .filter((row) => !row.is_empty);

const counts = todoCounts(rows);
const filters = `
  ${filterButton('all', '全部', rows.length)}
  ${filterButton('review', '待审核', counts.review)}
  ${filterButton('issue', '有异常', counts.failed)}
  ${filterButton('queued', '队列中', counts.queued)}
  ${filterButton('paused', '已暂停', counts.paused)}
  ${filterButton('completed', '已完结', counts.completed)}
  ${filterButton('archived', '已归档', counts.archived)}
`;

const projectRows = rows.length
  ? rows.map((row) => `
      <tr id="project-${escapeHtml(row.id)}" class="project-item" data-page-key="${escapeHtml(row.id || row.title || 'project')}" data-filter-values="${escapeHtml(projectFilterValues(row))}">
        <td>
          <strong>${escapeHtml(row.title || '未命名项目')}</strong>
          <span>${escapeHtml(row.genre || '未设置类型')} / ${escapeHtml(row.audience || '未设置读者')}</span>
          <span class="inline-meta">进度 ${escapeHtml(projectProgress(row))} / ${escapeHtml(queueSummary(row))}</span>
        </td>
        <td>${liveProjectBadge(row)}</td>
        <td>${nextActionHtml(row)}</td>
        <td>${projectActions(row)}</td>
        <td>${overviewDetails(row)}</td>
      </tr>`).join('')
  : '<tr><td colspan="5" class="empty">暂无小说项目</td></tr>';

const projectCards = rows.length
  ? rows.map((row) => `
      <article id="project-card-${escapeHtml(row.id)}" class="project-card project-item" data-page-key="${escapeHtml(row.id || row.title || 'project')}" data-filter-values="${escapeHtml(projectFilterValues(row))}">
        <div class="card-head">
          <div>
            <strong>${escapeHtml(row.title || '未命名项目')}</strong>
            <span>${escapeHtml(row.genre || '未设置类型')} / ${escapeHtml(row.audience || '未设置读者')}</span>
          </div>
          ${liveProjectBadge(row)}
        </div>
        <dl class="compact-dl">
          <dt>进度</dt><dd>${escapeHtml(projectProgress(row))}，已批准 ${escapeHtml(row.approved_chapter_count || 0)} 章</dd>
          <dt>队列</dt><dd>${escapeHtml(queueSummary(row))}</dd>
          <dt>下一步</dt><dd>${nextActionHtml(row)}</dd>
        </dl>
        ${projectActions(row)}
        ${overviewDetails(row)}
      </article>`).join('')
  : '<article class="project-card empty">暂无小说项目</article>';

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>小说项目列表</title>
  <style>
    :root { color-scheme: light; --bg:#f6f7f9; --panel:#fff; --ink:#182230; --muted:#667085; --line:#d8dee8; --accent:#1f7a5c; --accent-soft:#edf8f3; --warn:#a76508; --warn-soft:#fff7e8; --danger:#b42318; --danger-soft:#fff0ee; }
    * { box-sizing: border-box; }
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
    a { color: var(--accent); text-decoration: none; font-weight: 650; }
    nav { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    nav a { white-space: nowrap; }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 18px; overflow: hidden; }
    .next-step { min-width: 150px; display: grid; gap: 2px; border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; background: #fff; color: var(--ink); text-decoration: none; }
    .next-step strong { color: var(--ink); }
    .next-step span { display: block; margin-top: 0; color: var(--muted); font-size: 12px; line-height: 1.4; }
    .next-step.warn { border-color: #f0c36a; background: var(--warn-soft); }
    .next-step.bad { border-color: #f3b4ae; background: var(--danger-soft); }
    .next-step.good { border-color: #b9e3d4; background: var(--accent-soft); }
    .next-step.queued { border-color: #c7d7ee; background: #f3f7fc; }
    .filters { padding: 14px 16px; }
    .filter-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .filter-chip { border: 1px solid var(--line); border-radius: 999px; background: #fff; color: var(--ink); padding: 8px 12px; font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
    .filter-chip:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .filter-chip[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .pager { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 12px 16px; margin-bottom: 18px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .pager-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .pager button, .pager select { min-height: 36px; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--ink); padding: 0 10px; font: inherit; font-weight: 650; }
    .pager button:not(:disabled) { color: var(--accent); cursor: pointer; }
    .pager button:not(:disabled):hover { border-color: var(--accent); background: var(--accent-soft); }
    .pager button:disabled { color: var(--muted); cursor: not-allowed; }
    .pager-status { color: var(--muted); font-size: 13px; }
    .table-wrap { overflow: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 860px; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-size: 13px; font-weight: 600; white-space: nowrap; }
    .th-with-help { display: inline-flex; align-items: center; gap: 6px; }
    .th-help { position: relative; width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 50%; background: #fff; color: var(--accent); font-size: 12px; font-weight: 850; line-height: 1; cursor: help; }
    .th-help:focus-visible { outline: 3px solid #8fd4bd; outline-offset: 2px; }
    .th-help::after { content: attr(data-tooltip); position: absolute; left: 50%; top: calc(100% + 8px); width: 280px; max-width: min(280px, calc(100vw - 48px)); transform: translateX(-50%) translateY(4px); border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; background: #182230; color: #fff; box-shadow: 0 8px 24px rgba(24, 34, 48, .18); font-size: 12px; font-weight: 650; line-height: 1.5; white-space: normal; opacity: 0; pointer-events: none; transition: opacity .15s ease, transform .15s ease; z-index: 20; }
    .th-help::before { content: ""; position: absolute; left: 50%; top: calc(100% + 3px); width: 8px; height: 8px; transform: translateX(-50%) rotate(45deg); background: #182230; opacity: 0; pointer-events: none; transition: opacity .15s ease; z-index: 21; }
    .th-help:hover::after, .th-help:focus-visible::after { opacity: 1; transform: translateX(-50%) translateY(0); }
    .th-help:hover::before, .th-help:focus-visible::before { opacity: 1; }
    td span { display: block; color: var(--muted); margin-top: 3px; font-size: 13px; }
    .inline-meta { line-height: 1.45; }
    tr:target { outline: 2px solid var(--accent); outline-offset: -2px; background: var(--accent-soft); }
    tr:last-child td { border-bottom: 0; }
    .mobile-cards { display: none; }
    .project-card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin-bottom: 12px; content-visibility: auto; contain-intrinsic-size: 260px; }
    .project-card:target { outline: 2px solid var(--accent); }
    .card-head { display: flex; justify-content: space-between; gap: 12px; align-items: start; margin-bottom: 12px; }
    .card-head span { display: block; color: var(--muted); margin-top: 4px; font-size: 13px; }
    .compact-dl, .project-overview dl { display: grid; grid-template-columns: 82px 1fr; gap: 8px 10px; margin: 0; }
    .compact-dl { margin-bottom: 12px; }
    dt { color: var(--muted); }
    dd { margin: 0; min-width: 0; }
    dd span { display: block; color: var(--muted); margin-top: 3px; font-size: 13px; }
    .row-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .row-actions a, .disabled-action { min-height: 34px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 10px; background: #fff; color: var(--accent); text-decoration: none; font-weight: 650; touch-action: manipulation; }
    .row-actions a:hover { border-color: var(--accent); background: var(--accent-soft); }
    .disabled-action { color: var(--muted); border-color: var(--line); }
    .project-overview { margin-top: 10px; }
    .project-overview summary { color: var(--accent); cursor: pointer; font-weight: 650; }
    .project-overview dl { margin-top: 10px; }
    .badge { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 650; white-space: nowrap; }
    .badge.good { color: var(--accent); background: var(--accent-soft); }
    .badge.warn { color: var(--warn); background: var(--warn-soft); }
    .badge.bad { color: var(--danger); background: var(--danger-soft); }
    .badge.muted { color: var(--muted); background: #f6f7f9; }
    .error { color: var(--danger); }
    .empty { text-align: center; color: var(--muted); padding: 28px; }
    .filter-empty { margin: 0 0 18px; }
    [hidden] { display: none !important; }
    a:focus-visible, button:focus-visible, summary:focus-visible { outline: 3px solid #8fd4bd; outline-offset: 2px; }
    @media (max-width: 1024px) {
      main, .app-shell > main { width: min(100% - 24px, 1240px); margin: 16px auto 48px; }
      .app-shell { display: block; }
      .app-sidebar { position: static; height: auto; padding: 12px; border-right: 0; border-bottom: 1px solid var(--line); }
      .brand { display: none; }
      .side-nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
      .side-nav a, .side-nav span { white-space: nowrap; }
      .side-primary { display: none; }
      header { display: block; }
      nav { margin-top: 12px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
      .pager { display: grid; grid-template-columns: 1fr; }
      .desktop-table { display: none; }
      .mobile-cards { display: block; background: transparent; border: 0; overflow: visible; }
      .compact-dl, .project-overview dl { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="app-shell">
  ${renderSidebar('项目列表')}
  <main>
    <div class="page-context">
    <header>
      <div>
        <p class="ops-kicker">项目管理</p>
        <h1>小说项目管理</h1>
        <p class="muted">按下一步动作扫描项目：先看待审核和失败，再看队列与可继续写作。</p>
      </div>
    </header>
    </div>

    <section class="filters" aria-label="项目筛选">
      <div class="filter-bar">
        <strong>筛选</strong>
        ${filters}
      </div>
    </section>

    <nav class="pager" data-pagination="projects" aria-label="项目分页">
      <span class="pager-status" data-page-status>分页载入中</span>
      <div class="pager-controls">
        <button type="button" data-page-prev>上一页</button>
        <button type="button" data-page-next>下一页</button>
        <label>每页
          <select data-page-size>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
        </label>
      </div>
    </nav>

    <section class="desktop-table" aria-label="项目桌面列表">
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>项目</th>
              <th>状态</th>
              <th>下一步</th>
              <th><span class="th-with-help">操作<span class="th-help" tabindex="0" role="img" aria-label="${escapeHtml(projectActionHelpText)}" data-tooltip="${escapeHtml(projectActionHelpText)}">?</span></span></th>
              <th>更多</th>
            </tr>
          </thead>
          <tbody>${projectRows}</tbody>
        </table>
      </div>
    </section>

    <section class="mobile-cards" aria-label="项目卡片">
      <h2>项目卡片</h2>
      ${projectCards}
    </section>

    <p class="empty filter-empty" data-filter-empty hidden>当前筛选下暂无项目</p>
  </main>
  </div>
  <script>
    (() => {
      const buttons = Array.from(document.querySelectorAll('[data-project-filter]'));
      const items = Array.from(document.querySelectorAll('.project-item'));
      const empty = document.querySelector('[data-filter-empty]');
      const pager = document.querySelector('[data-pagination="projects"]');
      const prev = pager ? pager.querySelector('[data-page-prev]') : null;
      const next = pager ? pager.querySelector('[data-page-next]') : null;
      const status = pager ? pager.querySelector('[data-page-status]') : null;
      const sizeSelect = pager ? pager.querySelector('[data-page-size]') : null;
      const allowedFilters = new Set(['all', 'review', 'issue', 'queued', 'paused', 'completed', 'archived']);
      const allowedSizes = new Set(['10', '20', '50']);
      const groups = Array.from(items.reduce((map, item) => {
        const key = item.dataset.pageKey || item.id || String(map.size);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
        return map;
      }, new Map()).entries()).map(([key, groupItems]) => ({key, items: groupItems}));
      let currentPage = 1;
      let pageSize = 10;
      const readFilter = () => {
        const value = new URLSearchParams(window.location.search).get('filter') || 'all';
        return allowedFilters.has(value) ? value : 'all';
      };
      const readPageState = () => {
        const params = new URLSearchParams(window.location.search);
        const requestedSize = params.get('page_size') || '10';
        pageSize = allowedSizes.has(requestedSize) ? Number(requestedSize) : 10;
        currentPage = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
        if (sizeSelect) sizeSelect.value = String(pageSize);
      };
      const writeState = (value) => {
        const params = new URLSearchParams(window.location.search);
        if (value === 'all') {
          params.delete('filter');
        } else {
          params.set('filter', value);
        }
        if (currentPage > 1) params.set('page', String(currentPage));
        else params.delete('page');
        if (pageSize !== 10) params.set('page_size', String(pageSize));
        else params.delete('page_size');
        const query = params.toString();
        window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + (window.location.hash || ''));
      };
      const applyFilter = (value, options = {}) => {
        const activeValue = allowedFilters.has(value) ? value : 'all';
        const filtered = groups.filter((group) => group.items.some((item) => {
          const values = String(item.dataset.filterValues || 'all').split(/\\s+/);
          return activeValue === 'all' || values.includes(activeValue);
        }));
        const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        currentPage = Math.min(Math.max(1, currentPage), totalPages);
        const start = (currentPage - 1) * pageSize;
        const visibleKeys = new Set(filtered.slice(start, start + pageSize).map((group) => group.key));
        groups.forEach((group) => {
          const show = visibleKeys.has(group.key);
          group.items.forEach((item) => { item.hidden = !show; });
        });
        buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.projectFilter === activeValue)));
        if (empty) empty.hidden = filtered.length > 0;
        if (pager) pager.hidden = filtered.length === 0;
        if (status) status.textContent = '共 ' + filtered.length + ' 个项目 / 第 ' + currentPage + ' 页，共 ' + totalPages + ' 页';
        if (prev) prev.disabled = currentPage <= 1;
        if (next) next.disabled = currentPage >= totalPages;
        if (options.write !== false) writeState(activeValue);
      };
      buttons.forEach((button) => {
        button.addEventListener('click', () => {
          currentPage = 1;
          applyFilter(button.dataset.projectFilter || 'all');
        });
      });
      if (prev) prev.addEventListener('click', () => {
        currentPage -= 1;
        applyFilter(readFilter());
      });
      if (next) next.addEventListener('click', () => {
        currentPage += 1;
        applyFilter(readFilter());
      });
      if (sizeSelect) sizeSelect.addEventListener('change', () => {
        pageSize = Number(sizeSelect.value) || 10;
        currentPage = 1;
        applyFilter(readFilter());
      });
      readPageState();
      applyFilter(readFilter(), {write: false});
      window.addEventListener('popstate', () => {
        readPageState();
        applyFilter(readFilter(), {write: false});
      });
    })();
  </script>
</body>
</html>`;

return [{json: {response_html: html}}];
