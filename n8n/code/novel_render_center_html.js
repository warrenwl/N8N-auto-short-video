// n8n Code node: Render Novel Workbench HTML
// The workbench is the operational entry: next action, urgent projects, and project creation.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    GENERATE_BIBLE_PATCH: jobStatus === 'RUNNING' ? '扩写设定补丁生成中' : '扩写设定补丁待确认',
    GENERATE_OUTLINE: jobStatus === 'RUNNING' ? '大纲生成中' : '大纲待启动',
    PLAN_CHAPTER_DIRECTOR: jobStatus === 'RUNNING' ? '导演台规划中' : '导演台待启动',
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
      <div class="brand">
        <span>创作中台</span>
        <strong>小说后台</strong>
      </div>
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

function reviewLink(row, text) {
  const href = reviewHref(row);
  if (!href) return '<span class="muted">暂无待审章节</span>';
  const chapterText = text || `第 ${escapeHtml(row.need_review_chapter_no || '')} 章待审`;
  return `<a href="${href}">${chapterText}</a>`;
}

function queueLink(row, text) {
  if (!row.id) return '<span class="muted">暂无队列入口</span>';
  return `<a href="/webhook/novel-queue-status?project_id=${encodeURIComponent(row.id)}">${escapeHtml(text || '看队列')}</a>`;
}

