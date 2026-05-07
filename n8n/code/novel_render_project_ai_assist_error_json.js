// n8n Code node: Render Novel Project AI Assist Error JSON

let context = {};
try {
  context = $('代码 - 构建创建页 GLM助手请求').first().json || {};
} catch (error) {
  context = {};
}

const errorPayload = $json || {};
const message = errorPayload.error?.message
  || errorPayload.message
  || errorPayload.description
  || errorPayload.error?.description
  || 'GLM 生成失败，请稍后重试。';

const payload = {
  ok: false,
  assist_type: context.assist_type || errorPayload.assist_type || '',
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
