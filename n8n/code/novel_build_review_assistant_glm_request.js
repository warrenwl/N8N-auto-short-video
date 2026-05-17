// n8n Code node: Build Novel Review Assistant GLM Request
// Uses current chapter, Bible, outline, director card and facts for a read-only editing chat.

const fs = require('fs');

const source = $json || {};
const configPath = $env.NOVEL_GENERATION_CONFIG_PATH || '/config/novel_generation_config.jsonc';

const fallbackConfig = {
  model: 'glm-5.1',
  temperature: 0.52,
  max_tokens: 1800,
  max_tokens_by_prompt: {
    review_assistant: 1800,
  },
  thinking: {
    type: 'disabled',
  },
  prompt_version: 'novel-v1-20260504',
  system_prompts: {
    review_assistant: '你是一名商业网文审稿副驾驶、连续性编辑和剧情顾问。必须只输出严格 JSON。',
  },
};

function stripJsonComments(value) {
  return String(value || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readConfig() {
  try {
    if (!fs.existsSync(configPath)) return fallbackConfig;
    const data = JSON.parse(stripJsonComments(fs.readFileSync(configPath, 'utf8')));
    return {
      ...fallbackConfig,
      ...data,
      max_tokens_by_prompt: {
        ...fallbackConfig.max_tokens_by_prompt,
        ...(data.max_tokens_by_prompt || {}),
      },
      system_prompts: {
        ...fallbackConfig.system_prompts,
        ...(data.system_prompts || {}),
      },
    };
  } catch (error) {
    throw new Error(`读取小说生成配置失败：${configPath}；${error.message}`);
  }
}

function text(value) {
  return String(value ?? '').trim();
}

function toJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (error) {
    return fallback;
  }
}

function clip(value, limit) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value ?? '', null, 2);
  if (!limit || raw.length <= limit) return raw;
  return `${raw.slice(0, limit)}\n...（已截断）`;
}

function modeInstruction(mode) {
  if (mode === 'selection_advice') {
    return [
      '本轮重点是“选区局部建议”。',
      '只评价或建议当前选区，不要重写整章。',
      '如果建议可转为局部修订，suggested_actions 中给出 create_block_revision，并提供 instruction。',
    ].join('\n');
  }
  if (mode === 'design_reference') {
    return [
      '本轮重点是“参考设计”。',
      '给出桥段、冲突升级、伏笔触碰、节奏调整或下一步导演方案。',
      '方案必须尊重 Bible、大纲、导演台和连续性事实，不要把参考设计说成已经发生的事实。',
    ].join('\n');
  }
  return [
    '本轮重点是“剧情合理性/连续性”。',
    '检查人物动机、时间线、因果链、前后章承接、设定冲突和导演台执行偏差。',
    '结论要明确指出证据来源和风险等级。',
  ].join('\n');
}

function outputSchema() {
  return [
    '输出严格 JSON，顶层只能包含：',
    '{',
    '  "answer": "",',
    '  "findings": [{"type":"","severity":"low","description":"","evidence":""}],',
    '  "suggestions": [{"title":"","detail":"","priority":"medium"}],',
    '  "source_refs": [{"source_type":"chapter|bible|outline|director|fact|review|history","label":"","quote":"","confidence":0.8}],',
    '  "suggested_actions": [{"action_type":"create_block_revision|record_human_note|create_fact_draft|none","label":"","instruction":"","payload":{}}]',
    '}',
    '不要输出 Markdown，不要输出整章正文，不要自动批准、拒绝或直接应用修改。',
  ].join('\n');
}

const config = readConfig();
const mode = text(source.mode || 'continuity');
const question = text(source.question);
const selectedText = text(source.selected_text);
const systemPrompt = config.system_prompts?.review_assistant || fallbackConfig.system_prompts.review_assistant;
const maxTokens = source.max_tokens ?? (config.max_tokens_by_prompt || {}).review_assistant ?? config.max_tokens ?? 1800;
const startedAt = new Date().toISOString();

const context = {
  novel_bible: toJson(source.novel_bible, {}),
  outline_context: toJson(source.outline_context, {}),
  director_card: toJson(source.director_card, {}),
  continuity_facts: toJson(source.continuity_facts, []),
  previous_chapters: toJson(source.previous_chapters, []),
  future_outlines: toJson(source.future_outlines, []),
  review_report: toJson(source.review_report, {}),
  block_revisions: toJson(source.block_revisions, []),
  conversation_history: toJson(source.conversation_history, []),
};

const userPrompt = [
  '请作为小说审稿实时助手，回答当前审稿问题。',
  '',
  modeInstruction(mode),
  '',
  '【硬规则】',
  '1. 你只能给审稿建议、参考设计或可确认动作，不得直接改库、不得判定人工通过。',
  '2. 如果提出改正文，只能放进 suggested_actions.create_block_revision 的 instruction，由用户确认后走局部修订。',
  '3. 如果提出新事实，只能放进 suggested_actions.create_fact_draft，不得说已经写入事实库。',
  '4. 每个重要判断都要尽量给 source_refs；没有证据时明确写“证据不足”。',
  '5. 回答要短而可执行，优先指出下一步怎么改。',
  '',
  '【用户问题】',
  question,
  '',
  '【选区】',
  selectedText || '无',
  '',
  '【项目/章节】',
  `项目：${source.novel_title || '未使用项目标题'}`,
  `类型/读者/文风：${source.genre || '未设置'} / ${source.audience || '未设置'} / ${source.style || '未设置'}`,
  `章节：第 ${source.chapter_no || ''} 章 ${source.chapter_title || ''}`,
  `摘要：${source.chapter_summary || '未记录'}`,
  '',
  '【当前正文】',
  clip(source.chapter_body || '', 7000),
  '',
  '【Bible】',
  clip(context.novel_bible, 4500),
  '',
  '【本章大纲】',
  clip(context.outline_context, 2500),
  '',
  '【导演台】',
  clip(context.director_card, 4500),
  '',
  '【连续性事实】',
  clip(context.continuity_facts, 4500),
  '',
  '【前文正式摘要】',
  clip(context.previous_chapters, 2500),
  '',
  '【后续大纲】',
  clip(context.future_outlines, 2500),
  '',
  '【最近智能审稿】',
  clip(context.review_report, 3000),
  '',
  '【已有局部修订】',
  clip(context.block_revisions, 3000),
  '',
  '【本线程最近对话】',
  clip(context.conversation_history, 3000),
  '',
  outputSchema(),
].join('\n');

const messages = [
  {role: 'system', content: systemPrompt},
  {role: 'user', content: userPrompt},
];

return [{
  json: {
    ...source,
    run_type: 'REVIEW_ASSISTANT',
    prompt_key: `review_assistant_${mode}`,
    prompt_version: `${config.prompt_version || 'novel-v1'}-review-assistant`,
    prompt_config_path: configPath,
    prompt_messages_json: JSON.stringify(messages),
    ai_run_started_at: startedAt,
    llm_request_body: {
      model: source.model || config.model || 'glm-5.1',
      temperature: source.temperature ?? config.temperature ?? 0.52,
      max_tokens: maxTokens,
      thinking: config.thinking || {type: 'disabled'},
      response_format: {type: 'json_object'},
      messages,
    },
  },
}];
