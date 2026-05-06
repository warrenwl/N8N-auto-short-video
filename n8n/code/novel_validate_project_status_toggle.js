// n8n Code node: Validate Novel Project Pause/Resume
// Only accepts POST body fields from /webhook/novel-project-status-toggle.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('暂停或恢复项目必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('暂停或恢复项目必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const projectId = text(body.project_id || body.id);
const desiredAction = text(body.desired_action || body.action).toUpperCase();
const reviewer = text(body.reviewer || 'local_user') || 'local_user';
const comment = text(body.comment || body.note);

if (!uuidPattern.test(projectId)) {
  throw new Error(`无效 project_id：${projectId || '(empty)'}`);
}

if (!['PAUSE', 'RESUME'].includes(desiredAction)) {
  throw new Error('项目状态操作只能是暂停或恢复。');
}

return [{
  json: {
    project_id: projectId,
    desired_action: desiredAction,
    comment,
    reviewer,
    action: desiredAction === 'PAUSE' ? 'PAUSE_PROJECT' : 'RESUME_PROJECT',
  },
}];
