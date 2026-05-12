// n8n Code node: Validate front-end generation step action.
// Only accepts POST body fields from one-click project generation forms.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('前端生成必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('前端生成必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

function bool(value) {
  const raw = text(value).toLowerCase();
  return ['1', 'true', 'yes', 'on', 'regenerate', '重新生成', '重生成'].includes(raw);
}

function normalizeStep(value) {
  const raw = text(value).toUpperCase();
  if (['TREATMENT', 'STORY_TREATMENT', 'GENERATE_STORY_TREATMENT', '创作母本', '母本'].includes(raw)) return 'GENERATE_STORY_TREATMENT';
  if (['BIBLE', 'GENERATE_BIBLE', '设定集'].includes(raw)) return 'GENERATE_BIBLE';
  if (['BIBLE_PATCH', 'GENERATE_BIBLE_PATCH', '设定集补丁', '扩写设定补丁'].includes(raw)) return 'GENERATE_BIBLE_PATCH';
  if (['OUTLINE', 'GENERATE_OUTLINE', '大纲'].includes(raw)) return 'GENERATE_OUTLINE';
  if (['DIRECTOR', 'DIRECTOR_CARD', 'PLAN_CHAPTER_DIRECTOR', '导演台', '导演卡'].includes(raw)) return 'PLAN_CHAPTER_DIRECTOR';
  if (['CHAPTER', 'GENERATE_CHAPTER', '章节', '正文'].includes(raw)) return 'GENERATE_CHAPTER';
  throw new Error(`不支持的生成步骤：${raw || '(empty)'}`);
}

const projectId = text(body.project_id || body.id);
const requestedStep = normalizeStep(body.step || body.requested_step || body.job_type);
const regenerateExisting = bool(body.regenerate_existing || body.force_regenerate);
const regeneratePrompt = text(body.regenerate_prompt || body.premise || body.prompt_override || body.story_prompt);
const comment = text(body.comment || body.note);
const reviewer = text(body.reviewer || 'local_user') || 'local_user';

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
  throw new Error(`无效 project_id：${projectId || '(empty)'}`);
}

return [{
  json: {
    project_id: projectId,
    requested_step: requestedStep,
    regenerate_existing: regenerateExisting,
    regenerate_prompt: regeneratePrompt,
    comment,
    reviewer,
  },
}];
