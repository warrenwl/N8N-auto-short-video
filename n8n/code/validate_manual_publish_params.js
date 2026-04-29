/**
 * n8n Code 节点：Validate Manual Publish Params
 * Webhook URL 示例：
 * /webhook/douyin-manual-publish-action?action=published&job_id=123&token=xxx
 * /webhook/douyin-manual-publish-action?action=skip&job_id=123&token=xxx&note=今天不发
 */

const query = $json.query || $json || {};
const actionRaw = String(query.action || '').toLowerCase();
const jobId = query.job_id || query.id;
const token = query.token;
const note = query.note || '';
const publishedUrl = query.published_url || '';

if (!jobId) throw new Error('缺少 job_id');
if (!token) throw new Error('缺少 token');

let actionResult;
if (['published', 'done', 'yes', 'manual_published'].includes(actionRaw)) {
  actionResult = 'MANUAL_PUBLISHED';
} else if (['skip', 'skipped', 'no', 'later', 'manual_skipped'].includes(actionRaw)) {
  actionResult = 'MANUAL_SKIPPED';
} else {
  throw new Error('action 只能是 published 或 skip');
}

return [{
  json: {
    job_id: String(jobId),
    token: String(token),
    action_result: actionResult,
    note: String(note),
    published_url: String(publishedUrl)
  }
}];
