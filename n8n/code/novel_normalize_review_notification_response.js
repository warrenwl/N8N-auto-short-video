// n8n Code node: Normalize Novel Review Notification Response

return $input.all().map((item) => {
  const res = item.json || {};
  let remindMessage = '';
  let serverchanEnabled = true;
  let serverchanDisabled = false;
  let reviewDetailUrl = '';
  try {
    const messageNode = $('代码 - 构建小说审核提醒').first().json;
    serverchanEnabled = messageNode.serverchan_enabled !== false;
    serverchanDisabled = messageNode.serverchan_disabled === true || messageNode.serverchan_disable_reason === 'SERVERCHAN_DISABLED';
    remindMessage = String(messageNode.remind_message || '');
    reviewDetailUrl = String(messageNode.review_detail_url || '');
  } catch (error) {}

  const ok = res && (res.code === 0 || res.errno === 0 || res.message === 'success' || res.data);
  const skippedStatus = serverchanDisabled ? 'SKIPPED_DISABLED' : 'SKIPPED_NO_SENDKEY';

  return {
    json: {
      ...res,
      review_detail_url: reviewDetailUrl,
      remind_status: serverchanEnabled ? (ok ? 'SENT' : 'SENT_OR_UNKNOWN') : skippedStatus,
      remind_message_base64: Buffer.from(remindMessage, 'utf8').toString('base64'),
      remind_response_json: JSON.stringify(res || {}),
    },
  };
});
