// n8n Code node: Validate Novel Project Fact Action
// Only accepts POST body fields from /webhook/novel-project-fact-action.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('事实库操作必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('事实库操作必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

function normalizeAction(value) {
  const raw = text(value).toUpperCase();
  if (['CREATE', 'ADD', '新增', '新增事实'].includes(raw)) return 'CREATE';
  if (['UPDATE', 'EDIT', 'SAVE', '编辑', '保存'].includes(raw)) return 'UPDATE';
  if (['ACTIVATE', 'ACTIVE', '启用', '激活'].includes(raw)) return 'ACTIVATE';
  if (['DEACTIVATE', 'INACTIVE', 'DISABLE', '停用', '失效'].includes(raw)) return 'DEACTIVATE';
  if (['CLEAR_INACTIVE', 'CLEAN_INACTIVE', 'CLEAR', 'CLEAN', '清理失效事实', '清理'].includes(raw)) return 'CLEAR_INACTIVE';
  throw new Error('事实库操作只能是新增、编辑、激活、设为失效或清理失效事实。');
}

function positiveIntOrNull(value, label) {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} 必须是大于 0 的整数。`);
  }
  return parsed;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedFactTypes = new Set([
  'character',
  'item',
  'location',
  'ability',
  'relationship',
  'foreshadowing',
  'timeline',
  'rule',
  'other',
]);
const allowedStatuses = new Set(['ACTIVE', 'PENDING', 'INACTIVE']);

const projectId = text(body.project_id || body.id);
const factId = text(body.fact_id);
const factAction = normalizeAction(body.fact_action || body.action);
const factType = text(body.fact_type || 'other') || 'other';
const status = text(body.status).toUpperCase();
const reviewer = text(body.reviewer || 'local_user') || 'local_user';
const comment = text(body.comment || body.note);
const factValue = text(body.fact_value || body.value);

if (!uuidPattern.test(projectId)) {
  throw new Error(`无效 project_id：${projectId || '(empty)'}`);
}

if (!['CREATE', 'CLEAR_INACTIVE'].includes(factAction) && !uuidPattern.test(factId)) {
  throw new Error(`无效 fact_id：${factId || '(empty)'}`);
}

if (!allowedFactTypes.has(factType)) {
  throw new Error('事实类型无效。');
}

if (status && !allowedStatuses.has(status)) {
  throw new Error('事实状态只能是激活、待确认或失效。');
}

if ((factAction === 'CREATE' || factAction === 'UPDATE') && !factValue) {
  throw new Error('事实内容不能为空。');
}

return [{
  json: {
    project_id: projectId,
    fact_id: ['CREATE', 'CLEAR_INACTIVE'].includes(factAction) ? '' : factId,
    fact_action: factAction,
    fact_type: factType,
    fact_key: text(body.fact_key || body.key),
    fact_value: factValue,
    chapter_no: positiveIntOrNull(body.chapter_no, '章节号'),
    status,
    comment,
    reviewer,
    action: factAction === 'CLEAR_INACTIVE' ? 'CLEAR_INACTIVE_FACTS' : `${factAction}_FACT`,
  },
}];
