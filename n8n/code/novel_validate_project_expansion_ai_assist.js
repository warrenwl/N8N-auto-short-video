// n8n Code node: Validate Novel Project Expansion AI Assist
// Accepts POST body fields from /webhook/novel-project-expansion-ai-assist.

const source = $json || {};

if (source.query && !source.body) {
  throw new Error('扩写剧情 AI 创意必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('扩写剧情 AI 创意必须通过 POST body 提交。');
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

function normalizeExpansionScope(value) {
  const raw = text(value).toLowerCase();
  if (['append_only', 'append', 'only_append', '只追加新章节'].includes(raw)) return 'append_only';
  if (['rewrite_unwritten', 'unwritten', '重排未写章节'].includes(raw)) return 'rewrite_unwritten';
  if (['regenerate_outline', 'full', 'all', '高风险重排全部大纲'].includes(raw)) return 'regenerate_outline';
  return 'append_only';
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const projectId = text(body.project_id || body.id);

if (!uuidPattern.test(projectId)) {
  throw new Error(`无效 project_id：${projectId || '(empty)'}`);
}

const expansionRequest = text(body.expansion_request || body.user_request || body.prompt);
const expansionConstraints = text(body.expansion_constraints || '已批准正文不改；已激活事实不破坏；新增剧情必须承接现有大纲和人物动机。');

return [{
  json: {
    project_id: projectId,
    expansion_request: expansionRequest.slice(0, 2400),
    expansion_scope: normalizeExpansionScope(body.expansion_scope),
    expansion_constraints: expansionConstraints.slice(0, 1600),
    target_total_chapters: integer(body.target_total_chapters, 20, 1, 500),
    target_words_per_chapter: integer(body.target_words_per_chapter, 2000, 300, 10000),
    assist_nonce: text(body.assist_nonce || body.request_id || `${Date.now()}`).slice(0, 120),
    requested_at: new Date().toISOString(),
  },
}];
