// n8n Code node: Validate Review Params
// Expected webhook query params:
// ?action=approve|reject|back_review|rerender&task_id=<id>&token=<review_token>&note=<reason>&extra_note=<optional>

const source = $json || {};
const query = source.query || source.params || source;

const taskId = String(query.task_id || query.id || '').trim();
const rawAction = String(query.action || '').trim().toLowerCase();
const token = String(query.token || '').trim();
const note = String(query.note || '').trim();
const extraNote = String(query.extra_note || '').trim();

if (!taskId) {
  throw new Error('缺少 task_id 参数');
}

if (!token) {
  throw new Error('缺少 token 参数');
}

if (!['approve', 'reject', 'back_review', 'rerender'].includes(rawAction)) {
  throw new Error('action 只能是 approve、reject、back_review 或 rerender');
}

const nextStatusByAction = {
  approve: 'APPROVED',
  reject: 'REJECTED',
  back_review: 'NEED_REVIEW',
  rerender: 'SCRIPT_READY',
};
const reviewStatusByAction = {
  approve: 'APPROVED',
  reject: 'REJECTED',
  back_review: 'NEED_REVIEW',
  rerender: 'RERENDER_REQUESTED',
};
const nextStatus = nextStatusByAction[rawAction];
const reviewStatus = reviewStatusByAction[rawAction];
const reviewNote = [note, extraNote].filter(Boolean).join('：');

return [
  {
    json: {
      task_id: taskId,
      token,
      action: rawAction,
      next_status: nextStatus,
      review_status: reviewStatus,
      review_note: reviewNote,
      action_source: 'review_center',
      received_at: new Date().toISOString()
    }
  }
];
