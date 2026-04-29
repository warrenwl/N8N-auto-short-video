// n8n Code node: Normalize ServerChan Response

const inputItems = typeof items !== 'undefined' ? items : $input.all();

return inputItems.map(item => {
  const res = item.json;
  let remindMessage = '';
  let serverchanEnabled = true;
  try {
    const messageNode = $('Code - Build ServerChan Message').first().json;
    serverchanEnabled = messageNode.serverchan_enabled !== false;
    remindMessage = String(messageNode.remind_message || '');
  } catch (error) {}
  const remindMessageBase64 = Buffer.from(remindMessage, 'utf8').toString('base64');

  if (!serverchanEnabled) {
    return {
      json: {
        ...res,
        remind_status: 'SKIPPED_NO_SENDKEY',
        remind_message_base64: remindMessageBase64,
        remind_response_json: JSON.stringify(res || {}),
      },
    };
  }

  const ok = res && (res.code === 0 || res.errno === 0 || res.message === 'success' || res.data);
  return {
    json: {
      ...res,
      remind_status: ok ? 'SENT' : 'SENT_OR_UNKNOWN',
      remind_message_base64: remindMessageBase64,
      remind_response_json: JSON.stringify(res || {})
    }
  };
});
