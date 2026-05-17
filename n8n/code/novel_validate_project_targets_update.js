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

function optionalProjectTitle(value) {
  const normalized = text(value).replace(/\s+/g, ' ');
  if (!normalized) return '';
  if (normalized.length > 80) {
    throw new Error('项目标题不能超过 80 个字符。');
  }
  return normalized;
}

function checkboxBoolean(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return ['1', 'true', 'on', 'yes', 'y', 'enabled', '启用', '是'].includes(raw);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const projectId = text(body.project_id || body.id);
const reviewer = text(body.reviewer || 'local_user') || 'local_user';
const comment = text(body.comment || body.note);
const projectTitle = optionalProjectTitle(body.title || body.project_title);
const titleInPrompt = checkboxBoolean(body.title_in_prompt);
const expansionRequest = text(body.expansion_request || body.expansion_plan || body.plot_expansion_request);
const expansionConstraints = text(body.expansion_constraints || body.keep_constraints);

function normalizeExpansionScope(value) {
  const raw = text(value || 'append_only');
  const mapped = {
    append_only: 'append_only',
    append: 'append_only',
    only_append: 'append_only',
    '只追加新章节': 'append_only',
    rewrite_unwritten: 'rewrite_unwritten',
    unwritten: 'rewrite_unwritten',
    '重排未写章节': 'rewrite_unwritten',
    regenerate_outline: 'regenerate_outline',
    full_outline: 'regenerate_outline',
    '高风险重排全部大纲': 'regenerate_outline',
  }[raw];
  if (!mapped) {
    throw new Error('扩写范围无效。');
  }
  return mapped;
}

if (!uuidPattern.test(projectId)) {
  throw new Error(`无效 project_id：${projectId || '(empty)'}`);
}

return [{
  json: {
    project_id: projectId,
    target_total_chapters: positiveInt(body.target_total_chapters, '目标章节数'),
    target_words_per_chapter: positiveInt(body.target_words_per_chapter || 2000, '每章目标字数'),
    title: projectTitle,
    title_in_prompt: titleInPrompt,
    expansion_request: expansionRequest,
    expansion_scope: normalizeExpansionScope(body.expansion_scope),
    expansion_constraints: expansionConstraints,
    comment,
    reviewer,
    action: 'UPDATE_PROJECT_TARGET',
  },
}];
