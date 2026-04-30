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

function parseDbTime(value) {
  if (!value) return '';
  if (value instanceof Date) return value;
  const text = String(value).trim();
  if (!text) return '';
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text)
    ? text
    : `${text.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? '' : date;
}

function formatLocalTime(value) {
  if (!value) return '';
  const date = parseDbTime(value);
  if (!date) return String(value);
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
  const started = parseDbTime(row.render_started_at);
  const finished = parseDbTime(row.render_finished_at);
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
  if (status === 'GENERATING_SCRIPT' || status === 'MEDIA_READY' || status === 'SCRIPT_READY' || status === 'AUDIO_READY' || status === 'COVER_READY') {
    return row.updated_at;
  }
  return row.render_started_at || row.audio_started_at || row.media_started_at || row.updated_at;
}

function activeElapsed(row) {
  const startedAt = activeStartedAt(row);
  const started = parseDbTime(startedAt);
  if (!started) return '';
  return formatDuration(Date.now() - started.getTime());
}

function stageAgeSeconds(row) {
  const status = String(row.status || '');
  if (['SCRIPT_READY', 'AUDIO_READY', 'COVER_READY'].includes(status)) {
    const updated = parseDbTime(row.updated_at);
    if (!updated) return Number.NaN;
    return Math.max(0, Math.floor((Date.now() - updated.getTime()) / 1000));
  }
  const seconds = Number(row.elapsed_seconds);
  return Number.isFinite(seconds) ? seconds : Number.NaN;
}

function statusLabel(status) {
  return {
    GENERATING_SCRIPT: '生成脚本中',
    SCRIPT_READY: '等待渲染',
    MEDIA_READY: '等待重渲染',
    GENERATING_AUDIO: '脚本已完成，生成语音中',
    AUDIO_READY: '语音完成',
    GENERATING_COVER: '生成封面中',
    COVER_READY: '封面完成',
    RENDERING_VIDEO: '合成视频中',
    FAILED: '失败',
    RENDER_FAILED: '渲染失败',
    NEED_REVIEW: '待审核',
    APPROVED: '已通过',
    REJECTED: '已拒绝',
    PUBLISHED: '已发布',
  }[status] || status || '未知';
}

function parseRecentEvents(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return Object.values(value);
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function eventTypeLabel(value) {
  return {
    STAGE_STARTED: '阶段开始',
    STAGE_COMPLETED: '阶段完成',
    HUMAN_REVIEW: '人工审核',
    HUMAN_RECOVERY: '人工补救',
    HUMAN_ACTION: '人工操作',
    AUTO_TRIGGER: '自动触发',
    FAILURE: '失败记录',
  }[value] || value || '事件';
}

const generatingStatuses = new Set([
  'GENERATING_SCRIPT',
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
  GENERATING_SCRIPT: {percent: 10, text: '正在生成脚本'},
  SCRIPT_READY: {percent: 15, text: '脚本已完成，等待 06 工作流领取'},
  MEDIA_READY: {percent: 8, text: '等待 06 重渲染入口领取'},
  GENERATING_AUDIO: {percent: 20, text: '脚本已完成，正在生成语音'},
  AUDIO_READY: {percent: 35, text: '脚本与语音已完成'},
  GENERATING_COVER: {percent: 45, text: '语音已完成，正在生成封面'},
  COVER_READY: {percent: 60, text: '封面已完成，等待合成视频'},
  RENDERING_VIDEO: {percent: 80, text: '封面与语音已完成，正在合成视频'},
  FAILED: {percent: 100, text: '生成失败'},
  RENDER_FAILED: {percent: 100, text: '渲染失败'},
};

const staleThresholdSeconds = {
  GENERATING_SCRIPT: 5 * 60,
  SCRIPT_READY: 5 * 60,
  GENERATING_AUDIO: 15 * 60,
  AUDIO_READY: 10 * 60,
  GENERATING_COVER: 20 * 60,
  COVER_READY: 10 * 60,
  RENDERING_VIDEO: 20 * 60,
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
const allowedTabs = new Set(['NEED_REVIEW', 'GENERATING', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ALL']);
const query = getQuery();
const activeStatus = allowedTabs.has(String(query.status || '').toUpperCase()) ? String(query.status).toUpperCase() : 'NEED_REVIEW';
const allRows = $input.all().map((item) => item.json || {});
const counts = allRows.reduce((acc, row) => {
  const status = String(row.status || '');
  acc[status] = (acc[status] || 0) + 1;
  acc.ALL += 1;
  const reviewedAt = parseDbTime(row.reviewed_at);
  if (reviewedAt && !Number.isNaN(reviewedAt.getTime())) {
    const now = new Date();
    const reviewedDay = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai'}).format(reviewedAt);
    const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Shanghai'}).format(now);
    if (reviewedDay === today) acc.TODAY += 1;
  }
  if (generatingStatuses.has(status)) acc.GENERATING += 1;
  return acc;
}, {NEED_REVIEW: 0, GENERATING: 0, APPROVED: 0, REJECTED: 0, PUBLISHED: 0, ALL: 0, TODAY: 0});

const rows = activeStatus === 'ALL'
  ? allRows
  : activeStatus === 'GENERATING'
    ? allRows.filter((row) => generatingStatuses.has(String(row.status || '')))
    : allRows.filter((row) => row.status === activeStatus);

const tabIntro = {
  NEED_REVIEW: {
    title: '待审核',
    text: '这里集中处理已经生成完成、等待人工判断的视频。',
  },
  GENERATING: {
    title: '生成中',
    text: '这里展示脚本、语音、封面和视频合成阶段的任务，页面会自动刷新状态。',
  },
  APPROVED: {
    title: '已通过',
    text: '这里展示可以进入发布准备的视频；如果已经生成发布包，卡片会显示当前发布状态。',
  },
  REJECTED: {
    title: '已拒绝',
    text: '这里展示需要退回或重新渲染的视频，可重新渲染完整视频或仅重新合成视频。',
  },
  PUBLISHED: {
    title: '已发布',
    text: '这里展示已经确认手动发布完成的视频。',
  },
  ALL: {
    title: '全部视频',
    text: '这里按统一卡片样式汇总视频生产、审核和发布状态。',
  },
};

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

const activePublishStatuses = new Set(['PACKAGING', 'PACKAGE_READY', 'REMINDING', 'REMIND_SENT']);

function publishStatus(row) {
  return String(row.publish_job_status || row.publish_status || '');
}

function publishStatusLabel(value) {
  return {
    PACKAGING: '正在生成发布包',
    PACKAGE_READY: '发布包已生成',
    REMINDING: '正在发送提醒',
    REMIND_SENT: '已发送提醒',
    MANUAL_PUBLISHED: '已确认发布',
    MANUAL_SKIPPED: '已撤回/暂不发布',
  }[value] || value;
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
    const currentPublishStatus = publishStatus(row);
    if (activePublishStatuses.has(currentPublishStatus)) {
      return `
        <form method="GET" action="/webhook/douyin-publish-withdraw" ${inlineActionAttrs('APPROVED')}>
          <input type="hidden" name="task_id" value="${escapeHtml(row.id)}" />
          <input type="hidden" name="token" value="${escapeHtml(row.review_token || '')}" />
          <button class="withdraw" type="submit">撤回发布</button>
        </form>
        <form method="GET" action="/webhook/douyin-publish-start" ${inlineActionAttrs('APPROVED')}>
          <input type="hidden" name="task_id" value="${escapeHtml(row.id)}" />
          <input type="hidden" name="token" value="${escapeHtml(row.review_token || '')}" />
          <button class="publish" type="submit">再次发送提醒</button>
        </form>
      `;
    }
    return `
      <form method="GET" action="/webhook/video-review-action" ${inlineActionAttrs('NEED_REVIEW')}>
        ${hiddenReviewFields(row, 'back_review')}
        <button class="secondary" type="submit">退回待审核</button>
      </form>
      <form method="GET" action="/webhook/douyin-publish-start" ${inlineActionAttrs('APPROVED')}>
        <input type="hidden" name="task_id" value="${escapeHtml(row.id)}" />
        <input type="hidden" name="token" value="${escapeHtml(row.review_token || '')}" />
        <button class="publish" type="submit">直接发布到抖音</button>
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

