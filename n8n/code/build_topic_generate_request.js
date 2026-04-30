// n8n Code node: Build Topic Generate Request
// Reads /config/topic_idea_config.jsonc and builds a GLM request for M5 candidate generation.

const fs = require('fs');

const source = $json || {};
const query = source.query || source.params || source.body || source;
const configPath = $env.TOPIC_IDEA_CONFIG_PATH || '/config/topic_idea_config.jsonc';

const fallbackConfig = {
  model: 'glm-5.1',
  temperature: 0.82,
  max_tokens: 8000,
  defaults: {
    count: 1,
    platform: 'douyin',
    account_key: 'mes',
    direction: '认知偏差',
    category: '认知成长',
    audience: '30岁左右有焦虑感的普通上班族',
    tone: '理性克制',
    content_structure: '反常识观点',
    style: '理性克制',
  },
  blocked_topics: ['医疗诊断', '投资荐股', '夸大收益', '贩卖焦虑'],
  system_prompt: '你是一个短视频选题策划助手。必须只输出严格 JSON。',
  user_prompt_template: '请生成 {{count}} 条候选选题。一级分类：{{category}}。二级选题方向：{{direction}}。目标受众：{{audience}}。表达语气：{{tone}}。内容结构：{{content_structure}}。要求：选题必须具体，有明确痛点、反差或误区，避免鸡汤和标题党。输出 JSON：{"candidates":[{"topic":"","title":"","angle":"","core_angle":"","pain_point":"","promise":"","opening_hook":"","risk_note":"","score_reason":"","audience":"","category":"","tags":[]}]}',
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
    };
  } catch (error) {
    throw new Error(`读取选题生成配置失败：${configPath}；${error.message}`);
  }
}

function text(name, fallback = '') {
  return String(query[name] ?? fallback).trim();
}

function clampCount(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 20);
}

function renderTemplate(template, values) {
  return String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const value = values[key];
    return value === undefined || value === null || value === '' ? '' : String(value);
  });
}

const config = readConfig();
const defaults = config.defaults || {};
const count = clampCount(text('count', defaults.count), Number(defaults.count || 1));
const batchId = `glm-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(16).slice(2, 8)}`;
const tone = text('tone', defaults.tone || defaults.style || '理性克制') || '理性克制';
const contentStructure = text('content_structure', defaults.content_structure || '反常识观点') || '反常识观点';
const explicitStyle = text('style', '');
const style = explicitStyle || `${tone} / ${contentStructure}`;

const params = {
  batch_id: batchId,
  source: 'glm',
  source_ref: `glm:${batchId}`,
  count,
  platform: text('platform', defaults.platform || 'douyin') || 'douyin',
  account_key: text('account_key', defaults.account_key || 'mes') || 'mes',
  direction: text('direction', defaults.direction || '认知偏差') || '认知偏差',
  category: text('category', defaults.category || '认知成长') || '认知成长',
  audience: text('audience', defaults.audience || '普通短视频用户') || '普通短视频用户',
  tone,
  content_structure: contentStructure,
  style,
  requested_at: new Date().toISOString(),
};

const values = {
  ...params,
  blocked_topics: Array.isArray(config.blocked_topics) ? config.blocked_topics.join('、') : String(config.blocked_topics || ''),
};
const systemPrompt = renderTemplate(config.system_prompt, values);
const userPrompt = renderTemplate(config.user_prompt_template, values);

return [{
  json: {
    ...params,
    prompt_config_path: configPath,
    prompt_messages_json: JSON.stringify([
      {role: 'system', content: systemPrompt},
      {role: 'user', content: userPrompt},
    ]),
    llm_request_body: {
      model: config.model || 'glm-5.1',
      temperature: config.temperature ?? 0.82,
      max_tokens: config.max_tokens ?? 8000,
      response_format: {type: 'json_object'},
      messages: [
        {role: 'system', content: systemPrompt},
        {role: 'user', content: userPrompt},
      ],
    },
  },
}];
