// n8n Code node: Validate Novel Review Action
// Normalizes POST body fields before calling approve/request/reject SQL functions.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('审核动作必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('审核动作必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

const chapterId = text(body.chapter_id || body.id);
const reviewToken = text(body.review_token || body.token);
const rawAction = text(body.action).toLowerCase();
const comment = text(body.comment || body.note);
const reviewer = text(body.reviewer || 'local_user') || 'local_user';

const actionMap = {
  approve: 'APPROVE',
  pass: 'APPROVE',
  request_rewrite: 'REQUEST_REWRITE',
  rewrite: 'REQUEST_REWRITE',
  rerun_review: 'RERUN_REVIEW',
  request_review: 'RERUN_REVIEW',
  review_again: 'RERUN_REVIEW',
  ai_review: 'RERUN_REVIEW',
  reject: 'REJECT',
};

const action = actionMap[rawAction];

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chapterId)) {
  throw new Error(`无效 chapter_id：${chapterId || '(empty)'}`);
}

if (!reviewToken) {
  throw new Error('缺少 review_token，拒绝执行审核动作。');
}

if (!action) {
  throw new Error(`无效审核动作：${rawAction || '(empty)'}`);
}

return [{
  json: {
    chapter_id: chapterId,
    review_token: reviewToken,
    action,
    comment,
    reviewer,
    action_sql_function: {
      APPROVE: 'approve_novel_chapter',
      REQUEST_REWRITE: 'request_novel_chapter_rewrite',
      RERUN_REVIEW: 'apply_novel_review_action',
      REJECT: 'reject_novel_chapter',
    }[action],
  },
}];
