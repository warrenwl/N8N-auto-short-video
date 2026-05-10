// n8n Code node: Validate archived novel projects cleanup.
// Only accepts POST body fields from /webhook/novel-archived-projects-cleanup.

const source = $json || {};

if (source.query && !source.body) {
  throw new Error('清理已归档项目必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('清理已归档项目必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

const cleanupAction = text(body.cleanup_action || body.action || 'CLEAR_ARCHIVED_PROJECTS').toUpperCase();
const allowedActions = [
  'CLEAR_ARCHIVED_PROJECTS',
  'CLEAR_ARCHIVED',
  'DELETE_ARCHIVED_PROJECTS',
  'CLEAN_ARCHIVED_PROJECTS',
  '清理已归档项目',
];

if (!allowedActions.includes(cleanupAction)) {
  throw new Error('清理已归档项目操作无效。');
}

return [{
  json: {
    cleanup_action: 'CLEAR_ARCHIVED_PROJECTS',
    comment: text(body.comment || body.note),
    reviewer: text(body.reviewer || 'local_user') || 'local_user',
    action: 'CLEAR_ARCHIVED_PROJECTS',
  },
}];
