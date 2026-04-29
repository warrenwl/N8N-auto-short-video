// n8n Code node: Build Review Center HTML
// Input comes from a Postgres SELECT of review-related rows.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function assetUrl(path) {
  if (!path) return '';
  return `http://localhost:3001/asset?path=${encodeURIComponent(path)}`;
}

function formatLocalTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}小时${minutes % 60}分`;
  }
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
}

function formatDurationSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return '';
  return formatDuration(seconds * 1000);
}

function completedDuration(row) {
  const started = row.render_started_at ? new Date(row.render_started_at) : null;
  const finished = row.render_finished_at ? new Date(row.render_finished_at) : null;
  if (
    !started ||
    !finished ||
    Number.isNaN(started.getTime()) ||
    Number.isNaN(finished.getTime())
  ) {
    return '';
  }
  return formatDuration(finished.getTime() - started.getTime());
}

function activeStartedAt(row) {
  const status = String(row.status || '');
  if (status === 'RENDERING_VIDEO') return row.render_started_at || row.updated_at;
  if (status === 'GENERATING_AUDIO') return row.audio_started_at || row.updated_at;
  if (status === 'GENERATING_COVER') return row.media_started_at || row.updated_at;
  if (status === 'MEDIA_READY' || status === 'SCRIPT_READY' || status === 'AUDIO_READY' || status === 'COVER_READY') {
    return row.updated_at;
  }
  return row.render_started_at || row.audio_started_at || row.media_started_at || row.updated_at;
}

function activeElapsed(row) {
  const startedAt = activeStartedAt(row);
  const started = startedAt ? new Date(startedAt) : null;
  if (!started || Number.isNaN(started.getTime())) return '';
  return formatDuration(Date.now() - started.getTime());
}

function statusLabel(status) {
  return {
    SCRIPT_READY: '等待渲染',
    MEDIA_READY: '等待重渲染',
    GENERATING_AUDIO: '生成语音中',
    AUDIO_READY: '语音完成',
    GENERATING_COVER: '生成封面中',
    COVER_READY: '封面完成',
    RENDERING_VIDEO: '合成视频中',
    FAILED: '失败',
    RENDER_FAILED: '渲染失败',
    NEED_REVIEW: '待审核',
    APPROVED: '已通过',
    REJECTED: '已拒绝',
  }[status] || status || '未知';
}

const generatingStatuses = new Set([
  'SCRIPT_READY',
  'MEDIA_READY',
  'GENERATING_AUDIO',
  'AUDIO_READY',
  'GENERATING_COVER',
  'COVER_READY',
  'RENDERING_VIDEO',
  'FAILED',
  'RENDER_FAILED',
]);

const progressByStatus = {
  SCRIPT_READY: {percent: 5, text: '等待 06 工作流领取'},
  MEDIA_READY: {percent: 8, text: '等待 06 重渲染入口领取'},
  GENERATING_AUDIO: {percent: 20, text: '正在生成语音'},
  AUDIO_READY: {percent: 35, text: '语音已完成'},
  GENERATING_COVER: {percent: 45, text: '正在生成封面'},
  COVER_READY: {percent: 60, text: '封面已完成'},
  RENDERING_VIDEO: {percent: 80, text: '正在合成视频'},
  FAILED: {percent: 100, text: '生成失败'},
  RENDER_FAILED: {percent: 100, text: '渲染失败'},
};

function getQuery() {
  try {
    return $('Webhook - Review List').first().json.query || {};
  } catch (error) {
    return {};
  }
}

const rejectReasons = ['脚本不行', '画面不行', '声音不行', '字幕不行', '整体重做'];
const rejectOptions = rejectReasons.map((reason) => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join('');
const allowedTabs = new Set(['NEED_REVIEW', 'GENERATING', 'APPROVED', 'REJECTED', 'ALL']);
const query = getQuery();
const activeStatus = allowedTabs.has(String(query.status || '').toUpperCase()) ? String(query.status).toUpperCase() : 'NEED_REVIEW';
const allRows = $input.all().map((item) => item.json || {});
const counts = allRows.reduce((acc, row) => {
  const status = String(row.status || '');
  acc[status] = (acc[status] || 0) + 1;
  acc.ALL += 1;
  const reviewedAt = row.reviewed_at ? new Date(row.reviewed_at) : null;
  if (reviewedAt && !Number.isNaN(reviewedAt.getTime())) {
    const now = new Date();
    const reviewedDay = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai'}).format(reviewedAt);
    const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai'}).format(now);
    if (reviewedDay === today) acc.TODAY += 1;
  }
  if (generatingStatuses.has(status)) acc.GENERATING += 1;
  return acc;
}, {NEED_REVIEW: 0, GENERATING: 0, APPROVED: 0, REJECTED: 0, ALL: 0, TODAY: 0});

const rows = activeStatus === 'ALL'
  ? allRows
  : activeStatus === 'GENERATING'
    ? allRows.filter((row) => generatingStatuses.has(String(row.status || '')))
    : allRows.filter((row) => row.status === activeStatus);

function hiddenReviewFields(row, action) {
  return `
    <input type="hidden" name="action" value="${escapeHtml(action)}" />
    <input type="hidden" name="task_id" value="${escapeHtml(row.id)}" />
    <input type="hidden" name="token" value="${escapeHtml(row.review_token || '')}" />
  `;
}

function inlineActionAttrs(redirectStatus, triggerPath = '') {
  return `data-inline-action="true" data-trigger-path="${escapeHtml(triggerPath)}"`;
}

function actionButtons(row) {
  const status = String(row.status || '');
  if (status === 'NEED_REVIEW') {
    return `
      <form method="GET" action="/webhook/video-review-action">
        ${hiddenReviewFields(row, 'approve')}
        <button class="approve" type="submit">通过</button>
      </form>
      <form class="reject-form" method="GET" action="/webhook/video-review-action">
        ${hiddenReviewFields(row, 'reject')}
        <select name="note" aria-label="拒绝原因">${rejectOptions}</select>
        <input name="extra_note" placeholder="补充说明，可选" />
        <button class="reject" type="submit">拒绝</button>
      </form>
    `;
  }
  if (status === 'APPROVED') {
    return `
      <form method="GET" action="/webhook/video-review-action" ${inlineActionAttrs('NEED_REVIEW')}>
        ${hiddenReviewFields(row, 'back_review')}
        <button class="secondary" type="submit">退回待审核</button>
      </form>
    `;
  }
  if (status === 'REJECTED') {
    return `
      <form method="GET" action="/webhook/video-review-action" ${inlineActionAttrs('NEED_REVIEW')}>
        ${hiddenReviewFields(row, 'back_review')}
        <button class="secondary" type="submit">退回待审核</button>
      </form>
      <form method="GET" action="/webhook/video-review-action" ${inlineActionAttrs('GENERATING', '/webhook/video-rerender-split')}>
        ${hiddenReviewFields(row, 'rerender')}
        <button class="rerender" type="submit">重新渲染视频</button>
      </form>
      <form method="GET" action="/webhook/video-review-action" ${inlineActionAttrs('GENERATING', '/webhook/video-rerender-video-only')}>
        ${hiddenReviewFields(row, 'rerender_video_only')}
        <button class="video-only" type="submit">仅重新合成视频</button>
      </form>
    `;
  }
  return '';
}

function progressBlock(row) {
  const status = String(row.status || '');
  if (!generatingStatuses.has(status)) return '';
  const isVideoOnlyRerender = status === 'AUDIO_READY' && row.review_status === 'VIDEO_RERENDER_REQUESTED';
  const progress = isVideoOnlyRerender
    ? {percent: 65, text: '等待仅重新合成视频入口领取'}
    : progressByStatus[status] || {percent: 0, text: statusLabel(status)};
  const elapsed = activeElapsed(row) || formatDurationSeconds(row.elapsed_seconds);
  const updated = formatLocalTime(row.updated_at || '');
  const error = row.error || '';

  return `
    <div class="progress-card">
      <div class="progress-head">
        <span>${escapeHtml(progress.text)}</span>
        <strong>${Math.round(progress.percent)}%</strong>
      </div>
      <div class="progress-track"><div class="progress-fill ${status === 'FAILED' || status === 'RENDER_FAILED' ? 'failed' : ''}" style="width: ${Math.max(0, Math.min(100, progress.percent))}%"></div></div>
      <div class="progress-meta">
        ${updated ? `<span>更新时间：${escapeHtml(updated)}</span>` : ''}
        ${elapsed ? `<span>已用时间：${escapeHtml(elapsed)}</span>` : ''}
      </div>
      ${error ? `<div class="error-box">${escapeHtml(error)}</div>` : ''}
    </div>
  `;
}

const cards = rows.map((row) => {
  const id = String(row.id || '');
  const title = row.title || row.topic || '未命名视频';
  const videoPath = row.video_path || '';
  const coverPath = row.cover_path || '';
  const displayTime = formatLocalTime(row.review_display_at || row.render_finished_at || row.media_finished_at || row.created_at || row.updated_at || '');
  const reviewedTime = formatLocalTime(row.reviewed_at || row.approved_at || row.rejected_at || '');
  const durationText = completedDuration(row);
  const videoUrl = assetUrl(videoPath);
  const coverUrl = assetUrl(coverPath);
  const status = String(row.status || '');
  const reviewNote = row.review_note || '';
  const progress = progressBlock(row);

  return `
    <article class="card">
      <div class="media">
        ${videoUrl ? `<video src="${escapeHtml(videoUrl)}" poster="${escapeHtml(coverUrl)}" controls preload="metadata" onerror="this.outerHTML='<div class=&quot;empty&quot;>视频文件不可预览<br><small>本地文件可能已被清理</small></div>'"></video>` : '<div class="empty">暂无视频</div>'}
      </div>
      <div class="body">
        <div class="status ${escapeHtml(status.toLowerCase())}">${escapeHtml(statusLabel(status))}</div>
        <h2>${escapeHtml(title)}</h2>
        <p class="topic">${escapeHtml(row.topic || '')}</p>
        <dl>
          <dt>任务 ID</dt><dd>${escapeHtml(id)}</dd>
          <dt>视频路径</dt><dd>${escapeHtml(videoPath)}</dd>
          <dt>完成时间</dt><dd>${escapeHtml(displayTime)}</dd>
          ${durationText ? `<dt>持续时间</dt><dd>${escapeHtml(durationText)}</dd>` : ''}
          ${reviewedTime ? `<dt>审核时间</dt><dd>${escapeHtml(reviewedTime)}</dd>` : ''}
          ${reviewNote ? `<dt>审核备注</dt><dd>${escapeHtml(reviewNote)}</dd>` : ''}
        </dl>
        ${progress}
        <div class="actions">${actionButtons(row)}</div>
      </div>
    </article>
  `;
}).join('\n');

function tab(status, label, count) {
  const active = activeStatus === status ? ' active' : '';
  return `<a class="tab${active}" href="/webhook/video-review-list?status=${status}">${escapeHtml(label)} <span>${count}</span></a>`;
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>视频审核中心</title>
  <style>
    body { margin: 0; background: #f5f6f8; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", Arial, sans-serif; }
    header { position: sticky; top: 0; z-index: 10; background: rgba(255,255,255,.94); border-bottom: 1px solid #e5e7eb; backdrop-filter: blur(14px); }
    .head { max-width: 1180px; margin: 0 auto; padding: 18px 24px 14px; display: grid; gap: 14px; }
    .topline { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    h1 { margin: 0; font-size: 24px; letter-spacing: 0; }
    .metrics { display: flex; flex-wrap: wrap; gap: 8px; color: #4b5563; font-size: 13px; font-weight: 800; }
    .metric { background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 999px; padding: 7px 10px; }
    .refresh-note { width: fit-content; color: #1d4ed8; background: #eff6ff; border: 1px solid #dbeafe; border-radius: 999px; padding: 7px 10px; font-size: 12px; font-weight: 900; }
    .tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
    .tab { flex: 0 0 auto; color: #374151; text-decoration: none; border: 1px solid #d1d5db; background: #fff; border-radius: 999px; padding: 9px 13px; font-weight: 900; font-size: 14px; }
    .tab span { color: #6b7280; margin-left: 4px; }
    .tab.active { background: #111827; color: #fff; border-color: #111827; }
    .tab.active span { color: #d1d5db; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; display: grid; gap: 18px; }
    .card { display: grid; grid-template-columns: minmax(220px, 320px) 1fr; gap: 20px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 18px; box-shadow: 0 8px 24px rgba(15,23,42,.06); }
    .media { background: #090a0c; border-radius: 8px; overflow: hidden; aspect-ratio: 9 / 16; }
    video { width: 100%; height: 100%; display: block; object-fit: contain; background: #090a0c; }
    .empty { height: 100%; display: grid; place-items: center; color: #9ca3af; font-weight: 800; text-align: center; line-height: 1.7; padding: 18px; box-sizing: border-box; }
    .empty small { display: block; font-size: 12px; color: #6b7280; }
    .body { min-width: 0; display: flex; flex-direction: column; gap: 12px; }
    .status { width: fit-content; padding: 6px 10px; border-radius: 999px; background: #fff7ed; color: #c2410c; font-size: 12px; font-weight: 900; }
    .status.approved { background: #ecfdf5; color: #047857; }
    .status.rejected { background: #fef2f2; color: #b91c1c; }
    .status.script_ready, .status.generating_audio, .status.audio_ready, .status.generating_cover, .status.cover_ready, .status.rendering_video { background: #eff6ff; color: #1d4ed8; }
    .status.failed, .status.render_failed { background: #fef2f2; color: #b91c1c; }
    h2 { margin: 0; font-size: 26px; line-height: 1.22; letter-spacing: 0; }
    .topic { margin: 0; color: #4b5563; font-size: 15px; line-height: 1.6; }
    dl { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 8px 12px; margin: 4px 0 0; font-size: 13px; line-height: 1.5; }
    dt { color: #6b7280; font-weight: 800; }
    dd { margin: 0; word-break: break-word; color: #374151; }
    .actions { margin-top: auto; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .progress-card { border: 1px solid #dbeafe; background: #eff6ff; border-radius: 8px; padding: 12px; display: grid; gap: 8px; }
    .progress-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #1e40af; font-weight: 900; font-size: 13px; }
    .progress-track { height: 8px; border-radius: 999px; background: #dbeafe; overflow: hidden; }
    .progress-fill { height: 100%; background: #2563eb; border-radius: inherit; }
    .progress-fill.failed { background: #dc2626; }
    .progress-meta { display: flex; flex-wrap: wrap; gap: 8px 14px; color: #475569; font-size: 12px; font-weight: 800; }
    .error-box { border: 1px solid #fecaca; background: #fef2f2; color: #991b1b; border-radius: 6px; padding: 9px 10px; font-size: 12px; line-height: 1.5; word-break: break-word; }
    form { margin: 0; }
    button { border: 0; border-radius: 6px; padding: 11px 18px; color: #fff; font-weight: 900; cursor: pointer; font-size: 15px; }
    .approve { background: #16a34a; }
    .reject { background: #dc2626; }
    .secondary { background: #4b5563; }
    .rerender { background: #2563eb; }
    .video-only { background: #7c3aed; }
    .reject-form { display: flex; gap: 8px; align-items: center; }
    select, input[name="extra_note"] { width: 150px; max-width: 44vw; border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; font-size: 14px; background: #fff; color: #111827; }
    input[name="extra_note"] { width: 220px; }
    button:disabled { opacity: .66; cursor: progress; }
    .none { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 42px; text-align: center; color: #4b5563; font-weight: 800; }
    @media (max-width: 760px) {
      .topline { align-items: flex-start; flex-direction: column; }
      .card { grid-template-columns: 1fr; }
      .media { max-height: 560px; }
      .actions, .reject-form { flex-direction: column; align-items: stretch; }
      select, input[name="extra_note"] { width: auto; max-width: none; }
      button { width: 100%; }
    }
  </style>
  <script>
    document.addEventListener('submit', async (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.dataset.inlineAction !== 'true') return;
      event.preventDefault();

      const button = form.querySelector('button[type="submit"]');
      if (button) {
        button.disabled = true;
        button.dataset.originalText = button.textContent || '';
        button.textContent = '处理中...';
      }

      const params = new URLSearchParams(new FormData(form));
      const formAction = form.getAttribute('action') || '/webhook/video-review-action';
      const actionUrl = formAction + '?' + params.toString();
      try {
        const response = await fetch(actionUrl, {method: 'GET', cache: 'no-store'});
        if (!response.ok) {
          window.location.href = actionUrl;
          return;
        }

        const triggerPath = form.dataset.triggerPath || '';
        if (triggerPath) {
          const taskId = params.get('task_id') || '';
          const token = params.get('token') || '';
          fetch(triggerPath + '?task_id=' + encodeURIComponent(taskId) + '&token=' + encodeURIComponent(token), {cache: 'no-store'})
            .catch(() => {});
        }

        window.location.reload();
      } catch (error) {
        window.location.href = actionUrl;
      }
    });
  </script>
  ${activeStatus === 'GENERATING' ? '<script>setTimeout(() => window.location.reload(), 5000);</script>' : ''}
</head>
<body>
  <header>
    <div class="head">
      <div class="topline">
        <h1>视频审核中心</h1>
        <div class="metrics">
          <span class="metric">待审核 ${counts.NEED_REVIEW}</span>
          <span class="metric">生成中 ${counts.GENERATING}</span>
          <span class="metric">已通过 ${counts.APPROVED}</span>
          <span class="metric">已拒绝 ${counts.REJECTED}</span>
          <span class="metric">今日审核 ${counts.TODAY}</span>
        </div>
      </div>
      <nav class="tabs">
        ${tab('NEED_REVIEW', '待审核', counts.NEED_REVIEW)}
        ${tab('GENERATING', '生成中', counts.GENERATING)}
        ${tab('APPROVED', '已通过', counts.APPROVED)}
        ${tab('REJECTED', '已拒绝', counts.REJECTED)}
        ${tab('ALL', '全部', counts.ALL)}
      </nav>
      ${activeStatus === 'GENERATING' ? '<div class="refresh-note">自动刷新中，每 5 秒更新一次生成状态。</div>' : ''}
    </div>
  </header>
  <main>
    ${rows.length ? cards : '<div class="none">当前分类没有视频</div>'}
  </main>
</body>
</html>`;

return [{json: {response_html: html}}];
