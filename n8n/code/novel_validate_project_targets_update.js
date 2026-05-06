// n8n Code node: Validate Novel Project Target Update
// Only accepts POST body fields from /webhook/novel-project-targets-update.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('修改项目目标必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('修改项目目标必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

function positiveInt(value, label) {
  const parsed = Number.parseInt(text(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} 必须是大于 0 的整数。`);
  }
  return parsed;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const projectId = text(body.project_id || body.id);
const reviewer = text(body.reviewer || 'local_user') || 'local_user';
const comment = text(body.comment || body.note);

if (!uuidPattern.test(projectId)) {
  throw new Error(`无效 project_id：${projectId || '(empty)'}`);
}

return [{
  json: {
    project_id: projectId,
    target_total_chapters: positiveInt(body.target_total_chapters, '目标章节数'),
    target_words_per_chapter: positiveInt(body.target_words_per_chapter || 2000, '每章目标字数'),
    comment,
    reviewer,
    action: 'UPDATE_PROJECT_TARGET',
  },
}];
