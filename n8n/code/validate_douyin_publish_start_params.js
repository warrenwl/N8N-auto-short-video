// n8n Code node: Validate Douyin Publish Start Params
// Expected query: ?task_id=<video_topics.id>&token=<review_token>

const source = $json || {};
const query = source.query || source.params || source;

const taskId = String(query.task_id || query.id || '').trim();
const token = String(query.token || '').trim();

if (!taskId) {
  throw new Error('缺少 task_id 参数');
}

if (!token) {
  throw new Error('缺少 token 参数');
}

return [
  {
    json: {
      task_id: taskId,
      token,
      platform: 'douyin',
      received_at: new Date().toISOString(),
    },
  },
];
