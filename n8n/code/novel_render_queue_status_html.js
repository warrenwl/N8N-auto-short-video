// n8n Code node: Render Novel Queue Status HTML
// Read-only queue page. It must not expose mutating forms or action links.

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

const jobTypeLabel = {
  GENERATE_STORY_TREATMENT: '生成创作母本',
  GENERATE_BIBLE: '生成设定集',
  GENERATE_BIBLE_PATCH: '生成扩写设定补丁',
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
  GENERATE_STORY_TREATMENT: '生成创作母本',
  GENERATE_BIBLE: '生成设定集',
  GENERATE_BIBLE_PATCH: '生成扩写设定补丁',
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

function statusBadge(status) {
  const raw = String(status || '');
  const klass = raw === 'FAILED'
    ? 'bad'
    : raw === 'RUNNING'
      ? 'warn'
      : raw === 'SUCCEEDED'
        ? 'good'
        : 'muted';
  return `<span class="badge ${klass}">${escapeHtml(label(jobStatusLabel, raw, '未知状态'))}</span>`;
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

function breadcrumb(items) {
  return `<nav class="breadcrumbs" aria-label="面包屑">${items.map((item, index) => {
    const labelText = escapeHtml(item.label);
    const node = item.href
      ? `<a href="${escapeHtml(item.href)}">${labelText}</a>`
      : `<span>${labelText}</span>`;
    return `${index > 0 ? '<span class="crumb-separator">/</span>' : ''}${node}`;
  }).join('')}</nav>`;
}

const allRows = $input.all().map((item) => item.json || {});
const statsRow = allRows[0] || {};
const rows = allRows.filter((row) => !row.is_empty && row.job_id);
const attentionRows = rows.filter((row) => ['PENDING', 'RUNNING', 'FAILED'].includes(String(row.status || '')));
const completedRows = rows.filter((row) => !['PENDING', 'RUNNING', 'FAILED'].includes(String(row.status || ''))).slice(0, 20);

function metric(labelText, value, detail) {
  return `<div class="metric"><span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value ?? 0)}</strong>${detail ? `<em>${escapeHtml(detail)}</em>` : ''}</div>`;
}

const metrics = `
  ${metric('任务总数', statsRow.queue_total_count || 0)}
  ${metric('待处理', statsRow.queue_waiting_count || 0, '待处理表示等待调度执行')}
  ${metric('运行中', statsRow.queue_running_count || 0, '运行中表示正在执行')}
  ${metric('已失败', statsRow.queue_failed_count || 0, '失败表示需要查看恢复或日志')}
  ${metric('今日成功', statsRow.queue_succeeded_today_count || 0)}
`;

function rowChapter(row) {
  return row.chapter_no
    ? `第 ${escapeHtml(row.chapter_no)} 章 ${escapeHtml(stripChapterTitlePrefix(row.chapter_title || ''))}`
    : '项目级任务';
}

function latestCall(row) {
  if (!row.latest_ai_run_type) return '暂无调用记录';
  return `${escapeHtml(label(runTypeLabel, row.latest_ai_run_type, '未知调用'))} / ${escapeHtml(successLabel(row.latest_ai_success))} / ${escapeHtml(formatDuration(row.latest_ai_duration_ms))}`;
}

function queueFilterValues(row, group) {
  const values = ['all'];
  if (group === 'attention' || ['PENDING', 'RUNNING', 'FAILED'].includes(String(row.status || ''))) values.push('attention');
  if (group === 'completed' || !['PENDING', 'RUNNING', 'FAILED'].includes(String(row.status || ''))) values.push('completed');
  if (row.status === 'FAILED') values.push('failed');
  if (row.status === 'RUNNING') values.push('running');
  if (row.status === 'PENDING') values.push('pending');
  return values.join(' ');
}

function queuePageKey(row, group) {
  return row.job_id || `${group}-${row.project_id || 'project'}-${row.job_type || 'job'}-${row.chapter_no || 'project'}-${row.updated_at || row.created_at || ''}`;
}

function nextAction(row) {
  const error = localizeError(row.error_message || row.latest_ai_error_message);
  const projectHref = row.project_id
    ? `/webhook/novel-project-detail?project_id=${encodeURIComponent(row.project_id)}&view=ops#ops-section`
    : '/webhook/novel-project-list';
  if (row.project_id && row.status === 'PENDING' && row.job_type === 'GENERATE_CHAPTER') {
    return `<div class="next-stack"><a class="queue-action-link" href="/webhook/novel-project-detail?project_id=${encodeURIComponent(row.project_id)}">去项目页启动章节生成</a>${error ? `<small>上次运行已自动恢复，可重试</small>` : ''}</div>`;
  }
  if (row.project_id && row.status === 'PENDING' && row.job_type === 'PLAN_CHAPTER_DIRECTOR') {
    return `<div class="next-stack"><a class="queue-action-link" href="/webhook/novel-project-detail?project_id=${encodeURIComponent(row.project_id)}&view=director">去项目页启动导演台</a>${error ? `<small>上次运行已自动恢复，可重试</small>` : ''}</div>`;
  }
  if (row.project_id && row.status === 'PENDING') {
    return `<div class="next-stack"><a class="queue-action-link" href="/webhook/novel-project-detail?project_id=${encodeURIComponent(row.project_id)}">去项目页处理</a>${error ? `<small>上次运行已自动恢复，可重试</small>` : ''}</div>`;
  }
  if (error) {
    return `<details class="error-details"><summary>查看错误详情</summary><p class="error">${escapeHtml(error)}</p><div class="error-actions"><a href="${escapeHtml(projectHref)}">查看项目上下文</a><button type="button" data-copy-text="${escapeHtml(error)}">复制错误</button></div></details>`;
  }
  if (row.status === 'RUNNING') {
    return '<span class="next-note warn">观察中，稍后刷新</span>';
  }
  if (row.status === 'SUCCEEDED' && row.job_type === 'REVIEW_CHAPTER') {
    return '<a class="queue-action-link" href="/webhook/novel-review-list">去审核中心处理</a>';
  }
  if (row.project_id) {
    return `<a class="queue-action-link subtle" href="/webhook/novel-project-detail?project_id=${encodeURIComponent(row.project_id)}">返回项目</a>`;
  }
  return '<span class="next-note">无需处理</span>';
}

function jobTableRows(items, emptyText, group) {
  if (!items.length) return `<tr><td colspan="7" class="empty">${escapeHtml(emptyText)}</td></tr>`;
  return items.map((row) => `
      <tr class="queue-item" data-page-key="${escapeHtml(queuePageKey(row, group))}" data-queue-values="${escapeHtml(queueFilterValues(row, group))}" data-project-id="${escapeHtml(row.project_id || '')}">
        <td>
          <strong>${escapeHtml(row.project_title || '未命名项目')}</strong>
          <span>${rowChapter(row)}</span>
        </td>
        <td>${escapeHtml(label(jobTypeLabel, row.job_type, '未知任务'))}</td>
        <td>${statusBadge(row.status)}</td>
        <td>${nextAction(row)}</td>
        <td>${escapeHtml(formatLocalTime(row.updated_at || row.created_at))}</td>
        <td>${escapeHtml(row.attempt_count ?? 0)} / ${escapeHtml(row.max_attempts ?? 0)}</td>
        <td>
          <strong>最近调用</strong>
          <span>${latestCall(row)}</span>
        </td>
      </tr>`).join('');
}

function taskCards(items, emptyText, group) {
  if (!items.length) return `<article class="task-card empty">${escapeHtml(emptyText)}</article>`;
  return items.map((row) => `
      <article class="task-card queue-item" data-page-key="${escapeHtml(queuePageKey(row, group))}" data-queue-values="${escapeHtml(queueFilterValues(row, group))}" data-project-id="${escapeHtml(row.project_id || '')}">
        <div class="card-head">
          <div>
            <strong>${escapeHtml(row.project_title || '未命名项目')}</strong>
            <span>${rowChapter(row)}</span>
          </div>
          ${statusBadge(row.status)}
        </div>
        <dl>
          <dt>任务类型</dt><dd>${escapeHtml(label(jobTypeLabel, row.job_type, '未知任务'))}</dd>
          <dt>下一步</dt><dd>${nextAction(row)}</dd>
          <dt>更新时间</dt><dd>${escapeHtml(formatLocalTime(row.updated_at || row.created_at))}</dd>
          <dt>尝试次数</dt><dd>${escapeHtml(row.attempt_count ?? 0)} / ${escapeHtml(row.max_attempts ?? 0)}</dd>
          <dt>最近调用</dt><dd>${latestCall(row)}</dd>
        </dl>
      </article>`).join('');
}

function filterButton(value, text, count) {
  return `<button class="queue-filter" type="button" data-queue-filter="${escapeHtml(value)}" aria-pressed="false"><span>${escapeHtml(text)}</span><strong>${escapeHtml(count ?? 0)}</strong></button>`;
}

const failedCount = attentionRows.filter((row) => row.status === 'FAILED').length;
const runningCount = attentionRows.filter((row) => row.status === 'RUNNING').length;
const pendingCount = attentionRows.filter((row) => row.status === 'PENDING').length;
const visibleQueueRows = [...attentionRows, ...completedRows];

function healthCard(title, value, detail, tone = '') {
  return `<article class="health-card ${escapeHtml(tone)}"><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong><p>${escapeHtml(detail)}</p></article>`;
}

const filterBar = `
  ${filterButton('attention', '需要关注', attentionRows.length)}
  ${filterButton('pending', '待处理', pendingCount)}
  ${filterButton('running', '运行中', runningCount)}
  ${filterButton('failed', '失败', failedCount)}
  ${filterButton('completed', '最近完成', completedRows.length)}
`;

const queueHealth = `
  ${healthCard('系统健康', failedCount ? '需要关注' : (runningCount ? '运行中' : '稳定'), failedCount ? `${failedCount} 个失败任务需要查看项目运行视图。` : (runningCount ? `${runningCount} 个任务正在执行。` : '当前没有失败任务。'), failedCount ? 'bad' : (runningCount ? 'warn' : 'good'))}
  ${healthCard('运行中', runningCount, '正在执行的任务只观察，不重复触发。', runningCount ? 'warn' : '')}
  ${healthCard('待处理', pendingCount, '章节生成可从项目页启动；审稿提醒和重写等待后台队列调度。', pendingCount ? 'warn' : '')}
  ${healthCard('恢复入口', failedCount ? '打开运行日志' : '无需恢复', failedCount ? '失败行里可直接进入项目运行视图。' : '没有需要恢复的失败任务。', failedCount ? 'bad' : 'good')}
`;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>小说队列状态</title>
  <style>
    :root { color-scheme: light; --bg:#f6f7f9; --panel:#fff; --ink:#182230; --muted:#667085; --line:#d8dee8; --accent:#1f7a5c; --accent-soft:#edf8f3; --warn:#a76508; --danger:#b42318; --danger-soft:#fff0ee; }
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
    .breadcrumbs { gap: 8px; margin: 0 0 12px; color: var(--muted); font-size: 13px; }
    .breadcrumbs a { color: var(--muted); }
    .breadcrumbs a:hover { color: var(--accent); }
    .crumb-separator { color: #98a2b3; }
    .queue-workbench { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; margin-bottom: 18px; }
    .queue-toolbar { display: grid; grid-template-columns: minmax(180px, .7fr) minmax(420px, 1.5fr) minmax(340px, .9fr); gap: 14px; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--line); background: #fff; }
    .toolbar-copy { display: grid; gap: 4px; }
    .toolbar-copy strong { font-size: 16px; }
    .toolbar-copy span { color: var(--muted); font-size: 13px; line-height: 1.45; }
    .metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin: 14px 0; }
    .metric, section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
    .metric { padding: 14px; }
    .metric span { display: block; color: var(--muted); font-size: 13px; }
    .metric strong { display: block; margin-top: 6px; font-size: 24px; font-variant-numeric: tabular-nums; }
    .metric em { display: block; margin-top: 5px; color: var(--muted); font-style: normal; font-size: 12px; line-height: 1.45; }
    .legend { padding: 14px 16px; margin-bottom: 0; background: var(--accent-soft); border-color: #b9e3d4; }
    .legend p { margin: 0; color: #225447; line-height: 1.7; }
    .health-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding: 0 16px 16px; }
    .health-card { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fff; }
    .health-card span { display: block; color: var(--muted); font-size: 13px; }
    .health-card strong { display: block; margin-top: 6px; font-size: 20px; }
    .health-card p { margin: 8px 0 0; color: #3d4b5c; line-height: 1.5; }
    .health-card.good { border-color: #b9e3d4; background: var(--accent-soft); }
    .health-card.warn { border-color: #f0c36a; background: #fff7e8; }
    .health-card.bad { border-color: #f3b4ae; background: var(--danger-soft); }
    .project-filter-note { padding: 12px 16px; margin: 0; background: var(--accent-soft); border: 0; border-bottom: 1px solid #b9e3d4; color: #225447; }
    .project-filter-note a { margin-left: 8px; }
    .filter-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .queue-filter { min-height: 42px; display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--ink); padding: 0 11px; font: inherit; font-weight: 750; cursor: pointer; touch-action: manipulation; }
    .queue-filter strong { min-width: 24px; min-height: 24px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; padding: 0 7px; background: #f2f4f7; color: #344054; font-size: 12px; font-variant-numeric: tabular-nums; }
    .queue-filter:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .queue-filter[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .queue-filter[aria-pressed="true"] strong { background: var(--accent); color: #fff; }
    .pager { display: flex; justify-content: flex-end; gap: 12px; align-items: center; padding: 0; margin: 0; border: 0; border-radius: 0; background: transparent; }
    .pager-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .pager button, .pager select { min-height: 36px; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--ink); padding: 0 10px; font: inherit; font-weight: 650; }
    .pager button:not(:disabled) { color: var(--accent); cursor: pointer; }
    .pager button:not(:disabled):hover { border-color: var(--accent); background: var(--accent-soft); }
    .pager button:disabled { color: var(--muted); cursor: not-allowed; }
    .pager-status { color: var(--muted); font-size: 13px; white-space: nowrap; }
    section { margin-bottom: 18px; overflow: hidden; }
    section h2 { padding: 16px 16px 0; }
    .queue-list { margin: 0; border: 0; border-radius: 0; }
    .queue-list h2 { padding: 0; margin: 0; }
    .list-head { display: flex; justify-content: space-between; gap: 16px; align-items: end; padding: 14px 16px; border-bottom: 1px solid var(--line); background: #fbfcfd; }
    .list-head [data-filter-summary] { color: var(--muted); font-size: 13px; white-space: nowrap; }
    .table-wrap { overflow: auto; }
    table { width: 100%; border-collapse: collapse; min-width: 1040px; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-size: 13px; font-weight: 600; white-space: nowrap; }
    td span { display: block; color: var(--muted); margin-top: 3px; font-size: 13px; }
    tr:last-child td { border-bottom: 0; }
    .mobile-cards { display: none; padding: 0 12px 12px; }
    .task-card { border: 1px solid var(--line); border-radius: 8px; padding: 14px; margin-top: 12px; background: var(--panel); content-visibility: auto; contain-intrinsic-size: 260px; }
    .card-head { display: flex; justify-content: space-between; gap: 12px; align-items: start; margin-bottom: 12px; }
    .card-head span { display: block; color: var(--muted); margin-top: 4px; font-size: 13px; }
    .task-card dl { display: grid; grid-template-columns: 82px 1fr; gap: 8px 10px; margin: 0; }
    .task-card dt { color: var(--muted); }
    .task-card dd { margin: 0; min-width: 0; }
    .badge { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 650; white-space: nowrap; }
    .badge.good { color: var(--accent); background: var(--accent-soft); }
    .badge.warn { color: var(--warn); background: #fff7e8; }
    .badge.bad { color: var(--danger); background: var(--danger-soft); }
    .badge.muted { color: var(--muted); background: #f6f7f9; }
    .error { color: var(--danger); }
    .error-details summary { cursor: pointer; color: var(--danger); font-weight: 650; }
    .error-details p { margin: 8px 0 0; line-height: 1.5; }
    .error-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .error-actions a, .error-actions button { min-height: 32px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 10px; background: #fff; color: var(--accent); text-decoration: none; font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
    .error-actions a:hover, .error-actions button:hover { border-color: var(--accent); background: var(--accent-soft); }
    .queue-action-link { min-height: 32px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 10px; background: var(--accent-soft); color: var(--accent); font-weight: 750; }
    .queue-action-link:hover { border-color: var(--accent); background: #fff; }
    .queue-action-link.subtle { border-color: var(--line); background: #fff; }
    .next-stack { display: grid; gap: 5px; justify-items: start; }
    .next-stack small { color: var(--muted); line-height: 1.35; }
    .next-note { min-height: 32px; display: inline-flex; align-items: center; border-radius: 8px; padding: 0 10px; background: #f6f7f9; color: var(--muted); font-weight: 750; }
    .next-note.warn { background: #fff7e8; color: var(--warn); }
    .empty { text-align: center; color: var(--muted); padding: 28px; }
    .filter-empty { margin: 0; border-radius: 0; }
    .ops-overview { margin-bottom: 18px; }
    .ops-overview > summary { min-height: 44px; display: flex; align-items: center; padding: 0 16px; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--accent); font-weight: 800; cursor: pointer; }
    .ops-overview[open] > summary { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
    .ops-overview[open] { padding: 0 16px 16px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .ops-overview[open] > summary { margin: 0 -16px 14px; border: 0; border-bottom: 1px solid var(--line); }
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
      .metrics, .health-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .queue-toolbar { grid-template-columns: 1fr; align-items: stretch; }
      .pager { display: grid; grid-template-columns: 1fr; margin-top: 0; overflow: visible; padding-bottom: 0; }
      .pager-controls { justify-content: space-between; }
      .filter-row { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 2px; -webkit-overflow-scrolling: touch; }
      .queue-filter { white-space: nowrap; }
      .list-head { display: block; }
      .list-head [data-filter-summary] { display: block; margin-top: 6px; white-space: normal; }
      .desktop-table { display: none; }
      .mobile-cards { display: block; }
      .task-card dl { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .metrics, .health-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="app-shell">
  ${renderSidebar('队列状态')}
  <main>
    <div class="page-context">
    ${breadcrumb([
      {label: '工作台', href: '/webhook/novel-center'},
      {label: '队列状态'},
    ])}
    <header>
      <div>
        <p class="ops-kicker">队列运营</p>
        <h1>小说队列状态</h1>
        <p class="muted">只读页面。先筛选任务，再从对应列表回到项目、审核或运行日志处理。</p>
      </div>
    </header>
    </div>
    <details class="ops-overview">
      <summary>展开运行概览</summary>
      <div class="metrics">${metrics}</div>
      <section aria-label="系统健康">
        <h2>系统健康：哪里需要处理</h2>
        <div class="health-grid">${queueHealth}</div>
      </section>
      <section class="legend" aria-label="状态解释">
        <p>待处理表示等待调度执行；运行中表示正在执行；失败表示需要查看恢复或日志。最近任务、最近调用、失败任务和需要处理的项目都在下方列表里按筛选展示。</p>
      </section>
    </details>

    <section class="queue-workbench" aria-label="队列筛选与列表">
      <div class="queue-toolbar">
        <div class="toolbar-copy">
          <strong>只读筛选</strong>
          <span>先选状态，再处理对应列表；页面不提交任何写操作。</span>
        </div>
        <div class="filter-row">
          ${filterBar}
        </div>
        <nav class="pager" data-pagination="queue" aria-label="队列分页">
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
      </div>

      <div class="project-filter-note" data-project-filter-note hidden>
        <span>项目筛选已开启，只显示从项目列表跳转过来的项目任务。</span>
        <a data-project-detail-link hidden>返回项目</a>
        <a href="/webhook/novel-queue-status">清除项目筛选</a>
      </div>

      <section class="queue-list" data-queue-section>
        <div class="list-head">
          <div>
            <p class="ops-kicker">筛选结果</p>
            <h2>对应任务列表</h2>
          </div>
          <span data-filter-summary>按当前筛选展示</span>
        </div>
        <div class="table-wrap desktop-table">
          <table>
            <thead>
              <tr>
                <th>项目 / 章节</th>
                <th>任务</th>
                <th>状态</th>
                <th>下一步</th>
                <th>更新时间</th>
                <th>尝试</th>
                <th>最近调用</th>
              </tr>
            </thead>
            <tbody>${jobTableRows(visibleQueueRows, '暂无队列任务', 'queue')}</tbody>
          </table>
        </div>
        <div class="mobile-cards" aria-label="任务卡片">
          <h2>任务卡片</h2>
          ${taskCards(visibleQueueRows, '暂无队列任务', 'queue')}
        </div>
      </section>

      <p class="empty filter-empty" data-queue-empty hidden>当前筛选下暂无任务</p>
    </section>
  </main>
  </div>
  <script>
    (() => {
      const allowedFilters = new Set(['attention', 'failed', 'running', 'pending', 'completed', 'all']);
      const readParams = () => new URLSearchParams(window.location.search);
      const projectId = readParams().get('project_id') || '';
      const buttons = Array.from(document.querySelectorAll('[data-queue-filter]'));
      const items = Array.from(document.querySelectorAll('.queue-item'));
      const sections = Array.from(document.querySelectorAll('[data-queue-section]'));
      const empty = document.querySelector('[data-queue-empty]');
      const pager = document.querySelector('[data-pagination="queue"]');
      const prev = pager ? pager.querySelector('[data-page-prev]') : null;
      const next = pager ? pager.querySelector('[data-page-next]') : null;
      const status = pager ? pager.querySelector('[data-page-status]') : null;
      const sizeSelect = pager ? pager.querySelector('[data-page-size]') : null;
      const filterSummary = document.querySelector('[data-filter-summary]');
      const projectNote = document.querySelector('[data-project-filter-note]');
      const projectDetailLink = document.querySelector('[data-project-detail-link]');
      const allowedSizes = new Set(['10', '20', '50']);
      const filterNames = {
        attention: '需要关注',
        failed: '失败',
        running: '运行中',
        pending: '待处理',
        completed: '最近完成',
        all: '全部',
      };
      const groups = Array.from(items.reduce((map, item) => {
        const key = item.dataset.pageKey || item.id || String(map.size);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(item);
        return map;
      }, new Map()).entries()).map(([key, groupItems]) => ({key, items: groupItems}));
      let currentPage = 1;
      let pageSize = 10;
      const readFilter = () => {
        const value = readParams().get('filter') || 'attention';
        return allowedFilters.has(value) ? value : 'attention';
      };
      const readPageState = () => {
        const params = readParams();
        const requestedSize = params.get('page_size') || '10';
        pageSize = allowedSizes.has(requestedSize) ? Number(requestedSize) : 10;
        currentPage = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
        if (sizeSelect) sizeSelect.value = String(pageSize);
      };
      const writeState = (value) => {
        const params = readParams();
        if (value === 'attention') {
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
        const activeValue = allowedFilters.has(value) ? value : 'attention';
        const filtered = groups.filter((group) => group.items.some((item) => {
          const values = String(item.dataset.queueValues || 'all').split(/\\s+/);
          const matchesQueue = activeValue === 'all' || values.includes(activeValue);
          const matchesProject = !projectId || item.dataset.projectId === projectId;
          return matchesQueue && matchesProject;
        }));
        const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        currentPage = Math.min(Math.max(1, currentPage), totalPages);
        const start = (currentPage - 1) * pageSize;
        const visibleKeys = new Set(filtered.slice(start, start + pageSize).map((group) => group.key));
        groups.forEach((group) => {
          const show = visibleKeys.has(group.key);
          group.items.forEach((item) => { item.hidden = !show; });
        });
        sections.forEach((section) => {
          const hasVisible = Array.from(section.querySelectorAll('.queue-item')).some((item) => !item.hidden);
          section.hidden = !hasVisible;
        });
        buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.queueFilter === activeValue)));
        if (empty) empty.hidden = filtered.length > 0;
        if (pager) pager.hidden = filtered.length === 0;
        if (status) status.textContent = '共 ' + filtered.length + ' 个任务 / 第 ' + currentPage + ' 页，共 ' + totalPages + ' 页';
        if (filterSummary) filterSummary.textContent = '当前筛选：' + (filterNames[activeValue] || '需要关注') + '，共 ' + filtered.length + ' 个任务';
        if (prev) prev.disabled = currentPage <= 1;
        if (next) next.disabled = currentPage >= totalPages;
        if (projectNote) projectNote.hidden = !projectId;
        if (projectDetailLink && projectId) {
          projectDetailLink.hidden = false;
          projectDetailLink.href = '/webhook/novel-project-detail?project_id=' + encodeURIComponent(projectId);
        }
        if (options.write !== false) writeState(activeValue);
      };
      buttons.forEach((button) => {
        button.addEventListener('click', () => {
          currentPage = 1;
          applyFilter(button.dataset.queueFilter || 'attention');
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
      document.querySelectorAll('[data-copy-text]').forEach((button) => {
        button.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(button.dataset.copyText || '');
            button.textContent = '已复制';
          } catch (error) {
            button.textContent = '复制失败';
          }
        });
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
