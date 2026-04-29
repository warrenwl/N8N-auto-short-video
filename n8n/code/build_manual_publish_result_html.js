// n8n Code node: Build Manual Publish Result HTML

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const inputItems = typeof items !== 'undefined' ? items : $input.all();

return inputItems.map(item => {
  const row = item.json || {};
  const success = row.success === true || row.success === 'true';
  if (!success) {
    const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>发布确认失败</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; background:#f6f7f9; margin:0; padding:28px; }
    .card { max-width:720px; margin:0 auto; background:white; border-radius:18px; padding:28px; box-shadow:0 8px 30px rgba(0,0,0,.08); }
    h1 { margin:0 0 16px; color:#dc2626; }
    .row { line-height:1.9; color:#333; }
  </style>
</head>
<body>
  <div class="card">
    <h1>发布确认失败</h1>
    <div class="row"><strong>结果：</strong>${escapeHtml(row.result_code || 'UNKNOWN')}</div>
    <div class="row">常见原因：链接已过期、任务不存在，或 token 不匹配。</div>
  </div>
</body>
</html>`;
    return { json: { response_status_code: 409, response_html: html } };
  }

  const isPublished = row.status === 'MANUAL_PUBLISHED';
  const title = isPublished ? '已标记为已发布' : '已标记为暂不发布';
  const color = isPublished ? '#16a34a' : '#f59e0b';

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; background:#f6f7f9; margin:0; padding:28px; }
    .card { max-width:720px; margin:0 auto; background:white; border-radius:18px; padding:28px; box-shadow:0 8px 30px rgba(0,0,0,.08); }
    h1 { margin:0 0 16px; color:${color}; }
    .row { line-height:1.9; color:#333; }
    .muted { color:#777; font-size:14px; margin-top:16px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(title)}</h1>
    <div class="row"><strong>发布任务 ID：</strong>${escapeHtml(row.id)}</div>
    <div class="row"><strong>视频任务 ID：</strong>${escapeHtml(row.video_topic_id)}</div>
    <div class="row"><strong>当前状态：</strong>${escapeHtml(row.status)}</div>
    <div class="row"><strong>标题：</strong>${escapeHtml(row.title)}</div>
    <div class="muted">你可以关闭这个页面，状态已回写到 PostgreSQL。</div>
  </div>
</body>
</html>`;

  return {
    json: {
      response_status_code: 200,
      response_html: html
    }
  };
});
