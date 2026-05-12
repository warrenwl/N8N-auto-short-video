// n8n Code node: Render front-end generation step start HTML.
// Used by browser POST actions that claim a project-level generation job.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const stepLabel = {
  GENERATE_STORY_TREATMENT: '创作母本',
  GENERATE_BIBLE: '设定集',
  GENERATE_BIBLE_PATCH: '扩写设定补丁',
  GENERATE_OUTLINE: '大纲',
  PLAN_CHAPTER_DIRECTOR: '导演台规划',
  GENERATE_CHAPTER: '章节正文',
};

function label(map, value, fallback) {
  if (!value) return fallback;
  return map[value] || fallback;
}

function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }
  return {};
}

const row = $json || {};
const projectId = row.project_id || row.id || '';
const jobType = row.job_type || row.requested_step || '';
const claimSuccess = row.claim_success !== false && row.claim_success !== 'false';
const isBible = jobType === 'GENERATE_BIBLE';
const isTreatment = jobType === 'GENERATE_STORY_TREATMENT';
const isBiblePatch = jobType === 'GENERATE_BIBLE_PATCH';
const isOutline = jobType === 'GENERATE_OUTLINE';
const isDirector = jobType === 'PLAN_CHAPTER_DIRECTOR';
const isChapter = jobType === 'GENERATE_CHAPTER';
const payload = parseObject(row.payload);
const isRejectedRetry = isDirector && payload.trigger_source === 'chapter_rejected_retry';
const stepName = isRejectedRetry ? '继续重写章节' : label(stepLabel, jobType, '当前步骤');
const chapterNo = row.chapter_no ? `第 ${row.chapter_no} 章` : '当前章节';
const claimReasonLabel = {
  JOB_NOT_FOUND_OR_ALREADY_CLAIMED: '没有可立即执行的待处理任务。它可能已经被后台队列领取、已经完成，或当前项目状态不允许执行。',
  PROJECT_PAUSED: '项目已暂停，当前不会领取生成任务。',
  PROJECT_ARCHIVED: '项目已归档，当前不会领取生成任务。',
  RUNNING_JOB_BLOCKED: '项目仍有任务正在运行，暂不启动新的生成任务。',
  REGENERATE_JOB_ALREADY_EXISTS: '已有待处理的重生成任务，请回项目控制台再次启动或查看队列。',
};
const title = claimSuccess
  ? (isTreatment ? '创作母本生成已启动' : (isBible ? '设定集生成已启动' : (isBiblePatch ? '扩写设定补丁生成已启动' : (isOutline ? '大纲生成已启动' : (isDirector ? (isRejectedRetry ? `${chapterNo}继续重写已启动` : `${chapterNo}导演台已启动`) : (isChapter ? `${chapterNo}生成已启动` : '生成任务已启动'))))))
  : '未开始模型调用';
const summary = claimSuccess
  ? (isTreatment
    ? '创作母本任务已领取，模型会先生成主题内核、读者承诺、悬念栈、真相阶梯和情绪弧线；完成后会自动创建设定集生成任务。'
    : (isBible
    ? '设定集任务已领取，模型调用会继续在 n8n 后台执行。页面会自动跳到队列状态；完成后可回项目控制台查看设定内容。'
    : (isBiblePatch
      ? '扩写设定补丁任务已领取，模型会根据扩写计划、当前设定集、已批准正文和事实库生成待确认补丁。完成后回项目控制台确认应用。'
    : (isOutline
      ? '大纲任务已领取，模型调用会继续在 n8n 后台执行。页面会自动跳到队列状态；完成后可回项目控制台查看目录。'
      : (isDirector
        ? (isRejectedRetry
          ? `${chapterNo}继续重写任务已领取，模型调用会继续在 n8n 后台执行。系统会先完成导演台规划，通过质量闸门后再自动排队正文生成。`
          : `${chapterNo}导演台规划任务已领取，模型调用会继续在 n8n 后台执行。通过质量闸门后会自动排队正文生成；如需调整，项目页会显示导演台卡片。`)
        : (isChapter
        ? `${chapterNo}生成任务已领取，模型调用会继续在 n8n 后台执行。页面会自动跳到队列状态；生成候选稿后会进入智能审稿队列，审稿完成后再到审核中心处理。`
        : '当前生成步骤已交给后台执行。'))))))
  : (claimReasonLabel[row.claim_reason] || claimReasonLabel.JOB_NOT_FOUND_OR_ALREADY_CLAIMED);
