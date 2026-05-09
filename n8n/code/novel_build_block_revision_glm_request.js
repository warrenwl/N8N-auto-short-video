// n8n Code node: Build Novel Block Revision GLM Request
// Reads /config/novel_generation_config.jsonc and asks the model for a local replacement only.

const fs = require('fs');

const source = $json || {};
const configPath = $env.NOVEL_GENERATION_CONFIG_PATH || '/config/novel_generation_config.jsonc';

const fallbackConfig = {
  model: 'glm-5.1',
  temperature: 0.55,
  max_tokens: 2200,
  max_tokens_by_prompt: {
    block_revision: 2200,
  },
  thinking: {
    type: 'disabled',
  },
  prompt_version: 'novel-v1-20260504',
  defaults: {
    genre: '都市逆袭',
    audience: '男频爽文读者',
    style: '节奏快、冲突强、章末留钩子',
    target_words_per_chapter: 2000,
  },
  system_prompts: {
    block_revision: '你是一名商业网文局部改稿编辑。必须只输出严格 JSON。',
  },
};

function stripJsonComments(text) {
  return String(text || '')
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
      defaults: {
        ...fallbackConfig.defaults,
        ...(data.defaults || {}),
      },
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

function stringifyForPrompt(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function text(value) {
  return String(value ?? '').trim();
}

const actionLabel = {
  modify: '定向修改',
  expand: '扩写',
  condense: '压缩',
  polish: '润色',
  continue: '续写',
  logic_fix: '逻辑修补',
  custom: '自定义',
};

const rangeLockLabel = {
  selection_only: '只改选中内容',
  adjacent_one: '允许连带前后一小句',
  flag_later: '允许标记影响后文',
};

const config = readConfig();
const defaults = config.defaults || {};
const startedAt = new Date().toISOString();
const runType = 'REVISE_CHAPTER_BLOCK';
const promptKey = 'block_revision';
const maxTokens = source.max_tokens ?? (config.max_tokens_by_prompt || {})[promptKey] ?? config.max_tokens ?? 2200;
const selectedText = text(source.selected_text);
const instruction = text(source.instruction);
const systemPrompt = config.system_prompts?.block_revision || fallbackConfig.system_prompts.block_revision;

const userPrompt = [
  '请对小说待审稿的一个局部片段给出修订建议。',
  '',
  '【硬规则】',
  '1. 只输出局部结果，禁止输出整章正文。',
  '2. replacement_text 只能是用于替换或插入的文本，不要包含解释、Markdown、JSON 外壳以外的内容。',
  '3. action_type 为 continue 时，replacement_text 是插入到选中原文之后的新内容；其他类型默认替换选中原文。',
  '4. 不要改变未选中部分的事实、角色称呼和事件顺序。',
  '5. 如果人工要求会牵动后文连续性，请把 affects_later_text 设为 true，并在 change_summary 中说明风险。',
  '6. 必须落实人工要求；human_instruction_checklist 用数组逐条说明是否落实。',
  '7. 必须只输出严格 JSON，字段只能是 replacement_text、change_summary、human_instruction_checklist、affects_later_text。',
  '',
  '【输出 JSON Schema】',
  '{',
  '  "replacement_text": "",',
  '  "change_summary": "",',
  '  "human_instruction_checklist": [],',
  '  "affects_later_text": false',
  '}',
  '',
  '【项目约束】',
  `类型：${source.genre || defaults.genre || '未设置'}`,
  `目标读者：${source.audience || defaults.audience || '未设置'}`,
  `文风：${source.style || defaults.style || '未设置'}`,
  `目标章字数：${source.target_words_per_chapter || defaults.target_words_per_chapter || '未设置'}`,
  '',
  '【章节信息】',
  `项目：${source.novel_title || source.project_title || '未命名项目'}`,
  `章节：第 ${source.chapter_no || ''} 章 ${source.chapter_title || ''}`,
  `处理方式：${actionLabel[source.action_type] || source.action_type || '定向修改'}`,
  `修改范围锁：${rangeLockLabel[source.range_lock] || source.range_lock || '只改选中内容'}`,
  `段落范围：P${source.paragraph_start || '?'}${source.paragraph_end && source.paragraph_end !== source.paragraph_start ? `-P${source.paragraph_end}` : ''}`,
  '',
  '【选中原文】',
  selectedText,
  '',
  '【前文上下文】',
  text(source.before_context) || '无',
  '',
  '【后文上下文】',
  text(source.after_context) || '无',
  '',
  '【人工要求】',
  instruction,
  '',
  '【Bible / 关键设定】',
  stringifyForPrompt(source.novel_bible || source.bible),
  '',
  '【导演台】',
  stringifyForPrompt(source.director_card || source.director_card_payload || source.card_payload),
  '',
  '【关键事实】',
  stringifyForPrompt(source.continuity_facts || source.facts),
].join('\n');

const messages = [
  {role: 'system', content: systemPrompt},
  {role: 'user', content: userPrompt},
];

return [{
  json: {
    ...source,
    run_type: runType,
    prompt_key: promptKey,
    prompt_version: `${config.prompt_version || 'novel-v1'}-block-revision`,
    prompt_config_path: configPath,
    prompt_messages_json: JSON.stringify(messages),
    ai_run_started_at: startedAt,
    llm_request_body: {
      model: source.model || config.model || 'glm-5.1',
      temperature: source.temperature ?? config.temperature ?? 0.55,
      max_tokens: maxTokens,
      thinking: config.thinking || {type: 'disabled'},
      response_format: {type: 'json_object'},
      messages,
    },
  },
}];
