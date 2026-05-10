// n8n Code node: Validate Novel Bible Patch Action
// Applies, rejects, or regenerates a pending expansion Bible patch through POST only.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('设定集补丁操作必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('设定集补丁操作必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

function normalizeAction(value) {
  const raw = text(value).toUpperCase();
  if (['APPLY', 'APPROVE', '应用', '确认', '合并'].includes(raw)) return 'APPLY';
  if (['REJECT', '拒绝', '废弃'].includes(raw)) return 'REJECT';
  if (['REGENERATE', 'REGEN', '重新生成', '重生成'].includes(raw)) return 'REGENERATE';
  throw new Error(`不支持的设定集补丁操作：${raw || '(empty)'}`);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const patchId = text(body.patch_id || body.bible_patch_id || body.id);
if (!uuidPattern.test(patchId)) {
  throw new Error(`无效 bible_patch_id：${patchId || '(empty)'}`);
}

return [{
  json: {
    patch_id: patchId,
    patch_action: normalizeAction(body.patch_action || body.action),
    comment: text(body.comment || body.note),
    reviewer: text(body.reviewer || 'local_user') || 'local_user',
  },
}];
