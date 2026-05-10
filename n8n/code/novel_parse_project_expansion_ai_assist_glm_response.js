// n8n Code node: Parse Novel Project Expansion AI Assist GLM Response
// Returns browser-friendly JSON for the project expansion AI helper button.

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

function cleanText(value, limit) {
  const normalized = text(value).replace(/\s+/g, ' ');
  if (!limit || normalized.length <= limit) return normalized;
  return normalized.slice(0, limit);
}

const response = $input.first().json || $json || {};
const rawText = extractText(response);
const cleaned = cleanJsonText(rawText);

let parsed;
try {
  parsed = JSON.parse(cleaned);
} catch (error) {
  throw new Error(`扩写剧情 AI 创意输出不是合法 JSON：${error.message}`);
}

const beatDesign = asArray(parsed.beat_design || parsed.beats || parsed.plot_beats)
  .filter((item) => item !== undefined && item !== null)
  .slice(0, 8);
const settingAdditions = asArray(parsed.setting_additions || parsed.settings || parsed.new_settings)
  .filter((item) => item !== undefined && item !== null)
  .slice(0, 8);
const riskNotes = asArray(parsed.risk_notes || parsed.risks)
  .filter((item) => item !== undefined && item !== null)
  .slice(0, 8);

let expansionRequest = cleanText(parsed.expansion_request || parsed.request || parsed.plan || parsed.summary, 1400);
if (!expansionRequest && beatDesign.length) {
  expansionRequest = cleanText(beatDesign.map((item) => {
    if (typeof item === 'string') return item;
    return [item.chapter_range, item.purpose, item.conflict, item.hook].filter(Boolean).join('：');
  }).join('；'), 1400);
}

if (!expansionRequest) {
  throw new Error('扩写剧情 AI 创意没有返回可用设计。');
}

const payload = {
  ok: true,
  expansion_request: expansionRequest,
  beat_design: beatDesign,
  setting_additions: settingAdditions,
  risk_notes: riskNotes,
  message: cleanText(parsed.message || '已生成后续剧情设计，可继续微调后保存。', 80),
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
