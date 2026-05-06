// n8n Code node: Validate Novel Chapter Manual Edit
// Only accepts POST body fields from /webhook/novel-chapter-manual-edit.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('正文编辑必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('正文编辑必须通过 POST body 提交。');
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

const chapterId = text(body.chapter_id || body.id);
const reviewToken = text(body.review_token || body.token);
const title = stripChapterTitlePrefix(body.title || body.chapter_title);
const summary = text(body.summary || body.chapter_summary);
const chapterBody = text(body.body || body.chapter_body);
const comment = text(body.comment || body.note);
const reviewer = text(body.reviewer || 'local_user') || 'local_user';
const rawEditMode = text(body.edit_mode || body.save_mode || body.mode).toLowerCase();
const editMode = ['direct', 'direct_save', 'save', 'in_place'].includes(rawEditMode)
  ? 'DIRECT_SAVE'
  : 'CANDIDATE_REVIEW';

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chapterId)) {
  throw new Error(`无效 chapter_id：${chapterId || '(empty)'}`);
}

if (!reviewToken) {
  throw new Error('缺少 review_token，拒绝保存正文。');
}

if (!chapterBody) {
  throw new Error('正文不能为空。');
}

return [{
  json: {
    chapter_id: chapterId,
    review_token: reviewToken,
    title,
    summary,
    body: chapterBody,
    comment,
    reviewer,
    edit_mode: editMode,
    action: 'MANUAL_EDIT_CHAPTER',
  },
}];