const detailHref = projectId
  ? `/webhook/novel-project-detail?project_id=${encodeURIComponent(projectId)}`
  : '/webhook/novel-project-list';
const queueHref = projectId
  ? `/webhook/novel-queue-status?project_id=${encodeURIComponent(projectId)}`
  : '/webhook/novel-queue-status';

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#f6f7f9" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; --bg:#f6f7f9; --panel:#fff; --ink:#182230; --muted:#667085; --line:#d8dee8; --accent:#1f7a5c; --accent-soft:#edf8f3; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-tap-highlight-color: rgba(31, 122, 92, .14); }
    main { width: min(900px, calc(100vw - 32px)); margin: 24px auto 48px; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: end; margin-bottom: 18px; }
    .page-context { position: sticky; top: 0; z-index: 70; margin-bottom: 18px; padding: 14px 0 12px; background: rgba(246, 247, 249, .97); border-bottom: 1px solid rgba(216, 222, 232, .92); backdrop-filter: blur(10px); }
    .page-context header { margin-bottom: 0; }
    h1 { margin: 0; font-size: 28px; text-wrap: balance; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    p { line-height: 1.7; }
    .muted { color: var(--muted); margin: 6px 0 0; }
    a { color: var(--accent); text-decoration: none; font-weight: 650; }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 18px; overflow: hidden; }
    .result { padding: 18px; border-color: ${claimSuccess ? '#b9e3d4' : '#f1ce96'}; background: ${claimSuccess ? 'var(--accent-soft)' : '#fff7e8'}; }
    .detail { padding: 16px; }
    dl { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 10px 12px; margin: 0; }
    dt { color: var(--muted); }
    dd { margin: 0; min-width: 0; word-break: break-word; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; padding: 16px; border-top: 1px solid var(--line); }
    .button { min-height: 42px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 14px; background: #fff; color: var(--accent); text-decoration: none; font: inherit; font-weight: 750; touch-action: manipulation; cursor: pointer; }
    .button.primary { color: #fff; background: var(--accent); border-color: var(--accent); }
    .button:hover { border-color: var(--accent); background: var(--accent-soft); }
    .button.primary:hover { background: #19664e; }
    .run-note { padding: 14px 16px; border-top: 1px solid var(--line); color: var(--muted); line-height: 1.7; }
    button:disabled { opacity: .65; cursor: progress; }
    a:focus-visible, button:focus-visible { outline: 3px solid #8fd4bd; outline-offset: 2px; }
    @media (max-width: 720px) {
      main { width: min(100% - 24px, 720px); margin-top: 16px; }
      header { display: block; }
      nav { margin-top: 12px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
      dl { grid-template-columns: 1fr; }
      .actions { display: grid; }
      .inline-form { display: grid; }
    }
  </style>
</head>
<body>
  <main>
    <div class="page-context">
    <header>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p class="muted">${escapeHtml(stepName)}</p>
      </div>
    </header>
    </div>

    <section class="result" aria-live="polite">
      <h2>结果 + 下一步 + 返回上下文</h2>
      <p>${escapeHtml(summary)}</p>
    </section>

    <section>
      <div class="detail">
        <dl>
          <dt>生成内容</dt><dd>${escapeHtml(stepName)}</dd>
          <dt>执行方式</dt><dd>${escapeHtml(claimSuccess ? '后台执行中' : '未调用模型')}</dd>
          <dt>项目编号</dt><dd translate="no">${escapeHtml(projectId || '未记录')}</dd>
        </dl>
      </div>
      <div class="actions">
        <a class="button primary" href="${escapeHtml(claimSuccess ? queueHref : detailHref)}">${escapeHtml(claimSuccess ? '查看队列' : '返回项目控制台')}</a>
        <a class="button" href="${escapeHtml(claimSuccess ? detailHref : queueHref)}">${escapeHtml(claimSuccess ? '返回项目控制台' : '查看队列')}</a>
        <a class="button" href="/webhook/novel-project-list">项目列表</a>
      </div>
      <div class="run-note">${escapeHtml(claimSuccess ? '响应已先返回；后台模型调用仍在工作流继续执行。队列页会展示运行中、成功或失败。' : '这次提交没有触发模型调用。请回到项目控制台或队列页确认任务是否已经被领取、完成、暂停或归档。')}</div>
    </section>
  </main>
  <script>
    (() => {
      ${claimSuccess ? `window.setTimeout(() => { window.location.href = '${escapeHtml(queueHref)}'; }, 1800);` : ''}
    })();
  </script>
</body>
</html>`;

return [{json: {...row, response_html: html, response_status_code: 200}}];
