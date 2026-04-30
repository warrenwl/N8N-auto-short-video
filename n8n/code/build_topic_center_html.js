// n8n Code node: Build Topic Center HTML
// Input comes from topic_candidates SELECT rows.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatLocalTime(value) {
  if (!value) return '';
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

function getQuery() {
  try {
    return $('Webhook - Topic Center').first().json.query || {};
  } catch (error) {
    return {};
  }
}

function tagText(tags) {
  if (Array.isArray(tags)) return tags.join(' ');
  if (typeof tags === 'string') return tags;
  return '';
}

const allowedTabs = new Set(['CREATE', 'ACTIVE', 'PROMOTED', 'REJECTED', 'DUPLICATE', 'ALL']);
const statusLabel = {
  NEW: '待筛选',
  SCORED: '已评分',
  SELECTED: '已选择',
  PROMOTED: '已入池',
  REJECTED: '已拒绝',
  DUPLICATE: '重复',
};
const sourceLabel = {
  manual: '人工录入',
  import: '批量导入',
  glm: 'GLM 生成',
  hot: '热点采集',
  competitor: '竞品参考',
};

const query = getQuery();
const activeTab = allowedTabs.has(String(query.status || '').toUpperCase()) ? String(query.status).toUpperCase() : 'ACTIVE';
const rowsAll = $input.all()
  .map((item) => item.json || {})
  .filter((row) => row.is_empty !== true && row.is_empty !== 'true');

const counts = rowsAll.reduce((acc, row) => {
  const status = String(row.status || '');
  acc.ALL += 1;
  acc[status] = (acc[status] || 0) + 1;
  if (['NEW', 'SCORED', 'SELECTED'].includes(status)) acc.ACTIVE += 1;
  return acc;
}, {ACTIVE: 0, NEW: 0, SCORED: 0, SELECTED: 0, PROMOTED: 0, REJECTED: 0, DUPLICATE: 0, ALL: 0});

const rows = activeTab === 'CREATE'
  ? []
  : activeTab === 'ALL'
  ? rowsAll
  : activeTab === 'ACTIVE'
    ? rowsAll.filter((row) => ['NEW', 'SCORED', 'SELECTED'].includes(String(row.status || '')))
    : rowsAll.filter((row) => row.status === activeTab);

function tab(status, label, count = null) {
  const active = activeTab === status ? ' active' : '';
  return `<a class="tab${active}" href="/webhook/topic-center?status=${status}">${escapeHtml(label)}${count === null ? '' : ` <span>${count}</span>`}</a>`;
}

function actionButtons(row) {
  const status = String(row.status || '');
  if (!['NEW', 'SCORED', 'SELECTED'].includes(status)) return '';
  const id = escapeHtml(row.id);
  return `
    <form method="GET" action="/webhook/topic-action" data-inline-action="true">
      <input type="hidden" name="action" value="promote" />
      <input type="hidden" name="candidate_id" value="${id}" />
      <button class="promote" type="submit">确认入池</button>
    </form>
    <form method="GET" action="/webhook/topic-action" data-inline-action="true">
      <input type="hidden" name="action" value="reject" />
      <input type="hidden" name="candidate_id" value="${id}" />
      <button class="reject" type="submit">拒绝</button>
    </form>
    <form method="GET" action="/webhook/topic-action" data-inline-action="true">
      <input type="hidden" name="action" value="duplicate" />
      <input type="hidden" name="candidate_id" value="${id}" />
      <button class="secondary" type="submit">标记重复</button>
    </form>
  `;
}

