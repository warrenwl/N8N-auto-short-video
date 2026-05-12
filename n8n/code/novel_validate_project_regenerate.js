// n8n Code node: Validate Novel Project Regenerate Action
// Only accepts POST body fields from /webhook/novel-project-regenerate.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('重新生成必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('重新生成必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

function normalizeStep(value) {
  const raw = text(value).toUpperCase();
  if (['TREATMENT', 'STORY_TREATMENT', 'GENERATE_STORY_TREATMENT', '创作母本', '母本'].includes(raw)) return 'TREATMENT';
  if (['BIBLE', 'GENERATE_BIBLE', '设定集'].includes(raw)) return 'BIBLE';
  if (['OUTLINE', 'GENERATE_OUTLINE', '大纲'].includes(raw)) return 'OUTLINE';
  throw new Error(`不支持的重新生成类型：${text(value) || '(empty)'}`);
}

const projectId = text(body.project_id || body.id);
const step = normalizeStep(body.step || body.regenerate_step);
const legacyComment = text(body.comment || body.note);
const regeneratePrompt = text(body.regenerate_prompt || body.premise || body.prompt_override || body.story_prompt);
const effectiveRegeneratePrompt = step === 'BIBLE'
  ? (regeneratePrompt || legacyComment)
  : (step === 'TREATMENT' ? regeneratePrompt : '');
const comment = legacyComment || (effectiveRegeneratePrompt
  ? (step === 'TREATMENT' ? '以新的母本要求重新生成创作母本。' : '以新的核心创意重新生成设定集。')
  : '');
const reviewer = text(body.reviewer || 'local_user') || 'local_user';

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
  throw new Error(`无效 project_id：${projectId || '(empty)'}`);
}

return [{
  json: {
    project_id: projectId,
    step,
    comment,
    regenerate_prompt: effectiveRegeneratePrompt,
    reviewer,
    action: step === 'TREATMENT'
      ? 'REGENERATE_STORY_TREATMENT'
      : (step === 'BIBLE' ? 'REGENERATE_BIBLE' : 'REGENERATE_OUTLINE'),
  },
}];
