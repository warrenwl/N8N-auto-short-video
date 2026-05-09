// n8n Code node: Validate Novel Review Block Revision Apply
// Only accepts POST body fields from /webhook/novel-review-block-apply.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('局部修订确认必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('局部修订确认必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

const revisionId = text(body.revision_id || body.id);
const reviewToken = text(body.review_token || body.token);
const rawAction = text(body.action || body.apply_action || 'apply').toLowerCase();
const replacementText = text(body.replacement_text || body.edited_replacement_text || body.body);
const reviewer = text(body.reviewer || 'local_user') || 'local_user';

const actionMap = {
  apply: 'APPLY',
  apply_suggestion: 'APPLY',
  accept: 'APPLY',
  apply_edited: 'APPLY_EDITED',
  edit_and_apply: 'APPLY_EDITED',
  modify_apply: 'APPLY_EDITED',
  reject: 'REJECT',
  discard: 'REJECT',
  abandon: 'REJECT',
  regenerate: 'REGENERATE',
  regen: 'REGENERATE',
  rerun: 'REGENERATE',
  request_rewrite: 'REQUEST_REWRITE',
  full_rewrite: 'REQUEST_REWRITE',
};

const action = actionMap[rawAction];

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(revisionId)) {
  throw new Error(`无效 revision_id：${revisionId || '(empty)'}`);
}

if (!reviewToken) {
  throw new Error('缺少 review_token，拒绝确认局部修订。');
}

if (!action) {
  throw new Error(`无效局部修订确认动作：${rawAction || '(empty)'}`);
}

if (action === 'APPLY_EDITED' && !replacementText) {
  throw new Error('修改后应用时，替换文本不能为空。');
}

return [{
  json: {
    revision_id: revisionId,
    review_token: reviewToken,
    action,
    replacement_text: replacementText,
    reviewer,
  },
}];
