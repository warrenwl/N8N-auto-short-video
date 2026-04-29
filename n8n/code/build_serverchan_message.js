// n8n Code node: Build ServerChan Message
// Input: publish-helper package response.
// Output: ServerChan title/desp and manual confirmation links.

function env(name, fallback = '') {
  // n8n Code 节点中通常可以通过 $env 读取环境变量。
  try {
    if (typeof $env !== 'undefined' && $env[name]) return $env[name];
  } catch (e) {}
  return fallback;
}

const publicN8nBase = env('PUBLIC_N8N_BASE_URL', 'http://localhost:5678').replace(/\/$/, '');
const serverchanSendKey = env('SERVERCHAN_SENDKEY', '').trim();
const serverchanUrl = serverchanSendKey ? `https://sctapi.ftqq.com/${serverchanSendKey}.send` : '';

const inputItems = typeof items !== 'undefined' ? items : $input.all();

return inputItems.map(item => {
  const data = item.json;
  const rawJobId = data.job_id || data.id;
  const jobId = encodeURIComponent(rawJobId);
  const token = encodeURIComponent(data.manual_confirm_token || data.token || '');

  const doneUrl = `${publicN8nBase}/webhook/douyin-manual-publish-action?action=published&job_id=${jobId}&token=${token}`;
  const skipUrl = `${publicN8nBase}/webhook/douyin-manual-publish-action?action=skip&job_id=${jobId}&token=${token}`;
  const downloadPageUrl = data.download_page_url || data.video_url || '';
  const videoDownloadUrl = data.video_download_url || data.video_url || '';

  const title = `🎬 抖音视频待发布：${data.title || '未命名视频'}`;
  const hashtags = Array.isArray(data.hashtags) ? data.hashtags.join(' ') : (data.hashtags || '');

  const desp = [
    '# 🎬 抖音视频待发布',
    '',
    `**标题：** ${data.title || ''}`,
    '',
    '## 文案',
    '',
    data.caption || '',
    '',
    '## 话题',
    '',
    hashtags,
    '',
    '## 下载',
    '',
    downloadPageUrl ? `- [打开下载页面](${downloadPageUrl})` : '- 下载页面缺失',
    videoDownloadUrl ? `- [直接下载视频 final.mp4](${videoDownloadUrl})` : '- 视频链接缺失',
    data.cover_url ? `- [下载封面 cover.png](${data.cover_url})` : '- 封面链接缺失',
    data.caption_url ? `- [下载文案 caption.txt](${data.caption_url})` : '',
    '',
    '## 操作步骤',
    '',
    '1. 在手机上打开下载页面，先预览确认视频。',
    '2. 复制上面的文案和话题。',
    '3. 打开抖音 App，手动上传并确认发布。',
    '4. 发布完成后点击下面的“我已发布”。',
    '',
    '> 微信内如果只能播放不能保存，请点右上角选择“在浏览器打开”，再点下载视频文件。',
    '',
    `✅ [我已发布](${doneUrl})`,
    '',
    `⏸ [暂不发布](${skipUrl})`
  ].filter(Boolean).join('\n');

  return {
    json: {
      ...data,
      job_id: String(rawJobId),
      manual_published_url: doneUrl,
      manual_skip_url: skipUrl,
      serverchan_title: title,
      serverchan_desp: desp,
      remind_message: desp,
      serverchan_url: serverchanUrl || 'http://publish-helper:8010/serverchan-skip',
      serverchan_enabled: Boolean(serverchanUrl)
    }
  };
});