function recoveryBlock(row, elapsedSeconds) {
  const status = String(row.status || '');
  const threshold = staleThresholdSeconds[status];
  if (!threshold || !Number.isFinite(elapsedSeconds) || elapsedSeconds < threshold) return '';

  const warningText = `当前阶段可能卡住，已运行 ${formatDurationSeconds(elapsedSeconds)}。`;
  const recoveryActions = {
    GENERATING_SCRIPT: {
      action: 'reset_script',
      label: '重新生成脚本',
      triggerPath: '/webhook/video-script-start',
      className: 'recover',
    },
    SCRIPT_READY: {
      action: 'trigger_render',
      label: '重新触发渲染',
      triggerPath: '/webhook/video-render-start',
      className: 'recover',
    },
    GENERATING_AUDIO: {
      action: 'reset_audio',
      label: '重新生成语音',
      triggerPath: '/webhook/video-render-start',
      className: 'recover',
    },
    AUDIO_READY: {
      action: 'trigger_cover',
      label: '继续生成封面',
      triggerPath: '/webhook/video-rerender-cover',
      className: 'recover',
    },
    GENERATING_COVER: {
      action: 'reset_cover',
      label: '重新生成封面',
      triggerPath: '/webhook/video-rerender-cover',
      className: 'recover',
    },
    COVER_READY: {
      action: 'reset_render',
      label: '重新合成视频',
      triggerPath: '/webhook/video-rerender-video-only',
      className: 'video-only',
    },
    RENDERING_VIDEO: {
      action: 'reset_render',
      label: '重新合成视频',
      triggerPath: '/webhook/video-rerender-video-only',
      className: 'video-only',
    },
  };
  const recoveryAction = recoveryActions[status];
  const recoveryButton = recoveryAction
    ? `
      <form method="GET" action="/webhook/video-review-action" ${inlineActionAttrs('GENERATING', recoveryAction.triggerPath)}>
        ${hiddenReviewFields(row, recoveryAction.action)}
        <button class="${escapeHtml(recoveryAction.className)}" type="submit">${escapeHtml(recoveryAction.label)}</button>
      </form>
    `
    : '';

  return `
    <div class="recovery-card">
      <div>
        <strong>需要补救</strong>
        <span>${escapeHtml(warningText)}</span>
      </div>
      <div class="recovery-actions">
        ${recoveryButton}
        <form method="GET" action="/webhook/video-review-action" ${inlineActionAttrs('GENERATING')}>
          ${hiddenReviewFields(row, 'mark_failed')}
          <input type="hidden" name="note" value="人工标记失败" />
          <button class="mark-failed" type="submit">标记失败</button>
        </form>
      </div>
    </div>
  `;
}

