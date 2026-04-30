// n8n Code node: Build Auto Recovery Alert
// Input: AUTO_RECOVERY_FAILED rows returned by sql/39_auto_recover_stalled_tasks.sql.

function env(name, fallback = '') {
  try {
    if (typeof $env !== 'undefined' && $env[name]) return $env[name];
  } catch (error) {}
  return fallback;
}

const serverchanSendKey = env('SERVERCHAN_SENDKEY', '').trim();
const serverchanUrl = serverchanSendKey
  ? `https://sctapi.ftqq.com/${serverchanSendKey}.send`
  : 'http://publish-helper:8010/serverchan-skip';
const reviewUrl = `${env('PUBLIC_N8N_BASE_URL', 'http://localhost:5678').replace(/\/$/, '')}/webhook/video-review-list?status=GENERATING`;

return $input.all().map((item) => {
  const row = item.json || {};
  const title = `自动恢复失败：${row.title || row.topic || row.id}`;
  const desp = [
    '# 自动恢复失败',
    '',
    `任务：${row.title || row.topic || row.id}`,
    '',
    `任务 ID：${row.id}`,
    '',
    `原状态：${row.old_status || ''}`,
    '',
    `当前状态：${row.new_status || row.status || 'FAILED'}`,
    '',
    `阶段：${row.stage || ''}`,
    '',
    `自动恢复次数：${row.auto_recovery_attempts ?? ''}`,
    '',
    `卡住时长：${row.stale_seconds ?? ''} 秒`,
    '',
    row.message || '自动恢复超过上限，请人工检查。',
    '',
    `[打开审核中心生成中 Tab](${reviewUrl})`,
  ].join('\n');

  return {
    json: {
      ...row,
      serverchan_url: serverchanUrl,
      serverchan_title: title,
      serverchan_desp: desp,
      serverchan_enabled: Boolean(serverchanSendKey),
    },
  };
});
