// n8n Code node: Validate Topic Create Params
// Expected query/form params:
// ?topic=...&title=...&angle=...&audience=...&category=...&tags=...

const source = $json || {};
const query = source.query || source.params || source.body || source;

function text(name, fallback = '') {
  return String(query[name] ?? fallback).trim();
}

function normalizeTags(value) {
  return String(value || '')
    .split(/[，,\s#]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((tag) => tag.startsWith('#') ? tag : `#${tag}`);
}

const topic = text('topic');

const payload = {
  source: text('source', 'manual') || 'manual',
  source_ref: text('source_ref'),
  topic,
  title: text('title'),
  angle: text('angle'),
  audience: text('audience', '普通短视频用户') || '普通短视频用户',
  platform: text('platform', 'douyin') || 'douyin',
  account_key: text('account_key', 'mes') || 'mes',
  category: text('category'),
  tags: normalizeTags(text('tags')),
  received_at: new Date().toISOString(),
};

return [{
  json: {
    ...payload,
    tags_json: JSON.stringify(payload.tags),
    raw_payload_json: JSON.stringify(payload),
  },
}];
