// n8n Code node: Parse Topic Generate Response
// Parses GLM JSON and prepares a batch payload for Postgres.

function extractText(json) {
  if (!json || typeof json !== 'object') return '';
  if (json.choices?.[0]?.message?.content) return json.choices[0].message.content;
  if (json.llm_response?.choices?.[0]?.message?.content) return json.llm_response.choices[0].message.content;
  if (typeof json.output === 'string') return json.output;
  if (typeof json.text === 'string') return json.text;
  if (typeof json.response === 'string') return json.response;
  if (typeof json.message?.content === 'string') return json.message.content;
  return JSON.stringify(json);
}

function cleanJsonText(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return s;
}

function asTags(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[，,\s#]+/);
  return raw
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((tag) => tag.startsWith('#') ? tag : `#${tag}`);
}

function text(value) {
  return String(value || '').trim();
}

const request = $('代码 - 构建AI生成候选请求').first().json;
const response = $input.first().json;
const rawText = extractText(response);
const cleaned = cleanJsonText(rawText);

let parsed;
try {
  parsed = JSON.parse(cleaned);
} catch (error) {
  throw new Error(`GLM 选题输出不是合法 JSON：${error.message}\n原始输出：${rawText.slice(0, 1200)}`);
}

const candidatesSource = Array.isArray(parsed.candidates)
  ? parsed.candidates
  : Array.isArray(parsed.items)
    ? parsed.items
    : [];

const candidates = candidatesSource
  .map((candidate) => ({
    topic: text(candidate.topic || candidate.idea),
    title: text(candidate.title),
    angle: text(candidate.angle || candidate.reason),
    core_angle: text(candidate.core_angle || candidate.coreAngle || candidate.angle || candidate.reason),
    pain_point: text(candidate.pain_point || candidate.painPoint),
    promise: text(candidate.promise || candidate.value || candidate.takeaway),
    opening_hook: text(candidate.opening_hook || candidate.openingHook || candidate.hook),
    risk_note: text(candidate.risk_note || candidate.riskNote || '低风险'),
    score_reason: text(candidate.score_reason || candidate.scoreReason || candidate.reason),
    audience: text(candidate.audience || request.audience),
    category: text(candidate.category || request.category),
    tags: asTags(candidate.tags || candidate.hashtags),
    raw_candidate: candidate,
  }))
  .filter((candidate) => candidate.topic)
  .slice(0, Number(request.count || 10));

if (!candidates.length) {
  throw new Error(`GLM 没有返回可写入的候选选题。原始输出：${rawText.slice(0, 1200)}`);
}

const rawPayloadBase = {
  batch_id: request.batch_id,
  source: 'glm',
  generation_params: {
    count: request.count,
    platform: request.platform,
    account_key: request.account_key,
    direction: request.direction,
    category: request.category,
    audience: request.audience,
    tone: request.tone,
    content_structure: request.content_structure,
    style: request.style,
  },
  prompt_config_path: request.prompt_config_path,
  prompt_messages: JSON.parse(request.prompt_messages_json || '[]'),
  llm_response: response,
  parsed_at: new Date().toISOString(),
};

return [{
  json: {
    ...request,
    requested_count: Number(request.count || candidates.length),
    parsed_count: candidates.length,
    candidates_json: JSON.stringify(candidates),
    raw_payload_base_json: JSON.stringify(rawPayloadBase),
    llm_response_json: JSON.stringify(response),
  },
}];
