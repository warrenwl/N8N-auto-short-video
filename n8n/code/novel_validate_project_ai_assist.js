// n8n Code node: Validate Novel Project AI Assist
// Accepts POST body fields from /webhook/novel-project-ai-assist.

const source = $json || {};

if (source.query && !source.body) {
  throw new Error('小说创建页 AI 助手必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('小说创建页 AI 助手必须通过 POST body 提交。');
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

function bool(value) {
  return ['1', 'true', 'yes', 'on'].includes(text(value).toLowerCase());
}

function normalizeAssistType(value) {
  const raw = text(value).toLowerCase();
  if (['title', 'ai_title', '标题'].includes(raw)) return 'title';
  if (['idea', 'premise', 'ai_idea', '创意'].includes(raw)) return 'idea';
  throw new Error('AI 助手类型无效，只能生成标题或创意。');
}

const assistType = normalizeAssistType(body.assist_type || body.type || body.action);
const title = text(body.title);
const premise = text(body.premise);
const previousAiTitle = text(body.previous_ai_title);
const previousAiPremise = text(body.previous_ai_premise);
const genre = text(body.genre || '都市逆袭');
const audience = text(body.audience || '中文网文读者');
const style = text(body.style || '节奏快、冲突强、章末留钩子');
const targetTotalChapters = integer(body.target_total_chapters, 20, 1, 500);
const targetWordsPerChapter = integer(body.target_words_per_chapter, 2000, 300, 10000);
const assistNonce = text(body.assist_nonce || body.request_id || `${Date.now()}`);

if (!genre) {
  throw new Error('缺少小说类型 genre。');
}

return [{
  json: {
    assist_type: assistType,
    assist_nonce: assistNonce.slice(0, 120),
    title,
    premise,
    previous_ai_title: previousAiTitle,
    previous_ai_premise: previousAiPremise.slice(0, 800),
    title_is_ai_generated: bool(body.title_is_ai_generated),
    premise_is_ai_generated: bool(body.premise_is_ai_generated),
    genre,
    audience,
    style,
    target_total_chapters: targetTotalChapters,
    target_words_per_chapter: targetWordsPerChapter,
    requested_at: new Date().toISOString(),
  },
}];
