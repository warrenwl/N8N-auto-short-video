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
const sourceDocumentName = text(body.source_document_name || body.source_file_name);
const sourceDocumentType = text(body.source_document_type || body.source_file_type);
const sourceDocumentSize = integer(body.source_document_size, 0, 0, 20 * 1024 * 1024);
const sourceDocumentRaw = text(body.source_document_text || body.source_text || body.uploaded_text);
const sourceDocumentText = sourceDocumentRaw.slice(0, 80000);
const sourceDocumentCharCount = Array.from(sourceDocumentRaw).length;
const targetTotalChapters = integer(body.target_total_chapters, 20, 1, 500);
const targetWordsPerChapter = integer(body.target_words_per_chapter, 2000, 300, 10000);
const inferredTitle = sourceDocumentName
  ? sourceDocumentName.replace(/\.(txt|md|markdown)$/i, '').trim()
  : '';
const finalTitle = title || inferredTitle;

if (!finalTitle) {
  throw new Error('缺少小说标题 title。上传文档创建时，也需要标题或可识别的文件名。');
}

if (!genre) {
  throw new Error('缺少小说类型 genre。');
}

if (!premise && !sourceDocumentText) {
  throw new Error('缺少核心创意 premise；或上传 txt/md 文档内容。');
}

if (sourceDocumentRaw && sourceDocumentCharCount < 120) {
  throw new Error('上传文档内容过短，至少需要 120 个字符用于识别。');
}

return [{
  json: {
    title: finalTitle,
    genre,
    audience,
    style,
    premise: premise || `根据上传文档《${sourceDocumentName || finalTitle}》识别故事内容并生成创作母本。`,
    source_document_text: sourceDocumentText,
    source_document_name: sourceDocumentName,
    source_document_type: sourceDocumentType,
    source_document_size: sourceDocumentSize,
    source_document_char_count: sourceDocumentCharCount,
    source_document_truncated: sourceDocumentRaw.length > sourceDocumentText.length,
    create_mode: sourceDocumentText ? 'UPLOAD_SOURCE_DOCUMENT' : 'MANUAL_BRIEF',
    target_total_chapters: targetTotalChapters,
    target_words_per_chapter: targetWordsPerChapter,
    received_at: new Date().toISOString(),
  },
}];
