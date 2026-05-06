// n8n Code node: Build Novel Review Notification
// ServerChan only carries a detail-page link. It must not carry approve/reject action links.

function env(name, fallback = '') {
  try {
    if (typeof $env !== 'undefined' && $env[name]) return $env[name];
  } catch (error) {}
  return fallback;
}

function envFlag(name) {
  const value = env(name, '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function stripChapterTitlePrefix(value, fallback = '') {
  const raw = String(value ?? '').trim();
  const fallbackText = String(fallback ?? '').trim();
  if (!raw) return fallbackText;
  const cleaned = raw
    .replace(/^第\s*(?:[0-9０-９]+|[一二三四五六七八九十百千万零〇两]+|[Xx]+)\s*章\s*[：:、，,.．。-]?\s*/, '')
    .trim();
  return cleaned || fallbackText || raw;
}

const publicN8nBase = env('PUBLIC_N8N_BASE_URL', 'http://localhost:5678').replace(/\/$/, '');
const serverchanSendKey = env('SERVERCHAN_SENDKEY', '').trim();
const serverchanDisabled = envFlag('NOVEL_DISABLE_SERVERCHAN') || envFlag('DISABLE_SERVERCHAN');
const serverchanEnabled = Boolean(serverchanSendKey) && !serverchanDisabled;
const serverchanUrl = serverchanEnabled
  ? `https://sctapi.ftqq.com/${serverchanSendKey}.send`
  : 'http://publish-helper:8010/serverchan-skip';
const serverchanDisableReason = serverchanDisabled
  ? 'SERVERCHAN_DISABLED'
  : serverchanSendKey
    ? ''
    : 'NO_SENDKEY';

return $input.all().map((item) => {
  const row = item.json || {};
  const chapterId = encodeURIComponent(row.chapter_id || '');
  const token = encodeURIComponent(row.review_token || '');
  const detailUrl = `${publicN8nBase}/webhook/novel-review-detail?chapter_id=${chapterId}&review_token=${token}`;
  const chapterTitle = stripChapterTitlePrefix(row.chapter_title || '');
  const title = `小说章节待审核：${row.project_title || row.novel_title || row.project_id || ''} 第 ${row.chapter_no || ''} 章`;
  const desp = [
    '# 小说章节待审核',
    '',
    `项目：${row.project_title || row.novel_title || ''}`,
    '',
    `章节：第 ${row.chapter_no || ''} 章 ${chapterTitle}`,
    '',
    `AI 评分：${row.total_score ?? '-'}`,
    '',
    `AI 结论：${row.verdict || 'MANUAL_REVIEW'}`,
    '',
    '[打开审核详情页](' + detailUrl + ')',
    '',
    '提示：通知只进入审核详情页，真正通过、拒绝或要求重写必须在页面内用 POST 表单提交。',
  ].join('\n');

  return {
    json: {
      ...row,
      review_detail_url: detailUrl,
      serverchan_url: serverchanUrl,
      serverchan_title: title,
      serverchan_desp: desp,
      serverchan_enabled: serverchanEnabled,
      serverchan_disabled: serverchanDisabled,
      serverchan_disable_reason: serverchanDisableReason,
      remind_message: desp,
    },
  };
});
