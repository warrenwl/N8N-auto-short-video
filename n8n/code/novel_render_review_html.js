// n8n Code node: Render Novel Review HTML
// Input rows should be NEED_REVIEW novel_chapters joined with project, latest review report,
// and lightweight observability fields.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function reviewChapterTitle(row) {
  return stripChapterTitlePrefix(row.chapter_title || row.title, row.chapter_no ? `第 ${row.chapter_no} 章` : '审核详情');
}

function parseJsonMaybe(value, fallback) {
  if (!value) return fallback;
  if (Array.isArray(value) || typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (error) {
    return fallback;
  }
}

function formatLocalTime(value) {
  if (!value) return '未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function formatDuration(value) {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs < 0) return '未记录';
  if (durationMs >= 1000) return `${(durationMs / 1000).toFixed(1)} 秒`;
  return `${durationMs} 毫秒`;
}

const jobTypeLabel = {
  GENERATE_BIBLE: '生成设定集',
  GENERATE_OUTLINE: '生成大纲',
  PLAN_CHAPTER_DIRECTOR: '导演台规划',
  GENERATE_CHAPTER: '生成章节',
  REVIEW_CHAPTER: '智能审稿',
  REWRITE_CHAPTER: '重写章节',
  NOTIFY_REVIEW: '发送审核提醒',
};

const statusLabel = {
  SUCCESS: '成功',
  SUCCEEDED: '已成功',
  SENT: '已发送',
  PENDING: '待处理',
  RUNNING: '运行中',
  FAILED: '已失败',
  CANCELLED: '已取消',
  ACTIVE: '已激活',
  INACTIVE: '已失效',
  APPROVED: '已通过',
  PUBLISHED: '已发布',
  NEED_REVIEW: '待人工审核',
  DRAFT_READY: '候选稿已生成',
  AI_REVIEWED: '智能审稿完成',
  REWRITE_REQUESTED: '已要求重写',
  SUPERSEDED: '已被新版本替代',
  REJECTED: '已拒绝',
  PASS: '可通过',
  MANUAL_REVIEW: '需人工判断',
  REWRITE: '建议重写',
  REQUEST_REWRITE: '要求重写',
  REJECT: '拒绝',
  SKIPPED_DISABLED: '已跳过提醒',
  SKIPPED_NO_SENDKEY: '未配置提醒',
  SENT_OR_UNKNOWN: '发送结果待确认',
};

const humanActionLabel = {
  APPROVE: '通过',
  REQUEST_REWRITE: '要求重写',
  REJECT: '拒绝',
  PAUSE_PROJECT: '暂停项目',
  MANUAL_EDIT: '人工改稿',
};

const issueTypeLabel = {
  rhythm: '节奏',
  plot: '剧情',
  consistency: '连续性',
  readability: '可读性',
  commercial: '商业性',
  style: '文风',
  '跨章断链': '跨章断链',
};

const transitionModeLabel = {
  direct_continuation: '直接承接',
  natural_scene_cut: '自然转场',
  pov_shift: '视角转换',
  time_skip: '时间跳转',
  summary_bridge: '概述过桥',
};

const errorMessageLabel = {
  'SERVERCHAN_SENDKEY is not configured': '提醒密钥未配置',
  'Phase7 cancelled superseded candidate review': '候选稿已被新版本替代，旧审稿任务已取消',
};

function label(map, value, fallback) {
  if (!value) return fallback;
  return map[value] || fallback;
}

function localizeError(value) {
  if (!value) return '';
  const text = String(value);
  if (errorMessageLabel[text]) return errorMessageLabel[text];
  if (/[A-Za-z_]/.test(text)) return '原始错误已记录，请查看任务日志';
  return text;
}

function scoreClass(score) {
  const value = Number(score || 0);
  if (value >= 85) return 'good';
  if (value >= 70) return 'warn';
  return 'bad';
}

function statusClass(status) {
  const value = String(status || '').toUpperCase();
  if (['SUCCESS', 'SUCCEEDED', 'SENT', 'ACTIVE', 'APPROVED', 'PASS', 'SKIPPED_DISABLED', 'SKIPPED_NO_SENDKEY'].includes(value)) return 'good';
  if (['PENDING', 'RUNNING', 'MANUAL_REVIEW', 'REWRITE', 'REQUEST_REWRITE', 'NEED_REVIEW', 'AI_REVIEWED', 'DRAFT_READY'].includes(value)) return 'warn';
  if (['FAILED', 'REJECTED', 'REJECT', 'SENT_OR_UNKNOWN'].includes(value)) return 'bad';
  return 'muted';
}

function badge(value, fallback = '未知状态') {
  const raw = value || '';
  return `<span class="badge ${statusClass(raw)}">${escapeHtml(label(statusLabel, raw, fallback))}</span>`;
}

function listItems(items) {
  const array = parseJsonMaybe(items, []);
  if (!array.length) return '<li>无</li>';
  return array.map((item) => {
    if (typeof item === 'string') return `<li>${escapeHtml(item)}</li>`;
    const type = label(issueTypeLabel, item.type, item.type || item.severity || '问题');
    return `<li>${escapeHtml(type)}：${escapeHtml(item.description || item.value || JSON.stringify(item))}</li>`;
  }).join('');
}

function itemCount(items) {
  return parseJsonMaybe(items, []).length;
}

function shortItem(items, fallback) {
  const array = parseJsonMaybe(items, []);
  if (!array.length) return fallback;
  const item = array[0];
  if (typeof item === 'string') return item;
  const type = label(issueTypeLabel, item.type, item.type || item.severity || '要点');
  return `${type}：${item.description || item.value || JSON.stringify(item)}`;
}

function transitionReview(row) {
  const review = parseJsonMaybe(row.cross_chapter_transition_review, null);
  if (!review || typeof review !== 'object') return null;
  const mode = label(transitionModeLabel, review.mode, review.mode || '未说明');
  const allowed = review.allowed === true || review.allowed === 'true';
  const shouldBlock = review.should_block === true || review.should_block === 'true';
  const state = shouldBlock ? '应阻断' : allowed ? '可接受' : '需复核';
  const evidence = review.evidence || review.reason || '';
  const risk = review.risk || '';
  const fix = review.fix || '';
  return {mode, state, evidence, risk, fix, shouldBlock, allowed};
}

function humanReviewItems(value) {
  const records = parseJsonMaybe(value, []);
  if (!records.length) return '<li>暂无人工记录</li>';
  return records.slice(0, 5).map((record) => {
    const action = escapeHtml(label(humanActionLabel, record.action, '人工操作'));
    const reviewer = escapeHtml(record.reviewer || '本地用户');
    const createdAt = escapeHtml(formatLocalTime(record.created_at));
    const comment = record.comment ? `<p>${escapeHtml(record.comment)}</p>` : '';
    return `<li><strong>${action}</strong><span>${reviewer} / ${createdAt}</span>${comment}</li>`;
  }).join('');
}

function recommendation(row) {
  const verdict = String(row.verdict || 'MANUAL_REVIEW').toUpperCase();
  const score = Number(row.total_score || 0);
  if (verdict === 'PASS' && score >= 85) return '建议通过';
  if (verdict === 'REJECT' || score < 55) return '建议拒绝';
  if (verdict === 'REWRITE' || verdict === 'REQUEST_REWRITE' || score < 70) return '建议要求重写';
  return '建议人工复核';
}

function recommendationClass(row) {
  const text = recommendation(row);
  if (text.includes('通过')) return 'approve';
  if (text.includes('重写')) return 'rewrite';
  if (text.includes('拒绝')) return 'reject';
  return 'review';
}

function renderSidebar(current) {
  const links = [
    ['工作台', '/webhook/novel-center'],
    ['项目列表', '/webhook/novel-project-list'],
    ['创建项目', '/webhook/novel-project-new'],
    ['审核中心', '/webhook/novel-review-list'],
    ['队列状态', '/webhook/novel-queue-status'],
    ['运行日报', '/webhook/novel-daily-report'],
  ];
  return `
    <aside class="app-sidebar" aria-label="后台导航">
      <div class="brand"><span>创作中台</span><strong>小说后台</strong></div>
      <nav class="side-nav" aria-label="小说工作流导航">${links.map(([text, href]) => (
        text === current
          ? `<span class="active">${escapeHtml(text)}</span>`
          : `<a href="${href}">${escapeHtml(text)}</a>`
      )).join('')}</nav>
      <a class="side-primary" href="/webhook/novel-project-new">新建项目</a>
    </aside>`;
}

function breadcrumb(items) {
  return `<nav class="breadcrumbs" aria-label="面包屑">${items.map((item, index) => {
    const labelText = escapeHtml(item.label);
    const node = item.href
      ? `<a href="${escapeHtml(item.href)}">${labelText}</a>`
      : `<span>${labelText}</span>`;
    return `${index > 0 ? '<span class="crumb-separator">/</span>' : ''}${node}`;
  }).join('')}</nav>`;
}

function projectDetailHref(row, view = 'overview', hash = '') {
  const projectId = row.project_id || row.novel_project_id || '';
  if (!projectId) return '/webhook/novel-project-list';
  const viewParam = view && view !== 'overview' ? `&view=${encodeURIComponent(view)}` : '';
  return `/webhook/novel-project-detail?project_id=${encodeURIComponent(projectId)}${viewParam}${hash || ''}`;
}

function reviewDetailBreadcrumb(row) {
  const items = [
    {label: '工作台', href: '/webhook/novel-center'},
    {label: '审核中心', href: '/webhook/novel-review-list'},
  ];
  const projectId = row.project_id || row.novel_project_id || '';
  const projectTitle = row.project_title || row.novel_title || row.project_name || '';
  if (projectTitle) {
    items.push(projectId
      ? {label: projectTitle, href: projectDetailHref(row)}
      : {label: projectTitle});
  }
  const chapterLabel = row.chapter_no ? `第 ${row.chapter_no} 章审核` : '审核详情';
  items.push({label: chapterLabel});
  return breadcrumb(items);
}

function projectQueueHref(row) {
  const projectId = row.project_id || row.novel_project_id || '';
  return projectId
    ? `/webhook/novel-queue-status?project_id=${encodeURIComponent(projectId)}`
    : '/webhook/novel-queue-status';
}

function chapterDetailHref(row) {
  const chapterNo = row.chapter_no || '';
  const hash = chapterNo ? `#chapter-${encodeURIComponent(chapterNo)}` : '#written-section';
  return projectDetailHref(row, 'chapters', hash);
}

function reviewSummary(row) {
  const score = Number(row.total_score || 0);
  const rec = recommendation(row);
  const recClass = recommendationClass(row);
  return `
    <section class="review-summary" aria-label="审核结论摘要">
      <h3>审核结论摘要</h3>
      <div class="decision-banner ${escapeHtml(recClass)}">
        <strong>${escapeHtml(rec)}</strong>
        <span>${escapeHtml(recClass === 'approve' ? 'AI 评分与结论支持通过，但仍建议快速扫读正文。' : recClass === 'rewrite' ? '建议把修改意见写清楚，方便后续重写任务继承。' : recClass === 'reject' ? '拒绝会停止该候选稿成为正式版本，请确认原因明确。' : '当前结果需要人工判断，先阅读正文和运行依据。')}</span>
      </div>
      <dl>
        <dt>总评分</dt><dd><strong>${escapeHtml(score || '-')}</strong></dd>
        <dt>智能建议</dt><dd>${badge(row.verdict || 'MANUAL_REVIEW', '需人工判断')}</dd>
        <dt>当前状态</dt><dd>${badge(row.status || 'NEED_REVIEW', '待人工审核')}</dd>
        <dt>推荐人工动作</dt><dd><strong>${escapeHtml(rec)}</strong></dd>
      </dl>
    </section>`;
}

function reviewEvidence(row) {
  const aiSuccess = row.ai_run_success;
  const aiStatus = aiSuccess === true ? '成功' : aiSuccess === false ? '失败' : '未记录';
  const transition = transitionReview(row);
  return `
    <section class="review-evidence" aria-label="审核依据">
      <h3>审核依据</h3>
      <dl>
        <dt>模型调用</dt><dd>${escapeHtml(row.ai_run_model || '未记录')} / ${escapeHtml(formatDuration(row.ai_run_duration_ms))} / ${escapeHtml(aiStatus)}</dd>
        <dt>任务状态</dt><dd>${escapeHtml(label(jobTypeLabel, row.latest_job_type, '未记录'))} / ${escapeHtml(label(statusLabel, row.latest_job_status, '未记录'))}</dd>
        <dt>连续性事实</dt><dd>候选 ${escapeHtml(row.pending_fact_count ?? 0)} / 已激活 ${escapeHtml(row.active_fact_count ?? 0)} / 已失效 ${escapeHtml(row.inactive_fact_count ?? 0)}</dd>
        <dt>跨章承接</dt><dd>${transition ? `${escapeHtml(transition.mode)} / ${escapeHtml(transition.state)}` : '未记录'}</dd>
      </dl>
    </section>`;
}

function reviewScoreBrief(row) {
  const score = Number(row.total_score || 0);
  const rec = recommendation(row);
  const recClass = recommendationClass(row);
  return `
    <div class="review-brief" aria-label="审核快速判断">
      <span class="recommendation-pill ${escapeHtml(recClass)}">${escapeHtml(rec)}</span>
      <span>智能评分 ${escapeHtml(score || '-')}</span>
      <span>问题 ${escapeHtml(itemCount(row.issues))}</span>
      <span>建议 ${escapeHtml(itemCount(row.suggestions))}</span>
      <span>候选事实 ${escapeHtml(row.pending_fact_count ?? 0)}</span>
    </div>`;
}

function aiReviewDrawer(row, drawerId, opsId) {
  const score = Number(row.total_score || 0);
  const transition = transitionReview(row);
  return `
    <dialog class="side-drawer" id="${escapeHtml(drawerId)}" aria-label="智能审稿抽屉">
      <div class="drawer-shell">
        <header class="drawer-header">
          <div>
            <p class="ops-kicker">智能审稿</p>
            <h2>辅助判断</h2>
            <p>这里是模型意见和运行依据；最终决策仍以人工阅读正文为准。</p>
          </div>
          <button class="icon-button" type="button" data-close-dialog aria-label="关闭智能审稿">×</button>
        </header>
        <section class="drawer-section ai-score-card">
          <div class="score ${scoreClass(score)}">${escapeHtml(score || '-')}</div>
          ${reviewSummary(row)}
        </section>
        <section class="drawer-section">
          <h3>问题</h3>
          <ul>${listItems(row.issues)}</ul>
        </section>
        <section class="drawer-section">
          <h3>建议</h3>
          <ul>${listItems(row.suggestions)}</ul>
        </section>
        ${transition ? `
        <section class="drawer-section">
          <h3>跨章承接分析</h3>
          <dl class="transition-review">
            <dt>转场类型</dt><dd>${escapeHtml(transition.mode)}</dd>
            <dt>判断</dt><dd>${escapeHtml(transition.state)}</dd>
            <dt>依据</dt><dd>${escapeHtml(transition.evidence || '未说明')}</dd>
            <dt>风险</dt><dd>${escapeHtml(transition.risk || '未发现明显风险')}</dd>
            <dt>修法</dt><dd>${escapeHtml(transition.fix || '无需额外修法')}</dd>
          </dl>
        </section>` : ''}
        ${reviewEvidence(row)}
        ${observabilityBlock(row, opsId)}
      </div>
    </dialog>`;
}

function manualReviewEditDrawer(row, drawerId) {
  const token = escapeHtml(row.review_token || '');
  const chapterId = escapeHtml(row.chapter_id || row.id || '');
  const title = escapeHtml(reviewChapterTitle(row));
  const summary = escapeHtml(row.summary || '');
  const body = escapeHtml(row.body || '');
  return `
    <dialog class="side-drawer manual-edit-drawer" id="${escapeHtml(drawerId)}" aria-label="人工改稿抽屉">
      <div class="drawer-shell">
        <header class="drawer-header">
          <div>
            <p class="ops-kicker">人工改稿</p>
            <h2>修改待审正文</h2>
            <p>适合修少量错字、补换行、调整节奏。保存后用 POST 写入，不会进入结果二级页。</p>
          </div>
          <button class="icon-button" type="button" data-close-dialog aria-label="关闭人工改稿">×</button>
        </header>
        <form class="manual-edit-form" method="POST" action="/webhook/novel-review-manual-edit" data-review-manual-edit>
          <input type="hidden" name="chapter_id" value="${chapterId}" />
          <input type="hidden" name="review_token" value="${token}" />
          <input type="hidden" name="reviewer" value="local_user" />
          <label>
            <span>章节标题</span>
            <input name="title" value="${title}" />
          </label>
          <label>
            <span>章节摘要</span>
            <textarea name="summary" rows="3">${summary}</textarea>
          </label>
          <label class="body-field">
            <span>正文</span>
            <textarea name="body" rows="18">${body}</textarea>
          </label>
          <label>
            <span>改稿说明</span>
            <textarea name="comment" rows="3" placeholder="例如：拆分对话段落，补足情绪转折，修正错别字。"></textarea>
          </label>
          <p class="form-hint" data-manual-edit-feedback>保存为候选稿会重新进入智能审稿；直接通过会立刻成为正式版本。</p>
          <div class="manual-button-row">
            <button type="submit" name="decision" value="resubmit">保存改稿并送审</button>
            <button class="secondary" type="submit" name="decision" value="approve">改稿并直接通过</button>
          </div>
        </form>
      </div>
    </dialog>`;
}

function actionForm(row, className) {
  const token = escapeHtml(row.review_token || '');
  const chapterId = escapeHtml(row.chapter_id || row.id || '');
  const actionUrl = '/webhook/novel-review-action';
  const recClass = recommendationClass(row);
  const recText = recommendation(row);
  return `
    <form class="actions ${className}" method="POST" action="${actionUrl}">
      <input type="hidden" name="chapter_id" value="${chapterId}" />
      <input type="hidden" name="review_token" value="${token}" />
      <input type="hidden" name="reviewer" value="local_user" />
      <div class="action-card-head">
        <strong>提交审核决策</strong>
        <span>当前推荐：${escapeHtml(recText)}。要求重写会自动携带右侧智能审稿的问题与建议。</span>
      </div>
      <label>
        <textarea name="comment" rows="3" aria-label="审核意见" placeholder="通过可留空；要求重写即使留空，也会按智能审稿的问题与建议改稿；拒绝建议填写原因。"></textarea>
      </label>
      <div class="button-row" data-recommendation="${escapeHtml(recClass)}">
        <button class="${recClass === 'approve' ? 'recommended-button' : ''}" name="action" value="approve" type="submit">通过</button>
        <button class="warn-button ${recClass === 'rewrite' ? 'recommended-button' : ''}" name="action" value="request_rewrite" type="submit">要求重写</button>
        <button class="secondary danger-secondary ${recClass === 'reject' ? 'recommended-button' : ''}" name="action" value="reject" type="submit">拒绝</button>
      </div>
    </form>`;
}

function observabilityBlock(row, opsId) {
  const latestJobStatus = row.latest_job_status || '';
  const notifyStatus = row.notify_status || '';
  const remindStatus = row.remind_status || '';
  const aiSuccess = row.ai_run_success;
  const aiStatus = aiSuccess === true ? 'SUCCESS' : aiSuccess === false ? 'FAILED' : '';
  const detailLink = row.review_detail_url
    ? `<a class="small-link" href="${escapeHtml(row.review_detail_url)}">通知落点</a>`
    : '';
  const aiError = localizeError(row.ai_run_error_message);
  const jobError = localizeError(row.latest_job_error_message);

  return `
    <section class="observability" id="${escapeHtml(opsId)}" aria-label="运行观察">
      <h3>运行观察</h3>
      <div class="ops-grid">
        <div>
          <h4>模型调用</h4>
          <dl>
            <dt>模型</dt><dd>${escapeHtml(row.ai_run_model || '未记录')}</dd>
            <dt>提示词</dt><dd>${escapeHtml(row.ai_run_prompt_version || '未记录')}</dd>
            <dt>耗时</dt><dd>${escapeHtml(formatDuration(row.ai_run_duration_ms))}</dd>
            <dt>结果</dt><dd>${badge(aiStatus, '未记录')}</dd>
            <dt>时间</dt><dd>${escapeHtml(formatLocalTime(row.ai_run_created_at))}</dd>
          </dl>
          ${aiError ? `<p class="error">${escapeHtml(aiError)}</p>` : ''}
        </div>
        <div>
          <h4>任务状态</h4>
          <dl>
            <dt>类型</dt><dd>${escapeHtml(label(jobTypeLabel, row.latest_job_type, '未记录'))}</dd>
            <dt>状态</dt><dd>${badge(latestJobStatus, '未记录')}</dd>
            <dt>尝试</dt><dd>${escapeHtml(row.latest_job_attempt_count ?? 0)}</dd>
            <dt>更新</dt><dd>${escapeHtml(formatLocalTime(row.latest_job_updated_at))}</dd>
          </dl>
          ${jobError ? `<p class="error">${escapeHtml(jobError)}</p>` : ''}
        </div>
        <div>
          <h4>通知状态</h4>
          <dl>
            <dt>任务</dt><dd>${badge(notifyStatus, '未记录')}</dd>
            <dt>提醒</dt><dd>${badge(remindStatus, '未记录')}</dd>
          </dl>
          ${detailLink}
        </div>
        <div>
          <h4>事实库</h4>
          <p class="fact-line">候选事实 ${escapeHtml(row.pending_fact_count ?? 0)} / 已激活 ${escapeHtml(row.active_fact_count ?? 0)} / 已失效 ${escapeHtml(row.inactive_fact_count ?? 0)}</p>
        </div>
        <div class="wide">
          <h4>人工记录</h4>
          <p class="muted">共 ${escapeHtml(row.human_review_count ?? 0)} 条</p>
          <ul class="history">${humanReviewItems(row.human_reviews)}</ul>
        </div>
      </div>
    </section>
  `;
}

function safeId(row) {
  return String(row.chapter_id || row.id || `chapter-${row.chapter_no || 'unknown'}`).replace(/[^a-zA-Z0-9_-]/g, '-');
}

function reviewDetailUrl(row) {
  return `/webhook/novel-review-detail?chapter_id=${encodeURIComponent(row.chapter_id || row.id || '')}&review_token=${encodeURIComponent(row.review_token || '')}`;
}

function renderListDashboard(items) {
  if (!items.length) return '';
  const first = items[0];
  const counts = items.reduce((acc, row) => {
    acc[recommendationClass(row)] = (acc[recommendationClass(row)] || 0) + 1;
    return acc;
  }, {});
  return `
    <section class="review-workbench" aria-label="审核入口">
      <div>
        <p class="ops-kicker">审核入口</p>
        <h2>先处理最上方的待审稿</h2>
        <p>列表只保留判断所需信息：推荐动作、评分、摘要和首要问题。正文与提交动作都在详情页，避免误操作。</p>
        <div class="review-counts">
          <span>建议通过 ${escapeHtml(counts.approve || 0)}</span>
          <span>建议重写 ${escapeHtml(counts.rewrite || 0)}</span>
          <span>高风险 ${escapeHtml(counts.reject || 0)}</span>
          <span>需判断 ${escapeHtml(counts.review || 0)}</span>
        </div>
      </div>
      <div class="workbench-actions">
        <a class="primary-link" href="${escapeHtml(reviewDetailUrl(first))}">处理下一章</a>
        <a href="/webhook/novel-center">返回工作台</a>
        <a href="/webhook/novel-project-list?filter=review">待审项目</a>
      </div>
    </section>`;
}

function renderDetailReturnBar(row) {
  return `
    <nav class="return-strip" aria-label="审核返回上下文">
      <a href="/webhook/novel-review-list">返回审核列表</a>
      <a href="${escapeHtml(projectDetailHref(row))}">返回项目</a>
      <a href="${escapeHtml(chapterDetailHref(row))}">返回章节</a>
      <a href="${escapeHtml(projectQueueHref(row))}">查看队列</a>
    </nav>`;
}

function renderListCard(row) {
  const score = Number(row.total_score || 0);
  const title = escapeHtml(reviewChapterTitle(row));
  const projectTitle = escapeHtml(row.project_title || row.novel_title || row.project_name || '小说项目');
  const detailUrl = reviewDetailUrl(row);
  const summary = row.summary || '暂无候选稿摘要，请打开审核详情阅读正文。';
  const rec = recommendation(row);
  const recClass = recommendationClass(row);
  const issueCount = itemCount(row.issues);
  const suggestionCount = itemCount(row.suggestions);
  const firstIssue = shortItem(row.issues, '暂无首要问题');
  const firstSuggestion = shortItem(row.suggestions, '暂无修改建议');
  return `
    <article class="review-row ${escapeHtml(recClass)} review-list-summary" data-mode="list" data-page-key="${escapeHtml(row.chapter_id || row.id || title)}">
      <div class="review-row-main">
        <div class="row-title-line">
          <span class="recommendation-pill ${escapeHtml(recClass)}">${escapeHtml(rec)}</span>
          <h3>${title}</h3>
        </div>
        <p class="meta">待审摘要 / ${projectTitle} / 第 ${escapeHtml(row.chapter_no || '')} 章 / 版本 ${escapeHtml(row.generation_version || '')}</p>
        <p class="summary-line">${escapeHtml(summary)}</p>
        <div class="quick-evidence" aria-label="快速依据">
          <span>评分 ${escapeHtml(score || '-')}</span>
          <span>问题 ${escapeHtml(issueCount)}</span>
          <span>建议 ${escapeHtml(suggestionCount)}</span>
          <span>候选事实 ${escapeHtml(row.pending_fact_count ?? 0)}</span>
        </div>
        <details class="mini-evidence">
          <summary>查看首要问题和建议</summary>
          <p><strong>问题</strong>${escapeHtml(firstIssue)}</p>
          <p><strong>建议</strong>${escapeHtml(firstSuggestion)}</p>
        </details>
      </div>
      <div class="review-row-actions">
        <a class="primary-link" href="${detailUrl}">打开并决策</a>
        <a href="${escapeHtml(projectDetailHref(row))}">回项目</a>
        <a href="${escapeHtml(chapterDetailHref(row))}">章节上下文</a>
      </div>
    </article>`;
}

function reviewGroupInfo(row) {
  const rec = recommendationClass(row);
  const notifyStatus = String(row.notify_status || row.remind_status || '');
  if (notifyStatus.includes('SKIPPED') || notifyStatus.includes('FAILED')) {
    return {key: 'notify', title: '通知异常', detail: '提醒没有正常送达，先打开详情确认上下文。'};
  }
  if (rec === 'approve') return {key: 'approve', title: '建议通过', detail: '评分和结论较稳定，优先快速扫读后通过。'};
  if (rec === 'rewrite') return {key: 'rewrite', title: '建议重写', detail: '需要把修改意见写清楚，方便重写任务继承。'};
  if (rec === 'reject') return {key: 'risk', title: '高风险', detail: '拒绝会阻止候选稿成为正式版本，请确认原因明确。'};
  return {key: 'manual', title: '需人工判断', detail: '当前结果不够明确，先阅读正文和运行依据。'};
}

function renderListGroups(items) {
  const order = ['approve', 'rewrite', 'risk', 'notify', 'manual'];
  const groups = items.reduce((acc, row) => {
    const info = reviewGroupInfo(row);
    if (!acc[info.key]) acc[info.key] = {...info, rows: []};
    acc[info.key].rows.push(row);
    return acc;
  }, {});
  return order
    .filter((key) => groups[key])
    .map((key, index) => `
      <details class="review-lane" data-review-lane="${escapeHtml(key)}" ${index === 0 ? 'open' : ''}>
        <summary class="lane-head">
          <div>
            <p class="ops-kicker">审核分组</p>
            <h2>${escapeHtml(groups[key].title)}</h2>
            <p class="muted">${escapeHtml(groups[key].detail)}</p>
          </div>
          <strong>${escapeHtml(groups[key].rows.length)}</strong>
        </summary>
        ${groups[key].rows.map(renderListCard).join('')}
      </details>`)
    .join('');
}

function renderDetailCard(row) {
  const body = String(row.body || '');
  const score = Number(row.total_score || 0);
  const title = escapeHtml(reviewChapterTitle(row));
  const projectTitle = escapeHtml(row.project_title || row.novel_title || row.project_name || '小说项目');
  const id = safeId(row);
  const commentAnchor = `review-comment-${id}`;
  const opsAnchor = `review-ops-${id}`;
  const drawerId = `ai-review-drawer-${id}`;
  const manualDrawerId = `manual-edit-drawer-${id}`;
  const rec = recommendation(row);
  return `
    <article class="card" data-mode="detail">
      <header class="card-header">
        <div>
          <p class="meta">${projectTitle} / 第 ${escapeHtml(row.chapter_no || '')} 章 / 版本 ${escapeHtml(row.generation_version || '')}</p>
          <h2>${title}</h2>
        </div>
        <div class="score ${scoreClass(score)}">${score || '-'}</div>
      </header>
      <span id="${escapeHtml(commentAnchor)}" class="anchor-target"></span>
      ${actionForm(row, 'mobile-actions')}
      <section class="review-detail-workspace" id="reader-section-${escapeHtml(id)}">
        <div class="review-reader-panel">
          <div class="reader-head">
            <div>
              <p class="ops-kicker">审核内容</p>
              <h3>先读正文，再提交人工判断</h3>
              <p class="muted">推荐动作：${escapeHtml(rec)}。智能审稿已收进右侧抽屉，避免干扰正文阅读。</p>
            </div>
            ${reviewScoreBrief(row)}
          </div>
          <pre class="reader-body">${escapeHtml(body)}</pre>
        </div>
        <aside class="decision-dock" aria-label="审核决策侧栏">
          <div class="decision-dock-head">
            <p class="ops-kicker">人工决策</p>
            <strong>${escapeHtml(rec)}</strong>
            <span>阅读正文后提交；通过会成为正式版本，重写会继承你的意见。</span>
          </div>
          ${actionForm(row, 'desktop-actions')}
          <div class="decision-links">
            <button type="button" data-open-dialog="${escapeHtml(manualDrawerId)}">人工改稿</button>
            <button type="button" data-open-dialog="${escapeHtml(drawerId)}">打开智能审稿</button>
            <button type="button" data-open-dialog="${escapeHtml(drawerId)}">查看运行依据</button>
            <a href="/webhook/novel-review-list">返回审核列表</a>
            <a href="${escapeHtml(projectDetailHref(row))}">返回项目</a>
            <a href="${escapeHtml(chapterDetailHref(row))}">返回章节</a>
            <a href="${escapeHtml(projectQueueHref(row))}">查看队列</a>
          </div>
        </aside>
      </section>
      ${aiReviewDrawer(row, drawerId, opsAnchor)}
      ${manualReviewEditDrawer(row, manualDrawerId)}
    </article>`;
}

const rows = $input.all()
  .map((item) => item.json || {})
  .filter((row) => !row.is_empty);

const pageMode = String(rows[0]?.page_mode || 'DETAIL').toUpperCase();
const isListPage = pageMode === 'LIST';
const firstRow = rows[0] || {};
const reviewBreadcrumbHtml = isListPage
  ? breadcrumb([
    {label: '工作台', href: '/webhook/novel-center'},
    {label: '审核中心'},
  ])
  : reviewDetailBreadcrumb(firstRow);
const cards = rows.length
  ? (isListPage ? renderListGroups(rows) : rows.map(renderDetailCard).join(''))
  : '<section class="empty">暂无待审核章节</section>';
const reviewFlowHtml = rows.length
  ? (isListPage ? renderListDashboard(rows) : '')
  : '';
const headerActionsHtml = !isListPage && rows.length ? renderDetailReturnBar(firstRow) : '';
const reviewPagerHtml = isListPage && rows.length
  ? `<nav class="pager" data-pagination="reviews" aria-label="审核分页">
      <span class="pager-status" data-page-status>分页载入中</span>
      <div class="pager-controls">
        <button type="button" data-page-prev>上一页</button>
        <button type="button" data-page-next>下一页</button>
        <label>每页
          <select data-page-size>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
        </label>
      </div>
    </nav>`
  : '';

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>小说审核中心</title>
  <style>
    :root { color-scheme: light; --ink:#17202a; --muted:#667085; --line:#d9dee7; --bg:#f6f7f9; --panel:#fff; --accent:#1f7a5c; --accent-soft:#edf8f3; --warn:#a76508; --bad:#b42318; --bad-soft:#fff0ee; }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--ink); background: var(--bg); -webkit-tap-highlight-color: rgba(31, 122, 92, .14); }
    .app-shell { min-height: 100vh; display: grid; grid-template-columns: 220px minmax(0, 1fr); }
    .app-sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 16px; padding: 22px 16px; border-right: 1px solid var(--line); background: #fff; }
    .brand { display: grid; gap: 3px; padding: 0 4px 12px; border-bottom: 1px solid var(--line); }
    .brand span { color: var(--muted); font-size: 11px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
    .brand strong { font-size: 20px; line-height: 1.2; }
    .side-nav { display: grid; gap: 4px; }
    .side-nav a, .side-nav span { min-height: 38px; display: flex; align-items: center; border-radius: 8px; padding: 0 10px; color: #344054; text-decoration: none; font-weight: 750; }
    .side-nav a:hover, .side-nav .active { color: var(--accent); background: var(--accent-soft); }
    .side-primary { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; margin-top: auto; background: var(--accent); color: #fff; text-decoration: none; font-weight: 800; }
    main { width: min(1240px, calc(100vw - 32px)); margin: 24px auto 48px; }
    .app-shell > main { width: auto; max-width: none; margin: 24px 16px 48px; }
    .page-header { display: flex; justify-content: space-between; gap: 16px; align-items: end; margin-bottom: 18px; }
    .page-context { position: sticky; top: 0; z-index: 70; margin-bottom: 18px; padding: 14px 0 12px; background: rgba(246, 247, 249, .97); border-bottom: 1px solid rgba(216, 222, 232, .92); backdrop-filter: blur(10px); }
    .page-context .page-header { margin-bottom: 0; }
    h1 { margin: 0; font-size: 28px; text-wrap: balance; }
    .ops-kicker { margin: 0 0 6px; color: var(--muted); font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    .page-header p { margin: 6px 0 0; color: var(--muted); }
    nav { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    a { color: var(--accent); text-decoration: none; font-weight: 650; }
    nav a { white-space: nowrap; }
    .breadcrumbs { gap: 8px; margin: 0 0 12px; color: var(--muted); font-size: 13px; }
    .breadcrumbs a { color: var(--muted); }
    .breadcrumbs a:hover { color: var(--accent); }
    .crumb-separator { color: #98a2b3; }
    .review-workbench { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; border: 1px solid #b9e3d4; border-radius: 8px; padding: 16px; margin-bottom: 18px; background: var(--accent-soft); }
    .review-workbench h2 { margin: 0 0 8px; }
    .review-workbench p { margin: 0; color: #225447; line-height: 1.65; }
    .review-counts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .review-counts span, .quick-evidence span { min-height: 28px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 999px; padding: 0 10px; background: #fff; color: #225447; font-size: 13px; font-weight: 700; }
    .workbench-actions { min-width: 320px; display: grid; grid-template-columns: 1fr; gap: 8px; }
    .workbench-actions a, .review-row-actions a, .primary-link, .return-strip a { min-height: 38px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 12px; background: #fff; color: var(--accent); text-decoration: none; font-weight: 750; }
    .primary-link, .workbench-actions .primary-link, .review-row-actions .primary-link { background: var(--accent); color: #fff; border-color: var(--accent); }
    .return-strip { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; padding: 12px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .page-header .return-strip { margin: 0; padding: 0; border: 0; background: transparent; justify-content: flex-end; }
    .page-header .return-strip a { min-height: 34px; background: #fff; }
    .pager { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 12px 16px; margin-bottom: 18px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .pager-controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .pager button, .pager select { min-height: 36px; border: 1px solid var(--line); border-radius: 8px; background: #fff; color: var(--ink); padding: 0 10px; font: inherit; font-weight: 650; }
    .pager button:not(:disabled) { color: var(--accent); cursor: pointer; }
    .pager button:not(:disabled):hover { border-color: var(--accent); background: var(--accent-soft); }
    .pager button:disabled { color: var(--muted); cursor: not-allowed; }
    .pager-status { color: var(--muted); font-size: 13px; }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px; margin-bottom: 18px; content-visibility: auto; contain-intrinsic-size: 520px; }
    .review-lane { margin-bottom: 18px; }
    .lane-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; margin-bottom: 12px; background: #fff; }
    .review-lane:not([open]) .lane-head { margin-bottom: 0; }
    .lane-head h2 { margin-top: 0; }
    .lane-head strong { min-width: 42px; min-height: 42px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #b9e3d4; border-radius: 8px; background: var(--accent-soft); color: var(--accent); font-size: 20px; font-variant-numeric: tabular-nums; }
    .review-row { display: grid; grid-template-columns: minmax(0, 1fr) 180px; gap: 14px; align-items: start; border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; background: #fff; }
    .review-row.approve { border-color: #b9e3d4; }
    .review-row.rewrite { border-color: #f1ce96; }
    .review-row.reject { border-color: #f2b8b5; }
    .row-title-line { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .row-title-line h3 { margin: 0; font-size: 18px; }
    .recommendation-pill { display: inline-flex; align-items: center; min-height: 26px; border-radius: 999px; padding: 0 10px; font-size: 13px; font-weight: 800; border: 1px solid var(--line); background: #f6f7f9; }
    .recommendation-pill.approve { color: var(--accent); background: var(--accent-soft); border-color: #b9e3d4; }
    .recommendation-pill.rewrite { color: var(--warn); background: #fff7e8; border-color: #f1ce96; }
    .recommendation-pill.reject { color: var(--bad); background: var(--bad-soft); border-color: #f2b8b5; }
    .summary-line { margin: 8px 0 10px; line-height: 1.65; }
    .quick-evidence { display: flex; flex-wrap: wrap; gap: 8px; }
    .mini-evidence { margin-top: 10px; border-top: 1px solid var(--line); padding-top: 8px; color: var(--muted); }
    .mini-evidence summary { color: var(--accent); cursor: pointer; font-weight: 700; }
    .mini-evidence p { margin: 8px 0 0; line-height: 1.55; }
    .mini-evidence strong { margin-right: 8px; color: var(--ink); }
    .review-row-actions { display: grid; gap: 8px; }
    .card-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; border-bottom: 1px solid var(--line); padding-bottom: 14px; }
    h2 { margin: 4px 0 0; font-size: 22px; }
    .detail-link, .small-link { display: inline-block; margin-top: 8px; color: var(--accent); text-decoration: none; font-weight: 650; }
    .context-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .context-actions .detail-link { min-height: 32px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 10px; background: #fff; margin-top: 0; }
    .drawer-trigger, .decision-links button {
      color: var(--accent);
      border: 1px solid var(--line);
      background: #fff;
      padding: 0 10px;
      min-height: 32px;
      font: inherit;
      font-weight: 650;
      border-radius: 8px;
      cursor: pointer;
    }
    h3, h4 { margin: 0 0 10px; }
    .meta, .muted { margin: 0; color: var(--muted); font-size: 13px; }
    .score { min-width: 64px; border-radius: 8px; padding: 10px 12px; text-align: center; font-size: 24px; font-weight: 700; border: 1px solid var(--line); font-variant-numeric: tabular-nums; }
    .score.good { color: var(--accent); }
    .score.warn { color: var(--warn); }
    .score.bad { color: var(--bad); }
    .review-summary { margin-top: 16px; padding: 14px; border: 1px solid #b9e3d4; border-radius: 8px; background: var(--accent-soft); }
    .decision-banner { display: grid; gap: 4px; margin-bottom: 12px; padding: 12px; border-radius: 8px; border: 1px solid var(--line); background: #fff; }
    .decision-banner strong { font-size: 18px; }
    .decision-banner span { color: var(--muted); line-height: 1.55; }
    .decision-banner.approve { border-color: #b9e3d4; background: #f5fbf8; }
    .decision-banner.rewrite { border-color: #f1ce96; background: #fffaf0; }
    .decision-banner.reject { border-color: #f2b8b5; background: var(--bad-soft); }
    .review-summary dl { grid-template-columns: 96px 1fr; margin-bottom: 0; }
    .review-evidence { margin-top: 12px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .review-evidence dl { grid-template-columns: 96px 1fr; margin-bottom: 0; }
    .decision-rail { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 420px); gap: 14px; align-items: start; margin-top: 16px; padding: 14px; border: 1px solid #b9e3d4; border-radius: 8px; background: var(--accent-soft); }
    .decision-rail .review-summary { margin-top: 0; background: #fff; }
    .decision-rail .actions { position: sticky; top: 16px; margin-top: 0; background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
    .detail-link:hover, .small-link:hover { border-color: var(--accent); background: var(--accent-soft); }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; padding-top: 16px; }
    .review-detail-workspace { --review-panel-height: min(760px, calc(100vh - 150px)); display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 380px); gap: 18px; align-items: stretch; padding-top: 16px; }
    .review-reader-panel { min-width: 0; min-height: 520px; height: var(--review-panel-height); display: grid; grid-template-rows: auto minmax(0, 1fr); border: 1px solid var(--line); border-radius: 8px; background: #fff; overflow: hidden; }
    .reader-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding: 16px 18px; border-bottom: 1px solid var(--line); background: #fbfcfd; }
    .reader-head h3 { margin-bottom: 6px; font-size: 20px; }
    .review-brief { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; max-width: 420px; }
    .review-brief span { min-height: 28px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 0 10px; background: #fff; color: #344054; font-size: 13px; font-weight: 750; white-space: nowrap; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; padding: 18px 20px; background: #fff; border-radius: 0; line-height: 1.82; min-height: 0; height: 100%; overflow: auto; font-size: 16px; }
    aside { border-left: 1px solid var(--line); padding-left: 18px; }
    .decision-dock { position: sticky; top: 86px; align-self: start; max-height: var(--review-panel-height); display: flex; flex-direction: column; overflow: auto; border: 1px solid #b9e3d4; border-radius: 8px; background: var(--accent-soft); padding: 14px; }
    .decision-dock-head { display: grid; gap: 4px; margin-bottom: 12px; }
    .decision-dock-head strong { font-size: 20px; }
    .decision-dock-head span { color: #225447; line-height: 1.55; font-size: 13px; }
    .decision-dock .actions { margin-top: 0; border: 1px solid var(--line); border-radius: 8px; background: #fff; padding: 12px; }
    .decision-links { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #b9e3d4; }
    .decision-links a, .decision-links button { min-height: 36px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 10px; background: #fff; color: var(--accent); text-decoration: none; font: inherit; font-weight: 750; cursor: pointer; }
    .decision-links button:first-child { grid-column: 1 / -1; background: var(--accent); color: #fff; border-color: var(--accent); }
    dl { display: grid; grid-template-columns: 70px 1fr; gap: 6px 10px; margin: 0 0 16px; }
    dt { color: var(--muted); }
    dd { margin: 0; min-width: 0; }
    ul { margin: 0 0 16px; padding-left: 18px; }
    .summary-card { margin-top: 16px; padding: 14px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .summary-card p { margin: 0 0 8px; line-height: 1.7; }
    .compact-review { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 16px; }
    .compact-review > div { border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
    .observability { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); scroll-margin-top: 16px; }
    .ops-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
    .ops-grid > div { border: 1px solid var(--line); border-radius: 8px; padding: 12px; min-width: 0; }
    .ops-grid .wide { grid-column: 1 / -1; }
    .badge { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 650; font-variant-numeric: tabular-nums; }
    .badge.good { color: var(--accent); background: var(--accent-soft); }
    .badge.warn { color: var(--warn); background: #fff7e8; }
    .badge.bad { color: var(--bad); background: var(--bad-soft); }
    .badge.muted { color: var(--muted); background: #f6f7f9; }
    .fact-line { margin: 0; color: var(--muted); line-height: 1.7; }
    .history { padding-left: 18px; margin-bottom: 0; }
    .history span { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; }
    .history p, .error { margin: 4px 0 0; color: var(--bad); font-size: 13px; line-height: 1.5; }
    .anchor-target { display: block; height: 1px; scroll-margin-top: 16px; }
    .actions { display: grid; gap: 10px; margin-top: 16px; align-items: start; }
    .action-card-head { display: grid; gap: 4px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
    .action-card-head strong { font-size: 17px; }
    .action-card-head span { color: var(--muted); line-height: 1.5; font-size: 13px; }
    .actions label { display: grid; gap: 6px; color: var(--muted); font-size: 13px; }
    .actions em { font-style: normal; line-height: 1.45; }
    .actions textarea { min-height: 48px; resize: vertical; border: 1px solid var(--line); border-radius: 8px; padding: 10px; font: inherit; color: var(--ink); }
    .button-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    button { border: 0; border-radius: 8px; padding: 12px 18px; font: inherit; font-weight: 650; background: var(--accent); color: white; cursor: pointer; touch-action: manipulation; }
    button:hover { filter: brightness(.95); }
    button:disabled { opacity: .68; cursor: progress; }
    button.warn-button { background: var(--warn); }
    button.secondary { background: #4b5563; }
    button.danger-secondary { background: #6b7280; }
    button.recommended-button { box-shadow: 0 0 0 3px rgba(31, 122, 92, .18); transform: translateY(-1px); }
    .action-toast { position: fixed; right: 18px; bottom: 18px; z-index: 90; max-width: min(420px, calc(100vw - 36px)); border: 1px solid #b9e3d4; border-radius: 8px; padding: 12px 14px; background: #fff; color: var(--ink); box-shadow: 0 18px 44px rgba(16, 24, 40, .18); line-height: 1.55; }
    .action-toast strong { display: block; margin-bottom: 2px; }
    .action-toast.is-error { border-color: #f2b8b5; background: var(--bad-soft); color: var(--bad); }
    .action-toast[hidden] { display: none !important; }
    .mobile-actions { display: none; }
    .side-drawer {
      width: min(520px, calc(100vw - 24px));
      max-width: none;
      height: 100vh;
      max-height: none;
      margin: 0 0 0 auto;
      padding: 0;
      border: 0;
      background: #fff;
      color: var(--ink);
      box-shadow: -24px 0 60px rgba(16, 24, 40, .22);
    }
    .side-drawer::backdrop { background: rgba(15, 23, 42, .28); }
    .drawer-shell { min-height: 100%; display: grid; grid-template-rows: auto min-content min-content min-content min-content 1fr; overflow: auto; }
    .drawer-header { position: sticky; top: 0; z-index: 2; display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; padding: 18px; border-bottom: 1px solid var(--line); background: rgba(255, 255, 255, .96); backdrop-filter: blur(10px); }
    .drawer-header h2 { margin-top: 0; }
    .drawer-header p { margin: 4px 0 0; color: var(--muted); line-height: 1.55; }
    .icon-button { width: 36px; height: 36px; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 8px; padding: 0; background: #fff; color: var(--ink); font-size: 22px; line-height: 1; }
    .drawer-section { padding: 16px 18px; border-bottom: 1px solid var(--line); }
    .drawer-section .review-summary { margin-top: 0; background: #fff; }
    .drawer-section ul { margin-bottom: 0; }
    .ai-score-card { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 14px; align-items: start; background: var(--accent-soft); }
    .ai-score-card .score { background: #fff; }
    .side-drawer .review-evidence, .side-drawer .observability { margin: 0; padding: 16px 18px; border-width: 0 0 1px; border-radius: 0; }
    .side-drawer .ops-grid { grid-template-columns: 1fr; }
    .side-drawer .ops-grid > div { background: #fff; }
    .manual-edit-drawer { width: min(720px, calc(100vw - 24px)); }
    .manual-edit-drawer .drawer-shell { grid-template-rows: auto minmax(0, 1fr); }
    .manual-edit-form { min-height: 0; display: grid; grid-template-rows: auto auto minmax(260px, 1fr) auto auto auto; gap: 12px; padding: 16px 18px 18px; overflow: auto; }
    .manual-edit-form label { display: grid; gap: 6px; color: var(--muted); font-size: 13px; font-weight: 700; }
    .manual-edit-form input, .manual-edit-form textarea { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; color: var(--ink); background: #fff; font: inherit; }
    .manual-edit-form .body-field { min-height: 0; }
    .manual-edit-form .body-field textarea { min-height: 260px; height: 100%; line-height: 1.82; resize: vertical; }
    .form-hint { margin: 0; color: var(--muted); line-height: 1.55; font-size: 13px; }
    .form-hint.is-error { color: var(--bad); }
    .form-hint.is-success { color: var(--accent); }
    .manual-button-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .empty { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 28px; color: var(--muted); }
    a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 3px solid #8fd4bd; outline-offset: 2px; }
    @media (max-width: 960px) { .ops-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 820px) {
      main, .app-shell > main { width: min(100% - 24px, 1240px); margin: 16px auto 48px; padding-bottom: calc(96px + env(safe-area-inset-bottom)); }
      .app-shell { display: block; }
      .app-sidebar { position: static; height: auto; padding: 12px; border-right: 0; border-bottom: 1px solid var(--line); }
      .brand { display: none; }
      .side-nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
      .side-nav a, .side-nav span { white-space: nowrap; }
      .side-primary { display: none; }
      .page-header { display: block; }
      nav { margin-top: 12px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
      .review-workbench, .review-row { display: block; }
      .workbench-actions, .review-row-actions { min-width: 0; margin-top: 12px; }
      .pager { display: grid; grid-template-columns: 1fr; }
      .return-strip { flex-wrap: nowrap; overflow-x: auto; }
      .grid, .ops-grid, .compact-review, .decision-rail, .review-detail-workspace { grid-template-columns: 1fr; }
      .reader-head { display: grid; grid-template-columns: 1fr; }
      .review-brief { justify-content: flex-start; max-width: none; }
      .review-reader-panel { height: auto; min-height: 0; }
      pre { height: auto; max-height: 68vh; }
      aside { border-left: 0; padding-left: 0; }
      .decision-dock { position: static; height: auto; min-height: 0; }
      .decision-links { margin-top: 10px; }
      .decision-rail .actions { position: static; }
      .desktop-actions { display: none; }
      .mobile-actions {
        display: grid;
        grid-template-columns: 1fr;
        position: static;
        margin: 12px 0;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 12px;
      }
      .button-row { display: grid; grid-template-columns: 1fr; }
      button { min-height: 44px; }
    }
  </style>
</head>
<body>
  <div class="app-shell">
  ${renderSidebar('审核中心')}
  <main>
    <div class="page-context">
    ${reviewBreadcrumbHtml}
    <div class="page-header">
      <div>
        <h1>小说审核中心</h1>
        <p>${isListPage ? '列表页展示摘要卡片，完整正文和操作在详情页完成。' : '审核动作需要确认后通过表单提交。'}</p>
      </div>
      ${headerActionsHtml}
    </div>
    </div>
    ${reviewFlowHtml}
    ${reviewPagerHtml}
    ${cards}
  </main>
  </div>
  <script>
    (() => {
      const pager = document.querySelector('[data-pagination="reviews"]');
      if (pager) {
        const rows = Array.from(document.querySelectorAll('.review-row'));
        const lanes = Array.from(document.querySelectorAll('.review-lane'));
        const prev = pager.querySelector('[data-page-prev]');
        const next = pager.querySelector('[data-page-next]');
        const status = pager.querySelector('[data-page-status]');
        const sizeSelect = pager.querySelector('[data-page-size]');
        const allowedSizes = new Set(['10', '20', '50']);
        let currentPage = 1;
        let pageSize = 10;
        const readPageState = () => {
          const params = new URLSearchParams(window.location.search);
          const requestedSize = params.get('page_size') || '10';
          pageSize = allowedSizes.has(requestedSize) ? Number(requestedSize) : 10;
          currentPage = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
          if (sizeSelect) sizeSelect.value = String(pageSize);
        };
        const writePageState = () => {
          const params = new URLSearchParams(window.location.search);
          if (currentPage > 1) params.set('page', String(currentPage));
          else params.delete('page');
          if (pageSize !== 10) params.set('page_size', String(pageSize));
          else params.delete('page_size');
          const query = params.toString();
          window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + (window.location.hash || ''));
        };
        const applyPage = (options = {}) => {
          const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
          currentPage = Math.min(Math.max(1, currentPage), totalPages);
          const start = (currentPage - 1) * pageSize;
          const visibleRows = new Set(rows.slice(start, start + pageSize));
          rows.forEach((row) => { row.hidden = !visibleRows.has(row); });
          lanes.forEach((lane) => {
            lane.hidden = !Array.from(lane.querySelectorAll('.review-row')).some((row) => !row.hidden);
          });
          if (status) status.textContent = '共 ' + rows.length + ' 条待审 / 第 ' + currentPage + ' 页，共 ' + totalPages + ' 页';
          if (prev) prev.disabled = currentPage <= 1;
          if (next) next.disabled = currentPage >= totalPages;
          if (options.write !== false) writePageState();
        };
        if (prev) prev.addEventListener('click', () => {
          currentPage -= 1;
          applyPage();
        });
        if (next) next.addEventListener('click', () => {
          currentPage += 1;
          applyPage();
        });
        if (sizeSelect) sizeSelect.addEventListener('change', () => {
          pageSize = Number(sizeSelect.value) || 10;
          currentPage = 1;
          applyPage();
        });
        readPageState();
        applyPage({write: false});
        window.addEventListener('popstate', () => {
          readPageState();
          applyPage({write: false});
        });
      }

      document.querySelectorAll('[data-open-dialog]').forEach((button) => {
        button.addEventListener('click', () => {
          const dialog = document.getElementById(button.dataset.openDialog || '');
          if (!dialog) return;
          if (typeof dialog.showModal === 'function') dialog.showModal();
          else dialog.setAttribute('open', '');
        });
      });

      document.querySelectorAll('.side-drawer').forEach((dialog) => {
        dialog.addEventListener('click', (event) => {
          if (event.target === dialog) dialog.close();
        });
        dialog.querySelectorAll('[data-close-dialog]').forEach((button) => {
          button.addEventListener('click', () => dialog.close());
        });
      });

      const messages = {
        approve: '确认通过这一章？通过后会成为当前正式版本，并可能创建下一章任务。',
        request_rewrite: '确认要求重写这一稿？系统会自动携带智能审稿的问题与建议，人工意见会作为额外优先级。',
        reject: '确认拒绝这一稿？拒绝后不会成为正式版本，建议填写拒绝原因。',
      };
      const manualEditMessages = {
        resubmit: '确认保存人工改稿并重新送审？原待审稿会退出审核列表，新改稿会进入智能审稿队列。',
        approve: '确认保存人工改稿并直接通过？通过后会成为当前正式版本，并可能创建下一章任务。',
      };
      const toast = document.createElement('div');
      toast.className = 'action-toast';
      toast.hidden = true;
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);

      const showToast = (title, detail = '', isError = false) => {
        toast.classList.toggle('is-error', Boolean(isError));
        toast.replaceChildren();
        const strong = document.createElement('strong');
        strong.textContent = title;
        toast.appendChild(strong);
        if (detail) {
          const span = document.createElement('span');
          span.textContent = detail;
          toast.appendChild(span);
        }
        toast.hidden = false;
      };

      const resultMessageFromHtml = (html, fallback) => {
        try {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const title = doc.querySelector('.result strong')?.textContent?.trim()
            || doc.querySelector('h1')?.textContent?.trim()
            || '';
          const detail = doc.querySelector('.result p')?.textContent?.trim()
            || doc.querySelector('p')?.textContent?.trim()
            || '';
          return [title, detail].filter(Boolean).join('：') || fallback;
        } catch (error) {
          return fallback;
        }
      };

      const formPostUrl = (form) => form.getAttribute('action') || form.action || window.location.href;

      document.querySelectorAll('form.actions button[name="action"]').forEach((button) => {
        button.addEventListener('click', () => {
          const form = button.closest('form');
          if (form) form.dataset.pendingAction = button.value || '';
        });
      });

      document.querySelectorAll('form.actions').forEach((form) => {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const button = event.submitter || form.querySelector('button[name="action"][value="' + (form.dataset.pendingAction || '') + '"]') || form.querySelector('button[type="submit"]');
          const action = button?.value || form.dataset.pendingAction || '';
          const comment = String(form.querySelector('textarea')?.value || '').trim();
          let message = messages[action] || '确认提交审核操作？';
          if (!comment && action === 'request_rewrite') {
            message += '\\n\\n未填写人工补充意见，将按智能审稿的问题与建议重写。继续吗？';
          }
          if (!comment && action === 'reject') {
            message += '\\n\\n你还没有填写审核意见，后续追踪会比较困难。仍要继续吗？';
          }
          if (!window.confirm(message)) {
            return;
          }
          const originalText = button?.textContent || '提交';
          if (button) {
            button.disabled = true;
            button.textContent = '提交中...';
          }
          try {
            const body = new FormData(form);
            if (button?.name && !body.has(button.name)) body.append(button.name, button.value || '');
            const response = await fetch(formPostUrl(form), {
              method: 'POST',
              body,
              credentials: 'same-origin',
              headers: {'X-Requested-With': 'fetch'},
            });
            const html = await response.text();
            if (!response.ok) {
              throw new Error(resultMessageFromHtml(html, '审核操作失败：HTTP ' + response.status));
            }
            showToast('审核决策已提交', '正在返回审核列表...');
            window.setTimeout(() => {
              window.location.href = '/webhook/novel-review-list';
            }, 450);
          } catch (error) {
            showToast('审核操作未完成', error.message || '提交失败，请稍后重试。', true);
            if (button) {
              button.disabled = false;
              button.textContent = originalText;
            }
          }
        });
      });

      document.querySelectorAll('form[data-review-manual-edit] button[name="decision"]').forEach((button) => {
        button.addEventListener('click', () => {
          const form = button.closest('form');
          if (form) form.dataset.pendingDecision = button.value || '';
        });
      });

      document.querySelectorAll('form[data-review-manual-edit]').forEach((form) => {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const button = event.submitter || form.querySelector('button[name="decision"][value="' + (form.dataset.pendingDecision || '') + '"]') || form.querySelector('button[type="submit"]');
          const decision = button?.value || form.dataset.pendingDecision || 'resubmit';
          const body = String(form.querySelector('textarea[name="body"]')?.value || '').trim();
          const feedback = form.querySelector('[data-manual-edit-feedback]');
          if (!body) {
            if (feedback) {
              feedback.textContent = '正文不能为空。';
              feedback.classList.add('is-error');
              feedback.classList.remove('is-success');
            }
            return;
          }
          if (!window.confirm(manualEditMessages[decision] || '确认保存人工改稿？')) {
            return;
          }
          const originalText = button?.textContent || '提交';
          if (feedback) {
            feedback.textContent = '正在保存人工改稿...';
            feedback.classList.remove('is-error', 'is-success');
          }
          if (button) {
            button.disabled = true;
            button.textContent = '保存中...';
          }
          try {
            const requestBody = new FormData(form);
            if (button?.name && !requestBody.has(button.name)) requestBody.append(button.name, button.value || '');
            const response = await fetch(formPostUrl(form), {
              method: 'POST',
              body: requestBody,
              credentials: 'same-origin',
              headers: {'X-Requested-With': 'fetch'},
            });
            const html = await response.text();
            if (!response.ok) {
              throw new Error(resultMessageFromHtml(html, '人工改稿保存失败：HTTP ' + response.status));
            }
            if (feedback) {
              feedback.textContent = decision === 'approve' ? '已保存并通过，正在返回审核列表...' : '已保存并送审，正在返回审核列表...';
              feedback.classList.add('is-success');
            }
            showToast('人工改稿已保存', '正在返回审核列表...');
            window.setTimeout(() => {
              window.location.href = '/webhook/novel-review-list';
            }, 450);
          } catch (error) {
            if (feedback) {
              feedback.textContent = error.message || '保存失败，请稍后重试。';
              feedback.classList.add('is-error');
            }
            showToast('人工改稿未完成', error.message || '保存失败，请稍后重试。', true);
            if (button) {
              button.disabled = false;
              button.textContent = originalText;
            }
          }
        });
      });
    })();
  </script>
</body>
</html>`;

return [{json: {html}}];
