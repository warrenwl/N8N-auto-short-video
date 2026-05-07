// n8n Code node: Parse Novel Project AI Assist GLM Response
// Returns browser-friendly JSON for the create-page AI helper buttons.

function extractText(json) {
  if (!json || typeof json !== 'object') return '';
  if (json.llm_response?.choices?.[0]?.message?.content) return json.llm_response.choices[0].message.content;
  if (json.choices?.[0]?.message?.content) return json.choices[0].message.content;
  if (typeof json.output === 'string') return json.output;
  if (typeof json.text === 'string') return json.text;
  if (typeof json.response === 'string') return json.response;
  if (typeof json.message?.content === 'string') return json.message.content;
  return JSON.stringify(json);
}

function cleanJsonText(value) {
  let text = String(value || '').trim();
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return text;
}

function text(value) {
  return String(value ?? '').trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function cleanTitle(value) {
  return text(value)
    .replace(/[《》「」『』“”"']/g, '')
    .replace(/^书名[:：]\s*/i, '')
    .replace(/^小说标题[:：]\s*/i, '')
    .replace(/^第\s*(?:[0-9０-９]+|[一二三四五六七八九十百千万零〇两]+)\s*章\s*[：:、，,.．。-]?\s*/, '')
    .trim()
    .slice(0, 20);
}

function cleanPremise(value) {
  return text(value).replace(/\s+/g, ' ').slice(0, 600);
}

const response = $input.first().json || $json || {};
const rawText = extractText(response);
const cleaned = cleanJsonText(rawText);

let parsed;
try {
  parsed = JSON.parse(cleaned);
} catch (error) {
  throw new Error(`创建页 AI 助手 GLM 输出不是合法 JSON：${error.message}`);
}

const alternatives = asArray(parsed.alternatives || parsed.titles || parsed.title_options)
  .map(cleanTitle)
  .filter(Boolean)
  .slice(0, 4);
const title = cleanTitle(parsed.title || parsed.book_title || parsed.project_title || alternatives[0] || response.title);
const premise = cleanPremise(parsed.premise || parsed.core_idea || parsed.idea || parsed.story_core || response.premise);

if (!title && !premise) {
  throw new Error('创建页 AI 助手没有返回可用标题或创意。');
}

const payload = {
  ok: true,
  assist_type: response.assist_type || 'idea',
  title,
  premise,
  alternatives,
  rationale: text(parsed.rationale || parsed.reason || ''),
  message: text(parsed.message || 'GLM 已生成'),
  model: response.llm_request_body?.model || response.model || '',
};

return [{
  json: {
    ...response,
    ai_run_finished_at: new Date().toISOString(),
    parsed_payload: payload,
    parsed_payload_json: JSON.stringify(payload),
    response_status_code: 200,
    response_json: JSON.stringify(payload),
  },
}];
