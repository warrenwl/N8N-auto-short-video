// n8n Code node: Validate Novel Project Create
// Only accepts POST body fields from /webhook/novel-project-create.

const source = $json || {};

if (source.query && !source.body) {
  throw new Error('创建小说项目必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('创建小说项目必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

const title = text(body.title);
const genre = text(body.genre || '都市逆袭');
const audience = text(body.audience || '中文网文读者');
const style = text(body.style || '节奏快、冲突强、章末留钩子');
const premise = text(body.premise);
const targetTotalChapters = integer(body.target_total_chapters, 20, 1, 500);
const targetWordsPerChapter = integer(body.target_words_per_chapter, 2000, 300, 10000);

if (!title) {
  throw new Error('缺少小说标题 title。');
}

if (!genre) {
  throw new Error('缺少小说类型 genre。');
}

if (!premise) {
  throw new Error('缺少核心创意 premise。');
}

return [{
  json: {
    title,
    genre,
    audience,
    style,
    premise,
    target_total_chapters: targetTotalChapters,
    target_words_per_chapter: targetWordsPerChapter,
    received_at: new Date().toISOString(),
  },
}];