function overviewLink(row, text) {
  if (!row.id) return '<span class="muted">暂无项目入口</span>';
  return `<a href="/webhook/novel-project-detail?project_id=${encodeURIComponent(row.id)}">${escapeHtml(text || '打开项目')}</a>`;
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

function actionReason(row) {
  if (row.status === 'ARCHIVED') return '项目已归档，不会继续进入生成队列。';
  if (row.status === 'PAUSED') return '项目已暂停，恢复后才会继续排队。';
  if (hasReview(row)) return '等待人工审核，处理后才能继续下一章。';
  if (hasIssue(row)) return '存在失败任务，需要查看队列日志。';
  if (hasQueue(row)) return '有任务正在排队或执行，可以观察队列进度。';
  if (row.status === 'COMPLETED') return '项目已完结，可以查看概览和日报。';
  return '没有阻塞事项，可以进入项目指挥台排队下一步。';
}

function actionTone(row) {
  if (hasIssue(row)) return 'danger';
  if (hasReview(row)) return 'review';
  if (hasQueue(row)) return 'queued';
  if (canContinue(row)) return 'ready';
  return 'muted';
}

function actionLabel(row) {
  if (hasReview(row)) return '处理审核';
  if (hasIssue(row)) return '排查失败';
  if (hasQueue(row)) return '观察队列';
  if (canContinue(row)) return '继续写作';
  if (row.status === 'COMPLETED') return '整理成稿';
  if (row.status === 'ARCHIVED') return '已归档';
  if (row.status === 'PAUSED') return '已暂停';
  return '查看项目';
}

function currentSuggestion(rows) {
  if (!rows.length) {
    return {
      title: '当前建议操作',
      text: '还没有小说项目，先创建第一个项目，然后系统会自动排队生成设定集。',
      action: '<a class="primary-link" href="/webhook/novel-project-new">创建新小说项目</a>',
    };
  }
  const reviewRow = rows.find(hasReview);
  if (reviewRow) {
    return {
      title: '当前建议操作',
      text: `有章节正在等待人工审核，先处理《${reviewRow.title || '未命名项目'}》的待审稿，审核通过后才会继续下一章。`,
      action: reviewLink(reviewRow),
    };
  }
  const failedRow = rows.find(hasIssue);
  if (failedRow) {
    return {
      title: '当前建议操作',
      text: '当前存在失败任务，建议先查看失败任务和队列日志，确认是否需要恢复。',
      action: queueLink(failedRow, '查看失败任务'),
    };
  }
  const busyRow = rows.find(hasQueue);
  if (busyRow) {
    return {
      title: '当前建议操作',
      text: '当前有任务待调度或正在运行，可以查看队列状态确认执行进度。',
      action: queueLink(busyRow, '查看队列状态'),
    };
  }
  const archivedCount = rows.filter((row) => row.status === 'ARCHIVED').length;
  if (archivedCount > 0 && archivedCount === rows.length) {
    return {
      title: '当前建议操作',
      text: '当前项目都已归档，可以进入项目列表恢复需要继续处理的项目。',
      action: '<a class="primary-link" href="/webhook/novel-project-list">打开项目列表</a>',
    };
  }
  return {
    title: '当前建议操作',
    text: '暂无紧急操作。可以打开项目列表查看整体进度，或创建新的小说项目。',
    action: '<a class="primary-link" href="/webhook/novel-project-list">打开项目列表</a>',
  };
}

function todoCounts(rows) {
  return rows.reduce((acc, row) => {
    if (hasReview(row)) acc.review += Math.max(1, Number(row.need_review_count || 0));
    acc.failed += Number(row.failed_job_count || 0);
    if (hasIssue(row) && Number(row.failed_job_count || 0) === 0) acc.failed += 1;
    if (hasQueue(row)) acc.queued += 1;
    if (canContinue(row)) acc.continuable += 1;
    if (row.status === 'COMPLETED') acc.completed += 1;
    if (row.status === 'ARCHIVED') acc.archived += 1;
    return acc;
  }, {review: 0, failed: 0, queued: 0, continuable: 0, completed: 0, archived: 0});
}

function metric(labelText, value, tone) {
  return `<div class="todo-card ${tone || ''}"><span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderActionCard(row) {
  const failed = Number(row.failed_job_count || 0);
  const waiting = Number(row.waiting_job_count || 0);
  const running = Number(row.running_job_count || 0);
  const activeQueue = waiting + running;
  return `
    <article class="project-card action-card ${escapeHtml(actionTone(row))}">
      <div class="card-head">
        <div>
          <span class="task-chip">${escapeHtml(actionLabel(row))}</span>
          <strong>${escapeHtml(row.title || '未命名项目')}</strong>
          <span>${escapeHtml(row.genre || '未设置类型')} / ${escapeHtml(row.audience || '未设置读者')}</span>
        </div>
        ${liveProjectBadge(row)}
      </div>
      <p>${escapeHtml(actionReason(row))}</p>
      <div class="compact-line" aria-label="项目关键判断">
        <span>进度 ${escapeHtml(projectProgress(row))}</span>
        <span>队列 ${escapeHtml(activeQueue)}</span>
        <span>失败 ${escapeHtml(failed)}</span>
      </div>
      <div class="card-actions">
        ${hasReview(row) ? reviewLink(row, '去审核') : ''}
        ${queueLink(row, '看队列')}
        ${overviewLink(row, '打开项目')}
      </div>
      <details class="card-detail">
        <summary>展开运行细节</summary>
        <dl>
          <dt>最近任务</dt><dd>${latestJobHtml(row)}</dd>
          <dt>最近调用</dt><dd>${latestCallHtml(row)}</dd>
          <dt>更新时间</dt><dd>${escapeHtml(formatLocalTime(row.updated_at || row.created_at))}</dd>
        </dl>
      </details>
    </article>`;
}

function healthCard(labelText, value, detail, tone = '') {
  return `<article class="health-card ${escapeHtml(tone)}"><span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value)}</strong><p>${escapeHtml(detail)}</p></article>`;
}

const rows = $input.all()
  .map((item) => item.json || {})
  .filter((row) => !row.is_empty);

const suggestion = currentSuggestion(rows);
const counts = todoCounts(rows);
const actionRows = rows
  .filter((row) => hasReview(row) || hasIssue(row) || hasQueue(row) || canContinue(row))
  .slice(0, 6);

const actionCards = actionRows.length
  ? actionRows.map(renderActionCard).join('')
  : '<article class="project-card empty">暂无需要立即处理的项目，可打开项目列表查看全部项目。</article>';

const systemHealth = `
  ${healthCard('队列健康', counts.failed ? '需要排查' : (counts.queued ? '运行中' : '空闲'), counts.failed ? `${counts.failed} 个失败任务优先处理` : (counts.queued ? `${counts.queued} 个项目有任务在推进` : '当前没有队列压力'), counts.failed ? 'bad' : (counts.queued ? 'warn' : 'good'))}
  ${healthCard('审核压力', counts.review, counts.review ? '先处理人工审核，避免续写上下文阻塞' : '暂无待审章节', counts.review ? 'warn' : 'good')}
  ${healthCard('可继续写作', counts.continuable, counts.continuable ? '这些项目没有待审、失败或队列阻塞' : '暂无可直接推进项目', counts.continuable ? 'good' : '')}
