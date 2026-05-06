// n8n Code node: Validate Novel Outline Manual Update
// Only accepts POST body fields from /webhook/novel-outline-update.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('编辑大纲必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('编辑大纲必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

function stripChapterTitlePrefix(value, fallback = '') {
  const raw = text(value);
  const fallbackText = text(fallback);
  if (!raw) return fallbackText;
  const cleaned = raw
    .replace(/^第\s*(?:[0-9０-９]+|[一二三四五六七八九十百千万零〇两]+|[Xx]+)\s*章\s*[：:、，,.．。-]?\s*/, '')
    .trim();
  return cleaned || fallbackText || raw;
}

function positiveInt(value, label) {
  const parsed = Number.parseInt(text(value), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} 必须是大于 0 的整数。`);
  }
  return parsed;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const projectId = text(body.project_id);
const outlineId = text(body.outline_id || body.id);
const reviewer = text(body.reviewer || 'local_user') || 'local_user';
const comment = text(body.comment || body.note);

if (!uuidPattern.test(projectId)) {
  throw new Error(`无效 project_id：${projectId || '(empty)'}`);
}

if (!uuidPattern.test(outlineId)) {
  throw new Error(`无效 outline_id：${outlineId || '(empty)'}`);
}

return [{
  json: {
    project_id: projectId,
    outline_id: outlineId,
    volume_no: positiveInt(body.volume_no || 1, '卷号'),
    title: stripChapterTitlePrefix(body.title),
    summary: text(body.summary),
    chapter_goal: text(body.chapter_goal),
    conflict_point: text(body.conflict_point),
    emotional_point: text(body.emotional_point),
    hook: text(body.hook),
    comment,
    reviewer,
    action: 'UPDATE_OUTLINE',
  },
}];