function progressBlock(row) {
  const status = String(row.status || '');
  if (!generatingStatuses.has(status)) return '';
  const isVideoOnlyRerender = status === 'AUDIO_READY' && row.review_status === 'VIDEO_RERENDER_REQUESTED';
  const progress = isVideoOnlyRerender
    ? {percent: 65, text: '等待仅重新合成视频入口领取'}
    : progressByStatus[status] || {percent: 0, text: statusLabel(status)};
  const elapsedSeconds = Number(row.elapsed_seconds);
  const elapsed = formatDurationSeconds(elapsedSeconds) || activeElapsed(row);
  const updated = formatLocalTime(row.updated_at || '');
  const error = row.error || '';
  const recovery = recoveryBlock(row, stageAgeSeconds(row));

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
    ${recovery}
  `;
}

function eventTimeline(row) {
  const events = parseRecentEvents(row.recent_events).slice(0, 5);
  if (!events.length) return '';

  const items = events.map((event) => {
    const eventTime = formatLocalTime(event.created_at || '');
    const type = eventTypeLabel(event.event_type);
    const stage = event.stage ? ` · ${event.stage}` : '';
    const status = event.new_status ? ` → ${event.new_status}` : '';
    const message = event.message ? `<span>${escapeHtml(event.message)}</span>` : '';
    const eventSeq = Number(event.event_seq);
    const valueAttr = Number.isFinite(eventSeq) && eventSeq > 0 ? ` value="${Math.floor(eventSeq)}"` : '';
    return `
      <li${valueAttr}>
        <div><strong>${escapeHtml(type + stage + status)}</strong>${eventTime ? `<em>${escapeHtml(eventTime)}</em>` : ''}</div>
        ${message}
      </li>
    `;
  }).join('');

  return `
    <details class="event-timeline">
      <summary>最近事件</summary>
      <ol>${items}</ol>
    </details>
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
  const currentPublishStatus = publishStatus(row);
  const publishStatusText = currentPublishStatus ? publishStatusLabel(currentPublishStatus) : '';
  const remindedTime = formatLocalTime(row.publish_reminded_at || '');
  const autoRecoveryAttempts = Number(row.auto_recovery_attempts || 0);
  const lastAutoRecoveryAt = formatLocalTime(row.last_auto_recovery_at || '');
  const progress = progressBlock(row);
  const timeline = eventTimeline(row);

  return `
    <article class="card ${escapeHtml(status.toLowerCase())}">
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
          ${publishStatusText ? `<dt>发布状态</dt><dd>${escapeHtml(publishStatusText)}</dd>` : ''}
          ${remindedTime ? `<dt>提醒时间</dt><dd>${escapeHtml(remindedTime)}</dd>` : ''}
          ${autoRecoveryAttempts > 0 ? `<dt>自动恢复</dt><dd>${escapeHtml(`${autoRecoveryAttempts} 次${lastAutoRecoveryAt ? `，最近 ${lastAutoRecoveryAt}` : ''}`)}</dd>` : ''}
        </dl>
        ${progress}
        ${timeline}
        <div class="actions">${actionButtons(row)}</div>
      </div>
    </article>
  `;
}).join('\n');

