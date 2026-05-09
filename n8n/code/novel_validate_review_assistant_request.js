// n8n Code node: Validate Novel Review Assistant Request
// Accepts POST body fields from /webhook/novel-review-assistant.

const source = $json || {};

if (source.query && !source.body) {
  throw new Error('审稿助手必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('审稿助手必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function optionalUuid(value) {
  const raw = text(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) ? raw : '';
}

function positiveIntOrEmpty(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : '';
}

function offsetOrEmpty(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : '';
}

function normalizeMode(value) {
  const raw = text(value).toLowerCase();
  if (['continuity', '剧情连续性', '连续性', 'logic', 'plot_logic'].includes(raw)) return 'continuity';
  if (['selection_advice', 'selection', '局部建议', '选区建议', 'polish'].includes(raw)) return 'selection_advice';
  if (['design_reference', 'design', '灵感参考', '参考设计', 'idea'].includes(raw)) return 'design_reference';
  throw new Error(`审稿助手模式无效：${raw || '(empty)'}`);
}

const chapterId = text(body.chapter_id || body.id);
const reviewToken = text(body.review_token || body.token);
const threadId = optionalUuid(body.thread_id);
const mode = normalizeMode(body.mode || body.assistant_mode || 'continuity');
const question = text(body.question || body.prompt || body.message);
const selectedText = text(body.selected_text || body.selection || body.original_text);
const reviewer = text(body.reviewer || 'local_user') || 'local_user';

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chapterId)) {
  throw new Error(`无效 chapter_id：${chapterId || '(empty)'}`);
}

if (!reviewToken) {
  throw new Error('缺少 review_token，拒绝调用审稿助手。');
}

if (!question) {
  throw new Error('请先填写要问审稿助手的问题。');
}

if (question.length > 1200) {
  throw new Error('审稿助手问题过长，请压缩到 1200 字以内。');
}

if (selectedText.length > 3000) {
  throw new Error('选区过长，请缩小到 3000 字以内。');
}

return [{
  json: {
    chapter_id: chapterId,
    review_token: reviewToken,
    thread_id: threadId,
    mode,
    question,
    selected_text: selectedText,
    paragraph_start: positiveIntOrEmpty(body.paragraph_start || body.paragraph_no || body.paragraph),
    paragraph_end: positiveIntOrEmpty(body.paragraph_end || body.paragraph_no || body.paragraph),
    selection_start_offset: offsetOrEmpty(body.selection_start_offset || body.start_offset),
    selection_end_offset: offsetOrEmpty(body.selection_end_offset || body.end_offset),
    anchor_prefix: text(body.anchor_prefix || body.selection_prefix),
    anchor_suffix: text(body.anchor_suffix || body.selection_suffix),
    reviewer,
    action: 'REVIEW_ASSISTANT',
  },
}];
