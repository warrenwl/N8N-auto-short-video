// n8n Code node: Parse Novel Review Assistant GLM Response
// Converts model output into a browser JSON payload. Parse failures become ok:false payloads.

const source = $input.first().json || $json || {};

function extractText(value) {
  if (!value || typeof value !== 'object') return '';
  if (value.llm_response?.choices?.[0]?.message?.content) return value.llm_response.choices[0].message.content;
  if (value.choices?.[0]?.message?.content) return value.choices[0].message.content;
  if (typeof value.output === 'string') return value.output;
  if (typeof value.text === 'string') return value.text;
  if (typeof value.response === 'string') return value.response;
  if (typeof value.message?.content === 'string') return value.message.content;
  return JSON.stringify(value.llm_response || value);
}

function cleanJsonText(value) {
  let text = String(value || '').trim();
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return text;
}

function text(value, limit = 0) {
  const raw = String(value ?? '').trim();
  return limit && raw.length > limit ? raw.slice(0, limit) : raw;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function cleanObjectArray(value, normalizer, limit) {
  return asArray(value)
    .map((item) => normalizer(item && typeof item === 'object' ? item : {description: item}))
    .filter((item) => Object.values(item).some((field) => field !== '' && field !== null && field !== undefined))
    .slice(0, limit);
}

function normalizeFinding(item) {
  const severity = text(item.severity || 'medium').toLowerCase();
  return {
    type: text(item.type || item.category || 'review'),
    severity: ['low', 'medium', 'high'].includes(severity) ? severity : 'medium',
    description: text(item.description || item.detail || item.value, 500),
    evidence: text(item.evidence || item.reason || '', 500),
  };
}

function normalizeSuggestion(item) {
  return {
    title: text(item.title || item.label || '建议', 80),
    detail: text(item.detail || item.description || item.value, 700),
    priority: text(item.priority || 'medium', 20) || 'medium',
  };
}

function normalizeSourceRef(item) {
  const sourceType = text(item.source_type || item.type || 'chapter').toLowerCase();
  return {
    source_type: ['chapter', 'bible', 'outline', 'director', 'fact', 'review', 'history'].includes(sourceType) ? sourceType : 'chapter',
    label: text(item.label || item.title || '', 80),
    quote: text(item.quote || item.evidence || item.value || '', 260),
    confidence: Number.isFinite(Number(item.confidence)) ? Math.max(0, Math.min(1, Number(item.confidence))) : 0.7,
  };
}

function normalizeAction(item) {
  const raw = text(item.action_type || item.type || item.action || 'none').toLowerCase();
  const mapped = {
    block_revision: 'create_block_revision',
    revise_selection: 'create_block_revision',
    human_note: 'record_human_note',
    fact: 'create_fact_draft',
  }[raw] || raw;
  const actionType = ['create_block_revision', 'record_human_note', 'create_fact_draft', 'none'].includes(mapped) ? mapped : 'none';
  return {
    action_type: actionType,
    label: text(item.label || item.title || {
      create_block_revision: '转为局部修订',
      record_human_note: '记录为人工意见',
      create_fact_draft: '复制事实建议',
      none: '无需动作',
    }[actionType], 80),
    instruction: text(item.instruction || item.detail || item.description || '', 800),
    payload: item.payload && typeof item.payload === 'object' ? item.payload : {},
  };
}

function failurePayload(errorMessage) {
  return {
    ok: false,
    thread_id: source.thread_id || '',
    mode: source.mode || 'continuity',
    answer: errorMessage,
    findings: [],
    suggestions: [],
    source_refs: [],
    suggested_actions: [],
  };
}

const rawText = extractText(source);
const cleaned = cleanJsonText(rawText);

let parsed;
let parseError = '';
try {
  parsed = JSON.parse(cleaned);
} catch (error) {
  parseError = `审稿助手 GLM 输出不是合法 JSON：${error.message}`;
}

const payload = parseError
  ? failurePayload(parseError)
  : {
    ok: true,
    thread_id: source.thread_id || '',
    mode: source.mode || 'continuity',
    answer: text(parsed.answer || parsed.summary || parsed.message || '', 1200) || '审稿助手没有返回文字回答。',
    findings: cleanObjectArray(parsed.findings || parsed.issues || [], normalizeFinding, 8),
    suggestions: cleanObjectArray(parsed.suggestions || parsed.advice || [], normalizeSuggestion, 8),
    source_refs: cleanObjectArray(parsed.source_refs || parsed.sources || [], normalizeSourceRef, 8),
    suggested_actions: cleanObjectArray(parsed.suggested_actions || parsed.actions || [], normalizeAction, 5),
  };

const success = payload.ok === true;
const responsePayload = source.llm_response || (parseError ? {raw_text: rawText} : parsed);
const finishedAt = new Date().toISOString();

return [{
  json: {
    ...source,
    ai_run_finished_at: finishedAt,
    assistant_success: success,
    error_message: success ? '' : (source.error_message || parseError || '审稿助手调用失败'),
    llm_response_json: JSON.stringify(responsePayload || {}),
    parsed_payload: payload,
    parsed_payload_json: JSON.stringify(payload),
    response_status_code: success ? 200 : 502,
    response_json: JSON.stringify(payload),
  },
}];