function promotedActions(row) {
  const topicId = row.promoted_topic_id || '';
  const token = row.promoted_topic_review_token || '';
  const status = String(row.promoted_topic_status || '');
  const progress = Number(row.promoted_topic_progress_percent);
  const progressText = Number.isFinite(progress) ? ` · ${Math.round(progress)}%` : '';
  if (status === 'IDEA' && topicId && token) {
    return `
      <form method="GET" action="/webhook/video-script-start" data-inline-action="true" data-reload-delay="1200">
        <input type="hidden" name="task_id" value="${escapeHtml(topicId)}" />
        <input type="hidden" name="token" value="${escapeHtml(token)}" />
        <button class="generate" type="submit">生成视频</button>
      </form>
    `;
  }
  if (['GENERATING_SCRIPT', 'SCRIPT_READY', 'GENERATING_AUDIO', 'AUDIO_READY', 'GENERATING_COVER', 'COVER_READY', 'RENDERING_VIDEO', 'FAILED', 'RENDER_FAILED'].includes(status)) {
    return `<a class="progress-link" href="/webhook/video-review-list?status=GENERATING">查看生成进度${escapeHtml(progressText)}</a>`;
  }
  if (status === 'NEED_REVIEW') {
    return `<a class="progress-link" href="/webhook/video-review-list?status=NEED_REVIEW">去审核视频</a>`;
  }
  return '';
}

