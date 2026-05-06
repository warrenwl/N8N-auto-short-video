// n8n Code node: Validate Novel Project Archive / Restore Action
// Only accepts POST body fields from /webhook/novel-project-archive-toggle.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('项目归档必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('项目归档必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

const projectId = text(body.project_id || body.id);
const rawAction = text(body.desired_action || body.action).toUpperCase();
const confirmTitle = text(body.confirm_title || body.title_confirm);
const comment = text(body.comment || body.note);
const reviewer = text(body.reviewer || 'local_user') || 'local_user';

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
  throw new Error(`无效 project_id：${projectId || '(empty)'}`);
}

let desiredAction = rawAction;
if (['ARCHIVE', 'DELETE', 'SOFT_DELETE'].includes(rawAction)) desiredAction = 'ARCHIVE';
if (['RESTORE', 'UNARCHIVE', 'RECOVER'].includes(rawAction)) desiredAction = 'RESTORE';

if (!['ARCHIVE', 'RESTORE'].includes(desiredAction)) {
  throw new Error('项目归档操作无效。');
}

if (desiredAction === 'ARCHIVE' && !confirmTitle) {
  throw new Error('归档项目时必须输入项目名确认。');
}

return [{
  json: {
    project_id: projectId,
    desired_action: desiredAction,
    confirm_title: confirmTitle,
    comment,
    reviewer,
    action: desiredAction === 'RESTORE' ? 'RESTORE_PROJECT' : 'ARCHIVE_PROJECT',
  },
}];
