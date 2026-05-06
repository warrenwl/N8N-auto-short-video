// n8n Code node: Validate stale chapter cleanup.
// Only accepts POST body fields from /webhook/novel-stale-chapters-cleanup.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('过期历史章节清理必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('过期历史章节清理必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const projectId = text(body.project_id || body.id);
const cleanupAction = text(body.cleanup_action || body.action || 'CLEAR_STALE_CHAPTERS').toUpperCase();

if (!uuidPattern.test(projectId)) {
  throw new Error(`无效 project_id：${projectId || '(empty)'}`);
}

if (!['CLEAR_STALE_CHAPTERS', 'CLEAR_STALE', 'CLEAN_STALE_CHAPTERS', '清理过期历史章节'].includes(cleanupAction)) {
  throw new Error('过期历史章节清理操作无效。');
}

return [{
  json: {
    project_id: projectId,
    cleanup_action: 'CLEAR_STALE_CHAPTERS',
    comment: text(body.comment || body.note),
    reviewer: text(body.reviewer || 'local_user') || 'local_user',
    action: 'CLEAR_STALE_CHAPTERS',
  },
}];
