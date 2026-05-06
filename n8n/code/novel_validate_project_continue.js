// n8n Code node: Validate Novel Project Continue Action
// Only accepts POST body fields from /webhook/novel-project-continue.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('继续写作必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('继续写作必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

const projectId = text(body.project_id || body.id);
const comment = text(body.comment || body.note);
const reviewer = text(body.reviewer || 'local_user') || 'local_user';

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
  throw new Error(`无效 project_id：${projectId || '(empty)'}`);
}

return [{
  json: {
    project_id: projectId,
    comment,
    reviewer,
    action: 'CONTINUE_PROJECT',
  },
}];