function metaItem(label, value) {
  if (!value) return '';
  return `
    <div class="meta-item">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

const tabIntro = {
  ACTIVE: {
    title: '候选池',
    text: '这里展示还没有进入视频生产链路的候选选题。确认入池后，会写入 video_topics 并进入 IDEA 状态。',
  },
  PROMOTED: {
    title: '已入池',
    text: '这些选题已经转成正式视频主题，后续由 01 + 06 工作流继续生成脚本、语音、视频和待审核结果。',
  },
  REJECTED: {
    title: '已拒绝',
    text: '这里保留暂时不做的候选选题，方便回看来源、角度和评分理由，不会进入视频生成链路。',
  },
  DUPLICATE: {
    title: '重复选题',
    text: '这里保留被标记为重复的候选选题，用来避免后续人工或批量导入时重复投入。',
  },
  ALL: {
    title: '全部选题',
    text: '这里按统一卡片样式汇总所有候选状态，方便快速核对每条选题当前处在哪一步。',
  },
};

function renderPromotedCard(row) {
  const source = String(row.source || 'manual');
  const title = row.title || row.topic || '未命名选题';
  const tags = tagText(row.tags);
  const updatedAt = formatLocalTime(row.updated_at);
  const createdAt = formatLocalTime(row.created_at);
  const promotedTopicStatus = row.promoted_topic_status || 'IDEA';
  const promotedTitle = row.promoted_topic_title || title;
  const buttons = promotedActions(row);

  return `
    <article class="topic-card promoted-card">
      <div class="card-rail"><span>入池</span></div>
      <div class="promoted-main">
        <div class="candidate-head">
          <span class="badge promoted">已入池</span>
          <span class="source">${escapeHtml(sourceLabel[source] || source)}</span>
          <span class="video-state">${escapeHtml(promotedTopicStatus)}</span>
        </div>
        <h2>${escapeHtml(promotedTitle)}</h2>
        <p class="topic">${escapeHtml(row.topic || '')}</p>
        ${tags ? `<div class="tag-row">${escapeHtml(tags)}</div>` : ''}
      </div>
      <aside class="card-meta">
        ${metaItem('入池视频 ID', row.promoted_topic_id || '')}
        ${metaItem('候选 ID', row.id || '')}
        ${metaItem('平台/账号', `${row.platform || 'douyin'} / ${row.account_key || 'mes'}`)}
        ${metaItem('生成进度', Number.isFinite(Number(row.promoted_topic_progress_percent)) ? `${Math.round(Number(row.promoted_topic_progress_percent))}%` : '')}
        ${metaItem('更新时间', updatedAt)}
        ${metaItem('创建时间', createdAt)}
      </aside>
      ${buttons ? `<div class="candidate-actions">${buttons}</div>` : ''}
    </article>
  `;
}

function renderCandidateCard(row) {
  const status = String(row.status || '');
  const source = String(row.source || 'manual');
  const title = row.title || row.topic || '未命名选题';
  const tags = tagText(row.tags);
  const createdAt = formatLocalTime(row.created_at);
  const updatedAt = formatLocalTime(row.updated_at);
  const promotedTopicStatus = row.promoted_topic_status || '';
  const cardClass = status === 'REJECTED'
    ? 'topic-card candidate-card rejected-card'
    : status === 'DUPLICATE'
      ? 'topic-card candidate-card duplicate-card'
      : 'topic-card candidate-card active-card';
  const railText = status === 'REJECTED'
    ? '拒绝'
    : status === 'DUPLICATE'
      ? '重复'
      : '候选';
  const buttons = actionButtons(row);

  return `
    <article class="${cardClass}">
      <div class="card-rail"><span>${escapeHtml(railText)}</span></div>
      <div class="candidate-main">
        <div class="candidate-head">
          <span class="badge ${escapeHtml(status.toLowerCase())}">${escapeHtml(statusLabel[status] || status)}</span>
          <span class="source">${escapeHtml(sourceLabel[source] || source)}</span>
          ${row.category ? `<span class="category-pill">${escapeHtml(row.category)}</span>` : ''}
        </div>
        <h2>${escapeHtml(title)}</h2>
        <p class="topic">${escapeHtml(row.topic || '')}</p>
        ${row.angle ? `<div class="angle-box"><span>角度</span><strong>${escapeHtml(row.angle)}</strong></div>` : ''}
        ${tags ? `<div class="tag-row neutral">${escapeHtml(tags)}</div>` : ''}
      </div>
      <aside class="card-meta">
        ${metaItem('候选 ID', row.id || '')}
        ${metaItem('平台/账号', `${row.platform || 'douyin'} / ${row.account_key || 'mes'}`)}
        ${metaItem('受众', row.audience || '')}
        ${row.score ? metaItem('评分', row.score) : ''}
        ${row.score_reason ? metaItem('评分理由', row.score_reason) : ''}
        ${row.promoted_topic_id ? metaItem('入池视频', `${row.promoted_topic_id}${promotedTopicStatus ? `（${promotedTopicStatus}）` : ''}`) : ''}
        ${row.duplicate_of ? metaItem('重复来源', row.duplicate_of) : ''}
        ${metaItem('更新时间', updatedAt)}
        ${metaItem('创建时间', createdAt)}
      </aside>
      ${buttons ? `<div class="candidate-actions">${buttons}</div>` : ''}
    </article>
  `;
}

const cards = rows.map((row) => String(row.status || '') === 'PROMOTED'
  ? renderPromotedCard(row)
  : renderCandidateCard(row)
).join('\n');

const createPanel = `
  <section class="create-panel">
    <div class="panel-head">
      <div>
        <h2>手动录入候选选题</h2>
        <p class="form-hint">当前 Tab 只做人工录入；批量导入和 GLM 生成会在后续作为独立入口加入。</p>
      </div>
      <span class="panel-badge">source = manual</span>
    </div>
    <form method="GET" action="/webhook/topic-create" data-inline-action="true" data-after-success="/webhook/topic-center?status=ACTIVE">
      <div id="toast" class="toast"></div>
      <input type="hidden" name="source" value="manual" />
      <div class="create-grid">
        <label class="span-2">主题<textarea name="topic" required placeholder="例如：普通人如何把表达练得更清楚"></textarea></label>
        <label>标题<input name="title" placeholder="可选，后续 GLM 会重新生成" /></label>
        <label>分类<input name="category" placeholder="例如：职场成长" /></label>
        <label>受众<input name="audience" value="普通短视频用户" /></label>
        <label>平台<select name="platform"><option value="douyin">douyin</option></select></label>
        <label>账号 key<input name="account_key" value="mes" /></label>
        <label>来源<input value="人工录入" disabled /></label>
        <label class="span-2">角度<input name="angle" placeholder="可选，例如：用 3 个低成本练习给出可执行方法" /></label>
        <label class="span-2">标签<input name="tags" placeholder="表达力, 职场新人, 自我提升" /></label>
      </div>
      <button class="create-button" type="submit">加入候选池</button>
    </form>
  </section>
`;

const intro = tabIntro[activeTab]
  ? `<section class="tab-summary"><strong>${escapeHtml(tabIntro[activeTab].title)}</strong><span>${escapeHtml(tabIntro[activeTab].text)}</span></section>`
  : '';

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>选题中心</title>
  <style>
    body { margin: 0; background: #f5f6f8; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", Arial, sans-serif; }
    header { position: sticky; top: 0; z-index: 10; background: rgba(255,255,255,.94); border-bottom: 1px solid #e5e7eb; backdrop-filter: blur(14px); }
    .head { max-width: 1180px; margin: 0 auto; padding: 14px 24px 12px; display: grid; gap: 10px; }
    .topline { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .title-stack { min-width: 0; display: flex; align-items: baseline; gap: 10px; }
    .workspace-title { margin: 0; color: #6b7280; font-size: 13px; font-weight: 900; letter-spacing: 0; white-space: nowrap; }
    .workspace-title::after { content: "/"; margin-left: 10px; color: #d1d5db; }
    h1 { margin: 0; font-size: 24px; letter-spacing: 0; }
    .module-nav { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .module-link { color: #374151; text-decoration: none; border: 1px solid #d1d5db; background: #fff; border-radius: 999px; padding: 9px 14px; font-size: 14px; font-weight: 900; }
    .module-link.active { background: #111827; color: #fff; border-color: #111827; }
    .module-link:not(.active):hover { border-color: #9ca3af; color: #111827; }
    .tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
    .tab { flex: 0 0 auto; color: #374151; text-decoration: none; border: 1px solid #d1d5db; background: #fff; border-radius: 999px; padding: 9px 13px; font-weight: 900; font-size: 14px; }
    .tab span { color: #6b7280; margin-left: 4px; }
    .tab.active { background: #111827; color: #fff; border-color: #111827; }
    .tab.active span { color: #d1d5db; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; display: grid; gap: 18px; }
    :root { --ink: #15171a; --muted: #667085; --line: #e6e8ec; --paper: #fff; --wash: #f4f6f8; --blue: #1f6feb; --green: #14945f; --red: #d92d20; --slate: #667085; }
    .create-panel, .candidate, .topic-card, .none, .tab-summary { background: var(--paper); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 24px rgba(20,28,38,.06); }
    .create-panel { padding: 18px; }
    .panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
    .panel-badge { flex: 0 0 auto; width: fit-content; padding: 7px 10px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 12px; font-weight: 900; }
    .create-panel h2 { margin: 0 0 8px; font-size: 20px; line-height: 1.25; }
    .form-hint { margin: 0; color: #6b7280; font-size: 13px; line-height: 1.6; font-weight: 800; }
    .tab-summary { padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-left: 5px solid #111827; }
    .tab-summary strong { color: #111827; font-size: 16px; white-space: nowrap; }
    .tab-summary span { color: #4b5563; font-size: 13px; line-height: 1.6; font-weight: 800; text-align: right; }
    .create-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    label { display: grid; gap: 6px; color: #4b5563; font-size: 13px; font-weight: 900; }
    input, textarea, select { width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; color: #111827; font-size: 14px; font-family: inherit; box-sizing: border-box; }
    textarea { min-height: 76px; resize: vertical; }
    .span-2 { grid-column: 1 / -1; }
    .candidate { padding: 18px; display: grid; gap: 12px; }
    .topic-card { position: relative; overflow: hidden; padding: 0; display: grid; grid-template-columns: 56px minmax(0, 1fr) minmax(260px, 320px); grid-template-areas: "rail main meta" "rail actions meta"; gap: 0; align-items: stretch; transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease; }
    .topic-card:hover { transform: translateY(-1px); box-shadow: 0 16px 34px rgba(20,28,38,.10); }
    .active-card { --accent: var(--blue); --accent-bg: #eef5ff; --accent-soft: #f8fbff; }
    .promoted-card { --accent: var(--green); --accent-bg: #edfdf5; --accent-soft: #fbfffd; border-color: #cfeedd; }
    .rejected-card { --accent: var(--red); --accent-bg: #fff1f0; --accent-soft: #fffafa; border-color: #ffd5d2; }
    .duplicate-card { --accent: var(--slate); --accent-bg: #f2f4f7; --accent-soft: #fbfcfd; border-color: #d0d5dd; }
    .card-rail { grid-area: rail; background: linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 72%, #111827)); color: #fff; display: grid; place-items: center; min-height: 100%; }
    .card-rail span { writing-mode: vertical-rl; letter-spacing: 2px; font-size: 12px; font-weight: 900; }
    .candidate-main, .promoted-main { grid-area: main; min-width: 0; padding: 20px 22px 16px; display: grid; gap: 11px; background: linear-gradient(135deg, var(--accent-soft), #fff 44%); }
    .card-meta { grid-area: meta; border-left: 1px solid var(--line); background: #fbfcfd; padding: 18px; display: grid; align-content: start; gap: 10px; }
    .candidate-actions { grid-area: actions; border-top: 1px solid var(--line); padding: 14px 22px 18px; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; background: #fff; }
    .meta-item { display: grid; grid-template-columns: 74px minmax(0, 1fr); gap: 8px; align-items: start; }
    .meta-item span { color: #7a8494; font-size: 12px; font-weight: 900; }
    .meta-item strong { color: #273142; font-size: 13px; line-height: 1.45; word-break: break-word; font-weight: 800; }
    .video-state { width: fit-content; padding: 6px 10px; border-radius: 999px; background: #eef2ff; color: #3730a3; font-size: 12px; font-weight: 900; }
    .category-pill { width: fit-content; padding: 6px 10px; border-radius: 999px; background: #fff7ed; color: #c2410c; font-size: 12px; font-weight: 900; }
    .tag-row { color: #047857; background: #ecfdf5; border: 1px solid #bbf7d0; border-radius: 999px; padding: 8px 12px; font-size: 13px; font-weight: 900; line-height: 1.5; width: fit-content; max-width: 100%; }
    .tag-row.neutral { color: #175cd3; background: #eff6ff; border-color: #dbeafe; }
    .angle-box { border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--line)); background: var(--accent-bg); border-radius: 8px; padding: 10px 12px; display: grid; gap: 4px; }
    .angle-box span { color: #6b7280; font-size: 12px; font-weight: 900; }
    .angle-box strong { color: #1f2937; font-size: 14px; line-height: 1.55; }
    .candidate-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .badge, .source { width: fit-content; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 900; }
    .badge.new, .badge.scored, .badge.selected { background: #eff6ff; color: #1d4ed8; }
    .badge.promoted { background: #ecfdf5; color: #047857; }
    .badge.rejected { background: #fef2f2; color: #b91c1c; }
    .badge.duplicate { background: #f1f5f9; color: #475569; }
    .source { background: #f3f4f6; color: #4b5563; }
    .candidate h2, .candidate-card h2, .promoted-card h2 { margin: 0; color: var(--ink); font-size: 25px; line-height: 1.22; letter-spacing: 0; }
    .topic { margin: 0; color: #4b5563; font-size: 15px; line-height: 1.7; max-width: 76ch; }
    dl { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 8px 12px; margin: 0; font-size: 13px; line-height: 1.5; }
    dt { color: #6b7280; font-weight: 800; }
    dd { margin: 0; color: #374151; word-break: break-word; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    form { margin: 0; }
    button { border: 0; border-radius: 6px; padding: 11px 18px; color: #fff; font-weight: 900; cursor: pointer; font-size: 15px; }
    .promote { background: #16a34a; }
    .generate { background: #111827; }
    .reject { background: #dc2626; }
    .secondary { background: #4b5563; }
    .progress-link { display: inline-flex; align-items: center; justify-content: center; min-height: 42px; border-radius: 6px; padding: 0 16px; color: #111827; background: #f3f4f6; border: 1px solid #d1d5db; text-decoration: none; font-size: 14px; font-weight: 900; }
    .create-button { background: #111827; margin-top: 12px; }
    button:disabled { opacity: .66; cursor: progress; }
    .none { padding: 42px; text-align: center; color: #4b5563; font-weight: 800; }
    .toast { display: none; border-radius: 8px; padding: 10px 12px; font-size: 13px; font-weight: 900; }
    .toast.show { display: block; }
    .toast.error { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; }
    .toast.success { color: #166534; background: #ecfdf5; border: 1px solid #bbf7d0; }
    @media (max-width: 760px) {
      .topline { align-items: flex-start; flex-direction: column; }
      .title-stack { align-items: flex-start; flex-direction: column; gap: 2px; }
      .workspace-title::after { content: ""; margin: 0; }
      .panel-head, .tab-summary { align-items: flex-start; flex-direction: column; }
      .tab-summary span { text-align: left; }
      .create-grid { grid-template-columns: 1fr; }
      .topic-card { grid-template-columns: 1fr; grid-template-areas: "rail" "main" "meta" "actions"; }
      .card-rail { min-height: auto; height: 10px; }
      .card-rail span { display: none; }
      .card-meta { border-left: 0; border-top: 1px solid var(--line); }
      .actions { flex-direction: column; align-items: stretch; }
      button { width: 100%; }
    }
  </style>
  <script>
    document.addEventListener('submit', async (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.dataset.inlineAction !== 'true') return;
      event.preventDefault();

      const button = form.querySelector('button[type="submit"]');
      const toast = document.querySelector('#toast');
      if (toast) {
        toast.className = 'toast';
        toast.textContent = '';
      }
      if (button) {
        button.disabled = true;
        button.dataset.originalText = button.textContent || '';
        button.textContent = '处理中...';
      }

      const params = new URLSearchParams(new FormData(form));
      const actionUrl = (form.getAttribute('action') || '/webhook/topic-action') + '?' + params.toString();
      try {
        const response = await fetch(actionUrl, {method: 'GET', cache: 'no-store'});
        if (!response.ok) {
          const text = await response.text();
          if (toast) {
            toast.className = 'toast error show';
            toast.textContent = text || '操作未生效';
          }
          if (button) {
            button.disabled = false;
            button.textContent = button.dataset.originalText || '提交';
          }
          return;
        }
        const afterSuccess = form.dataset.afterSuccess || '';
        if (afterSuccess) {
          form.reset();
          const audience = form.querySelector('input[name="audience"]');
          const accountKey = form.querySelector('input[name="account_key"]');
          if (audience) audience.value = '普通短视频用户';
          if (accountKey) accountKey.value = 'mes';
          if (toast) {
            toast.className = 'toast success show';
            toast.textContent = '已加入候选池，正在刷新候选列表...';
          }
          setTimeout(() => {
            window.location.href = afterSuccess;
          }, 450);
          return;
        }
        const reloadDelay = Number(form.dataset.reloadDelay || 0);
        if (reloadDelay > 0) {
          setTimeout(() => window.location.reload(), reloadDelay);
          return;
        }
        window.location.reload();
      } catch (error) {
        window.location.href = actionUrl;
      }
    });
  </script>
</head>
<body>
  <header>
    <div class="head">
      <div class="topline">
        <div class="title-stack">
          <p class="workspace-title">内容生产台</p>
          <h1>选题中心</h1>
        </div>
        <nav class="module-nav" aria-label="主模块切换">
          <a class="module-link active" href="/webhook/topic-center">选题中心</a>
          <a class="module-link" href="/webhook/video-review-list">视频审核中心</a>
        </nav>
      </div>
      <nav class="tabs">
        ${tab('CREATE', '手动录入')}
        ${tab('ACTIVE', '候选池', counts.ACTIVE)}
        ${tab('PROMOTED', '已入池', counts.PROMOTED)}
        ${tab('REJECTED', '已拒绝', counts.REJECTED)}
        ${tab('DUPLICATE', '重复', counts.DUPLICATE)}
        ${tab('ALL', '全部', counts.ALL)}
      </nav>
    </div>
  </header>
  <main>
    ${activeTab === 'CREATE' ? createPanel : ''}
    ${activeTab === 'CREATE' ? '' : intro}
    ${activeTab === 'CREATE' ? '' : (rows.length ? cards : '<div class="none">当前分类没有候选选题</div>')}
  </main>
</body>
</html>`;

return [{json: {response_html: html}}];
