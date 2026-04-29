// n8n Code node: Build Review Result HTML
// Input comes from Postgres UPDATE query result.

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
const status = row.status || 'UNKNOWN';
const title = row.title || '';
const id = row.id || '';
const reviewedAt = row.reviewed_at || '';
const note = row.review_note || '';

const statusMeta = {
  APPROVED: {label: '已通过', color: '#16a34a', tab: 'APPROVED'},
  REJECTED: {label: '已拒绝', color: '#dc2626', tab: 'REJECTED'},
  NEED_REVIEW: {label: '待审核', color: '#d97706', tab: 'NEED_REVIEW'},
  SCRIPT_READY: {label: '等待重新渲染', color: '#2563eb', tab: 'ALL'},
};
const meta = statusMeta[status] || {label: status, color: '#4b5563', tab: 'ALL'};

const headline = success ? '审核操作成功' : '审核操作未生效';
const statusText = success ? `当前状态：${meta.label}` : `结果：${resultCode}`;
const color = success ? meta.color : '#dc2626';

const helpText = success
  ? '你可以关闭这个页面，或返回审核中心查看最新状态。'
  : '常见原因：任务不存在、token 不匹配，或当前状态不允许执行这个动作。';

const primaryTab = success ? meta.tab : 'NEED_REVIEW';
const actionLinks = `
  <div class="links">
    <a class="primary" href="/webhook/video-review-list?status=${escapeHtml(primaryTab)}">返回对应列表</a>
    <a href="/webhook/video-review-list?status=NEED_REVIEW">查看待审核</a>
    <a href="/webhook/video-review-list?status=APPROVED">查看已通过</a>
    <a href="/webhook/video-review-list?status=REJECTED">查看已拒绝</a>
  </div>
`;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(headline)}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", Arial, sans-serif; background: #f6f7f9; color: #111827; }
    .wrap { max-width: 760px; margin: 48px auto; padding: 0 20px; }
    .card { background: #fff; border-radius: 18px; padding: 32px; box-shadow: 0 12px 32px rgba(15, 23, 42, .08); }
    h1 { margin: 0 0 18px; font-size: 30px; }
    .badge { display: inline-block; background: ${color}; color: #fff; padding: 8px 14px; border-radius: 999px; font-weight: 700; margin-bottom: 22px; }
    .grid { display: grid; grid-template-columns: 120px 1fr; gap: 12px 18px; line-height: 1.7; }
    .key { color: #6b7280; }
    .value { word-break: break-word; }
    .tip { margin-top: 24px; padding: 16px; background: #f9fafb; border-radius: 12px; color: #374151; }
    .links { margin-top: 24px; display: flex; flex-wrap: wrap; gap: 10px; }
    a { display: inline-flex; align-items: center; justify-content: center; min-height: 42px; padding: 0 16px; border-radius: 8px; border: 1px solid #d1d5db; color: #374151; text-decoration: none; font-weight: 900; background: #fff; }
    a.primary { border-color: ${color}; background: ${color}; color: #fff; }
    @media (max-width: 640px) {
      .grid { grid-template-columns: 1fr; }
      .links { flex-direction: column; }
      a { width: 100%; box-sizing: border-box; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${escapeHtml(headline)}</h1>
      <div class="badge">${escapeHtml(statusText)}</div>
      <div class="grid">
        <div class="key">任务 ID</div><div class="value">${escapeHtml(id)}</div>
        <div class="key">标题</div><div class="value">${escapeHtml(title)}</div>
        <div class="key">结果代码</div><div class="value">${escapeHtml(resultCode)}</div>
        <div class="key">审核时间</div><div class="value">${escapeHtml(reviewedAt)}</div>
        <div class="key">审核备注</div><div class="value">${escapeHtml(note)}</div>
      </div>
      <div class="tip">${escapeHtml(helpText)}</div>
      ${actionLinks}
    </div>
  </div>
</body>
</html>`;

return [{ json: { ...row, response_html: html, response_status_code: success ? 200 : 409 } }];
