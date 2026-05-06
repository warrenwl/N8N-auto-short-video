// n8n Code node: Validate Novel Director Card Actions.
// Accepts POST body fields for manual save, regeneration, and chapter start.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('导演台操作必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('导演台操作必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

function normalizeAction(value) {
  const raw = text(value).toUpperCase();
  if (['UPDATE', 'SAVE', 'SAVE_CURRENT', 'DIRECTOR_CARD_UPDATE'].includes(raw)) return 'UPDATE_DIRECTOR_CARD';
  if (['REGENERATE', 'REGEN', 'DIRECTOR_CARD_REGENERATE', 'REGENERATE_DIRECTOR_CARD'].includes(raw)) return 'REGENERATE_DIRECTOR_CARD';
  if (['START_CHAPTER', 'GENERATE_CHAPTER', 'DIRECTOR_CARD_START_CHAPTER'].includes(raw)) return 'START_CHAPTER_FROM_DIRECTOR';
  throw new Error(`不支持的导演台操作：${raw || '(empty)'}`);
}

function uuid(value, fieldName, required = true) {
  const raw = text(value);
  if (!raw && !required) return '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    throw new Error(`无效 ${fieldName}：${raw || '(empty)'}`);
  }
  return raw;
}

function positiveInt(value, fieldName, required = true) {
  const raw = text(value);
  if (!raw && !required) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`无效 ${fieldName}：${raw || '(empty)'}`);
  }
  return parsed;
}

function parseJson(value, fieldName, required = false) {
  const raw = text(value);
  if (!raw && !required) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('必须是 JSON 对象');
    }
    return parsed;
  } catch (error) {
    throw new Error(`${fieldName} 不是合法 JSON：${error.message}`);
  }
}

const action = normalizeAction(body.action || body.director_action || body.card_action);
const projectId = uuid(body.project_id || body.id, 'project_id');
const directorCardId = uuid(body.director_card_id || body.card_id, 'director_card_id', action !== 'REGENERATE_DIRECTOR_CARD');
const chapterNo = positiveInt(body.chapter_no, 'chapter_no', action === 'REGENERATE_DIRECTOR_CARD');
const reviewer = text(body.reviewer || 'local_user') || 'local_user';
const comment = text(body.comment || body.note);
const cardPayload = action === 'UPDATE_DIRECTOR_CARD'
  ? parseJson(body.card_payload_json || body.card_payload || body.payload, '导演台 JSON', true)
  : {};

return [{
  json: {
    action,
    project_id: projectId,
    director_card_id: directorCardId,
    chapter_no: chapterNo,
    reviewer,
    comment,
    card_payload: cardPayload,
    card_payload_json: JSON.stringify(cardPayload),
  },
}];
