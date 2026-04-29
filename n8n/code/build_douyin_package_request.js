// n8n Code node: Build Douyin Package Request
// Input: one row from video_publish_jobs.
// Output: JSON body for publish-helper /package/douyin.

function env(name, fallback = '') {
  try {
    if (typeof $env !== 'undefined' && $env[name]) return $env[name];
  } catch (error) {}
  return fallback;
}

function normalizeHashtags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).map(s => s.trim()).filter(Boolean);
  return String(value)
    .split(/[，,\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.startsWith('#') ? s : `#${s}`)
    .slice(0, 8);
}

const inputItems = typeof items !== 'undefined' ? items : $input.all();
const publicFileBaseUrl = env('PUBLIC_FILE_BASE_URL', '').replace(/\/$/, '');

return inputItems.map(item => {
  const row = item.json;
  if (row.success === false || row.success === 'false') {
    throw new Error(`无法启动抖音发布任务：${row.result_code || 'UNKNOWN'}`);
  }

  const hashtags = normalizeHashtags(row.hashtags);
  const title = row.title || '抖音待发布视频';

  let caption = row.caption || '';
  if (!caption.trim()) {
    caption = `${title}\n\n${hashtags.join(' ')}`.trim();
  }

  return {
    json: {
      job_id: String(row.id),
      video_topic_id: row.video_topic_id,
      title,
      caption,
      hashtags,
      video_path: row.video_path,
      cover_path: row.cover_path || '',
      manual_confirm_token: row.manual_confirm_token,
      public_file_base_url: publicFileBaseUrl
    }
  };
});