function tab(status, label, count) {
  const active = activeStatus === status ? ' active' : '';
  return `<a class="tab${active}" href="/webhook/video-review-list?status=${status}">${escapeHtml(label)} <span>${count}</span></a>`;
}

const intro = tabIntro[activeStatus]
  ? `<section class="tab-summary"><strong>${escapeHtml(tabIntro[activeStatus].title)}</strong><span>${escapeHtml(tabIntro[activeStatus].text)}</span></section>`
  : '';

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>视频审核中心</title>
  <style>
    body { margin: 0; background: #f5f6f8; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", Arial, sans-serif; }
    header { position: sticky; top: 0; z-index: 10; background: rgba(255,255,255,.94); border-bottom: 1px solid #e5e7eb; backdrop-filter: blur(14px); }
    .head { max-width: 1180px; margin: 0 auto; padding: 14px 24px 12px; display: grid; gap: 10px; }
    .topline { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .title-stack { min-width: 0; display: flex; align-items: baseline; gap: 10px; }
    .workspace-title { margin: 0; color: #6b7280; font-size: 13px; font-weight: 900; letter-spacing: 0; white-space: nowrap; }
    .workspace-title::after { content: "/"; margin-left: 10px; color: #d1d5db; }
    h1 { margin: 0; font-size: 24px; letter-spacing: 0; }
    .module-nav { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .module-link { color: #374151; text-decoration: none; border: 1px solid #d1d5db; background: #fff; border-radius: 999px; padding: 9px 14px; font-size: 14px; font-weight: 900; }
    .module-link.active { background: #111827; color: #fff; border-color: #111827; }
    .module-link:not(.active):hover { border-color: #9ca3af; color: #111827; }
    .refresh-note { width: fit-content; color: #1d4ed8; background: #eff6ff; border: 1px solid #dbeafe; border-radius: 999px; padding: 7px 10px; font-size: 12px; font-weight: 900; }
    .tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
    .tab { flex: 0 0 auto; color: #374151; text-decoration: none; border: 1px solid #d1d5db; background: #fff; border-radius: 999px; padding: 9px 13px; font-weight: 900; font-size: 14px; }
    .tab span { color: #6b7280; margin-left: 4px; }
    .tab.active { background: #111827; color: #fff; border-color: #111827; }
    .tab.active span { color: #d1d5db; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; display: grid; gap: 18px; }
    .tab-summary { background: #fff; border: 1px solid #e5e7eb; border-left: 5px solid #111827; border-radius: 8px; box-shadow: 0 8px 24px rgba(15,23,42,.06); padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .tab-summary strong { color: #111827; font-size: 16px; white-space: nowrap; }
    .tab-summary span { color: #4b5563; font-size: 13px; line-height: 1.6; font-weight: 800; text-align: right; }
    .card { display: grid; grid-template-columns: minmax(220px, 320px) 1fr; gap: 20px; background: #fff; border: 1px solid #e5e7eb; border-left: 5px solid #f59e0b; border-radius: 8px; padding: 18px; box-shadow: 0 8px 24px rgba(15,23,42,.06); }
    .card.need_review { border-left-color: #f59e0b; }
    .card.approved { border-left-color: #16a34a; }
    .card.rejected, .card.failed, .card.render_failed { border-left-color: #dc2626; }
    .card.published { border-left-color: #111827; }
    .card.generating_script, .card.script_ready, .card.media_ready, .card.generating_audio, .card.audio_ready, .card.generating_cover, .card.cover_ready, .card.rendering_video { border-left-color: #2563eb; }
    .media { background: #090a0c; border-radius: 8px; overflow: hidden; aspect-ratio: 9 / 16; }
    video { width: 100%; height: 100%; display: block; object-fit: contain; background: #090a0c; }
    .empty { height: 100%; display: grid; place-items: center; color: #9ca3af; font-weight: 800; text-align: center; line-height: 1.7; padding: 18px; box-sizing: border-box; }
    .empty small { display: block; font-size: 12px; color: #6b7280; }
    .body { min-width: 0; display: flex; flex-direction: column; gap: 12px; }
    .status { width: fit-content; padding: 6px 10px; border-radius: 999px; background: #fff7ed; color: #c2410c; font-size: 12px; font-weight: 900; }
    .status.approved { background: #ecfdf5; color: #047857; }
    .status.rejected { background: #fef2f2; color: #b91c1c; }
    .status.generating_script, .status.script_ready, .status.generating_audio, .status.audio_ready, .status.generating_cover, .status.cover_ready, .status.rendering_video { background: #eff6ff; color: #1d4ed8; }
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
    .event-timeline { border: 1px solid #e5e7eb; background: #f9fafb; border-radius: 8px; padding: 0; overflow: hidden; }
    .event-timeline summary { position: sticky; top: 0; z-index: 1; background: #f9fafb; padding: 10px 12px; }
    .event-timeline[open] ol { max-height: 160px; overflow-y: auto; padding-right: 8px; }
    .event-timeline summary { cursor: pointer; color: #374151; font-size: 13px; font-weight: 900; }
    .event-timeline ol { margin: 0; padding: 0 12px 10px 30px; display: grid; gap: 8px; }
    .event-timeline li { color: #4b5563; font-size: 12px; line-height: 1.45; }
    .event-timeline li div { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
    .event-timeline strong { color: #111827; font-weight: 900; }
    .event-timeline em { color: #6b7280; font-style: normal; font-weight: 800; }
    .event-timeline span { display: block; margin-top: 2px; word-break: break-word; }
    .recovery-card { border: 1px solid #fed7aa; background: #fff7ed; border-radius: 8px; padding: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .recovery-card strong { display: block; color: #9a3412; font-size: 13px; font-weight: 900; margin-bottom: 4px; }
    .recovery-card span { display: block; color: #7c2d12; font-size: 12px; font-weight: 800; line-height: 1.5; }
    .recovery-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; }
    form { margin: 0; }
    button { border: 0; border-radius: 6px; padding: 11px 18px; color: #fff; font-weight: 900; cursor: pointer; font-size: 15px; }
    .approve { background: #16a34a; }
    .reject { background: #dc2626; }
    .secondary { background: #4b5563; }
    .rerender { background: #2563eb; }
    .video-only { background: #7c3aed; }
    .recover { background: #ea580c; }
    .mark-failed { background: #b91c1c; }
    .publish { background: #111827; }
    .withdraw { background: #dc2626; }
    .reject-form { display: flex; gap: 8px; align-items: center; }
    select, input[name="extra_note"] { width: 150px; max-width: 44vw; border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; font-size: 14px; background: #fff; color: #111827; }
    input[name="extra_note"] { width: 220px; }
    button:disabled { opacity: .66; cursor: progress; }
    .none { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 42px; text-align: center; color: #4b5563; font-weight: 800; }
    @media (max-width: 760px) {
      .topline { align-items: flex-start; flex-direction: column; }
      .title-stack { align-items: flex-start; flex-direction: column; gap: 2px; }
      .workspace-title::after { content: ""; margin: 0; }
      .tab-summary { align-items: flex-start; flex-direction: column; }
      .tab-summary span { text-align: left; }
      .card { grid-template-columns: 1fr; }
      .media { max-height: 560px; }
      .actions, .reject-form, .recovery-card, .recovery-actions { flex-direction: column; align-items: stretch; }
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
  ${activeStatus === 'GENERATING' ? `<script>
    document.addEventListener('DOMContentLoaded', () => {
      const note = document.querySelector('#review-refresh-note');
      let seconds = 5;
      const render = () => {
        if (note) note.textContent = '自动刷新中，下次更新：' + seconds + ' 秒';
      };
      render();
      setInterval(() => {
        seconds -= 1;
        if (seconds <= 0) {
          window.location.reload();
          return;
        }
        render();
      }, 1000);
    });
  </script>` : ''}
</head>
<body>
  <header>
    <div class="head">
      <div class="topline">
        <div class="title-stack">
          <p class="workspace-title">内容生产台</p>
          <h1>视频审核中心</h1>
        </div>
        <nav class="module-nav" aria-label="主模块切换">
          <a class="module-link" href="/webhook/topic-center">选题中心</a>
          <a class="module-link active" href="/webhook/video-review-list">视频审核中心</a>
        </nav>
      </div>
      <nav class="tabs">
        ${tab('NEED_REVIEW', '待审核', counts.NEED_REVIEW)}
        ${tab('GENERATING', '生成中', counts.GENERATING)}
        ${tab('APPROVED', '已通过', counts.APPROVED)}
        ${tab('REJECTED', '已拒绝', counts.REJECTED)}
        ${tab('PUBLISHED', '已发布', counts.PUBLISHED)}
        ${tab('ALL', '全部', counts.ALL)}
      </nav>
      ${activeStatus === 'GENERATING' ? '<div id="review-refresh-note" class="refresh-note">自动刷新中，下次更新：5 秒</div>' : ''}
    </div>
  </header>
  <main>
    ${intro}
    ${rows.length ? cards : '<div class="none">当前分类没有视频</div>'}
  </main>
</body>
</html>`;

return [{json: {response_html: html}}];
