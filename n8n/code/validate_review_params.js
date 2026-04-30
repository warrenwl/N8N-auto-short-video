// n8n Code node: Validate Review Params
// Expected webhook query params:
// ?action=approve|reject|back_review|rerender|rerender_video_only|reset_script|trigger_render|reset_audio|trigger_cover|reset_cover|reset_render|mark_failed&task_id=<id>&token=<review_token>&note=<reason>&extra_note=<optional>

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

const allowedActions = [
  'approve',
  'reject',
  'back_review',
  'rerender',
  'rerender_video_only',
  'reset_script',
  'trigger_render',
  'reset_audio',
  'trigger_cover',
  'reset_cover',
  'reset_render',
  'mark_failed',
];

if (!allowedActions.includes(rawAction)) {
  throw new Error(`action 只能是 ${allowedActions.join('、')}`);
}

const nextStatusByAction = {
  approve: 'APPROVED',
  reject: 'REJECTED',
  back_review: 'NEED_REVIEW',
  rerender: 'MEDIA_READY',
  rerender_video_only: 'AUDIO_READY',
  reset_script: 'IDEA',
  trigger_render: 'SCRIPT_READY',
  reset_audio: 'SCRIPT_READY',
  trigger_cover: 'AUDIO_READY',
  reset_cover: 'AUDIO_READY',
  reset_render: 'AUDIO_READY',
  mark_failed: 'FAILED',
};
const reviewStatusByAction = {
  approve: 'APPROVED',
  reject: 'REJECTED',
  back_review: 'NEED_REVIEW',
  rerender: 'RERENDER_REQUESTED',
  rerender_video_only: 'VIDEO_RERENDER_REQUESTED',
  reset_script: 'RECOVERY_REQUESTED',
  trigger_render: 'RECOVERY_REQUESTED',
  reset_audio: 'RECOVERY_REQUESTED',
  trigger_cover: 'COVER_RECOVERY_REQUESTED',
  reset_cover: 'COVER_RECOVERY_REQUESTED',
  reset_render: 'VIDEO_RERENDER_REQUESTED',
  mark_failed: 'MANUAL_FAILED',
};
const defaultNoteByAction = {
  reset_script: '人工恢复：脚本生成卡住，退回 IDEA 并重新请求 GLM',
  trigger_render: '人工恢复：等待渲染超时，重新触发 06',
  reset_audio: '人工恢复：语音生成卡住，退回等待渲染并重新生成语音',
  trigger_cover: '人工恢复：语音完成后等待超时，继续生成封面',
  reset_cover: '人工恢复：封面生成卡住，复用语音重新生成封面',
  reset_render: '人工恢复：视频合成卡住，复用素材重新合成视频',
  mark_failed: '人工标记失败',
};

const nextStatus = nextStatusByAction[rawAction];
const reviewStatus = reviewStatusByAction[rawAction];
const reviewNote = [note || defaultNoteByAction[rawAction] || '', extraNote].filter(Boolean).join('：');

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
