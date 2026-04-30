// n8n Code node: Normalize Auto Recovery Alert Response

return $input.all().map((item) => {
  const res = item.json || {};
  let serverchanEnabled = true;
  try {
    serverchanEnabled = $('Code - Build Auto Recovery Alert').first().json.serverchan_enabled !== false;
  } catch (error) {}

  const ok = res && (res.code === 0 || res.errno === 0 || res.message === 'success' || res.data);
  return {
    json: {
      ...res,
      alert_status: serverchanEnabled ? (ok ? 'SENT' : 'SENT_OR_UNKNOWN') : 'SKIPPED_NO_SENDKEY',
      alert_response_json: JSON.stringify(res || {}),
    },
  };
});
