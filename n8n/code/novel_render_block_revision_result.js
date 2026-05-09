// n8n Code node: Render Novel Block Revision Result HTML
// Input comes from request/apply SQL functions for review block revisions.

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
const resultCode = row.result_code || (success ? 'UPDATED' : 'UNKNOWN');
const action = row.action || '';
const projectId = row.project_id || '';
const chapterId = row.chapter_id || '';
const revisionId = row.revision_id || '';
const chapterNo = row.chapter_no || '';
const reviewToken = row.review_token || row.token || '';
const color = success ? '#1f7a5c' : '#b42318';
const headline = success ? '局部修订操作成功' : '局部修订操作未完成';

const resultLabel = {
  BLOCK_REVISION_QUEUED: '局部修订已排队',
  BLOCK_REVISION_SUGGESTED: '局部建议已生成',
  BLOCK_REVISION_APPLIED: '局部修订已应用',
  BLOCK_REVISION_REJECTED: '局部建议已放弃',
  BLOCK_REVISION_REGENERATED: '局部修订已重新生成',
  BLOCK_REVISION_TO_REWRITE_QUEUED: '已转为整章重写',
  ANCHOR_NOT_FOUND: '锚点已失效',
  AMBIGUOUS_ANCHOR: '锚点不唯一',
  ACTIVE_BLOCK_REVISION_JOB_EXISTS: '已有局部修订在处理',
  NO_MATCH_OR_INVALID_STATE: '状态不允许执行',
  PROJECT_NOT_EDITABLE: '项目不可编辑',
  BLOCK_REVISION_NOT_SUGGESTED: '建议尚未生成',
  EMPTY_BLOCK_REVISION_REPLACEMENT: '替换文本为空',
  INVALID_BLOCK_REVISION_APPLY_ACTION: '确认动作无效',
  INVALID_BLOCK_REVISION_ACTION: '修订类型无效',
};

const actionLabel = {
  REQUEST_BLOCK_REVISION: '创建局部修订',
  APPLY_BLOCK_REVISION: '应用建议',
  APPLY_EDITED_BLOCK_REVISION: '修改后应用',
  REJECT_BLOCK_REVISION: '放弃建议',
  REGENERATE_BLOCK_REVISION: '重新生成',
  REQUEST_REWRITE: '转为整章重写意见',
};

const detailHref = chapterId && reviewToken
  ? `/webhook/novel-review-detail?chapter_id=${encodeURIComponent(chapterId)}&review_token=${encodeURIComponent(reviewToken)}`
  : '/webhook/novel-review-list';
const projectHref = projectId ? `/webhook/novel-project-detail?project_id=${encodeURIComponent(projectId)}` : '/webhook/novel-project-list';
const queueHref = projectId ? `/webhook/novel-queue-status?project_id=${encodeURIComponent(projectId)}` : '/webhook/novel-queue-status';
const primaryHref = success && resultCode === 'BLOCK_REVISION_TO_REWRITE_QUEUED' ? '/webhook/novel-review-list' : detailHref;
const primaryLabel = success && resultCode === 'BLOCK_REVISION_APPLIED'
  ? '继续局部修改'
  : success && resultCode === 'BLOCK_REVISION_TO_REWRITE_QUEUED'
    ? '返回审核列表'
    : '返回审核详情';

const rows = [
  ['操作', actionLabel[action] || action || '-'],
  ['结果', resultLabel[resultCode] || resultCode],
  ['说明', row.message || '操作结果已记录。'],
  ['章节序号', chapterNo || '-'],
  ['章节状态', row.chapter_status || '-'],
  ['任务类型', row.job_type || '-'],
  ['任务编号', row.job_id || '-'],
  ['修订编号', revisionId || '-'],
  ['章节编号', chapterId || '-'],
].map(([key, value]) => `
  <dt>${escapeHtml(key)}</dt>
  <dd>${escapeHtml(value || '-')}</dd>
`).join('');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(headline)}</title>
  <style>
    :root { --bg:#f6f7f9; --panel:#fff; --ink:#17202a; --muted:#667085; --line:#d9dee7; --accent:#1f7a5c; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
    main { width: min(840px, calc(100vw - 32px)); margin: 36px auto; }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 24px; }
    h1 { margin: 0 0 14px; font-size: 28px; }
    .result { margin: 0 0 18px; padding: 14px; border-radius: 8px; background: ${success ? '#edf8f3' : '#fff0ee'}; line-height: 1.7; }
    .result strong { display: block; color: ${color}; font-size: 18px; }
    .result p { margin: 4px 0 0; color: #344054; }
    dl { display: grid; grid-template-columns: 108px minmax(0, 1fr); gap: 10px 14px; line-height: 1.65; }
    dt { color: var(--muted); }
    dd { margin: 0; word-break: break-word; }
    .links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
    a { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--line); color: #344054; text-decoration: none; font-weight: 650; background: #fff; }
    a.primary { border-color: ${color}; background: ${color}; color: #fff; }
    @media (max-width: 640px) { dl { grid-template-columns: 1fr; } .links { flex-direction: column; } }
  </style>
</head>
<body>
  <main>
    <section>
      <h1>${escapeHtml(headline)}</h1>
      <div class="result">
        <strong>${escapeHtml(resultLabel[resultCode] || resultCode)}</strong>
        <p>${escapeHtml(row.message || '操作结果已记录。')}</p>
      </div>
      <dl>${rows}</dl>
      <div class="links">
        <a class="primary" href="${escapeHtml(primaryHref)}">${escapeHtml(primaryLabel)}</a>
        <a href="${escapeHtml(detailHref)}">审核详情</a>
        <a href="${escapeHtml(projectHref)}">返回项目</a>
        <a href="${escapeHtml(queueHref)}">查看队列</a>
        <a href="/webhook/novel-center">返回工作台</a>
      </div>
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
