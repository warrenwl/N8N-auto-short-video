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

function normalizeStep(value) {
  const raw = text(value).toUpperCase();
  if (['BIBLE', 'GENERATE_BIBLE', '设定集'].includes(raw)) return 'GENERATE_BIBLE';
  if (['OUTLINE', 'GENERATE_OUTLINE', '大纲'].includes(raw)) return 'GENERATE_OUTLINE';
  if (['DIRECTOR', 'DIRECTOR_CARD', 'PLAN_CHAPTER_DIRECTOR', '导演台', '导演卡'].includes(raw)) return 'PLAN_CHAPTER_DIRECTOR';
  if (['CHAPTER', 'GENERATE_CHAPTER', '章节', '正文'].includes(raw)) return 'GENERATE_CHAPTER';
  throw new Error(`不支持的生成步骤：${raw || '(empty)'}`);
}

const projectId = text(body.project_id || body.id);
const requestedStep = normalizeStep(body.step || body.requested_step || body.job_type);

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
  throw new Error(`无效 project_id：${projectId || '(empty)'}`);
}

return [{
  json: {
    project_id: projectId,
    requested_step: requestedStep,
  },
}];
