// n8n Code node: Validate Novel Review Reminder Resend
// Only accepts POST body fields from /webhook/novel-review-remind.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('重新发送审核提醒必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('重新发送审核提醒必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

const chapterId = text(body.chapter_id || body.id);
const reviewToken = text(body.review_token || body.token);
const comment = text(body.comment || body.note);
const reviewer = text(body.reviewer || 'local_user') || 'local_user';

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chapterId)) {
  throw new Error(`无效 chapter_id：${chapterId || '(empty)'}`);
}

if (!reviewToken) {
  throw new Error('缺少 review_token，拒绝重新发送提醒。');
}

return [{
  json: {
    chapter_id: chapterId,
    review_token: reviewToken,
    comment,
    reviewer,
    action: 'RESEND_REVIEW_NOTIFICATION',
  },
}];
