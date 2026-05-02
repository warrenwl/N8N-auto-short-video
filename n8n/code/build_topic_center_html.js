// n8n Code node: Build Topic Center HTML
// Input comes from topic_candidates SELECT rows.

const fs = require('fs');

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

function stripJsonComments(text) {
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readTopicIdeaConfig() {
  const fallback = {
    defaults: {
      count: 1,
      platform: 'douyin',
      account_key: 'mes',
      direction: '认知偏差',
      category: '认知成长',
      audience: '30岁左右有焦虑感的普通上班族',
      tone: '理性克制',
      content_structure: '反常识观点',
      style: '理性克制',
    },
    category_direction_groups: [
      {category: '认知成长', directions: ['认知偏差', '判断力训练', '行动系统', '反馈机制']},
      {category: 'AI自动化', directions: ['办公提效', '内容生产', '资料整理', '自动化工作流']},
      {category: '职场效率', directions: ['向上沟通', '工作汇报', '任务拆解', '优先级管理']},
    ],
    counts: [1, 2, 5, 10],
    categories: ['认知成长', 'AI自动化', '职场效率'],
    audience_groups: [{group: '默认', items: ['30岁左右有焦虑感的普通上班族', '想用AI提升效率但没有技术背景的人']}],
    tones: ['理性克制', '温和陪伴', '犀利观点'],
    content_structures: ['反常识观点', '实操清单', '故事开场'],
    styles: ['理性克制', '温和陪伴', '实操清单'],
  };
  const configPath = $env.TOPIC_IDEA_CONFIG_PATH || '/config/topic_idea_config.jsonc';
  try {
    if (!fs.existsSync(configPath)) return fallback;
    const data = JSON.parse(stripJsonComments(fs.readFileSync(configPath, 'utf8')));
    return {
      ...fallback,
      ...data,
      defaults: {
        ...fallback.defaults,
        ...(data.defaults || {}),
      },
    };
  } catch (error) {
    return {
      ...fallback,
      load_error: `读取 ${configPath} 失败：${error.message}`,
    };
  }
}

function flattenAudienceGroups(groups) {
  return (Array.isArray(groups) ? groups : [])
    .flatMap((group) => (Array.isArray(group.items) ? group.items : []).map((item) => ({
      group: group.group || '',
      value: String(item || '').trim(),
    })))
    .filter((item) => item.value);
}

function getCategoryDirectionGroups(config) {
  const groups = Array.isArray(config.category_direction_groups) ? config.category_direction_groups : [];
  if (groups.length) {
    return groups
      .map((group) => ({
        category: String(group.category || group.name || '').trim(),
        directions: (Array.isArray(group.directions) ? group.directions : [])
          .map((item) => String(item || '').trim())
          .filter(Boolean),
      }))
      .filter((group) => group.category);
  }

  const categories = Array.isArray(config.categories) ? config.categories : [];
  const directions = Array.isArray(config.directions) ? config.directions : [];
  return categories
    .map((category) => ({
      category: String(category || '').trim(),
      directions: directions.map((item) => String(item || '').trim()).filter(Boolean),
    }))
    .filter((group) => group.category);
}

function directionMapJson(groups) {
  const map = groups.reduce((acc, group) => {
    acc[group.category] = group.directions;
    return acc;
  }, {});
  return JSON.stringify(map);
}

function audienceRecommendationMapJson(config) {
  const items = Array.isArray(config.audience_recommendations) ? config.audience_recommendations : [];
  const map = items.reduce((acc, group) => {
    const category = String(group.category || '').trim();
    if (!category) return acc;
    const categoryMap = {};
    const defaults = Array.isArray(group.default) ? group.default : [];
    categoryMap.__default = defaults
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const directions = group.directions && typeof group.directions === 'object' ? group.directions : {};
    Object.entries(directions).forEach(([direction, values]) => {
      categoryMap[direction] = (Array.isArray(values) ? values : [])
        .map((item) => String(item || '').trim())
        .filter(Boolean);
    });
    acc[category] = categoryMap;
    return acc;
  }, {});
  return JSON.stringify(map);
}

function recommendedAudienceOptions(config, category, direction, allOptions) {
  const groups = Array.isArray(config.audience_recommendations) ? config.audience_recommendations : [];
  const group = groups.find((item) => String(item.category || '').trim() === category);
  const directions = group && group.directions && typeof group.directions === 'object' ? group.directions : {};
  const recommended = group
    ? (Array.isArray(directions[direction]) ? directions[direction] : group.default || [])
    : [];
  return [
    ...recommended.map((value) => ({group: '推荐', value})),
    ...allOptions,
  ];
}

function uniqueOptionValues(values) {
  const seen = new Set();
  return values
    .map((item) => {
      const value = typeof item === 'string' ? item : item.value;
      const label = typeof item === 'string' ? '' : item.group || item.label;
      const normalized = String(value || '').trim();
      if (!normalized || seen.has(normalized)) return null;
      seen.add(normalized);
      return {value: normalized, label};
    })
    .filter(Boolean);
}

function selectOptions(values, selectedValue) {
  return uniqueOptionValues(values)
    .map((item) => `<option value="${escapeHtml(item.value)}"${item.value === selectedValue ? ' selected' : ''}>${escapeHtml(item.label ? `${item.label} / ${item.value}` : item.value)}</option>`)
    .join('');
}

function customSelectField({name, label, values, selectedValue, customPlaceholder, span2 = false, type = 'text', min = '', max = '', selectAttrs = ''}) {
  const selected = String(selectedValue || '').trim();
  const options = uniqueOptionValues(values);
  const hasSelected = options.some((item) => item.value === selected);
  const customActive = selected && !hasSelected;
  const typeAttrs = type === 'number' ? ` type="number"${min ? ` min="${escapeHtml(min)}"` : ''}${max ? ` max="${escapeHtml(max)}"` : ''}` : '';
  return `
    <label class="${span2 ? 'span-2' : ''} custom-field">${escapeHtml(label)}
      <select data-custom-select="${escapeHtml(name)}"${selectAttrs ? ` ${selectAttrs}` : ''}>
        ${selectOptions(options, selected)}
        <option value="__custom__"${customActive ? ' selected' : ''}>自定义...</option>
      </select>
      <input class="custom-input${customActive ? ' show' : ''}" data-custom-input="${escapeHtml(name)}"${typeAttrs} value="${customActive ? escapeHtml(selected) : ''}" placeholder="${escapeHtml(customPlaceholder || `自定义${label}`)}" />
      <input type="hidden" name="${escapeHtml(name)}" data-custom-hidden="${escapeHtml(name)}" value="${escapeHtml(selected)}" />
    </label>
  `;
}

const topicIdeaConfig = readTopicIdeaConfig();
const topicIdeaDefaults = topicIdeaConfig.defaults || {};
const audienceOptions = flattenAudienceGroups(topicIdeaConfig.audience_groups);
const categoryDirectionGroups = getCategoryDirectionGroups(topicIdeaConfig);
const categoryOptions = categoryDirectionGroups.map((group) => group.category);
const selectedCategory = topicIdeaDefaults.category || categoryOptions[0] || '认知成长';
const selectedDirectionGroup = categoryDirectionGroups.find((group) => group.category === selectedCategory) || categoryDirectionGroups[0] || {directions: []};
const directionOptions = selectedDirectionGroup.directions;
const selectedDirection = topicIdeaDefaults.direction || directionOptions[0] || '认知偏差';
const recommendedAudienceOptionsInitial = recommendedAudienceOptions(topicIdeaConfig, selectedCategory, selectedDirection, audienceOptions);

const allowedTabs = new Set(['AI_GENERATE', 'CREATE', 'ACTIVE', 'PROMOTED', 'REJECTED', 'DUPLICATE', 'ALL']);
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
const pageSize = 10;
function positiveInt(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
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

const filteredRows = activeTab === 'CREATE' || activeTab === 'AI_GENERATE'
  ? []
  : activeTab === 'ALL'
  ? rowsAll
  : activeTab === 'ACTIVE'
    ? rowsAll.filter((row) => ['NEW', 'SCORED', 'SELECTED'].includes(String(row.status || '')))
    : rowsAll.filter((row) => row.status === activeTab);
const shouldPaginate = !['AI_GENERATE', 'CREATE'].includes(activeTab);
const totalRows = filteredRows.length;
const totalPages = shouldPaginate ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
const currentPage = shouldPaginate ? Math.min(positiveInt(query.page, 1), totalPages) : 1;
const pageStart = (currentPage - 1) * pageSize;
const rows = shouldPaginate ? filteredRows.slice(pageStart, pageStart + pageSize) : filteredRows;

function tab(status, label, count = null) {
  const active = activeTab === status ? ' active' : '';
  return `<a class="tab${active}" href="/webhook/topic-center?status=${status}">${escapeHtml(label)}${count === null ? '' : ` <span>${count}</span>`}</a>`;
}

function pageUrl(page) {
  return `/webhook/topic-center?status=${encodeURIComponent(activeTab)}&page=${page}`;
}

function pagination() {
  if (!shouldPaginate || totalRows <= pageSize) return '';
  const prev = currentPage > 1
    ? `<a href="${pageUrl(currentPage - 1)}">上一页</a>`
    : '<span class="disabled">上一页</span>';
  const next = currentPage < totalPages
    ? `<a href="${pageUrl(currentPage + 1)}">下一页</a>`
    : '<span class="disabled">下一页</span>';
  return `
    <nav class="pagination" aria-label="分页">
      <span>第 ${currentPage} / ${totalPages} 页，共 ${totalRows} 条，每页 ${pageSize} 条</span>
      <div>${prev}${next}</div>
    </nav>
  `;
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
  AI_GENERATE: {
    title: 'AI 生成候选',
    text: '根据配置方向和页面自定义条件调用 GLM，生成结果只进入候选池 NEW 状态，不会自动入池或自动生成视频。',
  },
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

function sourceRefText(value) {
  const text = String(value || '');
  if (!text.startsWith('glm:')) return text;
  return text.replace(/^glm:/, '');
}

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
  const detailParts = [
    row.angle ? `<div class="angle-box"><span>角度</span><strong>${escapeHtml(row.angle)}</strong></div>` : '',
    row.opening_hook ? `<div class="angle-box"><span>开头钩子</span><strong>${escapeHtml(row.opening_hook)}</strong></div>` : '',
    row.risk_note ? `<div class="angle-box"><span>风险提示</span><strong>${escapeHtml(row.risk_note)}</strong></div>` : '',
    (row.candidate_score_reason || row.score_reason) ? `<div class="angle-box"><span>推荐理由</span><strong>${escapeHtml(row.candidate_score_reason || row.score_reason)}</strong></div>` : '',
  ].filter(Boolean).join('');

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
        <div class="compact-insights">
          ${row.core_angle ? `<div><span>核心</span><strong>${escapeHtml(row.core_angle)}</strong></div>` : ''}
          ${row.pain_point ? `<div><span>痛点</span><strong>${escapeHtml(row.pain_point)}</strong></div>` : ''}
          ${row.promise ? `<div><span>收益</span><strong>${escapeHtml(row.promise)}</strong></div>` : ''}
        </div>
        ${tags ? `<div class="tag-row neutral">${escapeHtml(tags)}</div>` : ''}
        ${detailParts ? `<details class="candidate-details"><summary>展开详情</summary><div class="detail-grid">${detailParts}</div></details>` : ''}
      </div>
      <aside class="card-meta">
        ${metaItem('受众', row.audience || '')}
        ${metaItem('平台/账号', `${row.platform || 'douyin'} / ${row.account_key || 'mes'}`)}
        ${source === 'glm' ? metaItem('生成批次', sourceRefText(row.source_ref)) : ''}
        ${row.score ? metaItem('评分', row.score) : ''}
        ${row.promoted_topic_id ? metaItem('入池视频', `${row.promoted_topic_id}${promotedTopicStatus ? `（${promotedTopicStatus}）` : ''}`) : ''}
        ${row.duplicate_of ? metaItem('重复来源', row.duplicate_of) : ''}
        ${metaItem('更新时间', updatedAt)}
        ${metaItem('候选 ID', row.id || '')}
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

const aiPanel = `
  <section class="create-panel ai-panel">
    <div class="panel-head">
      <div>
        <h2>AI 生成候选选题</h2>
        <p class="form-hint">读取 <code>/config/topic_idea_config.jsonc</code> 的分类联动配置。先选一级分类，再自动带出该分类下的二级选题方向；具体候选题目由 GLM 生成。</p>
      </div>
      <span class="panel-badge ai">source = glm</span>
    </div>
    ${topicIdeaConfig.load_error ? `<div class="config-warning">${escapeHtml(topicIdeaConfig.load_error)}</div>` : ''}
    <form method="GET" action="/webhook/topic-generate" data-inline-action="true">
      <div id="toast" class="toast"></div>
      <input type="hidden" name="platform" value="${escapeHtml(topicIdeaDefaults.platform || 'douyin')}" />
      <input type="hidden" name="account_key" value="${escapeHtml(topicIdeaDefaults.account_key || 'mes')}" />
      <div class="create-grid">
        ${customSelectField({
          name: 'category',
          label: '分类',
          values: categoryOptions,
          selectedValue: selectedCategory,
          customPlaceholder: '输入自定义一级分类',
          selectAttrs: 'data-category-select="true"',
        })}
        ${customSelectField({
          name: 'count',
          label: '数量',
          values: (topicIdeaConfig.counts || [1, 2, 5, 10]).map(String),
          selectedValue: String(topicIdeaDefaults.count || 1),
          customPlaceholder: '输入 1-20 之间的数字',
          type: 'number',
          min: '1',
          max: '20',
        })}
        ${customSelectField({
          name: 'direction',
          label: '选题方向（二级栏目）',
          values: directionOptions,
          selectedValue: selectedDirection,
          customPlaceholder: '输入自定义二级方向，例如：非技术人提效',
          span2: true,
          selectAttrs: `data-direction-select="true" data-category-directions="${escapeHtml(directionMapJson(categoryDirectionGroups))}"`,
        })}
        ${customSelectField({
          name: 'audience',
          label: '目标受众',
          values: recommendedAudienceOptionsInitial,
          selectedValue: topicIdeaDefaults.audience || '30岁左右有焦虑感的普通上班族',
          customPlaceholder: '输入更具体的人群，例如：30岁左右想用AI做副业但没有技术背景的人',
          span2: true,
          selectAttrs: `data-audience-select="true" data-audience-recommendations="${escapeHtml(audienceRecommendationMapJson(topicIdeaConfig))}" data-all-audiences="${escapeHtml(JSON.stringify(audienceOptions))}"`,
        })}
        ${customSelectField({
          name: 'tone',
          label: '表达语气',
          values: topicIdeaConfig.tones || topicIdeaConfig.styles || [],
          selectedValue: topicIdeaDefaults.tone || topicIdeaDefaults.style || '理性克制',
          customPlaceholder: '输入自定义表达语气',
        })}
        ${customSelectField({
          name: 'content_structure',
          label: '内容结构',
          values: topicIdeaConfig.content_structures || ['反常识观点', '实操清单', '故事开场'],
          selectedValue: topicIdeaDefaults.content_structure || '反常识观点',
          customPlaceholder: '输入自定义内容结构',
        })}
        <label>账号 key
          <input value="${escapeHtml(topicIdeaDefaults.account_key || 'mes')}" disabled />
        </label>
      </div>
      <button class="create-button ai-create-button" type="submit">生成候选</button>
    </form>
    <section class="generation-jobs">
      <div class="jobs-head">
        <h3>生成任务</h3>
        <span id="jobs-refresh-note">下次刷新：5 秒</span>
      </div>
      <div id="generation-jobs-list" class="jobs-list">正在读取生成任务...</div>
    </section>
  </section>
`;

const createPanel = `
  <section class="create-panel">
    <div class="panel-head">
      <div>
        <h2>手动录入候选选题</h2>
        <p class="form-hint">当前 Tab 只做人工录入；AI 生成候选已拆到独立 Tab，便于区分人工来源和 GLM 来源。</p>
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
    body:has(main.ai-main) { overflow: hidden; }
    main.ai-main { height: calc(100dvh - 128px); min-height: 0; padding-top: 14px; padding-bottom: 14px; box-sizing: border-box; overflow: hidden; }
    :root { --ink: #15171a; --muted: #667085; --line: #e6e8ec; --paper: #fff; --wash: #f4f6f8; --blue: #1f6feb; --green: #14945f; --red: #d92d20; --slate: #667085; }
    .create-panel, .candidate, .topic-card, .none, .tab-summary { background: var(--paper); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 24px rgba(20,28,38,.06); }
    .create-panel { padding: 18px; }
    .panel-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
    .panel-badge { flex: 0 0 auto; width: fit-content; padding: 7px 10px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; font-size: 12px; font-weight: 900; }
    .panel-badge.ai { background: #f0fdf4; color: #15803d; }
    .create-panel h2 { margin: 0 0 8px; font-size: 20px; line-height: 1.25; }
    code { padding: 2px 5px; border-radius: 5px; background: #f3f4f6; color: #374151; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .92em; }
    .form-hint { margin: 0; color: #6b7280; font-size: 13px; line-height: 1.6; font-weight: 800; }
    .config-warning { margin-bottom: 12px; border: 1px solid #fed7aa; background: #fff7ed; color: #9a3412; border-radius: 8px; padding: 10px 12px; font-size: 13px; font-weight: 900; }
    .ai-panel { height: 100%; min-height: 0; overflow: hidden; display: grid; grid-template-columns: minmax(0, 3fr) minmax(330px, 2fr); grid-template-rows: auto minmax(0, 1fr); align-content: stretch; gap: 14px 16px; padding: 16px 18px; box-sizing: border-box; }
    .ai-panel .panel-head { grid-column: 1 / -1; margin-bottom: 0; }
    .ai-panel .panel-badge { padding: 6px 9px; }
    .ai-panel h2 { margin-bottom: 4px; font-size: 18px; }
    .ai-panel .form-hint { font-size: 12px; line-height: 1.45; }
    .ai-panel form { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; display: grid; align-content: start; gap: 12px; padding-right: 4px; }
    .ai-panel .create-grid { gap: 11px 14px; }
    .ai-panel label { gap: 5px; font-size: 12px; }
    .ai-panel input, .ai-panel select { padding: 9px 11px; font-size: 13px; }
    .ai-panel .create-button { margin-top: 0; padding: 11px 16px; }
    .generation-jobs { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 16px; display: grid; gap: 12px; }
    .ai-panel .generation-jobs { min-height: 0; margin-top: 0; padding: 0 0 0 16px; border-top: 0; border-left: 1px solid var(--line); grid-template-rows: auto minmax(0, 1fr); gap: 8px; overflow: hidden; }
    .jobs-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 0 8px; background: var(--paper); border-bottom: 1px solid #eef0f3; }
    .jobs-head h3 { margin: 0; font-size: 17px; }
    .jobs-head span { color: #6b7280; font-size: 12px; font-weight: 900; }
    .jobs-list { height: min(320px, 42vh); overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; display: grid; align-content: start; gap: 10px; color: #4b5563; font-weight: 800; padding-right: 6px; scrollbar-gutter: stable; }
    .ai-panel .jobs-list { height: auto; min-height: 0; padding: 0 8px 10px 0; gap: 8px; }
    .job-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; background: #fbfcfd; display: grid; gap: 8px; }
    .ai-panel .job-card { padding: 10px 12px; gap: 6px; }
    .job-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
    .job-title { color: #111827; font-size: 14px; font-weight: 900; }
    .job-meta { color: #6b7280; font-size: 12px; line-height: 1.6; font-weight: 800; }
    .job-status { width: fit-content; padding: 5px 9px; border-radius: 999px; font-size: 12px; font-weight: 900; }
    .job-status.running { background: #eff6ff; color: #1d4ed8; }
    .job-status.succeeded { background: #ecfdf5; color: #047857; }
    .job-status.failed { background: #fef2f2; color: #b91c1c; }
    .tab-summary { padding: 14px 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-left: 5px solid #111827; }
    .tab-summary strong { color: #111827; font-size: 16px; white-space: nowrap; }
    .tab-summary span { color: #4b5563; font-size: 13px; line-height: 1.6; font-weight: 800; text-align: right; }
    .pagination { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #4b5563; font-size: 13px; font-weight: 900; box-shadow: 0 8px 20px rgba(20,28,38,.05); }
    .pagination div { display: flex; gap: 8px; align-items: center; }
    .pagination a, .pagination .disabled { min-width: 72px; text-align: center; color: #111827; text-decoration: none; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 10px; background: #fff; }
    .pagination .disabled { color: #9ca3af; background: #f3f4f6; cursor: not-allowed; }
    .create-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    label { display: grid; gap: 6px; color: #4b5563; font-size: 13px; font-weight: 900; }
    input, textarea, select { width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; color: #111827; font-size: 14px; font-family: inherit; box-sizing: border-box; }
    .custom-field { align-content: start; }
    .custom-input { display: none; }
    .custom-input.show { display: block; }
    textarea { min-height: 76px; resize: vertical; }
    .span-2 { grid-column: 1 / -1; }
    .candidate { padding: 18px; display: grid; gap: 12px; }
    .topic-card { position: relative; overflow: hidden; padding: 0; display: grid; grid-template-columns: 48px minmax(0, 1fr) minmax(240px, 290px); grid-template-areas: "rail main meta" "rail actions meta"; gap: 0; align-items: stretch; transition: transform .16s ease, box-shadow .16s ease, border-color .16s ease; }
    .topic-card:hover { transform: translateY(-1px); box-shadow: 0 16px 34px rgba(20,28,38,.10); }
    .active-card { --accent: var(--blue); --accent-bg: #eef5ff; --accent-soft: #f8fbff; }
    .promoted-card { --accent: var(--green); --accent-bg: #edfdf5; --accent-soft: #fbfffd; border-color: #cfeedd; }
    .rejected-card { --accent: var(--red); --accent-bg: #fff1f0; --accent-soft: #fffafa; border-color: #ffd5d2; }
    .duplicate-card { --accent: var(--slate); --accent-bg: #f2f4f7; --accent-soft: #fbfcfd; border-color: #d0d5dd; }
    .card-rail { grid-area: rail; background: linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 72%, #111827)); color: #fff; display: grid; place-items: center; min-height: 100%; }
    .card-rail span { writing-mode: vertical-rl; letter-spacing: 2px; font-size: 12px; font-weight: 900; }
    .candidate-main, .promoted-main { grid-area: main; min-width: 0; padding: 16px 18px 12px; display: grid; gap: 9px; background: linear-gradient(135deg, var(--accent-soft), #fff 44%); }
    .card-meta { grid-area: meta; border-left: 1px solid var(--line); background: #fbfcfd; padding: 14px; display: grid; align-content: start; gap: 8px; }
    .candidate-actions { grid-area: actions; border-top: 1px solid var(--line); padding: 12px 18px 14px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: #fff; }
    .meta-item { display: grid; grid-template-columns: 66px minmax(0, 1fr); gap: 7px; align-items: start; }
    .meta-item span { color: #7a8494; font-size: 12px; font-weight: 900; }
    .meta-item strong { color: #273142; font-size: 13px; line-height: 1.45; word-break: break-word; font-weight: 800; }
    .video-state { width: fit-content; padding: 6px 10px; border-radius: 999px; background: #eef2ff; color: #3730a3; font-size: 12px; font-weight: 900; }
    .category-pill { width: fit-content; padding: 6px 10px; border-radius: 999px; background: #fff7ed; color: #c2410c; font-size: 12px; font-weight: 900; }
    .tag-row { color: #047857; background: #ecfdf5; border: 1px solid #bbf7d0; border-radius: 999px; padding: 8px 12px; font-size: 13px; font-weight: 900; line-height: 1.5; width: fit-content; max-width: 100%; }
    .tag-row.neutral { color: #175cd3; background: #eff6ff; border-color: #dbeafe; }
    .angle-box { border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--line)); background: var(--accent-bg); border-radius: 8px; padding: 10px 12px; display: grid; gap: 4px; }
    .angle-box span { color: #6b7280; font-size: 12px; font-weight: 900; }
    .angle-box strong { color: #1f2937; font-size: 14px; line-height: 1.55; }
    .compact-insights { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .compact-insights div { min-width: 0; border: 1px solid color-mix(in srgb, var(--accent) 16%, var(--line)); background: rgba(255,255,255,.72); border-radius: 8px; padding: 8px 10px; display: grid; gap: 3px; }
    .compact-insights span { color: #7a8494; font-size: 11px; font-weight: 900; }
    .compact-insights strong { color: #273142; font-size: 12px; line-height: 1.42; font-weight: 850; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .candidate-details { border-top: 1px dashed #d9dee7; padding-top: 8px; }
    .candidate-details summary { width: fit-content; cursor: pointer; color: #4b5563; font-size: 12px; font-weight: 900; list-style: none; }
    .candidate-details summary::-webkit-details-marker { display: none; }
    .candidate-details summary::after { content: " +"; color: var(--accent); }
    .candidate-details[open] summary::after { content: " -"; }
    .detail-grid { display: grid; gap: 8px; padding-top: 8px; }
    .candidate-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .badge, .source { width: fit-content; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 900; }
    .badge.new, .badge.scored, .badge.selected { background: #eff6ff; color: #1d4ed8; }
    .badge.promoted { background: #ecfdf5; color: #047857; }
    .badge.rejected { background: #fef2f2; color: #b91c1c; }
    .badge.duplicate { background: #f1f5f9; color: #475569; }
    .source { background: #f3f4f6; color: #4b5563; }
    .candidate h2, .candidate-card h2, .promoted-card h2 { margin: 0; color: var(--ink); font-size: 21px; line-height: 1.25; letter-spacing: 0; }
    .topic { margin: 0; color: #4b5563; font-size: 14px; line-height: 1.55; max-width: 76ch; }
    dl { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 8px 12px; margin: 0; font-size: 13px; line-height: 1.5; }
    dt { color: #6b7280; font-weight: 800; }
    dd { margin: 0; color: #374151; word-break: break-word; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    form { margin: 0; }
    button { border: 0; border-radius: 6px; padding: 10px 15px; color: #fff; font-weight: 900; cursor: pointer; font-size: 14px; }
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
    .toast.info { color: #1e3a8a; background: #eff6ff; border: 1px solid #bfdbfe; }
    @media (max-width: 760px) {
      body:has(main.ai-main) { overflow: auto; }
      main.ai-main { height: auto; min-height: 0; overflow: visible; }
      .ai-panel { height: auto; overflow: visible; display: grid; grid-template-columns: 1fr; grid-template-rows: auto; }
      .ai-panel .panel-head { grid-column: auto; }
      .ai-panel form { overflow: visible; padding-right: 0; }
      .ai-panel .generation-jobs { padding: 12px 0 0; border-left: 0; border-top: 1px solid var(--line); }
      .ai-panel .jobs-list { max-height: 320px; }
      .topline { align-items: flex-start; flex-direction: column; }
      .title-stack { align-items: flex-start; flex-direction: column; gap: 2px; }
      .workspace-title::after { content: ""; margin: 0; }
      .panel-head, .tab-summary { align-items: flex-start; flex-direction: column; }
      .tab-summary span { text-align: left; }
      .pagination { align-items: stretch; flex-direction: column; }
      .pagination div { justify-content: space-between; }
      .create-grid { grid-template-columns: 1fr; }
      .topic-card { grid-template-columns: 1fr; grid-template-areas: "rail" "main" "meta" "actions"; }
      .card-rail { min-height: auto; height: 10px; }
      .card-rail span { display: none; }
      .card-meta { border-left: 0; border-top: 1px solid var(--line); }
      .compact-insights { grid-template-columns: 1fr; }
      .actions { flex-direction: column; align-items: stretch; }
      button { width: 100%; }
    }
  </style>
  <script>
    function syncCustomField(root, name) {
      const select = root.querySelector('[data-custom-select="' + name + '"]');
      const input = root.querySelector('[data-custom-input="' + name + '"]');
      const hidden = root.querySelector('[data-custom-hidden="' + name + '"]');
      if (!select || !input || !hidden) return;
      const isCustom = select.value === '__custom__';
      input.classList.toggle('show', isCustom);
      input.required = isCustom;
      hidden.value = isCustom ? input.value.trim() : select.value;
    }

    function syncAllCustomFields(root) {
      root.querySelectorAll('[data-custom-select]').forEach((select) => {
        syncCustomField(root, select.dataset.customSelect);
      });
    }

    function categoryDirectionMap(select) {
      try {
        return JSON.parse(select.dataset.categoryDirections || '{}');
      } catch (error) {
        return {};
      }
    }

    function parseDataJson(node, key, fallback) {
      try {
        return JSON.parse(node.dataset[key] || '');
      } catch (error) {
        return fallback;
      }
    }

    function setSelectOptions(select, values, selectedValue) {
      select.innerHTML = '';
      values.forEach((item) => {
        const value = typeof item === 'string' ? item : item.value;
        const label = typeof item === 'string' ? '' : item.group;
        if (!value) return;
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label ? label + ' / ' + value : value;
        if (value === selectedValue) option.selected = true;
        select.appendChild(option);
      });
      const custom = document.createElement('option');
      custom.value = '__custom__';
      custom.textContent = '自定义...';
      select.appendChild(custom);
    }

    function uniqueAudienceOptions(values) {
      const seen = new Set();
      return values
        .map((item) => {
          const value = typeof item === 'string' ? item : item.value;
          const group = typeof item === 'string' ? '' : item.group;
          const normalized = String(value || '').trim();
          if (!normalized || seen.has(normalized)) return null;
          seen.add(normalized);
          return {group: group || '', value: normalized};
        })
        .filter(Boolean);
    }

    function syncAudienceOptions(form, keepCurrent) {
      const categoryHidden = form.querySelector('[data-custom-hidden="category"]');
      const directionHidden = form.querySelector('[data-custom-hidden="direction"]');
      const audienceSelect = form.querySelector('[data-audience-select]');
      const audienceInput = form.querySelector('[data-custom-input="audience"]');
      const audienceHidden = form.querySelector('[data-custom-hidden="audience"]');
      if (!categoryHidden || !directionHidden || !audienceSelect || !audienceInput || !audienceHidden) return;

      const recommendations = parseDataJson(audienceSelect, 'audienceRecommendations', {});
      const allAudiences = parseDataJson(audienceSelect, 'allAudiences', []);
      const category = categoryHidden.value;
      const direction = directionHidden.value;
      const categoryRecommendations = recommendations[category] || {};
      const recommended = Array.isArray(categoryRecommendations[direction])
        ? categoryRecommendations[direction]
        : Array.isArray(categoryRecommendations.__default)
          ? categoryRecommendations.__default
          : [];
      const values = uniqueAudienceOptions([
        ...recommended.map((value) => ({group: '推荐', value})),
        ...allAudiences,
      ]);
      const current = audienceHidden.value || audienceInput.value || '';
      const selected = keepCurrent && values.some((item) => item.value === current)
        ? current
        : values[0]?.value || '';

      setSelectOptions(audienceSelect, values, selected);
      if (selected) {
        audienceInput.value = '';
        audienceSelect.value = selected;
      } else {
        audienceSelect.value = '__custom__';
      }
      if (keepCurrent && current && !values.some((item) => item.value === current)) {
        audienceSelect.value = '__custom__';
        audienceInput.value = current;
      }
      syncCustomField(form, 'audience');
    }

    function syncDirectionOptions(form, keepCurrent) {
      const categoryHidden = form.querySelector('[data-custom-hidden="category"]');
      const directionSelect = form.querySelector('[data-direction-select]');
      const directionInput = form.querySelector('[data-custom-input="direction"]');
      const directionHidden = form.querySelector('[data-custom-hidden="direction"]');
      if (!categoryHidden || !directionSelect || !directionInput || !directionHidden) return;

      const map = categoryDirectionMap(directionSelect);
      const category = categoryHidden.value;
      const values = Array.isArray(map[category]) ? map[category] : [];
      const current = directionHidden.value || directionInput.value || '';
      const selected = keepCurrent && values.includes(current)
        ? current
        : values[0] || '';

      setSelectOptions(directionSelect, values, selected);
      if (selected) {
        directionInput.value = '';
        directionSelect.value = selected;
      } else {
        directionSelect.value = '__custom__';
      }
      if (keepCurrent && current && !values.includes(current)) {
        directionSelect.value = '__custom__';
        directionInput.value = current;
      }
      syncCustomField(form, 'direction');
      syncAudienceOptions(form, keepCurrent);
    }

    function escapeText(value) {
      return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[char]));
    }

    function jobStatusText(status) {
      if (status === 'RUNNING') return '生成中';
      if (status === 'SUCCEEDED') return '已完成';
      if (status === 'FAILED') return '失败';
      return status || '未知';
    }

    const generationJobsRefreshSeconds = 5;
    let generationJobsCountdown = generationJobsRefreshSeconds;
    let generationJobsRunningCount = 0;
    let generationJobsRefreshing = false;

    function updateGenerationJobsRefreshNote() {
      const note = document.querySelector('#jobs-refresh-note');
      if (!note) return;
      const prefix = generationJobsRunningCount > 0
        ? '有 ' + generationJobsRunningCount + ' 个任务生成中，'
        : '';
      note.textContent = prefix + '下次刷新：' + generationJobsCountdown + ' 秒';
    }

    function resetGenerationJobsCountdown() {
      generationJobsCountdown = generationJobsRefreshSeconds;
      updateGenerationJobsRefreshNote();
    }

    function renderJob(job) {
      const statusClass = String(job.status || '').toLowerCase();
      const counts = job.status === 'SUCCEEDED'
        ? '生成 ' + job.created_count + ' 条，重复 ' + job.duplicate_count + ' 条'
        : job.status === 'RUNNING'
          ? '已用时 ' + job.elapsed_seconds + 's'
          : (job.error || '生成失败');
      return '<article class="job-card">' +
        '<div class="job-top">' +
          '<div class="job-title">' + escapeText(job.category || '-') + ' / ' + escapeText(job.direction || '-') + '</div>' +
          '<span class="job-status ' + escapeText(statusClass) + '">' + escapeText(jobStatusText(job.status)) + '</span>' +
        '</div>' +
        '<div class="job-meta">批次：' + escapeText(job.batch_id || '-') + ' · 数量：' + escapeText(job.requested_count || 0) + ' · ' + escapeText(counts) + '</div>' +
      '</article>';
    }

    async function refreshGenerationJobs() {
      const list = document.querySelector('#generation-jobs-list');
      if (!list) return;
      if (generationJobsRefreshing) return;
      generationJobsRefreshing = true;
      try {
        const response = await fetch('/webhook/topic-generation-jobs', {cache: 'no-store'});
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        const jobs = Array.isArray(data.jobs) ? data.jobs : [];
        list.innerHTML = jobs.length
          ? jobs.map(renderJob).join('')
          : '暂无生成任务';
        generationJobsRunningCount = Number(data.running_count || 0);
        resetGenerationJobsCountdown();
      } catch (error) {
        list.textContent = '读取生成任务失败：' + error.message;
        resetGenerationJobsCountdown();
      } finally {
        generationJobsRefreshing = false;
      }
    }

    function startGenerationJobsCountdown() {
      updateGenerationJobsRefreshNote();
      setInterval(() => {
        generationJobsCountdown -= 1;
        if (generationJobsCountdown <= 0) {
          refreshGenerationJobs();
          return;
        }
        updateGenerationJobsRefreshNote();
      }, 1000);
    }

    document.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const form = target.closest('form');
      if (!form) return;
      if (target.matches('[data-custom-select]')) {
        syncCustomField(form, target.dataset.customSelect);
        if (target.matches('[data-category-select]')) syncDirectionOptions(form, false);
        if (target.matches('[data-direction-select]')) syncAudienceOptions(form, false);
      }
    });

    document.addEventListener('input', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const form = target.closest('form');
      if (!form) return;
      if (target.matches('[data-custom-input]')) {
        syncCustomField(form, target.dataset.customInput);
        if (target.dataset.customInput === 'direction') syncAudienceOptions(form, false);
      }
    });

    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('form').forEach((form) => {
        syncAllCustomFields(form);
        syncDirectionOptions(form, true);
      });
      refreshGenerationJobs();
      startGenerationJobsCountdown();
    });

    document.addEventListener('submit', async (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.dataset.inlineAction !== 'true') return;
      event.preventDefault();
      syncAllCustomFields(form);
      syncDirectionOptions(form, true);

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
      const isTopicGenerate = form.getAttribute('action') === '/webhook/topic-generate';
      if (isTopicGenerate) {
        if (toast) {
          toast.className = 'toast info show';
          toast.textContent = '正在提交生成任务...';
        }
      }
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
        if (isTopicGenerate) {
          if (button) {
            button.disabled = false;
            button.textContent = button.dataset.originalText || '生成候选';
          }
          if (toast) {
            toast.className = 'toast success show';
            toast.textContent = '已提交生成任务，后台正在调用 GLM。你可以刷新页面，任务状态会保留在右侧。';
          }
          refreshGenerationJobs();
          return;
        }
        if (afterSuccess) {
          form.reset();
          const audience = form.querySelector('input[name="audience"]');
          const accountKey = form.querySelector('input[name="account_key"]');
          if (audience && form.getAttribute('action') === '/webhook/topic-create') audience.value = '普通短视频用户';
          if (accountKey && form.getAttribute('action') === '/webhook/topic-create') accountKey.value = 'mes';
          if (toast) {
            toast.className = 'toast success show';
            toast.textContent = isTopicGenerate
              ? '已生成候选，正在刷新候选列表...'
              : '已加入候选池，正在刷新候选列表...';
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
        ${tab('AI_GENERATE', 'AI生成')}
        ${tab('CREATE', '手动录入')}
        ${tab('ACTIVE', '候选池', counts.ACTIVE)}
        ${tab('PROMOTED', '已入池', counts.PROMOTED)}
        ${tab('REJECTED', '已拒绝', counts.REJECTED)}
        ${tab('DUPLICATE', '重复', counts.DUPLICATE)}
        ${tab('ALL', '全部', counts.ALL)}
      </nav>
    </div>
  </header>
  <main class="${activeTab === 'AI_GENERATE' ? 'ai-main' : ''}">
    ${activeTab === 'AI_GENERATE' ? aiPanel : ''}
    ${activeTab === 'CREATE' ? createPanel : ''}
    ${activeTab === 'AI_GENERATE' || activeTab === 'CREATE' ? '' : intro}
    ${pagination()}
    ${activeTab === 'AI_GENERATE' || activeTab === 'CREATE' ? '' : (rows.length ? cards : '<div class="none">当前分类没有候选选题</div>')}
    ${pagination()}
  </main>
</body>
</html>`;

return [{json: {response_html: html}}];