`;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>小说工作台</title>
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
    header { display: flex; justify-content: space-between; gap: 16px; align-items: end; margin-bottom: 16px; }
    .page-context { position: sticky; top: 0; z-index: 70; margin-bottom: 18px; padding: 14px 0 12px; background: rgba(246, 247, 249, .97); border-bottom: 1px solid rgba(216, 222, 232, .92); backdrop-filter: blur(10px); }
    .page-context header { margin-bottom: 0; }
    h1 { margin: 0; font-size: 28px; text-wrap: balance; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    .ops-kicker { margin: 0 0 6px; color: var(--muted); font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    .muted { color: var(--muted); margin: 6px 0 0; }
    a, .primary-link { color: var(--accent); text-decoration: none; font-weight: 650; }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 18px; overflow: hidden; }
    .workbench { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; background: transparent; border: 0; overflow: visible; }
    .next-action { display: grid; gap: 14px; align-items: start; padding: 16px; border-color: #b9e3d4; background: var(--accent-soft); }
    .next-action p { margin: 0; color: #225447; line-height: 1.6; }
    .quick-links, .card-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .quick-links a, .quick-links button, .card-actions a, .card-actions span { min-height: 38px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 12px; background: #fff; color: var(--accent); text-decoration: none; font: inherit; font-weight: 650; touch-action: manipulation; cursor: pointer; }
    .quick-links a:hover, .quick-links button:hover, .card-actions a:hover, .primary-link:hover { border-color: var(--accent); background: var(--accent-soft); }
    .todo-overview { padding: 0; border: 0; background: transparent; }
    .todo-overview h2 { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .todo-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
    .todo-card { border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; background: #fff; }
    .todo-card span { display: block; color: var(--muted); font-size: 12px; }
    .todo-card strong { display: block; margin-top: 3px; font-size: 20px; font-variant-numeric: tabular-nums; }
    .todo-card.warn { border-color: #f0c36a; background: var(--warn-soft); }
    .todo-card.bad { border-color: #f3b4ae; background: var(--danger-soft); }
    .todo-card.good { border-color: #b9e3d4; background: var(--accent-soft); }
    .section-title { padding: 16px 16px 0; }
    .action-list { padding: 16px; }
    .action-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
    .health-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 16px; }
    .health-card { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fff; }
    .health-card span { display: block; color: var(--muted); font-size: 13px; }
    .health-card strong { display: block; margin-top: 6px; font-size: 20px; }
    .health-card p { margin: 8px 0 0; color: #3d4b5c; line-height: 1.55; }
    .health-card.good { border-color: #b9e3d4; background: var(--accent-soft); }
    .health-card.warn { border-color: #f0c36a; background: var(--warn-soft); }
    .health-card.bad { border-color: #f3b4ae; background: var(--danger-soft); }
    .modal-dialog { width: min(680px, calc(100vw - 24px)); border: 0; border-radius: 8px; padding: 0; background: #fff; box-shadow: 0 22px 54px rgba(16, 24, 40, .22); }
    .modal-dialog::backdrop { background: rgba(15, 23, 42, .28); }
    .modal-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding: 16px; border-bottom: 1px solid var(--line); }
    .modal-body { padding: 16px; }
    .modal-close { min-height: 34px; border: 1px solid var(--line); border-radius: 8px; padding: 0 10px; background: #fff; color: var(--ink); font: inherit; cursor: pointer; }
    form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 16px; }
    label { display: grid; gap: 6px; font-size: 13px; color: var(--muted); }
    input, textarea { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 10px 11px; font: inherit; color: var(--ink); background: white; }
    textarea { min-height: 76px; resize: vertical; }
    .wide { grid-column: 1 / -1; }
    button[type="submit"] { justify-self: start; border: 0; border-radius: 8px; padding: 11px 18px; font: inherit; font-weight: 650; color: white; background: var(--accent); cursor: pointer; touch-action: manipulation; }
    button[type="submit"]:hover { background: #19664e; }
    .project-card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; content-visibility: auto; contain-intrinsic-size: 120px; }
    .action-card.review { border-color: #f0c36a; }
    .action-card.danger { border-color: #f3b4ae; background: #fffafa; }
    .action-card.queued { border-color: #c7d7ee; }
    .action-card.ready { border-color: #b9e3d4; }
    .project-card.empty { text-align: center; color: var(--muted); padding: 28px; }
    .project-card p { margin: 0 0 10px; color: #3d4b5c; line-height: 1.45; }
    .compact-line { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }
    .compact-line span { min-height: 28px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 0 9px; color: #344054; background: #fff; font-size: 12px; font-weight: 750; }
    .card-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: start; margin-bottom: 8px; }
    .card-head span { display: block; color: var(--muted); margin-top: 4px; font-size: 13px; }
    .task-chip { display: inline-flex !important; width: fit-content; margin: 0 0 8px !important; border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; background: #fff; color: var(--ink) !important; font-size: 12px !important; font-weight: 800; }
    .project-card dl { display: grid; grid-template-columns: 82px 1fr; gap: 8px 10px; margin: 0 0 14px; }
    .project-card dt { color: var(--muted); }
    .project-card dd { margin: 0; min-width: 0; }
    .project-card dd span { display: block; color: var(--muted); margin-top: 3px; font-size: 13px; }
    .card-detail { margin-top: 10px; border-top: 1px solid var(--line); padding-top: 8px; }
    .card-detail summary { color: var(--muted); font-size: 13px; font-weight: 750; cursor: pointer; }
    .card-detail dl { margin-top: 10px; }
    .badge { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 650; white-space: nowrap; }
    .badge.good { color: var(--accent); background: var(--accent-soft); }
    .badge.warn { color: var(--warn); background: var(--warn-soft); }
    .badge.bad { color: var(--danger); background: var(--danger-soft); }
    .badge.muted { color: var(--muted); background: #f6f7f9; }
    .error { color: var(--danger); }
    a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 3px solid #8fd4bd; outline-offset: 2px; }
    @media (max-width: 860px) {
      .app-shell { display: block; }
      .app-sidebar { position: static; height: auto; padding: 12px; border-right: 0; border-bottom: 1px solid var(--line); }
      .brand { display: none; }
      .side-nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
      .side-nav a, .side-nav span { white-space: nowrap; }
      .side-primary { display: none; }
      main, .app-shell > main { width: min(100% - 24px, 1240px); margin: 16px auto 48px; }
      form, .workbench, .next-action, .action-grid, .health-grid, .todo-grid { grid-template-columns: 1fr; }
      header { display: block; }
      .next-action { display: block; }
      .quick-links { margin-top: 12px; }
      .project-card dl { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="app-shell">
  ${renderSidebar('工作台')}
  <main>
    <div class="page-context">
    <header>
      <div>
        <p class="ops-kicker">运营工作台</p>
        <h1>小说运营工作台</h1>
        <p class="muted">先回答“现在该处理什么”，再进入项目、审核、队列或日报。</p>
      </div>
    </header>
    </div>

    <section class="workbench" aria-label="小说工作台">
      <div class="next-action" aria-label="当前建议操作">
        <div>
          <p class="ops-kicker">今日行动指挥</p>
          <h2>${escapeHtml(suggestion.title)}</h2>
          <p>${escapeHtml(suggestion.text)}</p>
        </div>
        <div class="quick-links" aria-label="次级入口">
          ${suggestion.action}
          <a href="/webhook/novel-project-list">打开项目列表</a>
          <a href="/webhook/novel-review-list">去审核</a>
          <a href="/webhook/novel-daily-report">看日报</a>
          <button type="button" data-open-dialog="system-health-modal">系统健康</button>
        </div>
      </div>
      <section class="todo-overview" aria-label="待办总览">
        <h2>待办总览</h2>
        <div class="todo-grid">
          ${metric('待审核', counts.review, counts.review ? 'warn' : '')}
          ${metric('失败任务', counts.failed, counts.failed ? 'bad' : '')}
          ${metric('队列中', counts.queued, counts.queued ? 'warn' : '')}
          ${metric('可继续写作', counts.continuable, counts.continuable ? 'good' : '')}
          ${metric('已完结', counts.completed, 'good')}
          ${metric('已归档', counts.archived, '')}
        </div>
      </section>
    </section>

    <section class="action-list" aria-label="需要处理的项目">
      <div class="section-title">
        <p class="ops-kicker">任务流</p>
        <h2>任务流：需要处理的项目</h2>
        <p class="muted">只显示待审、失败、排队或可继续推进的项目；完整清单在项目列表。</p>
      </div>
      <div class="action-grid">
        ${actionCards}
      </div>
    </section>

    <dialog class="modal-dialog" id="system-health-modal" aria-label="系统健康弹窗">
      <div class="modal-head">
        <div>
          <p class="ops-kicker">系统健康</p>
          <h2>系统健康</h2>
          <p class="muted">用于判断后台是否在正常推进，以及今天是否需要介入。</p>
        </div>
        <button class="modal-close" type="button" data-close-dialog>关闭</button>
      </div>
      <div class="modal-body">
        <div class="health-grid">${systemHealth}</div>
      </div>
    </dialog>

    <section>
      <div class="section-title">
        <h2>创建新小说项目</h2>
        <p class="muted">创建表单已经移到独立页面，避免工作台变成又看状态又填表的混合页。</p>
      </div>
      <div class="action-list">
        <a class="primary-link" href="/webhook/novel-project-new">打开创建项目页</a>
      </div>
    </section>
  </main>
  </div>
  <script>
    (() => {
      document.querySelectorAll('[data-open-dialog]').forEach((button) => {
        button.addEventListener('click', () => {
          const dialog = document.getElementById(button.dataset.openDialog || '');
          if (!dialog) return;
          if (typeof dialog.showModal === 'function') dialog.showModal();
          else dialog.setAttribute('open', '');
        });
      });
      document.querySelectorAll('[data-close-dialog]').forEach((button) => {
        button.addEventListener('click', () => {
          const dialog = button.closest('dialog');
          if (dialog && typeof dialog.close === 'function') dialog.close();
          else if (dialog) dialog.removeAttribute('open');
        });
      });
      document.querySelectorAll('dialog').forEach((dialog) => {
        dialog.addEventListener('click', (event) => {
          if (event.target === dialog && typeof dialog.close === 'function') dialog.close();
        });
      });
    })();
  </script>
</body>
</html>`;

return [{json: {response_html: html}}];
