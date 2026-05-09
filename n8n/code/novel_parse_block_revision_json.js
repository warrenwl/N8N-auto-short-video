// n8n Code node: Parse Novel Block Revision JSON
// Extracts local revision output from an OpenAI-compatible response.

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

function cleanJsonText(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return s;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function text(value) {
  return String(value ?? '').trim();
}

function normalizeChecklist(value) {
  return asArray(value).map((item) => {
    if (typeof item === 'string') {
      return {
        requirement: item,
        fulfilled: true,
        evidence: '',
      };
    }
    if (!item || typeof item !== 'object') {
      return {
        requirement: String(item ?? ''),
        fulfilled: false,
        evidence: '',
      };
    }
    return {
      requirement: text(item.requirement || item.item || item.instruction || item.text),
      fulfilled: item.fulfilled === undefined ? true : Boolean(item.fulfilled),
      evidence: text(item.evidence || item.note || item.reason),
    };
  }).filter((item) => item.requirement);
}

const source = $json || {};
const rawText = extractText(source);
const finishedAt = new Date().toISOString();
const llmResponseJson = source.llm_response_json || JSON.stringify(source.llm_response || {});
let parsed;
try {
  parsed = JSON.parse(cleanJsonText(rawText));
} catch (error) {
  return [{
    json: {
      ...source,
      block_revision_parse_success: false,
      replacement_text: '',
      change_summary: '',
      instruction_checklist: [],
      instruction_checklist_json: '[]',
      affects_later_text: false,
      parsed_payload_json: '{}',
      llm_response_json: llmResponseJson,
      raw_text: rawText,
      error_message: `局部修订模型输出不是合法 JSON：${error.message}`,
      ai_run_finished_at: finishedAt,
    },
  }];
}

const replacementText = text(parsed.replacement_text);
if (!replacementText) {
  return [{
    json: {
      ...source,
      block_revision_parse_success: false,
      replacement_text: '',
      change_summary: text(parsed.change_summary),
      instruction_checklist: [],
      instruction_checklist_json: '[]',
      affects_later_text: false,
      parsed_payload: parsed,
      parsed_payload_json: JSON.stringify(parsed),
      llm_response_json: llmResponseJson,
      raw_text: rawText,
      error_message: '局部修订模型没有返回 replacement_text。',
      ai_run_finished_at: finishedAt,
    },
  }];
}

const instructionChecklist = normalizeChecklist(parsed.human_instruction_checklist);
const affectsLaterText = parsed.affects_later_text === true || parsed.affects_later_text === 'true';

return [{
  json: {
    ...source,
    block_revision_parse_success: true,
    replacement_text: replacementText,
    change_summary: text(parsed.change_summary),
    instruction_checklist: instructionChecklist,
    instruction_checklist_json: JSON.stringify(instructionChecklist),
    affects_later_text: affectsLaterText,
    parsed_payload: parsed,
    parsed_payload_json: JSON.stringify(parsed),
    llm_response_json: llmResponseJson,
    raw_text: rawText,
    ai_run_finished_at: finishedAt,
  },
}];
