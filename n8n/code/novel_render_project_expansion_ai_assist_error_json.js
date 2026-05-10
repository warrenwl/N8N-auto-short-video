// n8n Code node: Render Novel Project Expansion AI Assist Error JSON

let context = {};
try {
  context = $('代码 - 构建扩写剧情 AI创意请求').first().json || {};
} catch (error) {
  context = {};
}

const errorPayload = $json || {};
const message = errorPayload.error?.message
  || errorPayload.message
  || errorPayload.description
  || errorPayload.error?.description
  || '扩写剧情 AI 创意生成失败，请稍后重试。';

const payload = {
  ok: false,
  expansion_request: context.expansion_request || '',
  beat_design: [],
  setting_additions: [],
  risk_notes: [],
  message: String(message),
};

return [{
  json: {
    ...context,
    error_message: String(message),
    response_status_code: 502,
    response_json: JSON.stringify(payload),
  },
}];
