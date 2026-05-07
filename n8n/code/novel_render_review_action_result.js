// n8n Code node: Render Novel Review Action Result HTML
// Input comes from apply_novel_review_action(...).

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const row = $json || {};
const success = row.success === true || row.success === 'true';
const action = row.action || '';
const resultCode = row.result_code || (success ? 'UPDATED' : 'UNKNOWN');
const chapterId = row.chapter_id || '';
const projectId = row.project_id || '';
const chapterNo = row.chapter_no || '';
const chapterStatus = row.chapter_status || '';
const projectStatus = row.project_status || '';
const nextJobId = row.next_job_id || '';
const rewriteJobId = row.rewrite_job_id || '';
const activatedFactCount = Number(row.activated_fact_count || 0);
const inactivatedFactCount = Number(row.inactivated_fact_count || 0);

const actionLabel = {
  APPROVE: '通过',
  REQUEST_REWRITE: '要求重写',
  REJECT: '拒绝',
}[action] || action || '未知动作';

const headline = success ? '小说审核操作成功' : '小说审核操作未生效';
const statusText = success
  ? `${actionLabel}已记录`
  : `结果：${resultCode}`;
const color = success ? '#1f7a5c' : '#b42318';
const helpText = success
  ? (action === 'APPROVE'
    ? '这一章已经成为正式版本。下一步通常是回项目确认续写状态，或继续处理下一条待审。'
    : action === 'REQUEST_REWRITE'
      ? '重写要求已经记录，后台重写任务会立即启动。你可以去队列查看进度，或回项目查看章节上下文。'
      : nextJobId
        ? `这一稿已拒绝，系统已为第 ${chapterNo || ''} 章排好继续重写任务。回项目后首屏会显示“继续重写第 ${chapterNo || ''} 章”。`
        : `这一稿已拒绝。回项目后可以继续重写第 ${chapterNo || ''} 章，不会跳过本章。`)
  : '常见原因：章节不存在、review_token 不匹配，或当前章节状态不允许执行该动作。';
const projectHref = projectId ? `/webhook/novel-project-detail?project_id=${encodeURIComponent(projectId)}` : '/webhook/novel-project-list';
const chapterHref = projectId ? `/webhook/novel-project-detail?project_id=${encodeURIComponent(projectId)}&view=chapters${chapterNo ? `#chapter-${encodeURIComponent(chapterNo)}` : '#written-section'}` : '/webhook/novel-project-list';
const queueHref = projectId ? `/webhook/novel-queue-status?project_id=${encodeURIComponent(projectId)}` : '/webhook/novel-queue-status';
const primaryLabel = success && action === 'REJECT' ? '返回项目继续重写' : (success ? '继续审核下一章' : '返回审核中心');

const rows = [
  ['动作', actionLabel],
  ['结果代码', resultCode],
  ['章节 ID', chapterId],
  ['项目 ID', projectId],
  ['章节序号', chapterNo],
  ['章节状态', chapterStatus],
  ['项目状态', projectStatus],
  ['下一章任务', nextJobId],
  ['重写任务', rewriteJobId],
  ['激活事实', activatedFactCount],
  ['失效事实', inactivatedFactCount],
].map(([key, value]) => `
  <div class="key">${escapeHtml(key)}</div>
  <div class="value">${escapeHtml(value || '-')}</div>
`).join('');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(headline)}</title>
  <style>
    :root { --bg:#f6f7f9; --panel:#fff; --ink:#17202a; --muted:#667085; --line:#d9dee7; --accent:#1f7a5c; --accent-soft:#edf8f3; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
    main { width: min(840px, calc(100vw - 32px)); margin: 36px auto; }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 24px; }
    .page-context { position: sticky; top: 0; z-index: 70; margin: -24px -24px 18px; padding: 18px 24px 14px; background: rgba(246, 247, 249, .97); border-bottom: 1px solid rgba(216, 222, 232, .92); backdrop-filter: blur(10px); }
    h1 { margin: 0 0 16px; font-size: 28px; }
    h2 { margin: 0 0 10px; font-size: 18px; }
    .badge { display: inline-block; margin-bottom: 20px; padding: 8px 12px; border-radius: 8px; background: ${color}; color: #fff; font-weight: 700; }
    .grid { display: grid; grid-template-columns: 108px minmax(0, 1fr); gap: 10px 14px; line-height: 1.65; }
    .key { color: var(--muted); }
    .value { word-break: break-word; }
    .tip { margin-top: 16px; padding: 14px; border-radius: 8px; background: ${success ? 'var(--accent-soft)' : '#fff0ee'}; color: #344054; line-height: 1.7; }
    .links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
    a { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--line); color: #344054; text-decoration: none; font-weight: 650; background: #fff; }
    a.primary { border-color: ${color}; background: ${color}; color: #fff; }
    details { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 14px; }
    summary { cursor: pointer; color: var(--accent); font-weight: 750; }
    @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } .links { flex-direction: column; } }
  </style>
</head>
<body>
  <main>
    <section>
      <div class="page-context">
      <h1>${escapeHtml(headline)}</h1>
      <h2>结果 + 下一步 + 返回上下文</h2>
      </div>
      <div class="badge">${escapeHtml(statusText)}</div>
      <div class="tip">${escapeHtml(helpText)}</div>
      <div class="links">
        <a class="primary" href="${escapeHtml(action === 'REJECT' && success ? projectHref : '/webhook/novel-review-list')}">${escapeHtml(primaryLabel)}</a>
        <a href="${escapeHtml(projectHref)}">返回项目</a>
        <a href="${escapeHtml(chapterHref)}">返回章节</a>
        <a href="${escapeHtml(queueHref)}">查看队列</a>
        <a href="/webhook/novel-center">返回工作台</a>
      </div>
      <details>
        <summary>查看写入明细</summary>
        <div class="grid">${rows}</div>
      </details>
    </section>
  </main>
</body>
</html>`;

return [{
  json: {
    ...row,
    response_html: html,
    response_status_code: success ? 200 : 409,
  },
}];
