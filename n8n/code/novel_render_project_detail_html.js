// n8n Code node: Render Novel Project Console HTML
// Read-only project assets plus safe POST forms for queue-only actions.

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

function renderOptions(options, selectedValue) {
  return options.map((option) => {
    const value = Array.isArray(option) ? option[0] : option;
    const label = Array.isArray(option) ? option[1] : option;
    const selected = String(value) === String(selectedValue) ? ' selected' : '';
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
  }).join('');
}

const wordCountOptions = [
  ['1200', '短测 1200 字'],
  ['1500', '轻量 1500 字'],
  ['2000', '常规 2000 字'],
  ['2500', '平台常规 2500 字'],
  ['3000', '长章 3000 字'],
  ['4000', '深度长章 4000 字'],
  ['6000', '爆更长章 6000 字'],
  ['8000', '超长章 8000 字'],
];

function renderWordCountOptions(selectedValue) {
  const selected = String(selectedValue || '2000');
  const hasSelected = wordCountOptions.some(([value]) => String(value) === selected);
  const customOption = hasSelected
    ? ''
    : `<option value="${escapeHtml(selected)}" selected>当前 ${escapeHtml(selected)} 字（自定义）</option>`;
  return `${customOption}${renderOptions(wordCountOptions, selected)}`;
}

function chapterSegmentCountForTarget(targetWords) {
  const words = Number(targetWords || 0);
  if (words <= 1500) return 1;
  if (words <= 2500) return 2;
  if (words <= 3500) return 3;
  if (words <= 4500) return 4;
  if (words <= 6500) return 5;
  return 6;
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
    hour12: false,
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatDuration(value) {
  const durationMs = Number(value);
  if (!Number.isFinite(durationMs) || durationMs < 0) return '未记录';
  if (durationMs >= 1000) return `${(durationMs / 1000).toFixed(1)} 秒`;
  return `${durationMs} 毫秒`;
}

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
}

function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }
  return {};
}

const projectStatusLabel = {
  CREATED: '待生成设定集',
  BIBLE_READY: '设定集已完成',
  OUTLINE_READY: '大纲已完成',
  WRITING: '写作中',
  REVIEWING: '待人工审核',
  PAUSED: '已暂停',
  ARCHIVED: '已归档',
  COMPLETED: '已完结',
  FAILED: '已失败',
};

const outlineStatusLabel = {
  PLANNED: '已规划',
  GENERATING: '生成中',
  READY: '大纲已就绪',
  FAILED: '大纲失败',
};

const chapterStatusLabel = {
  PLANNED: '已规划',
  GENERATING: '生成中',
  DRAFT_READY: '候选稿已生成',
  AI_REVIEWED: '已智能审稿',
  NEED_REVIEW: '待人工审核',
  APPROVED: '已批准',
  PUBLISHED: '已发布',
  REWRITE_REQUESTED: '已要求重写',
  SUPERSEDED: '已被新版本替代',
  REJECTED: '已拒绝',
  FAILED: '已失败',
};

const jobTypeLabel = {
  GENERATE_BIBLE: '生成设定集',
  GENERATE_OUTLINE: '生成大纲',
  PLAN_CHAPTER_DIRECTOR: '导演台规划',
  GENERATE_CHAPTER: '生成章节',
  REVIEW_CHAPTER: '智能审稿',
  REWRITE_CHAPTER: '重写章节',
  NOTIFY_REVIEW: '发送审核提醒',
};

const jobStatusLabel = {
  PENDING: '待处理',
  RUNNING: '运行中',
  SUCCEEDED: '已完成',
  FAILED: '已失败',
  CANCELLED: '已取消',
};

const runTypeLabel = {
  GENERATE_BIBLE: '生成设定集',
  GENERATE_OUTLINE: '生成大纲',
  PLAN_CHAPTER_DIRECTOR: '导演台规划',
  GENERATE_CHAPTER: '生成章节',
  REVIEW_CHAPTER: '智能审稿',
  REWRITE_CHAPTER: '重写章节',
};

const factTypeLabel = {
  character: '人物',
  item: '物品',
  location: '地点',
  ability: '能力',
  relationship: '关系',
  foreshadowing: '伏笔',
  timeline: '时间线',
  rule: '规则',
  other: '其他',
};

const factStatusLabel = {
  ACTIVE: '已激活',
  PENDING: '待确认',
  INACTIVE: '已失效',
};

const directorStatusLabel = {
  READY: '已就绪',
  NEEDS_REVIEW: '需调整',
  FAILED: '失败',
  SUPERSEDED: '已过期',
};

const directorSourceLabel = {
  AI: '模型',
  MANUAL: '手动',
};

const directorForeshadowActionLabel = {
  seed: '埋设',
  touch: '触碰',
  payoff: '兑现',
  avoid_reveal: '避开揭露',
};

const sourceLabel = {
  ai: '模型',
  human: '人工',
  import: '导入',
  system: '系统',
};

const verdictLabel = {
  PASS: '可通过',
  REWRITE: '建议重写',
  MANUAL_REVIEW: '需人工判断',
};

const humanActionLabel = {
  APPROVE: '通过',
  REQUEST_REWRITE: '要求重写',
  REJECT: '拒绝',
  PAUSE_PROJECT: '暂停项目',
  MANUAL_EDIT: '手动编辑正文',
};

const projectEventLabel = {
  BIBLE_UPDATED: '设定集已编辑',
  OUTLINE_UPDATED: '大纲已编辑',
  DIRECTOR_CARD_UPDATED: '导演台已编辑',
  DIRECTOR_CARD_REGENERATE_REQUESTED: '导演台重跑已排队',
  DIRECTOR_CARD_CHAPTER_JOB_CREATED: '导演台已排正文',
  PROJECT_TARGET_UPDATED: '项目目标已修改',
  PROJECT_PAUSED: '项目已暂停',
  PROJECT_RESUMED: '项目已恢复',
  CHAPTER_MANUAL_EDIT_CREATED: '正文候选稿已创建',
  CHAPTER_MANUAL_EDIT_SAVED: '正文已保存',
  BIBLE_REGENERATE_REQUESTED: '设定集重跑已排队',
  OUTLINE_REGENERATE_REQUESTED: '大纲重跑已排队',
  PROJECT_ARCHIVED: '项目已归档',
  PROJECT_RESTORED: '项目已恢复归档',
};

function label(map, value, fallback) {
  if (!value) return fallback;
  return map[value] || fallback;
}

function badge(value, map, fallback = '未知状态') {
  const raw = String(value || '');
  const klass = raw === 'FAILED' || raw === 'REJECTED' || raw === 'INACTIVE'
    ? 'bad'
    : raw === 'NEED_REVIEW' || raw === 'REWRITE_REQUESTED' || raw === 'DRAFT_READY' || raw === 'AI_REVIEWED' || raw === 'PENDING' || raw === 'RUNNING' || raw === 'MANUAL_REVIEW' || raw === 'REWRITE'
      ? 'warn'
      : raw === 'APPROVED' || raw === 'PUBLISHED' || raw === 'COMPLETED' || raw === 'SUCCEEDED' || raw === 'ACTIVE' || raw === 'PASS'
        ? 'good'
        : 'muted';
  return `<span class="badge ${klass}">${escapeHtml(label(map, raw, fallback))}</span>`;
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
    const isLast = index === items.length - 1;
    return isLast || !item.href
      ? `<span aria-current="page">${labelText}</span>`
      : `<a href="${escapeHtml(item.href)}">${labelText}</a>`;
  }).join('<span class="crumb-separator">/</span>')}</nav>`;
}

function reviewHref(chapter) {
  if (chapter.status !== 'NEED_REVIEW' || !chapter.review_token || !chapter.id) return '';
  return `/webhook/novel-review-detail?chapter_id=${encodeURIComponent(chapter.id)}&review_token=${encodeURIComponent(chapter.review_token)}`;
}

function chapterHeading(chapterNo, title) {
  const text = stripChapterTitlePrefix(title, '未命名章节');
  return `第 ${chapterNo} 章：${text}`;
}

function jsonListItem(item) {
  if (typeof item === 'string') return escapeHtml(item);
  if (!item || typeof item !== 'object') return escapeHtml(String(item ?? ''));
  const type = item.type || item.title || item.severity || '要点';
  const description = item.description || item.value || item.content || item.suggestion || '';
  const severity = item.severity ? ` <span class="muted">(${escapeHtml(item.severity)})</span>` : '';
  if (description) return `<strong>${escapeHtml(type)}</strong>${severity}：${escapeHtml(description)}`;
  return escapeHtml(JSON.stringify(item));
}

function jsonBlock(value) {
  if (value === null || value === undefined || value === '') return '<p class="muted">未记录</p>';
  if (Array.isArray(value)) {
    if (!value.length) return '<p class="muted">未记录</p>';
    return `<ul>${value.map((item) => `<li>${jsonListItem(item)}</li>`).join('')}</ul>`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return '<p class="muted">未记录</p>';
    return `<dl class="compact-dl">${entries.map(([key, val]) => `
      <dt>${escapeHtml(key)}</dt><dd>${escapeHtml(typeof val === 'string' ? val : JSON.stringify(val))}</dd>
    `).join('')}</dl>`;
  }
  return `<p>${escapeHtml(value)}</p>`;
}

const bibleFieldLabel = {
  name: '姓名',
  names: '姓名',
  alias: '别名',
  aliases: '别名',
  nickname: '昵称',
  nicknames: '昵称',
  public_name: '公开称呼',
  real_name: '真实姓名',
  age: '年龄',
  identity: '身份',
  identity_note: '身份说明',
  personality: '性格',
  goal: '目标',
  goals: '目标',
  weakness: '弱点',
  growth_arc: '成长线',
  role: '定位',
  character_role: '角色定位',
  function: '作用',
  motivation: '动机',
  desire: '欲望',
  agenda: '行动目标',
  background: '背景',
  backstory: '背景',
  origin: '出身',
  relationship: '关系',
  relationship_with_mc: '与主角关系',
  relation_to_mc: '与主角关系',
  conflict_with_mc: '与主角冲突',
  conflict_point: '冲突点',
  description: '描述',
  appearance: '外貌',
  look: '外貌',
  trait: '特征',
  traits: '特征',
  conflict: '冲突',
  secret: '秘密',
  ability: '能力',
  abilities: '能力',
  skill: '技能',
  skills: '技能',
  limitation: '限制',
  limit: '限制',
  faction: '阵营',
  family: '家族',
  organization: '组织',
  status: '状态',
  arc: '人物线',
  emotional_arc: '情感线',
  threat_level: '威胁等级',
  antagonist_role: '反派定位',
  from: '来源角色',
  to: '目标角色',
  reason: '原因',
  value: '内容',
  note: '备注',
};

function normalizeStructuredValue(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed || !/^[\[{]/.test(trimmed)) return value;
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return value;
  }
}

function humanizeBibleKey(key) {
  const raw = String(key || '').trim();
  if (!raw) return '字段';
  if (bibleFieldLabel[raw]) return bibleFieldLabel[raw];
  const lower = raw.toLowerCase();
  if (bibleFieldLabel[lower]) return bibleFieldLabel[lower];
  if (/[\u4e00-\u9fa5]/.test(raw)) return raw;
  if (lower.includes('relationship') || lower.includes('relation')) return '人物关系';
  if (lower.includes('conflict')) return '冲突';
  if (lower.includes('identity')) return '身份说明';
  if (lower.includes('motivation')) return '动机';
  if (lower.includes('threat')) return '威胁等级';
  if (lower.includes('public')) return '公开称呼';
  if (lower.includes('alias')) return '别名';
  if (lower.includes('goal')) return '目标';
  if (lower.includes('arc')) return '人物线';
  return '补充信息';
}

function isEmptyStructuredValue(value) {
  const data = normalizeStructuredValue(value);
  if (data === null || data === undefined) return true;
  if (typeof data === 'string') return data.trim() === '';
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === 'object') return Object.keys(data).length === 0;
  return false;
}

function readableStructuredValue(value) {
  const data = normalizeStructuredValue(value);
  if (isEmptyStructuredValue(data)) return '<span class="muted">未记录</span>';
  if (Array.isArray(data)) {
    return `<ul class="inline-list">${data.map((item) => `<li>${readableStructuredValue(item)}</li>`).join('')}</ul>`;
  }
  if (typeof data === 'object') {
    const rows = Object.entries(data)
      .filter(([, val]) => !isEmptyStructuredValue(val))
      .map(([key, val]) => `<dt>${escapeHtml(humanizeBibleKey(key))}</dt><dd>${readableStructuredValue(val)}</dd>`)
      .join('');
    return rows ? `<dl class="setting-dl">${rows}</dl>` : '<span class="muted">未记录</span>';
  }
  return `<span>${escapeHtml(data)}</span>`;
}

function localizeStructuredKeys(value) {
  const data = normalizeStructuredValue(value);
  if (Array.isArray(data)) return data.map((item) => localizeStructuredKeys(item));
  if (!data || typeof data !== 'object') return data;
  return Object.fromEntries(Object.entries(data).map(([key, val]) => [
    humanizeBibleKey(key),
    localizeStructuredKeys(val),
  ]));
}

function settingText(value) {
  const data = normalizeStructuredValue(value);
  if (isEmptyStructuredValue(data)) return '<p class="muted">未记录</p>';
  if (Array.isArray(data)) {
    return `<ul class="setting-list simple">${data.map((item) => `<li>${readableStructuredValue(item)}</li>`).join('')}</ul>`;
  }
  if (typeof data === 'object') return readableStructuredValue(data);
  return `<p class="setting-text">${escapeHtml(data)}</p>`;
}

function settingEntries(value, fallbackTitle) {
  const data = normalizeStructuredValue(value);
  if (isEmptyStructuredValue(data)) return '<p class="muted">未记录</p>';
  const items = Array.isArray(data) ? data : [data];
  return `<ol class="setting-list">${items.map((item, index) => {
    const normalized = normalizeStructuredValue(item);
    if (typeof normalized === 'object' && normalized && !Array.isArray(normalized)) {
      const title = normalized.name || normalized.姓名 || normalized.名字 || normalized.role || normalized.定位 || `${fallbackTitle}${items.length > 1 ? ` ${index + 1}` : ''}`;
      return `<li><strong>${escapeHtml(title)}</strong>${readableStructuredValue(normalized)}</li>`;
    }
    return `<li>${readableStructuredValue(normalized)}</li>`;
  }).join('')}</ol>`;
}

function settingChips(value) {
  const data = normalizeStructuredValue(value);
  if (isEmptyStructuredValue(data)) return '<p class="muted">未记录</p>';
  const items = Array.isArray(data) ? data : [data];
  return `<div class="chip-list">${items.map((item) => {
    const normalized = normalizeStructuredValue(item);
    if (typeof normalized === 'object' && normalized && !Array.isArray(normalized)) {
      const text = normalized.title || normalized.name || normalized.名称 || normalized.卖点 || normalized.description || Object.values(normalized).filter(Boolean).join(' / ');
      return `<span>${escapeHtml(text || '卖点')}</span>`;
    }
    return `<span>${escapeHtml(normalized)}</span>`;
  }).join('')}</div>`;
}

function bibleCard(title, contentHtml) {
  return `<article class="bible-card"><h3>${escapeHtml(title)}</h3>${contentHtml}</article>`;
}

function formHidden(name, value) {
  return `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value || '')}" />`;
}

function jsonTextareaValue(value, fallback, options = {}) {
  const data = value === undefined || value === null || value === '' ? fallback : value;
  const output = options.localizeKeys ? localizeStructuredKeys(data) : data;
  try {
    return JSON.stringify(output, null, 2);
  } catch (error) {
    return String(output || '');
  }
}

function jsonTextareaField(name, label, value, fallback, options = {}) {
  return `<label class="json-field"><span>${escapeHtml(label)}</span><textarea class="json-textarea" name="${escapeHtml(name)}" data-json-field>${escapeHtml(jsonTextareaValue(value, fallback, options))}</textarea><small class="json-feedback" data-json-feedback>结构格式正常，保存时会自动转为后端字段</small></label>`;
}

function continueForm(projectId) {
  return `
    <form class="inline-form action-queue" method="POST" action="/webhook/novel-project-continue" data-confirm="继续写作只会补齐缺失的下一步队列任务，不会直接调用模型；如果页面已经出现“启动设定集生成”或“启动大纲生成”，建议优先点击对应按钮。确认补齐任务？">
      ${formHidden('project_id', projectId)}
      ${formHidden('reviewer', 'local_user')}
      <button type="submit"><span>排队下一步</span><small>不直接调用模型</small></button>
    </form>`;
}

function generationRunForm(projectId, jobType, job = {}) {
  const config = {
    GENERATE_BIBLE: {
      action: '/webhook/novel-generate-bible-now',
      step: 'bible',
      label: '启动设定集生成',
      confirm: '这会启动后台模型任务；提交完成后会留在当前项目页并刷新状态。确认启动？',
    },
    GENERATE_OUTLINE: {
      action: '/webhook/novel-generate-outline-now',
      step: 'outline',
      label: '启动大纲生成',
      confirm: '这会启动后台模型任务；提交完成后会留在当前项目页并刷新状态。确认启动？',
    },
    PLAN_CHAPTER_DIRECTOR: {
      action: '/webhook/novel-generate-director-now',
      step: 'director',
      label: job.chapter_no ? `启动第 ${job.chapter_no} 章导演台` : '启动导演台',
      confirm: '这会领取当前项目已排队的导演台任务；提交完成后会留在当前项目页并刷新状态，模型调用会继续在 n8n 后台执行。确认启动？',
    },
    GENERATE_CHAPTER: {
      action: '/webhook/novel-generate-chapter-now',
      step: 'chapter',
      label: job.chapter_no ? `启动第 ${job.chapter_no} 章生成` : '启动章节生成',
      confirm: '这会领取当前项目已排队的章节生成任务；提交完成后会留在当前项目页并刷新状态，模型调用会继续在 n8n 后台执行。确认启动？',
    },
  }[jobType];
  if (!projectId || !config) return '';
  return `
    <form class="inline-form action-now" method="POST" action="${escapeHtml(config.action)}" data-confirm="${escapeHtml(config.confirm)}">
      ${formHidden('project_id', projectId)}
      ${formHidden('step', config.step)}
      <button class="primary" type="submit"><span>${escapeHtml(config.label)}</span><small>后台执行并刷新状态</small></button>
    </form>`;
}

function rewriteRunForm(projectId, job = {}) {
  if (!projectId || !job.id || !['PENDING', 'RUNNING'].includes(String(job.status || ''))) return '';
  const chapterNo = job.chapter_no ? `第 ${job.chapter_no} 章` : '当前章节';
  const isRunning = job.status === 'RUNNING';
  const labelText = isRunning ? `检查并恢复${chapterNo}重写` : `启动${chapterNo}重写`;
  const helperText = isRunning ? '超时则重排并重试' : '恢复/重试模型调用';
  const confirmText = isRunning
    ? '这会检查已运行的重写任务；只有运行超过 6 分钟的任务才会被恢复为待执行并重新启动，避免正常运行中的模型调用被重复触发。确认检查并恢复？'
    : '这会立即领取已排队的重写任务；不会创建新章节，模型调用会在后台继续执行。确认启动？';
  return `
    <form class="inline-form action-now rewrite-now-form" method="POST" action="/webhook/novel-rewrite-start" data-confirm="${escapeHtml(confirmText)}">
      ${formHidden('project_id', projectId)}
      ${formHidden('job_id', job.id)}
      ${formHidden('reviewer', 'local_user')}
      <button class="primary" type="submit"><span>${escapeHtml(labelText)}</span><small>${escapeHtml(helperText)}</small></button>
    </form>`;
}

function regenerateAssetForm(projectId, step, options = {}) {
  const isBible = step === 'BIBLE';
  const labelText = isBible ? '重新生成设定集' : '重新生成大纲';
  const smallText = isBible ? '更新核心创意并重排大纲' : '覆盖目录并保留章节';
  const confirmText = isBible
    ? '这会用新的核心创意/生成要求重新生成设定集，并取消旧的待处理任务；新设定完成后会覆盖当前设定，并继续创建新的大纲生成任务。已生成章节不会自动删除。确认重跑？'
    : '这会重新生成大纲，并取消旧的待处理章节/审稿/重写任务；新大纲完成后会覆盖当前目录，已生成章节不会自动删除。确认重跑？';
  const note = options.note || (isBible
    ? '适合核心创意变化、提示词升级、角色主名/别名规则改变、设定结构明显不干净时使用。这里填写的内容会成为新的项目核心创意，并进入本次设定集生成提示词。'
    : '适合设定集已修正、章节规划需要按新规则重排时使用。');
  const textareaName = isBible ? 'regenerate_prompt' : 'comment';
  const textareaLabel = isBible ? '新的核心创意 / 生成要求' : '备注';
  const textareaPlaceholder = isBible
    ? '例如：一女主三男主，前朝落难公主被仇家异姓王收养，前期甜宠修罗场，后期身份揭露转虐恋…'
    : '例如：设定集已修正，重跑章节目录…';
  return `
    <details class="action-detail danger-detail regenerate-detail">
      <summary>${escapeHtml(labelText)}</summary>
      <form method="POST" action="/webhook/novel-project-regenerate" data-confirm="${escapeHtml(confirmText)}">
        ${formHidden('project_id', projectId)}
        ${formHidden('step', step)}
        ${formHidden('reviewer', 'local_user')}
        <p class="muted">${escapeHtml(note)}</p>
        <label><span>${escapeHtml(textareaLabel)}</span><textarea name="${escapeHtml(textareaName)}" placeholder="${escapeHtml(textareaPlaceholder)}"></textarea></label>
        ${isBible ? '<input type="hidden" name="comment" value="以新的核心创意重新生成设定集" />' : ''}
        <button type="submit"><span>${escapeHtml(labelText)}</span><small>${escapeHtml(smallText)}</small></button>
      </form>
    </details>`;
}

function projectTargetsForm(row) {
  return `
    <details class="action-detail management-detail">
      <summary>修改项目目标</summary>
      <form method="POST" action="/webhook/novel-project-targets-update" data-confirm="确认保存新的项目目标？如果目标章节数增加，后续继续写作可能会先补齐大纲。">
        ${formHidden('project_id', row.id)}
        ${formHidden('reviewer', 'local_user')}
        <div class="form-grid">
          <label>
            <span>目标章节数</span>
            <input name="target_total_chapters" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(row.target_total_chapters || 20)}" />
          </label>
          <label>
            <span>每章目标字数</span>
            <select name="target_words_per_chapter">${renderWordCountOptions(row.target_words_per_chapter || 2000)}</select>
            <small class="form-help">只影响后续章节生成和重写；已生成章节不会自动改写，运行中的模型调用也不会中途变更。</small>
          </label>
        </div>
        <label>
          <span>修改说明</span>
          <textarea name="comment" placeholder="例如：把第一季扩展到三十章…"></textarea>
        </label>
        <button type="submit">保存项目目标</button>
      </form>
    </details>`;
}

function projectPauseForms(row) {
  const isPaused = row.status === 'PAUSED';
  const action = isPaused ? 'RESUME' : 'PAUSE';
  const labelText = isPaused ? '恢复项目' : '暂停项目';
  const confirmText = isPaused
    ? '恢复后队列可以继续领取该项目任务，确认恢复？'
    : '暂停后待处理任务会保留，但队列会跳过该项目，确认暂停？';
  return `
    <details class="action-detail management-detail">
      <summary>${escapeHtml(labelText)}</summary>
      <form method="POST" action="/webhook/novel-project-status-toggle" data-confirm="${escapeHtml(confirmText)}">
        ${formHidden('project_id', row.id)}
        ${formHidden('desired_action', action)}
        ${formHidden('reviewer', 'local_user')}
        <label>
          <span>${escapeHtml(isPaused ? '恢复说明' : '暂停说明')}</span>
          <textarea name="comment" placeholder="${escapeHtml(isPaused ? '例如：恢复生成第二卷…' : '例如：等待人工调整大纲，暂停队列领取…')}"></textarea>
        </label>
        <button type="submit">${escapeHtml(labelText)}</button>
      </form>
    </details>`;
}

function projectArchiveForms(row) {
  const isArchived = row.status === 'ARCHIVED';
  if (isArchived) {
    return `
      <details class="action-detail danger-detail">
        <summary>恢复归档项目</summary>
        <form method="POST" action="/webhook/novel-project-archive-toggle" data-confirm="恢复后项目会重新出现在可管理状态；已取消的旧任务不会自动恢复，需要手动继续写作。确认恢复？">
          ${formHidden('project_id', row.id)}
          ${formHidden('desired_action', 'RESTORE')}
          ${formHidden('reviewer', 'local_user')}
          <label>
            <span>恢复说明</span>
            <textarea name="comment" placeholder="例如：重新打开项目，准备继续调整正文…"></textarea>
          </label>
          <button type="submit">恢复归档项目</button>
        </form>
      </details>`;
  }
  return `
    <details class="action-detail danger-detail">
      <summary>归档项目</summary>
      <form method="POST" action="/webhook/novel-project-archive-toggle" data-confirm="归档会取消待处理任务，并停止项目继续推进；项目数据仍保留。确认归档？">
        ${formHidden('project_id', row.id)}
        ${formHidden('desired_action', 'ARCHIVE')}
        ${formHidden('reviewer', 'local_user')}
        <p class="muted">归档相当于软删除：不会物理删除设定集、大纲、章节和日志，但待处理任务会被取消。</p>
        <label>
          <span>输入项目名确认</span>
          <input name="confirm_title" autocomplete="off" placeholder="请输入：${escapeHtml(row.title || '')}" />
        </label>
        <label>
          <span>归档说明</span>
          <textarea name="comment" placeholder="例如：测试项目不再继续写作…"></textarea>
        </label>
        <button type="submit">归档项目</button>
      </form>
    </details>`;
}

function bibleEditForm(projectId, bible) {
  return `
    <details class="action-detail management-detail">
      <summary>编辑设定集（高级）</summary>
      <form method="POST" action="/webhook/novel-bible-update" data-confirm="确认保存设定集？后续生成会读取新的设定。">
        ${formHidden('project_id', projectId)}
        ${formHidden('reviewer', 'local_user')}
        <div class="json-tools">
          <button type="button" data-format-json>格式化结构化字段</button>
          <span>保存前会检查结构化内容，避免无效数据写入设定集。</span>
        </div>
        <div class="form-grid">
          <label><span>故事核心</span><textarea name="story_core">${escapeHtml(bible.story_core || '')}</textarea></label>
          <label><span>世界设定</span><textarea name="world_setting">${escapeHtml(bible.world_setting || '')}</textarea></label>
          <label><span>能力体系</span><textarea name="power_system">${escapeHtml(bible.power_system || '')}</textarea></label>
          <label><span>文风规则</span><textarea name="tone_rules">${escapeHtml(bible.tone_rules || '')}</textarea></label>
          <label><span>禁忌规则</span><textarea name="forbidden_rules">${escapeHtml(bible.forbidden_rules || '')}</textarea></label>
          ${jsonTextareaField('main_character_json', '主角设定（可编辑结构）', bible.main_character, {}, {localizeKeys: true})}
          ${jsonTextareaField('supporting_characters_json', '配角设定（可编辑结构）', bible.supporting_characters, [], {localizeKeys: true})}
          ${jsonTextareaField('villain_setting_json', '反派设定（可编辑结构）', bible.villain_setting, [], {localizeKeys: true})}
          ${jsonTextareaField('relationship_map_json', '人物关系（可编辑结构）', bible.relationship_map, [], {localizeKeys: true})}
          ${jsonTextareaField('selling_points_json', '卖点（可编辑结构）', bible.selling_points, [], {localizeKeys: true})}
        </div>
        <label>
          <span>修改说明</span>
          <textarea name="comment" placeholder="例如：补充反派动机和能力限制…"></textarea>
        </label>
        <button type="submit">保存设定集</button>
      </form>
    </details>`;
}

function outlineEditForm(projectId, outline) {
  return `
    <details class="action-detail management-detail">
      <summary>编辑本章大纲</summary>
      <form method="POST" action="/webhook/novel-outline-update" data-confirm="确认保存本章大纲？后续生成会读取新的大纲。">
        ${formHidden('project_id', projectId)}
        ${formHidden('outline_id', outline.id)}
        ${formHidden('reviewer', 'local_user')}
        <div class="form-grid">
          <label><span>卷号</span><input name="volume_no" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(outline.volume_no || 1)}" /></label>
          <label><span>章节标题</span><input name="title" value="${escapeHtml(stripChapterTitlePrefix(outline.title || ''))}" /></label>
          <label><span>大纲摘要</span><textarea name="summary">${escapeHtml(outline.summary || '')}</textarea></label>
          <label><span>章节目标</span><textarea name="chapter_goal">${escapeHtml(outline.chapter_goal || '')}</textarea></label>
          <label><span>冲突点</span><textarea name="conflict_point">${escapeHtml(outline.conflict_point || '')}</textarea></label>
          <label><span>情绪点</span><textarea name="emotional_point">${escapeHtml(outline.emotional_point || '')}</textarea></label>
          <label><span>章末钩子</span><textarea name="hook">${escapeHtml(outline.hook || '')}</textarea></label>
        </div>
        <label>
          <span>修改说明</span>
          <textarea name="comment" placeholder="例如：强化本章反转，保留结尾悬念…"></textarea>
        </label>
        <button type="submit">保存本章大纲</button>
      </form>
    </details>`;
}

function rewriteForm(chapter) {
  if (!chapter.is_current || !['APPROVED', 'PUBLISHED'].includes(chapter.status)) return '';
  return `
    <details class="action-detail">
      <summary>申请重写此章</summary>
      <form method="POST" action="/webhook/novel-chapter-rewrite-request" data-confirm="这会为当前正式版本创建重写任务。旧正式版本会继续保持当前可续写，确认申请重写？">
        ${formHidden('chapter_id', chapter.id)}
        ${formHidden('review_token', chapter.review_token)}
        ${formHidden('reviewer', 'local_user')}
        <label>
          <span>重写要求</span>
          <textarea name="comment" placeholder="例如：强化冲突、压缩铺垫、保留结尾钩子…"></textarea>
        </label>
        <button type="submit">提交重写申请</button>
      </form>
    </details>`;
}

function manualEditForm(chapter) {
  if (!chapter.body || !['DRAFT_READY', 'AI_REVIEWED', 'NEED_REVIEW', 'APPROVED', 'PUBLISHED'].includes(chapter.status)) return '';
  const canSaveCandidate = chapter.is_current && ['APPROVED', 'PUBLISHED'].includes(chapter.status);
  return `
    <details class="action-detail">
      <summary>手动编辑正文</summary>
      <form method="POST" action="/webhook/novel-chapter-manual-edit" data-confirm="确认保存正文？">
        ${formHidden('chapter_id', chapter.id)}
        ${formHidden('review_token', chapter.review_token)}
        ${formHidden('reviewer', 'local_user')}
        <div class="form-grid">
          <label><span>章节标题</span><input name="title" value="${escapeHtml(stripChapterTitlePrefix(chapter.title || ''))}" /></label>
          <label><span>章节摘要</span><textarea name="summary">${escapeHtml(chapter.summary || '')}</textarea></label>
        </div>
        <label>
          <span>正文</span>
          <textarea class="large-textarea" name="body">${escapeHtml(chapter.body || '')}</textarea>
        </label>
        <label>
          <span>修改说明</span>
          <textarea name="comment" placeholder="例如：压缩开头铺垫，强化结尾反转…"></textarea>
        </label>
        <p class="form-help">直接保存会修改当前版本，不调用模型；保存为候选稿会创建新候选版本并进入智能审稿，原正式版本不变。</p>
        <div class="manual-edit-actions">
          ${canSaveCandidate ? '<button type="submit" name="edit_mode" value="candidate_review" data-confirm="这会创建新的人工编辑候选稿，不覆盖当前正式版本；候选稿会进入智能审稿队列。确认保存为候选稿并送审？">保存为候选稿并送审</button>' : '<span class="disabled-action">候选稿送审仅支持当前正式版本</span>'}
          <button type="submit" name="edit_mode" value="direct_save" data-confirm="这会直接保存当前章节版本，不创建候选稿、不调用模型、不新增审稿任务。确认直接保存？">直接保存</button>
        </div>
      </form>
    </details>`;
}

function remindForm(chapter) {
  const href = reviewHref(chapter);
  if (!href) return '';
  return `
    <form class="inline-form" method="POST" action="/webhook/novel-review-remind" data-confirm="这会重新创建审核提醒任务，提醒链接只进入审核详情页。确认发送？">
      ${formHidden('chapter_id', chapter.id)}
      ${formHidden('review_token', chapter.review_token)}
      ${formHidden('reviewer', 'local_user')}
      <button type="submit">重新发送提醒</button>
    </form>`;
}

function copyReviewButton(chapter) {
  const href = reviewHref(chapter);
  if (!href) return '';
  return `<button type="button" data-copy-text="${escapeHtml(href)}">复制审核链接</button>`;
}

function reviewLink(chapter) {
  const href = reviewHref(chapter);
  return href ? `<a href="${href}">去审核</a>` : '';
}

function directorPayload(card) {
  return parseObject(card?.card_payload);
}

function directorCardStatus(card, activeJob) {
  if (activeJob?.status === 'RUNNING') return {status: 'RUNNING', label: '生成中'};
  if (activeJob?.status === 'PENDING') return {status: 'PENDING', label: '排队中'};
  if (!card?.id) return {status: 'NONE', label: '无导演台'};
  if (card.manual_override) return {status: card.status || 'READY', label: `已手改 / ${label(directorStatusLabel, card.status, '已就绪')}`};
  return {status: card.status || 'READY', label: label(directorStatusLabel, card.status, '已就绪')};
}

function directorCardBadge(card, activeJob) {
  const state = directorCardStatus(card, activeJob);
  const status = state.status;
  const klass = status === 'READY'
    ? 'good'
    : status === 'NEEDS_REVIEW' || status === 'PENDING' || status === 'RUNNING'
      ? 'warn'
      : status === 'FAILED'
        ? 'bad'
        : 'muted';
  return `<span class="badge ${klass}">${escapeHtml(state.label)}</span>`;
}

function directorRegenerateForm(projectId, chapterNo, cardId = '') {
  if (!projectId || !chapterNo) return '';
  return `
    <form class="inline-form" method="POST" action="/webhook/novel-director-card-regenerate" data-confirm="这会为本章重新排队导演台规划，不会删除旧版本。确认重新生成？">
      ${formHidden('project_id', projectId)}
      ${formHidden('director_card_id', cardId)}
      ${formHidden('chapter_no', chapterNo)}
      ${formHidden('director_action', 'REGENERATE')}
      ${formHidden('reviewer', 'local_user')}
      <button type="submit"><span>重新生成导演台</span><small>只排队规划</small></button>
    </form>`;
}

function directorStartChapterForm(projectId, card, chapterJob = null, chapter = null) {
  if (!projectId || !card?.id || card.status !== 'READY') return '';
  if (chapter?.status === 'NEED_REVIEW') {
    return reviewHref(chapter)
      ? `<a href="${escapeHtml(reviewHref(chapter))}">正文已生成，去审核</a>`
      : '<span class="disabled-action">正文已生成，待人工审核</span>';
  }
  if (['DRAFT_READY', 'AI_REVIEWED'].includes(String(chapter?.status || ''))) {
    return '<span class="disabled-action">正文已生成，等待审稿</span>';
  }
  if (['APPROVED', 'PUBLISHED'].includes(String(chapter?.status || ''))) {
    return `<a href="${escapeHtml(projectViewHref('chapters', `#chapter-${encodeURIComponent(chapter.chapter_no || card.chapter_no)}`))}">正文已通过，查看正文</a>`;
  }
  if (String(chapter?.status || '') === 'REWRITE_REQUESTED') {
    return '<span class="disabled-action">正文已要求重写</span>';
  }
  if (chapterJob?.status === 'RUNNING') {
    return '<span class="disabled-action">正文生成中</span>';
  }
  if (chapterJob?.status === 'PENDING') {
    return `
    <form class="inline-form action-now" method="POST" action="/webhook/novel-generate-chapter-now" data-confirm="正文任务已排队。这会领取已排队的章节生成任务，模型调用会在 n8n 后台继续执行。确认启动？">
      ${formHidden('project_id', projectId)}
      ${formHidden('step', 'chapter')}
      <button class="primary" type="submit"><span>正文已排队，启动生成</span><small>领取正文任务</small></button>
    </form>`;
  }
  return `
    <form class="inline-form action-queue" method="POST" action="/webhook/novel-director-card-start-chapter" data-confirm="这会按当前导演台创建正文生成任务，不会直接调用模型，也不会覆盖旧正文。确认排队正文？">
      ${formHidden('project_id', projectId)}
      ${formHidden('director_card_id', card.id)}
      ${formHidden('chapter_no', card.chapter_no)}
      ${formHidden('director_action', 'START_CHAPTER')}
      ${formHidden('reviewer', 'local_user')}
      <button type="submit"><span>排队正文生成</span><small>不直接调用模型</small></button>
    </form>`;
}

function directorSaveForm(projectId, card) {
  if (!projectId || !card?.id) return '';
  const drawerId = `director-edit-${card.id || card.chapter_no}`;
  const expectedSegments = chapterSegmentCountForTarget(row.target_words_per_chapter || 2000);
  return `
    <button class="director-edit-trigger" type="button" data-open-dialog="${escapeHtml(drawerId)}">编辑导演台</button>
    <dialog class="side-dialog director-edit-dialog" id="${escapeHtml(drawerId)}" aria-label="导演台高级编辑抽屉">
      <div class="drawer-panel director-edit-panel">
        <div class="drawer-head">
          <div>
            <p class="ops-kicker">导演台</p>
            <h3>高级编辑（原始结构）</h3>
            <p class="muted">适合修正阻断问题、补齐分段计划和调整事实来源审计。保存后会创建新的当前版本，页面会自动刷新。</p>
          </div>
          <button class="drawer-close" type="button" data-close-dialog>关闭</button>
        </div>
        <form class="director-edit-form" method="POST" action="/webhook/novel-director-card-update" data-expected-segments="${escapeHtml(expectedSegments)}" data-confirm="保存后会创建新的当前导演台版本；旧版本保留为历史。确认保存？">
          ${formHidden('project_id', projectId)}
          ${formHidden('director_card_id', card.id)}
          ${formHidden('chapter_no', card.chapter_no)}
          ${formHidden('director_action', 'UPDATE')}
          ${formHidden('reviewer', 'local_user')}
          <div class="json-tools">
            <button type="button" data-format-json>格式化结构</button>
            <button type="button" data-resolve-director-gate>标记阻断已解决</button>
            <span>保存前会检查 JSON；本项目当前每章约 ${escapeHtml(row.target_words_per_chapter || 2000)} 字，导演台分段计划需 ${escapeHtml(expectedSegments)} 段。</span>
          </div>
          <p class="form-help">状态由原始结构里的质量闸门决定：通过必须为 true，阻断列表必须为空，分段计划数量必须匹配。</p>
          <label class="wide"><span>导演台原始结构</span><textarea class="json-textarea director-json" name="card_payload_json" data-json-field>${escapeHtml(jsonTextareaValue(directorPayload(card), {}))}</textarea><small class="json-feedback" data-json-feedback>结构格式正常</small></label>
          <label class="wide"><span>备注</span><input name="comment" placeholder="可选：说明为什么调整这张导演台" /></label>
          <p class="form-help" data-async-feedback>点保存后会写入新版本并刷新页面；如果格式错误，会停留在抽屉里提示。</p>
          <div class="drawer-action-row">
            <button class="primary" type="submit">保存为当前版本</button>
            <button type="button" data-close-dialog>取消</button>
          </div>
        </form>
      </div>
    </dialog>`;
}

function directorMiniLink(card, outline, activeJob) {
  const chapterNo = outline?.chapter_no || card?.chapter_no || activeJob?.chapter_no || '';
  if (!chapterNo) return '';
  return `<a href="${escapeHtml(projectViewHref('director', `#director-${encodeURIComponent(chapterNo)}`))}">看导演台</a>`;
}

function outlineCard(outline, chaptersByNo, projectId, directorByNo = new Map(), directorJobsByNo = new Map()) {
  const chapters = chaptersByNo.get(Number(outline.chapter_no)) || [];
  const director = directorByNo.get(Number(outline.chapter_no)) || null;
  const directorJob = directorJobsByNo.get(Number(outline.chapter_no)) || null;
  const latest = chapters.slice().sort((a, b) => {
    const versionDiff = Number(b.generation_version || 0) - Number(a.generation_version || 0);
    if (versionDiff !== 0) return versionDiff;
    return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
  })[0] || null;
  const hasBody = Boolean(latest && latest.body);
  const filterValues = ['all'];
  if (hasBody) filterValues.push('written');
  if (chapters.some((chapter) => chapter.is_current)) filterValues.push('current');
  if (chapters.some((chapter) => chapter.status === 'NEED_REVIEW')) filterValues.push('review');
  const chapterHref = hasBody ? projectViewHref('chapters', `#chapter-${encodeURIComponent(outline.chapter_no || '')}`) : '';
  return `
    <article class="catalog-item" data-chapter-values="${escapeHtml(filterValues.join(' '))}">
      <div class="item-head">
        <div>
          <strong>${escapeHtml(chapterHeading(outline.chapter_no, latest?.title || outline.title || '未命名章节'))}</strong>
          <span>第 ${escapeHtml(outline.volume_no || 1)} 卷</span>
        </div>
        <div class="badge-row">${directorCardBadge(director, directorJob)}${latest ? badge(latest.status, chapterStatusLabel) : badge(outline.status, outlineStatusLabel)}</div>
      </div>
      <dl>
        <dt>大纲摘要</dt><dd>${escapeHtml(outline.summary || '暂无大纲摘要')}</dd>
        <dt>章节目标</dt><dd>${escapeHtml(outline.chapter_goal || '未记录')}</dd>
        <dt>冲突点</dt><dd>${escapeHtml(outline.conflict_point || '未记录')}</dd>
        <dt>情绪点</dt><dd>${escapeHtml(outline.emotional_point || '未记录')}</dd>
        <dt>章末钩子</dt><dd>${escapeHtml(outline.hook || '未记录')}</dd>
      </dl>
      <div class="row-actions">
        ${directorMiniLink(director, outline, directorJob)}
        ${hasBody ? `<a href="${escapeHtml(chapterHref)}">看正文</a>` : '<span class="disabled-action">未生成正文</span>'}
        ${latest ? reviewLink(latest) : ''}
      </div>
      ${outline.id ? outlineEditForm(projectId, outline) : ''}
    </article>`;
}

function isStaleChapter(chapter) {
  return chapter.is_stale === true || String(chapter.is_stale || '').toLowerCase() === 'true';
}

function reviewReportBlock(chapter) {
  const report = parseObject(chapter.latest_review_report);
  if (!report.id) return '<p class="muted">暂无 AI 审稿报告</p>';
  return `
    <dl class="compact-dl">
      <dt>总评分</dt><dd>${escapeHtml(report.total_score ?? '未记录')}</dd>
      <dt>智能建议</dt><dd>${badge(report.verdict || 'MANUAL_REVIEW', verdictLabel)}</dd>
      <dt>一致性</dt><dd>${escapeHtml(report.consistency_score ?? '未记录')}</dd>
      <dt>可读性</dt><dd>${escapeHtml(report.readability_score ?? '未记录')}</dd>
      <dt>剧情</dt><dd>${escapeHtml(report.plot_score ?? '未记录')}</dd>
      <dt>商业性</dt><dd>${escapeHtml(report.commercial_score ?? '未记录')}</dd>
      <dt>问题</dt><dd>${jsonBlock(report.issues || [])}</dd>
      <dt>建议</dt><dd>${jsonBlock(report.suggestions || [])}</dd>
    </dl>`;
}

function humanReviewBlock(chapter) {
  const records = parseArray(chapter.human_reviews);
  if (!records.length) return '<p class="muted">暂无人工审核记录</p>';
  return `<ul class="history">${records.map((record) => `
    <li><strong>${escapeHtml(label(humanActionLabel, record.action, '人工操作'))}</strong><span>${escapeHtml(record.reviewer || '本地用户')} / ${escapeHtml(formatLocalTime(record.created_at))}</span>${record.comment ? `<p>${escapeHtml(record.comment)}</p>` : ''}</li>
  `).join('')}</ul>`;
}

function chapterAiRunsBlock(chapter) {
  const runs = parseArray(chapter.ai_runs);
  if (!runs.length) return '<p class="muted">暂无章节模型调用</p>';
  return `<ul class="history">${runs.map((run) => `
    <li><strong>${escapeHtml(label(runTypeLabel, run.run_type, '模型调用'))}</strong><span>${escapeHtml(run.model || '未记录')} / ${escapeHtml(run.success === false ? '失败' : '成功')} / ${escapeHtml(formatDuration(run.duration_ms))} / ${escapeHtml(formatLocalTime(run.created_at))}</span><span>触发来源：${escapeHtml(runTriggerSource(run))}</span>${run.error_message ? `<p class="error">${escapeHtml(run.error_message)}</p>` : ''}</li>
  `).join('')}</ul>`;
}

function runTriggerSource(run) {
  const payload = parseObject(run.request_payload);
  if (payload.trigger_source === 'front_immediate') return '前端后台启动';
  const requestedBy = payload.requested_by || payload.payload?.requested_by;
  if (String(requestedBy || '').includes('front')) return '前端后台启动';
  if (run.job_id) return '队列自动执行';
  if (requestedBy) return `人工触发 / ${requestedBy}`;
  return '队列或系统触发';
}

function latestChapterRun(chapter) {
  return parseArray(chapter.ai_runs)
    .slice()
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0] || null;
}

function chapterEvidenceStrip(chapter) {
  const run = latestChapterRun(chapter);
  const report = parseObject(chapter.latest_review_report);
  const runText = run
    ? `${label(runTypeLabel, run.run_type, '模型调用')} / ${run.model || '未记录'} / ${run.success === false ? '失败' : '成功'} / ${formatDuration(run.duration_ms)}`
    : '暂无模型调用';
  const scoreText = report.id
    ? `审稿总分 ${report.total_score ?? '未记录'} / ${label(verdictLabel, report.verdict || 'MANUAL_REVIEW', '需人工判断')}`
    : '暂无审稿报告';
  return `
    <div class="chapter-evidence" aria-label="章节运行摘要">
      <span>最近模型调用：${escapeHtml(runText)}</span>
      <span>智能审稿：${escapeHtml(scoreText)}</span>
    </div>`;
}

function chapterVersionKind(chapter) {
  if (isStaleChapter(chapter)) return '旧大纲历史';
  if (chapter.is_current) return '当前正式版本';
  if (chapter.status === 'NEED_REVIEW') return '待审核候选';
  if (chapter.status === 'SUPERSEDED') return '历史候选稿';
  if (chapter.status === 'DRAFT_READY' || chapter.status === 'AI_REVIEWED') return '候选版本';
  return label(chapterStatusLabel, chapter.status, '历史版本');
}

function chapterHistoryTimeline(chapter, history = []) {
  const versions = history.length ? history : [chapter];
  const drawerId = `chapter-history-${chapter.id || chapter.chapter_no}`;
  const items = versions.map((version, index) => {
    const isLatest = version.id === chapter.id;
    const body = version.body || '';
    return `
      <li class="${isLatest ? 'is-latest' : ''}">
        <div class="timeline-dot"></div>
        <div class="timeline-body">
          <div class="timeline-head">
            <strong>版本 ${escapeHtml(version.generation_version || 1)}${isLatest ? ' / 当前展示' : ''}</strong>
            <span>${escapeHtml(formatLocalTime(version.updated_at || version.created_at))}</span>
          </div>
          <div class="badge-row">${badge(version.status, chapterStatusLabel)}<span class="badge muted">${escapeHtml(chapterVersionKind(version))}</span></div>
          <p>${escapeHtml(chapterHeading(version.chapter_no, version.title || '未命名章节'))}</p>
          <p class="muted">${escapeHtml(version.summary || '暂无章节摘要')}</p>
          <details>
            <summary>查看该版本正文</summary>
            <pre>${escapeHtml(body || '暂无正文')}</pre>
          </details>
        </div>
      </li>`;
  }).join('');
  return {
    button: `<button type="button" data-open-dialog="${escapeHtml(drawerId)}">历史版本</button>`,
    dialog: `
    <dialog class="side-dialog version-dialog" id="${escapeHtml(drawerId)}" aria-label="章节历史版本时间轴">
      <div class="drawer-panel">
        <div class="drawer-head">
          <div>
            <p class="ops-kicker">版本时间轴</p>
            <h2>${escapeHtml(chapterHeading(chapter.chapter_no, chapter.title || '未命名章节'))}</h2>
            <p class="muted">主列表只展示每章最新版本；历史稿、旧大纲正文和被替换稿都收在这里。</p>
          </div>
          <button class="drawer-close" type="button" data-close-dialog>关闭</button>
        </div>
        <ol class="version-timeline">${items}</ol>
      </div>
    </dialog>`,
  };
}

function chapterCard(chapter, options = {}) {
  const title = chapter.title || '未命名章节';
  const body = chapter.body || '';
  const stale = options.stale || isStaleChapter(chapter);
  const history = options.history || [chapter];
  const historyDrawer = stale ? {button: '', dialog: ''} : chapterHistoryTimeline(chapter, history);
  const current = chapter.is_current ? '<span class="badge good">当前正式版本</span>' : '';
  const staleBadge = stale ? '<span class="badge muted">旧大纲历史</span>' : '';
  const actions = stale
    ? '<span class="disabled-action">旧大纲历史只读</span>'
    : `
        ${reviewLink(chapter) || '<span class="disabled-action">只读正文</span>'}
        ${historyDrawer.button}
        ${copyReviewButton(chapter)}
        <button type="button" data-copy-target="body-${escapeHtml(chapter.id)}">复制正文</button>
        ${remindForm(chapter)}
      `;
  return `
    <article id="${stale ? 'stale-' : ''}chapter-${escapeHtml(chapter.chapter_no)}" class="chapter-card${stale ? ' stale-chapter-card' : ''}" data-written-status="${escapeHtml(chapter.status || '')}" data-version-kind="${stale ? 'stale' : (chapter.is_current ? 'current' : 'candidate')}">
      <div class="item-head">
        <div>
          <strong>${escapeHtml(chapterHeading(chapter.chapter_no, title))}</strong>
          <span>版本 ${escapeHtml(chapter.generation_version || 1)} / 字数 ${escapeHtml(chapter.word_count || 0)} / ${escapeHtml(formatLocalTime(chapter.updated_at || chapter.created_at))}</span>
        </div>
        <div class="badge-row">${badge(chapter.status, chapterStatusLabel)}${current}${staleBadge}</div>
      </div>
      ${stale ? '<p class="stale-note">这份正文生成于当前大纲更新之前，仅作为历史记录保留，不再参与当前章节审核和下一步判断。</p>' : ''}
      <p class="chapter-summary">${escapeHtml(chapter.summary || '暂无章节摘要')}</p>
      ${chapterEvidenceStrip(chapter)}
      <div class="row-actions">
        ${actions}
      </div>
      ${historyDrawer.dialog}
      ${stale ? '' : rewriteForm(chapter)}
      ${stale ? '' : manualEditForm(chapter)}
      <details class="chapter-body">
        <summary>章节正文</summary>
        <pre id="body-${escapeHtml(chapter.id)}">${escapeHtml(body || '暂无正文')}</pre>
      </details>
      <details class="chapter-extra">
        <summary>审稿报告</summary>
        ${reviewReportBlock(chapter)}
      </details>
      <details class="chapter-extra">
        <summary>人工审核记录</summary>
        ${humanReviewBlock(chapter)}
      </details>
      <details class="chapter-extra">
        <summary>章节模型调用</summary>
        ${chapterAiRunsBlock(chapter)}
      </details>
    </article>`;
}

function directorValueText(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.map(directorValueText).filter(Boolean).join('；');
  if (typeof value === 'object') {
    return Object.values(value).map(directorValueText).filter(Boolean).join('；');
  }
  return String(value);
}

function directorListItem(item) {
  if (typeof item === 'string') return escapeHtml(item);
  if (!item || typeof item !== 'object') return escapeHtml(directorValueText(item));
  const risk = item.risk || item.title || item.issue || '';
  const reason = item.reason || item.why || '';
  const fix = item.fix || item.solution || item.suggestion || '';
  if (risk || reason || fix) {
    return [
      risk ? `<strong>${escapeHtml(risk)}</strong>` : '',
      reason ? `<span>原因：${escapeHtml(reason)}</span>` : '',
      fix ? `<span>修正：${escapeHtml(fix)}</span>` : '',
    ].filter(Boolean).join('<br />');
  }
  const description = item.description || item.value || item.content || item.instruction || '';
  const title = item.name || item.label || item.type || '要点';
  if (description) return `<strong>${escapeHtml(title)}</strong>：${escapeHtml(description)}`;
  return escapeHtml(directorValueText(item));
}

function directorList(values) {
  const items = parseArray(values);
  if (!items.length) return '<p class="muted">未记录</p>';
  return `<ul>${items.map((item) => `<li>${directorListItem(item)}</li>`).join('')}</ul>`;
}

function directorDl(entries) {
  const rows = entries
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(directorValueText(value))}</dd>`)
    .join('');
  return rows ? `<dl class="compact-dl">${rows}</dl>` : '<p class="muted">未记录</p>';
}

function chapterRef(value) {
  const no = Number(value);
  return Number.isFinite(no) && no > 0 ? `第 ${Math.round(no)} 章` : '';
}

function directorForeshadowingOpsHtml(values) {
  const ops = parseArray(values);
  if (!ops.length) return '<p class="muted">未记录</p>';
  return `<ul class="director-op-list">${ops.map((op) => {
    const item = op && typeof op === 'object' ? op : {};
    const title = item.thread_key || item.name || item.instruction || '伏笔';
    const rows = directorDl([
      ['动作', label(directorForeshadowActionLabel, item.action, '触碰')],
      ['处理方式', item.instruction],
      ['可见方式', item.visibility],
      ['避免提前揭露', item.do_not_reveal],
      ['下次触碰', chapterRef(item.next_touch_chapter)],
      ['揭露前禁写', chapterRef(item.do_not_reveal_before)],
      ['预计兑现', chapterRef(item.payoff_target_chapter)],
    ]);
    return `<li><strong>${escapeHtml(title)}</strong>${rows}</li>`;
  }).join('')}</ul>`;
}

function directorSegmentPlanHtml(payload) {
  const segments = parseArray(payload.segment_plan);
  if (!segments.length) return '<p class="muted">未记录</p>';
  return `<ol class="director-segments">${segments.map((segment, index) => `
    <li>
      <strong>第 ${escapeHtml(segment.segment_no || index + 1)} 段</strong>
      ${directorDl([
        ['目标', segment.goal],
        ['冲突', segment.conflict],
        ['信息释放', segment.information_release],
        ['情绪转折', segment.emotion_turn],
        ['段尾钩子', segment.ending_hook],
      ])}
    </li>
  `).join('')}</ol>`;
}

function directorCardArticle(card, outline, activeJob, chapterJob = null, chapter = null) {
  const payload = directorPayload(card);
  const chain = parseObject(payload.causal_chain);
  const constraints = parseObject(payload.continuity_constraints);
  const qualityGate = parseObject(payload.quality_gate);
  const blockingIssues = parseArray(qualityGate.blocking_issues);
  const chapterNo = card?.chapter_no || outline?.chapter_no || activeJob?.chapter_no || '';
  const title = stripChapterTitlePrefix(outline?.title || '', '未命名章节');
  const statusBadgeHtml = directorCardBadge(card, activeJob);
  const sourceText = card?.id ? `${label(directorSourceLabel, card.source, '来源未知')} / v${card.version || 1}` : '暂无版本';
  const actions = card?.id
    ? `
      ${directorStartChapterForm(projectId, card, chapterJob, chapter)}
      ${directorRegenerateForm(projectId, chapterNo, card.id)}
      ${directorSaveForm(projectId, card)}
      <a href="${escapeHtml(projectViewHref('facts', '#facts-section'))}">查看伏笔账本</a>
      <a href="${escapeHtml(projectViewHref('ops', '#ops-section'))}">查看 AI 调用</a>
    `
    : `${directorRegenerateForm(projectId, chapterNo) || '<span class="disabled-action">等待大纲</span>'}`;
  return `
    <article id="director-${escapeHtml(chapterNo)}" class="director-card">
      <div class="item-head">
        <div>
          <strong>第 ${escapeHtml(chapterNo || '-')} 章：${escapeHtml(title)}</strong>
          <span>${escapeHtml(sourceText)} / ${escapeHtml(formatLocalTime(card?.updated_at || card?.created_at || activeJob?.updated_at))}</span>
        </div>
        <div class="badge-row">${statusBadgeHtml}${card?.manual_override ? '<span class="badge warn">已手改</span>' : ''}</div>
      </div>
      ${blockingIssues.length ? `<div class="director-warning"><strong>阻断问题</strong><p class="muted">这些来自导演台原始结构里的质量闸门；保存后仍有阻断内容时，状态会继续显示待调整。</p>${directorList(blockingIssues)}</div>` : ''}
      <div class="director-grid">
        <section class="director-panel"><h3>情节因果链</h3>${directorDl([
          ['章节意图', payload.chapter_intent],
          ['前因', chain.from_previous],
          ['触发', chain.trigger],
          ['不可逆结果', chain.irreversible_result],
          ['推向后续', chain.to_next],
        ])}</section>
        <section class="director-panel"><h3>人物动机</h3>${directorList(chain.character_motives)}</section>
        <section class="director-panel"><h3>连续性约束</h3>${directorDl([
          ['必须记住', parseArray(constraints.must_remember).join('；')],
          ['不能打破', parseArray(constraints.must_not_break).join('；')],
          ['后文护栏', parseArray(constraints.future_outline_guardrails).join('；')],
        ])}</section>
        <section class="director-panel"><h3>伏笔操作</h3>${directorForeshadowingOpsHtml(payload.foreshadowing_ops)}</section>
        <section class="director-panel"><h3>突兀风险</h3>${directorList(payload.abruptness_risks)}</section>
        <section class="director-panel"><h3>分段计划</h3>${directorSegmentPlanHtml(payload)}</section>
      </div>
      <div class="row-actions">${actions}</div>
    </article>`;
}

function staleChapterCleanupForm(projectId, staleCount) {
  if (!staleCount) return '';
  const confirmText = `这会永久删除 ${staleCount} 个旧大纲历史章节，并清理对应审稿记录；当前大纲和新章节任务不会被删除。确认清理？`;
  return `
    <form class="inline-form stale-cleanup-form" method="POST" action="/webhook/novel-stale-chapters-cleanup" data-confirm="${escapeHtml(confirmText)}">
      ${formHidden('project_id', projectId)}
      ${formHidden('cleanup_action', 'CLEAR_STALE_CHAPTERS')}
      ${formHidden('reviewer', 'local_user')}
      <button type="submit"><span>一键清理过期历史章节</span><small>${escapeHtml(staleCount)} 个版本</small></button>
    </form>`;
}

function jobItem(job) {
  const error = job.error_message ? `<p class="error">${escapeHtml(job.error_message)}</p>` : '';
  const scopedProjectId = job.project_id || projectId || '';
  const queueHref = `/webhook/novel-queue-status?project_id=${encodeURIComponent(scopedProjectId)}`;
  const failureActions = job.status === 'FAILED'
    ? `<div class="row-actions failure-actions"><a href="${escapeHtml(queueHref)}">查看队列上下文</a><button type="button" data-copy-text="${escapeHtml(job.error_message || '暂无错误详情')}">复制错误</button><a href="#ops-section">回到运行日志</a></div>`
    : '';
  return `<li><strong>${escapeHtml(label(jobTypeLabel, job.job_type, '任务'))} ${badge(job.status, jobStatusLabel)}</strong><span>第 ${escapeHtml(job.chapter_no || '-')} 章 / 尝试 ${escapeHtml(job.attempt_count || 0)} / ${escapeHtml(formatLocalTime(job.updated_at || job.created_at))}</span>${error}${failureActions}</li>`;
}

function aiRunItem(run) {
  const error = run.error_message ? `<p class="error">${escapeHtml(run.error_message)}</p>` : '';
  const chapter = run.chapter_no ? `第 ${run.chapter_no} 章` : '项目级';
  return `<li><strong>${escapeHtml(label(runTypeLabel, run.run_type, '模型调用'))}</strong><span>${escapeHtml(chapter)} / ${escapeHtml(run.model || '未记录')} / ${escapeHtml(run.success === false ? '失败' : '成功')} / ${escapeHtml(formatDuration(run.duration_ms))} / ${escapeHtml(formatLocalTime(run.created_at))}</span><span>触发来源：${escapeHtml(runTriggerSource(run))}</span>${error}</li>`;
}

function selectOptions(options, selected) {
  const current = String(selected || '');
  return options.map(([value, text]) => `<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(text)}</option>`).join('');
}

function factTypeSelect(selected) {
  return selectOptions([
    ['character', '人物'],
    ['item', '物品'],
    ['location', '地点'],
    ['ability', '能力'],
    ['relationship', '关系'],
    ['foreshadowing', '伏笔'],
    ['timeline', '时间线'],
    ['rule', '规则'],
    ['other', '其他'],
  ], selected || 'other');
}

function factStatusSelect(selected) {
  return selectOptions([
    ['ACTIVE', '激活'],
    ['PENDING', '待确认'],
    ['INACTIVE', '失效'],
  ], selected || 'ACTIVE');
}

function factStatusAction(fact) {
  const isActive = fact.status === 'ACTIVE';
  return `
    <form class="inline-form fact-status-form" method="POST" action="/webhook/novel-project-fact-action" data-confirm="${isActive ? '设为失效后，后续章节生成不会再主动参考这条事实。确认？' : '激活后，这条事实会进入后续章节生成上下文。确认？'}">
      ${formHidden('project_id', projectId)}
      ${formHidden('fact_id', fact.id)}
      ${formHidden('fact_action', isActive ? 'DEACTIVATE' : 'ACTIVATE')}
      ${formHidden('reviewer', 'local_user')}
      <button type="submit">${isActive ? '设为失效' : '激活'}</button>
    </form>`;
}

function factEditForm(fact) {
  return `
    <details class="fact-edit">
      <summary>编辑这条事实</summary>
      <form method="POST" action="/webhook/novel-project-fact-action" data-confirm="保存后，这条事实会按人工维护内容参与后续续写约束。确认保存？">
        ${formHidden('project_id', projectId)}
        ${formHidden('fact_id', fact.id)}
        ${formHidden('fact_action', 'UPDATE')}
        ${formHidden('reviewer', 'local_user')}
        <label><span>事实类型</span><select name="fact_type">${factTypeSelect(fact.fact_type)}</select></label>
        <label><span>状态</span><select name="status">${factStatusSelect(fact.status)}</select></label>
        <label><span>标题/关键词</span><input name="fact_key" value="${escapeHtml(fact.fact_key || '')}" placeholder="例如：女主真实身份" /></label>
        <label><span>关联章节</span><input name="chapter_no" inputmode="numeric" value="${escapeHtml(fact.chapter_no || '')}" placeholder="留空表示项目级事实" /></label>
        <label class="wide"><span>事实内容</span><textarea name="fact_value" required>${escapeHtml(fact.fact_value || '')}</textarea></label>
        <label class="wide"><span>备注</span><input name="comment" placeholder="可选：说明为什么调整这条事实" /></label>
        <button class="primary" type="submit">保存事实</button>
      </form>
    </details>`;
}

function factCreateForm(projectId) {
  return `
    <button class="drawer-button fact-create-trigger" type="button" data-open-dialog="fact-create-drawer">新增人工事实</button>
    <dialog class="side-dialog fact-create-dialog" id="fact-create-drawer" aria-label="新增人工事实抽屉">
      <div class="drawer-panel">
        <div class="drawer-head">
          <div>
            <p class="ops-kicker">人工维护</p>
            <h2>新增人工事实</h2>
            <p class="muted">保存后会关闭抽屉并刷新事实库；不会调用模型，也不会跳转到结果页。</p>
          </div>
          <button class="drawer-close" type="button" data-close-dialog>关闭</button>
        </div>
        <form class="fact-create-form" method="POST" action="/webhook/novel-project-fact-action" data-async-drawer-form data-confirm="新增激活事实后，后续章节生成会把它作为连续性约束。确认新增？">
          ${formHidden('project_id', projectId)}
          ${formHidden('fact_action', 'CREATE')}
          ${formHidden('reviewer', 'local_user')}
          <label><span>事实类型</span><select name="fact_type">${factTypeSelect('other')}</select></label>
          <label><span>状态</span><select name="status">${factStatusSelect('ACTIVE')}</select></label>
          <label><span>标题/关键词</span><input name="fact_key" placeholder="例如：男主隐藏身份" /></label>
          <label><span>关联章节</span><input name="chapter_no" inputmode="numeric" placeholder="留空表示项目级事实" /></label>
          <label class="wide"><span>事实内容</span><textarea name="fact_value" required placeholder="写清楚后续续写必须保持一致的设定、关系、伏笔、物品状态或规则。"></textarea></label>
          <label class="wide"><span>备注</span><input name="comment" placeholder="可选：为什么新增这条事实" /></label>
          <p class="async-feedback" data-async-feedback role="status" aria-live="polite"></p>
          <button class="primary" type="submit">保存事实</button>
        </form>
      </div>
    </dialog>`;
}

function factClearInactiveForm(projectId, inactiveCount) {
  const disabled = inactiveCount > 0 ? '' : ' disabled';
  const confirmText = `这会永久删除 ${inactiveCount} 条已失效事实；激活和待确认事实会保留。确认清理？`;
  return `
    <form class="inline-form fact-clear-form" method="POST" action="/webhook/novel-project-fact-action" data-confirm="${escapeHtml(confirmText)}">
      ${formHidden('project_id', projectId)}
      ${formHidden('fact_action', 'CLEAR_INACTIVE')}
      ${formHidden('reviewer', 'local_user')}
      <button type="submit"${disabled}><span>清理失效事实</span><small>${escapeHtml(inactiveCount)} 条可清理</small></button>
    </form>`;
}

function factCard(fact) {
  return `
    <article class="fact-card">
      <div class="item-head">
        <strong>${escapeHtml(fact.fact_key || label(factTypeLabel, fact.fact_type, '事实'))}</strong>
        ${badge(fact.status, factStatusLabel)}
      </div>
      <p>${escapeHtml(fact.fact_value || '未记录')}</p>
      <span>${escapeHtml(label(factTypeLabel, fact.fact_type, '其他'))} / ${escapeHtml(label(sourceLabel, fact.source, '未知来源'))} / 第 ${escapeHtml(fact.chapter_no || '-')} 章 / 置信度 ${escapeHtml(fact.confidence ?? '未记录')}</span>
      <div class="fact-actions">
        ${factStatusAction(fact)}
        ${factEditForm(fact)}
      </div>
    </article>`;
}

function projectEventItem(event) {
  const target = event.outline_chapter_no ? `第 ${event.outline_chapter_no} 章` : '项目级';
  return `<li><strong>${escapeHtml(label(projectEventLabel, event.event_type, '项目操作'))}</strong><span>${escapeHtml(target)} / ${escapeHtml(event.actor || '本地用户')} / ${escapeHtml(formatLocalTime(event.created_at))}</span>${event.comment ? `<p>${escapeHtml(event.comment)}</p>` : ''}</li>`;
}

const rows = $input.all().map((item) => item.json || {});
const row = rows.find((item) => !item.is_empty) || rows[0] || {};
const found = row && !row.is_empty && row.id;

const missingHtml = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>项目未找到</title>
<style>body{margin:0;background:#f6f7f9;color:#182230;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(760px,calc(100vw - 32px));margin:48px auto}section{background:#fff;border:1px solid #d8dee8;border-radius:8px;padding:24px}a{color:#1f7a5c;font-weight:650;text-decoration:none}</style></head>
<body><main><section><h1>项目未找到</h1><p>没有找到对应的小说项目，请从项目列表重新进入。</p><a href="/webhook/novel-project-list">返回项目列表</a></section></main></body></html>`;

if (!found) {
  return [{json: {response_html: missingHtml, response_status_code: 404}}];
}

const projectId = row.id;
const bible = parseObject(row.bible);
const outlines = parseArray(row.outlines).sort((a, b) => Number(a.chapter_no || 0) - Number(b.chapter_no || 0));
const directorCards = parseArray(row.director_cards)
  .sort((a, b) => {
    const chapterDiff = Number(a.chapter_no || 0) - Number(b.chapter_no || 0);
    if (chapterDiff !== 0) return chapterDiff;
    return Number(b.version || 0) - Number(a.version || 0);
  });
const allChapters = parseArray(row.chapters)
  .filter((chapter) => chapter.body || chapter.summary || chapter.title)
  .sort((a, b) => {
    const chapterDiff = Number(a.chapter_no || 0) - Number(b.chapter_no || 0);
    if (chapterDiff !== 0) return chapterDiff;
    return Number(b.generation_version || 0) - Number(a.generation_version || 0);
  });
const chapters = allChapters.filter((chapter) => !isStaleChapter(chapter));
const staleChapters = allChapters.filter((chapter) => isStaleChapter(chapter));
const facts = parseArray(row.facts);
const plotThreads = parseArray(row.plot_threads);
const jobs = parseArray(row.jobs);
const aiRuns = parseArray(row.ai_runs);
const projectEvents = parseArray(row.project_events);

const chaptersByNo = chapters.reduce((acc, chapter) => {
  const no = Number(chapter.chapter_no || 0);
  if (!acc.has(no)) acc.set(no, []);
  acc.get(no).push(chapter);
  return acc;
}, new Map());

const allChaptersByNo = allChapters.reduce((acc, chapter) => {
  const no = Number(chapter.chapter_no || 0);
  if (!acc.has(no)) acc.set(no, []);
  acc.get(no).push(chapter);
  return acc;
}, new Map());

const latestChapterByNo = new Map(Array.from(chaptersByNo.entries()).map(([no, versions]) => {
  const latest = versions.slice().sort((a, b) => {
    const versionDiff = Number(b.generation_version || 0) - Number(a.generation_version || 0);
    if (versionDiff !== 0) return versionDiff;
    return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
  })[0];
  return [no, latest];
}).filter(([, chapter]) => chapter));

const currentDirectorByNo = new Map(directorCards
  .filter((card) => card.is_current !== false && String(card.status || '') !== 'SUPERSEDED')
  .map((card) => [Number(card.chapter_no || 0), card])
  .filter(([no]) => no > 0));

const latestChapters = Array.from(latestChapterByNo.values())
  .sort((a, b) => Number(a.chapter_no || 0) - Number(b.chapter_no || 0));

const syntheticOutlines = outlines.length
  ? outlines
  : latestChapters.map((chapter) => ({
    chapter_no: chapter.chapter_no,
    volume_no: 1,
    title: chapter.title,
    summary: chapter.summary,
    status: 'READY',
  }));

const writtenVersionCount = chapters.filter((chapter) => chapter.body).length;
const writtenCount = latestChapters.filter((chapter) => chapter.body).length;
const currentCount = latestChapters.filter((chapter) => chapter.is_current).length;
const reviewCount = latestChapters.filter((chapter) => chapter.status === 'NEED_REVIEW').length;
const waitingCount = jobs.filter((job) => job.status === 'PENDING').length;
const runningCount = jobs.filter((job) => job.status === 'RUNNING').length;
const failedJobs = jobs.filter((job) => job.status === 'FAILED');
const activeQueueCount = waitingCount + runningCount;
const activeFacts = facts.filter((fact) => fact.status === 'ACTIVE').length;
const inactiveFacts = facts.filter((fact) => fact.status === 'INACTIVE').length;
const pendingHumanReviewChapter = latestChapters.find((chapter) => chapter.status === 'NEED_REVIEW');
const pendingBibleJob = jobs.find((job) => job.job_type === 'GENERATE_BIBLE' && job.status === 'PENDING');
const pendingOutlineJob = jobs.find((job) => job.job_type === 'GENERATE_OUTLINE' && job.status === 'PENDING');
const pendingDirectorJob = jobs.find((job) => job.job_type === 'PLAN_CHAPTER_DIRECTOR' && job.status === 'PENDING');
const chapterJobHasReadyDirector = (job) => {
  const card = currentDirectorByNo.get(Number(job.chapter_no || 0));
  return Boolean(card && card.status === 'READY');
};
const pendingChapterJob = jobs.find((job) => job.job_type === 'GENERATE_CHAPTER' && job.status === 'PENDING' && chapterJobHasReadyDirector(job));
const pendingChapterWithoutReadyDirectorJob = jobs.find((job) => job.job_type === 'GENERATE_CHAPTER' && job.status === 'PENDING' && !chapterJobHasReadyDirector(job));
const runningBibleJob = jobs.find((job) => job.job_type === 'GENERATE_BIBLE' && job.status === 'RUNNING');
const runningOutlineJob = jobs.find((job) => job.job_type === 'GENERATE_OUTLINE' && job.status === 'RUNNING');
const runningDirectorJob = jobs.find((job) => job.job_type === 'PLAN_CHAPTER_DIRECTOR' && job.status === 'RUNNING');
const runningChapterJob = jobs.find((job) => job.job_type === 'GENERATE_CHAPTER' && job.status === 'RUNNING');
const activeQueueJobs = jobs
  .filter((job) => ['PENDING', 'RUNNING'].includes(job.status))
  .sort((a, b) => {
    if (a.status !== b.status) return a.status === 'RUNNING' ? -1 : 1;
    return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
  });
const pendingReviewJob = activeQueueJobs.find((job) => job.job_type === 'REVIEW_CHAPTER' && job.status === 'PENDING');
const runningReviewJob = activeQueueJobs.find((job) => job.job_type === 'REVIEW_CHAPTER' && job.status === 'RUNNING');
const pendingRewriteJob = activeQueueJobs.find((job) => job.job_type === 'REWRITE_CHAPTER' && job.status === 'PENDING');
const runningRewriteJob = activeQueueJobs.find((job) => job.job_type === 'REWRITE_CHAPTER' && job.status === 'RUNNING');
const pendingNotifyJob = activeQueueJobs.find((job) => job.job_type === 'NOTIFY_REVIEW' && job.status === 'PENDING');
const runningNotifyJob = activeQueueJobs.find((job) => job.job_type === 'NOTIFY_REVIEW' && job.status === 'RUNNING');
const directorJobsByNo = new Map(activeQueueJobs
  .filter((job) => job.job_type === 'PLAN_CHAPTER_DIRECTOR' && Number(job.chapter_no || 0) > 0)
  .map((job) => [Number(job.chapter_no), job]));
const chapterJobsByNo = new Map(activeQueueJobs
  .filter((job) => job.job_type === 'GENERATE_CHAPTER' && Number(job.chapter_no || 0) > 0)
  .map((job) => [Number(job.chapter_no), job]));
const needsReviewDirector = directorCards
  .filter((card) => card.is_current !== false && card.status === 'NEEDS_REVIEW')
  .sort((a, b) => Number(a.chapter_no || 0) - Number(b.chapter_no || 0))[0] || null;
const readyDirectorCount = directorCards.filter((card) => card.is_current !== false && card.status === 'READY').length;
const needsReviewDirectorCount = directorCards.filter((card) => card.is_current !== false && card.status === 'NEEDS_REVIEW').length;
const hasFrontStartJob = Boolean(pendingBibleJob || pendingOutlineJob || pendingDirectorJob || pendingChapterJob);
const hasBibleAsset = Object.keys(bible).length > 0;
const hasOutlineAsset = syntheticOutlines.length > 0;
const canShowContinueForm = !hasFrontStartJob
  && activeQueueCount === 0
  && failedJobs.length === 0
  && reviewCount === 0
  && !['ARCHIVED', 'PAUSED', 'COMPLETED'].includes(String(row.status || ''));
const bibleRegenerateControl = pendingBibleJob
  ? generationRunForm(projectId, 'GENERATE_BIBLE')
  : (runningBibleJob
    ? '<span class="disabled-action">设定集正在生成</span>'
    : (hasBibleAsset ? regenerateAssetForm(projectId, 'BIBLE') : ''));
const outlineRegenerateControl = pendingOutlineJob
  ? generationRunForm(projectId, 'GENERATE_OUTLINE')
  : (runningOutlineJob
    ? '<span class="disabled-action">大纲正在生成</span>'
    : (hasOutlineAsset ? regenerateAssetForm(projectId, 'OUTLINE') : ''));

function chapterLabel(job) {
  return job?.chapter_no ? `第 ${job.chapter_no} 章` : '当前章节';
}

function liveProjectStatusInfo() {
  const baseStatus = String(row.status || '');
  const baseLabel = label(projectStatusLabel, baseStatus, baseStatus || '未知状态');
  const lockedStatuses = ['PAUSED', 'ARCHIVED', 'COMPLETED', 'FAILED'];
  const withBase = (code, text) => ({
    code,
    label: text,
    baseLabel,
    note: baseStatus && text !== baseLabel ? `基础状态：${baseLabel}` : '',
  });
  if (lockedStatuses.includes(baseStatus)) {
    return {code: baseStatus, label: baseLabel, baseLabel, note: ''};
  }
  if (runningBibleJob) return withBase('RUNNING', '设定集生成中');
  if (pendingBibleJob) return withBase('PENDING', '设定集待启动');
  if (runningOutlineJob) return withBase('RUNNING', '大纲生成中');
  if (pendingOutlineJob) return withBase('PENDING', '大纲待启动');
  if (runningDirectorJob) return withBase('RUNNING', `${chapterLabel(runningDirectorJob)}导演台规划中`);
  if (pendingDirectorJob) return withBase('PENDING', `${chapterLabel(pendingDirectorJob)}导演台待启动`);
  if (needsReviewDirector) return withBase('NEEDS_REVIEW', `第 ${needsReviewDirector.chapter_no} 章导演台需调整`);
  if (pendingChapterWithoutReadyDirectorJob) return withBase('PENDING', `${chapterLabel(pendingChapterWithoutReadyDirectorJob)}等待导演台`);
  if (runningChapterJob) return withBase('RUNNING', `${chapterLabel(runningChapterJob)}生成中`);
  if (pendingChapterJob) return withBase('PENDING', `${chapterLabel(pendingChapterJob)}待启动`);
  if (runningRewriteJob) return withBase('RUNNING', `${chapterLabel(runningRewriteJob)}重写中`);
  if (pendingRewriteJob) return withBase('PENDING', `${chapterLabel(pendingRewriteJob)}重写待执行`);
  if (runningReviewJob) return withBase('RUNNING', `${chapterLabel(runningReviewJob)}智能审稿中`);
  if (pendingReviewJob) return withBase('PENDING', `${chapterLabel(pendingReviewJob)}等待智能审稿`);
  if (reviewCount > 0) return withBase('NEED_REVIEW', pendingHumanReviewChapter?.chapter_no ? `第 ${pendingHumanReviewChapter.chapter_no} 章待人工审核` : '待人工审核');
  if (runningNotifyJob) return withBase('RUNNING', `${chapterLabel(runningNotifyJob)}提醒发送中`);
  if (pendingNotifyJob) return withBase('PENDING', `${chapterLabel(pendingNotifyJob)}提醒待发送`);
  if (failedJobs.length > 0) return withBase('FAILED', '有失败任务');
  return {code: baseStatus, label: baseLabel, baseLabel, note: ''};
}

const liveProjectStatus = liveProjectStatusInfo();
const activeRewriteActionJob = pendingRewriteJob || runningRewriteJob;

const viewConfig = {
  overview: {label: '总览', title: '项目总览', description: '只保留当前建议、关键资产入口和最近待处理项。'},
  bible: {label: '设定集', title: '设定集', description: '管理长篇写作会反复引用的项目级设定。'},
  outline: {label: '大纲', title: '大纲与目录', description: '查看章节规划、已写状态和目录筛选。'},
  director: {label: '导演台', title: '导演台', description: '查看本章因果、连续性约束、伏笔操作、突兀风险和分段计划。'},
  chapters: {label: '章节', title: '章节正文与版本', description: '处理正文、候选版本、重写和人工编辑。'},
  facts: {label: '事实库', title: '连续性事实', description: '查看续写时需要保持一致的人物、物品、伏笔和规则。'},
  ops: {label: '运行日志', title: '运行日志', description: '排查模型调用、失败任务和项目操作记录。'},
  export: {label: '导出', title: '导出全文 Markdown', description: '导出当前正式版本，候选稿和废稿不会进入全文。'},
};
const requestedView = String(row.requested_view || row.view || 'overview').toLowerCase();
const activeView = Object.prototype.hasOwnProperty.call(viewConfig, requestedView) ? requestedView : 'overview';

function projectViewHref(view, hash = '') {
  const viewParam = view && view !== 'overview' ? `&view=${encodeURIComponent(view)}` : '';
  return `/webhook/novel-project-detail?project_id=${encodeURIComponent(projectId)}${viewParam}${hash || ''}`;
}

function viewTabs() {
  return `<nav class="view-tabs" aria-label="项目二级视图">${Object.entries(viewConfig).map(([view, info]) => (
    view === activeView
      ? `<span class="view-tab active" aria-current="page">${escapeHtml(info.label)}</span>`
      : `<a class="view-tab" href="${escapeHtml(projectViewHref(view))}">${escapeHtml(info.label)}</a>`
  )).join('')}</nav>`;
}

function recommendationState() {
  if (row.status === 'ARCHIVED') return {
    title: '项目已归档',
    body: '归档项目不会进入生成队列；如需重新处理，请先恢复归档项目。',
    intent: '管理项目',
    mode: '暂停推进',
  };
  if (row.status === 'PAUSED') return {
    title: '项目已暂停',
    body: '项目暂停期间不会领取队列任务。需要继续生成时，先在项目操作抽屉里恢复项目。',
    intent: '管理项目',
    mode: '暂停推进',
  };
  if (pendingBibleJob) return {
    title: '启动设定集生成',
    body: `设定集任务已排队，但设定内容还没有生成。点击“启动设定集生成”会在当前页提交并刷新状态，模型调用在后台继续执行。${reviewCount ? `旧待审章节仍保留 ${reviewCount} 个，但当前应先完成重跑链路。` : ''}`,
    intent: '生成项目设定',
    mode: '后台执行',
  };
  if (runningBibleJob) return {
    title: '设定集正在生成',
    body: `请稍后刷新项目控制台，或到队列状态页观察任务是否完成。${reviewCount ? `旧待审章节仍保留 ${reviewCount} 个，等新设定和大纲完成后再决定是否处理。` : ''}`,
    intent: '观察进度',
    mode: '后台运行中',
  };
  if (pendingOutlineJob) return {
    title: '启动大纲生成',
    body: `大纲任务已排队，但章节目录还没有生成。点击“启动大纲生成”会在当前页提交并刷新状态，模型调用在后台继续执行。${reviewCount ? `旧待审章节仍保留 ${reviewCount} 个，但当前应先完成新大纲。` : ''}`,
    intent: '生成章节目录',
    mode: '后台执行',
  };
  if (runningOutlineJob) return {
    title: '大纲正在生成',
    body: `请稍后刷新项目控制台，或到队列状态页观察任务是否完成。${reviewCount ? `旧待审章节仍保留 ${reviewCount} 个，等新大纲完成后再决定是否处理。` : ''}`,
    intent: '观察进度',
    mode: '后台运行中',
  };
  if (pendingDirectorJob) return {
    title: pendingDirectorJob.chapter_no ? `启动第 ${pendingDirectorJob.chapter_no} 章导演台` : '启动导演台',
    body: pendingDirectorJob.chapter_no
      ? `第 ${pendingDirectorJob.chapter_no} 章导演台任务已排队。点击“启动第 ${pendingDirectorJob.chapter_no} 章导演台”会先检查因果链、人物动机、连续性约束和伏笔账本；通过后才会自动排正文生成。`
      : '导演台任务已排队。点击“启动导演台”会先检查因果链、人物动机、连续性约束和伏笔账本；通过后才会自动排正文生成。',
    intent: '生成导演台规划',
    mode: '后台执行',
  };
  if (runningDirectorJob) return {
    title: runningDirectorJob.chapter_no ? `第 ${runningDirectorJob.chapter_no} 章导演台规划中` : '导演台规划中',
    body: '导演台模型调用正在后台执行。完成后若通过质量闸门会自动排正文任务；若存在突兀或断裂风险，会停在导演台视图等待调整。',
    intent: '观察导演台',
    mode: '后台运行中',
  };
  if (needsReviewDirector) return {
    title: `第 ${needsReviewDirector.chapter_no} 章导演台需调整`,
    body: '当前导演台的质量闸门未通过，正文生成已暂停。进入导演台视图查看阻断问题，手动修正 JSON 后再按此导演台生成正文。',
    intent: '修正导演台',
    mode: '不会调用模型',
  };
  if (pendingChapterWithoutReadyDirectorJob) return {
    title: pendingChapterWithoutReadyDirectorJob.chapter_no
      ? `第 ${pendingChapterWithoutReadyDirectorJob.chapter_no} 章等待导演台`
      : '章节等待导演台',
    body: '检测到旧流程遗留的正文生成任务，但这一章还没有 READY 导演台。正文启动入口会先隐藏，避免跳过因果、人物动机、连续性和伏笔检查；自动恢复会补建导演台任务，出现“启动导演台”后再推进。',
    intent: '补齐导演台',
    mode: '等待调度',
  };
  if (pendingChapterJob) return {
    title: pendingChapterJob.chapter_no ? `启动第 ${pendingChapterJob.chapter_no} 章生成` : '启动章节生成',
    body: pendingChapterJob.chapter_no
      ? `第 ${pendingChapterJob.chapter_no} 章任务已排队。点击“启动第 ${pendingChapterJob.chapter_no} 章生成”会领取这个任务，模型调用在后台继续；生成候选稿后会进入智能审稿队列。${reviewCount ? `旧待审章节仍保留 ${reviewCount} 个，当前优先生成新候选稿。` : '审稿完成后再到审核中心处理。'}`
      : `章节生成任务已排队。点击“启动章节生成”会领取这个任务，模型调用在后台继续；生成候选稿后会进入智能审稿队列。${reviewCount ? `旧待审章节仍保留 ${reviewCount} 个，当前优先生成新候选稿。` : '审稿完成后再到审核中心处理。'}`,
    intent: '生成章节正文',
    mode: '后台执行',
  };
  if (runningChapterJob) return {
    title: runningChapterJob.chapter_no ? `第 ${runningChapterJob.chapter_no} 章正在生成` : '章节正在生成',
    body: '章节模型调用正在后台执行。请到队列状态页观察运行结果；完成后会出现候选稿和后续审稿任务。',
    intent: '观察进度',
    mode: '后台运行中',
  };
  if (runningRewriteJob || pendingRewriteJob) {
    const job = runningRewriteJob || pendingRewriteJob;
    const isRunning = job.status === 'RUNNING';
    return {
      title: isRunning ? `${chapterLabel(job)}正在重写` : `${chapterLabel(job)}重写待执行`,
      body: isRunning
        ? '章节重写模型调用正在后台执行。完成后会生成新的候选稿，并自动进入智能审稿。'
        : '章节重写任务已经排队。点击“启动重写”会立即领取这条任务，按审核意见生成新的候选稿，并自动进入智能审稿。',
      intent: isRunning ? '观察重写' : '启动重写',
      mode: isRunning ? '后台运行中' : '后台执行',
    };
  }
  if (runningReviewJob || pendingReviewJob) {
    const job = runningReviewJob || pendingReviewJob;
    const isRunning = job.status === 'RUNNING';
    return {
      title: isRunning ? `${chapterLabel(job)}智能审稿中` : `${chapterLabel(job)}等待智能审稿`,
      body: isRunning
        ? '智能审稿模型调用正在后台执行。完成后会进入人工审核，届时可在审核中心处理。'
        : '候选稿已经生成，智能审稿任务正在等待后台队列领取；审稿完成后再进入人工审核。',
      intent: '观察审稿',
      mode: isRunning ? '后台运行中' : '等待调度',
    };
  }
  if (failedJobs.length > 0) return {
    title: '先查看失败任务',
    body: `有 ${failedJobs.length} 个失败任务。先复制错误或打开队列上下文，再决定是否重试、修正文档或恢复任务。`,
    intent: '排查异常',
    mode: '不会调用模型',
  };
  if (reviewCount > 0) return {
    title: '先处理人工审核',
    body: `有 ${reviewCount} 个章节待人工审核。通过后才会成为正式版本，并继续保持上下文顺序。`,
    intent: '人工决策',
    mode: '不会调用模型',
  };
  if (runningNotifyJob || pendingNotifyJob) {
    const job = runningNotifyJob || pendingNotifyJob;
    const isRunning = job.status === 'RUNNING';
    return {
      title: job.chapter_no ? `第 ${job.chapter_no} 章审核提醒${isRunning ? '发送中' : '待发送'}` : `审核提醒${isRunning ? '发送中' : '待发送'}`,
      body: '候选稿已进入审核提醒流程。即使提醒尚未发送，也可以直接进入审核中心或队列页查看待审上下文。',
      intent: '发送提醒',
      mode: isRunning ? '后台运行中' : '等待调度',
    };
  }
  if (activeQueueCount > 0) return {
    title: activeQueueJobs[0]
      ? `${label(jobTypeLabel, activeQueueJobs[0].job_type, '后台任务')}${activeQueueJobs[0].status === 'RUNNING' ? '运行中' : '待执行'}`
      : '后台任务处理中',
    body: `队列中还有 ${activeQueueCount} 个任务。当前不是手动排队阶段，请先查看队列状态确认具体任务、运行结果或失败原因。`,
    intent: '观察队列',
    mode: activeQueueJobs.some((job) => job.status === 'RUNNING') ? '后台运行中' : '等待调度',
  };
  if (row.status === 'COMPLETED') return {
    title: '项目已完结',
    body: '目标章节已经写完，可以查看全文或导出 Markdown。',
    intent: '整理成稿',
    mode: '不会调用模型',
  };
  return {
    title: '排队下一步',
    body: '当前没有待处理任务。点击“排队下一步”只会补齐下一步任务，后续由队列或后台启动入口推进。',
    intent: '补齐任务',
    mode: '不直接调用模型',
  };
}

const recommendationInfo = recommendationState();

function executionLabel(info) {
  if (info.mode === '后台执行') return '会调用模型';
  if (info.mode === '后台运行中') return info.title.includes('提醒') ? '只发送提醒' : '会调用模型';
  if (info.mode === '等待调度') return info.title.includes('提醒') ? '只发送提醒' : '队列待执行';
  if (info.mode === '不直接调用模型' || info.title === '排队下一步') return '只排队';
  if (info.intent === '管理项目') return '危险操作需确认';
  return '不会调用模型';
}

function riskItem(title, value, detail, tone = '') {
  return `
    <article class="risk-card ${escapeHtml(tone)}">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(detail)}</p>
    </article>`;
}

const catalogHtml = syntheticOutlines.length
  ? syntheticOutlines.map((outline) => outlineCard(outline, chaptersByNo, projectId, currentDirectorByNo, directorJobsByNo)).join('')
  : '<article class="empty">暂无章节目录。生成大纲后会出现在这里。</article>';

const writtenHtml = latestChapters.length
  ? latestChapters.map((chapter) => chapterCard(chapter, {
    history: allChaptersByNo.get(Number(chapter.chapter_no || 0)) || [chapter],
  })).join('')
  : '<article class="empty">当前大纲下暂无已写章节。章节生成成功后会出现在这里。</article>';
const staleChapterHtml = staleChapters.length
  ? `<details class="stale-chapter-history">
      <summary>旧大纲历史正文（${escapeHtml(staleChapters.length)} 个版本）</summary>
      <div class="stale-history-toolbar">
        <p class="muted">这些正文生成于当前大纲更新之前，不计入当前进度、待审数量和下一步动作。</p>
        ${staleChapterCleanupForm(projectId, staleChapters.length)}
      </div>
      <div class="chapter-grid">${staleChapters.map((chapter) => chapterCard(chapter, {stale: true})).join('')}</div>
    </details>`
  : '';

const markdownExport = latestChapters
  .filter((chapter) => chapter.is_current && ['APPROVED', 'PUBLISHED'].includes(chapter.status) && chapter.body)
  .sort((a, b) => Number(a.chapter_no || 0) - Number(b.chapter_no || 0))
  .map((chapter) => `## ${chapterHeading(chapter.chapter_no, chapter.title)}\n\n${chapter.body}`)
  .join('\n\n');

function overviewCard(title, value, detail, href, cta = '打开') {
  return `
    <article class="overview-card">
      <h3><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong></h3>
      <p>${escapeHtml(detail)}</p>
      <a href="${escapeHtml(href)}">${escapeHtml(cta)}</a>
    </article>`;
}

const recentChapterHtml = latestChapters
  .filter((chapter) => chapter.body || chapter.status === 'NEED_REVIEW')
  .slice()
  .sort((a, b) => Number(b.chapter_no || 0) - Number(a.chapter_no || 0))
  .slice(0, 3)
  .map((chapter) => overviewCard(
    chapterHeading(chapter.chapter_no, chapter.title),
    label(chapterStatusLabel, chapter.status, '章节'),
    chapter.summary || '暂无章节摘要',
    projectViewHref('chapters', `#chapter-${encodeURIComponent(chapter.chapter_no || '')}`),
    chapter.status === 'NEED_REVIEW' ? '处理章节' : '查看章节'
  ))
  .join('');

const overviewHtml = `
    <section id="overview-section" aria-label="项目总览入口">
      <div class="section-title"><p class="ops-kicker">总览入口</p><h2>项目资产入口</h2><p class="muted">默认只显示判断下一步所需的信息；进入二级视图后再编辑、查看正文或排障。</p></div>
      <div class="overview-grid">
        ${overviewCard('设定集', Object.keys(bible).length ? '已生成' : '待生成', Object.keys(bible).length ? '世界观、人物、卖点和文风规则已可查看。' : '设定集还未生成，先启动或排队这一步。', projectViewHref('bible'), '查看设定')}
        ${overviewCard('大纲', `${syntheticOutlines.length} 章`, syntheticOutlines.length ? '查看章节规划、已写状态和待审章节。' : '大纲还未生成，完成设定集后会创建大纲任务。', projectViewHref('outline'), '查看大纲')}
        ${overviewCard('导演台', `${readyDirectorCount}/${syntheticOutlines.length || 0}`, needsReviewDirectorCount ? `${needsReviewDirectorCount} 章导演台需调整，正文生成会先暂停。` : '查看因果链、连续性约束、伏笔操作和分段计划。', projectViewHref('director'), '查看导演台')}
        ${overviewCard('章节', `${writtenCount}/${row.target_total_chapters || 0}`, `当前正式版本 ${currentCount} 个，待人工审核 ${reviewCount} 个。`, projectViewHref('chapters'), '查看章节')}
        ${overviewCard('事实库', `${activeFacts} 条`, `共 ${facts.length} 条事实，包含激活、待确认和失效记录。`, projectViewHref('facts'), '查看事实')}
        ${overviewCard('运行', `${failedJobs.length} 失败`, `队列中 ${activeQueueCount} 个任务，失败任务建议先看日志和上下文。`, projectViewHref('ops'), '查看日志')}
        ${overviewCard('导出', markdownExport ? '可导出' : '暂无正文', markdownExport ? '已批准的正式章节可导出 Markdown。' : '需要先有已批准正文才能导出全文。', projectViewHref('export'), '打开导出')}
      </div>
    </section>
    <section aria-label="关键风险和资产完成度">
      <div class="section-title"><h2>关键风险与资产完成度</h2><p class="muted">先看项目是否卡住，再决定进入哪个二级视图。</p></div>
      <div class="risk-grid">
        ${riskItem('人工审核', `${reviewCount} 待审`, reviewCount ? '先处理待审章节，避免续写上下文阻塞。' : '当前没有人工审核阻塞。', reviewCount ? 'warn' : 'good')}
        ${riskItem('失败任务', `${failedJobs.length} 失败`, failedJobs.length ? '进入运行视图查看错误、最近任务和模型调用。' : '当前没有失败任务。', failedJobs.length ? 'bad' : 'good')}
        ${riskItem('队列推进', `${activeQueueCount} 个`, activeQueueCount ? '队列仍在推进，先观察再重复操作。' : '队列空闲，可根据下一步动作推进。', activeQueueCount ? 'warn' : 'good')}
      </div>
    </section>
    <section aria-label="最近章节">
      <div class="section-title"><h2>最近章节</h2><p class="muted">这里只保留最近需要关注的章节，完整章节列表进入“章节”视图。</p></div>
      <div class="overview-grid">${recentChapterHtml || '<article class="empty">暂无已写或待审核章节。</article>'}</div>
    </section>`;

const bibleSectionHtml = `
    <section id="bible-section" aria-label="设定集">
      <div class="section-title"><h2>设定集</h2><p class="muted">管理生成长篇时会反复参考的项目级设定。</p></div>
      ${bibleRegenerateControl ? `<div class="asset-action-row">${bibleRegenerateControl}</div>` : ''}
      <div class="section-title">${bibleEditForm(projectId, bible)}</div>
      ${Object.keys(bible).length ? `
        <div class="bible-grid">
          ${bibleCard('故事核心', settingText(bible.story_core))}
          ${bibleCard('世界设定', settingText(bible.world_setting))}
          ${bibleCard('主角设定', settingEntries(bible.main_character, '主角'))}
          ${bibleCard('配角设定', settingEntries(bible.supporting_characters, '配角'))}
          ${bibleCard('反派设定', settingEntries(bible.villain_setting, '反派'))}
          ${bibleCard('能力体系', settingText(bible.power_system))}
          ${bibleCard('人物关系', settingEntries(bible.relationship_map, '关系'))}
          ${bibleCard('文风规则', settingText(bible.tone_rules))}
          ${bibleCard('禁忌规则', settingText(bible.forbidden_rules))}
          ${bibleCard('卖点', settingChips(bible.selling_points))}
        </div>` : `<article class="empty">暂无设定集。${pendingBibleJob ? '点击“启动设定集生成”会把模型调用交给后台完成。' : '排队下一步会优先补齐生成设定集任务。'}</article>`}
    </section>`;

const outlineSectionHtml = `
    <section class="filters" aria-label="目录筛选">
      <div class="filter-row">
        <strong>目录筛选</strong>
        <button class="filter-chip" type="button" data-chapter-filter="all" aria-pressed="false">全部目录</button>
        <button class="filter-chip" type="button" data-chapter-filter="written" aria-pressed="false">只看已写</button>
        <button class="filter-chip" type="button" data-chapter-filter="current" aria-pressed="false">正式版本</button>
        <button class="filter-chip" type="button" data-chapter-filter="review" aria-pressed="false">待审核</button>
      </div>
    </section>
    <section id="catalog-section" aria-label="大纲与目录">
      <div class="section-title">
        <h2>大纲与目录</h2>
        <p class="muted">目录来自章节大纲；生成过正文的章节可以直接跳到正文和版本记录。</p>
      </div>
      ${outlineRegenerateControl ? `<div class="asset-action-row">${outlineRegenerateControl}</div>` : ''}
      <div class="catalog-grid">${catalogHtml}</div>
    </section>
    <p class="empty filter-empty" data-catalog-empty hidden>当前筛选下暂无目录项</p>`;

const directorSourceItems = syntheticOutlines.length
  ? syntheticOutlines.map((outline) => ({
    outline,
    card: currentDirectorByNo.get(Number(outline.chapter_no || 0)) || null,
    job: directorJobsByNo.get(Number(outline.chapter_no || 0)) || null,
    chapterJob: chapterJobsByNo.get(Number(outline.chapter_no || 0)) || null,
    chapter: latestChapterByNo.get(Number(outline.chapter_no || 0)) || null,
  }))
  : directorCards
    .filter((card) => card.is_current !== false)
    .map((card) => ({
      outline: {chapter_no: card.chapter_no, title: card.card_payload?.chapter_title || ''},
      card,
      job: null,
      chapterJob: chapterJobsByNo.get(Number(card.chapter_no || 0)) || null,
      chapter: latestChapterByNo.get(Number(card.chapter_no || 0)) || null,
    }));
const directorSectionHtml = `
    <section id="director-section" aria-label="导演台">
      <div class="section-title">
        <h2>导演台</h2>
        <p class="muted">正文生成前先看本章因果、人物动机、连续性约束、伏笔操作、突兀风险和分段计划。</p>
      </div>
      <div class="risk-grid">
        ${riskItem('已就绪', `${readyDirectorCount} 章`, '质量闸门通过，可排队正文生成。', readyDirectorCount ? 'good' : '')}
        ${riskItem('需调整', `${needsReviewDirectorCount} 章`, needsReviewDirectorCount ? '存在突兀或断裂风险，正文生成已暂停。' : '当前没有阻断问题。', needsReviewDirectorCount ? 'warn' : 'good')}
        ${riskItem('伏笔线程', `${plotThreads.length} 条`, '来自导演台和事实库的跨章节伏笔账本。', plotThreads.length ? 'warn' : '')}
      </div>
      <div class="director-list">
        ${directorSourceItems.length
          ? directorSourceItems.map(({card, outline, job, chapterJob, chapter}) => directorCardArticle(card, outline, job, chapterJob, chapter)).join('')
          : '<article class="empty">暂无导演台。大纲生成后会先排队第 1 章导演台。</article>'}
      </div>
    </section>`;

const chaptersSectionHtml = `
    <section id="written-section" class="written-section" aria-label="章节正文与版本">
      <div class="section-title">
        <h2>章节正文与版本</h2>
        <p class="muted">主列表只展示每章最新版本；历史稿、旧候选稿和过期正文收进“历史版本”抽屉时间轴。指定章节重写只会创建重写任务，旧正式版本不会被改掉。</p>
      </div>
      <div class="reader-toolbar" aria-label="正文工具条">
        <strong>正文工具条</strong>
        <button type="button" data-body-action="expand-all">展开全部正文</button>
        <button type="button" data-body-action="collapse-all">收起全部正文</button>
      </div>
      <div class="chapter-grid">${writtenHtml}</div>
      ${staleChapterHtml}
    </section>`;

const factsSectionHtml = `
    <section id="facts-section" aria-label="连续性事实">
      <div class="section-title"><h2>连续性事实</h2><p class="muted">事实库是后续生成章节会读取的连续性记忆：激活事实会进入模型上下文，待确认事实来自候选稿或重写稿，失效事实仅保留追溯。</p></div>
      <div class="fact-toolbar">
        <div>
          <strong>人工维护入口</strong>
          <p class="muted">适合补充身份真相、人物关系、伏笔、物品归属和世界规则；不会调用模型，只保存到事实库。</p>
        </div>
        <div class="fact-maintenance-actions">
          ${factCreateForm(projectId)}
          ${factClearInactiveForm(projectId, inactiveFacts)}
        </div>
      </div>
      <div class="fact-grid">${facts.length ? facts.map(factCard).join('') : '<article class="empty">暂无连续性事实。</article>'}</div>
    </section>`;

const opsSectionHtml = `
    <section id="ops-section" aria-label="运行日志">
      <details class="ops-detail" open>
        <summary>运行日志（展开查看模型调用、失败原因和最近任务）</summary>
        <div class="section-title"><h2>运行日志</h2><p class="muted">深层排障信息默认收起；章节卡片里会直接显示最近模型调用和审稿摘要。</p></div>
        <div class="bible-grid">
        <article class="bible-card">
          <h3>模型调用日志</h3>
          ${aiRuns.length ? `<ul class="history">${aiRuns.map(aiRunItem).join('')}</ul>` : '<p class="muted">暂无模型调用记录</p>'}
        </article>
        <article class="bible-card">
          <h3>失败原因</h3>
          ${failedJobs.length ? `<ul class="history">${failedJobs.map(jobItem).join('')}</ul>` : '<p class="muted">暂无失败任务</p>'}
        </article>
        <article class="bible-card">
          <h3>最近任务</h3>
          ${jobs.length ? `<ul class="history">${jobs.slice(0, 12).map(jobItem).join('')}</ul>` : '<p class="muted">暂无任务记录</p>'}
        </article>
        <article class="bible-card">
          <h3>项目操作记录</h3>
          ${projectEvents.length ? `<ul class="history">${projectEvents.map(projectEventItem).join('')}</ul>` : '<p class="muted">暂无项目操作记录</p>'}
        </article>
        </div>
      </details>
    </section>`;

const exportSectionHtml = `
    <section id="export-section" aria-label="导出全文 Markdown">
      <div class="section-title"><h2>导出全文 Markdown</h2><p class="muted">这里只导出当前正式版本，候选稿和废稿不会进入全文。</p></div>
      <div class="export-box">
        <div class="row-actions">
          <button type="button" data-copy-target="approved-markdown">复制全文 Markdown</button>
          <button type="button" data-download-markdown>下载 Markdown</button>
        </div>
        <textarea id="approved-markdown" class="export-text" readonly>${escapeHtml(markdownExport || '暂无已批准正文。')}</textarea>
      </div>
    </section>`;

const activeViewHtml = {
  overview: overviewHtml,
  bible: bibleSectionHtml,
  outline: outlineSectionHtml,
  director: directorSectionHtml,
  chapters: chaptersSectionHtml,
  facts: factsSectionHtml,
  ops: opsSectionHtml,
  export: exportSectionHtml,
}[activeView] || overviewHtml;

const projectViewShell = `
    <section class="sticky-jump-section" aria-label="项目二级导航">
      <div class="section-title"><p class="ops-kicker">项目二级视图</p><h2>${escapeHtml(viewConfig[activeView].title)}</h2><p class="muted">${escapeHtml(viewConfig[activeView].description)}</p></div>
      ${viewTabs()}
    </section>
    ${activeViewHtml}`;

const projectBreadcrumbItems = [
  {label: '工作台', href: '/webhook/novel-center'},
  {label: '项目列表', href: '/webhook/novel-project-list'},
  activeView === 'overview'
    ? {label: row.title || '未命名项目'}
    : {label: row.title || '未命名项目', href: projectViewHref('overview')},
];
if (activeView !== 'overview') {
  projectBreadcrumbItems.push({label: viewConfig[activeView].label});
}
const projectBreadcrumbHtml = breadcrumb(projectBreadcrumbItems);

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#f6f7f9" />
  <title>项目控制台 - ${escapeHtml(row.title || '未命名项目')}</title>
  <style>
    :root { color-scheme: light; --bg:#f6f7f9; --panel:#fff; --ink:#182230; --muted:#667085; --line:#d8dee8; --accent:#1f7a5c; --accent-soft:#edf8f3; --warn:#a76508; --warn-soft:#fff7e8; --danger:#b42318; --danger-soft:#fff0ee; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-tap-highlight-color: rgba(31, 122, 92, .14); }
    .app-shell { min-height: 100vh; display: grid; grid-template-columns: 220px minmax(0, 1fr); }
    .app-sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 16px; padding: 22px 16px; border-right: 1px solid var(--line); background: #fff; }
    .brand { display: grid; gap: 3px; padding: 0 4px 12px; border-bottom: 1px solid var(--line); }
    .brand span { color: var(--muted); font-size: 11px; font-weight: 850; letter-spacing: .08em; text-transform: uppercase; }
    .brand strong { font-size: 20px; line-height: 1.2; }
    .side-nav { display: grid; gap: 4px; }
    .side-nav a, .side-nav span { min-height: 38px; display: flex; align-items: center; border-radius: 8px; padding: 0 10px; color: #344054; text-decoration: none; font-weight: 750; }
    .side-nav a:hover, .side-nav .active { color: var(--accent); background: var(--accent-soft); }
    .side-primary { min-height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; margin-top: auto; background: var(--accent); color: #fff; text-decoration: none; font-weight: 800; }
    main { width: min(1120px, calc(100vw - 48px)); margin: 24px auto 56px; }
    .app-shell > main { width: auto; max-width: none; margin: 24px 16px 56px; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: end; margin-bottom: 18px; }
    .page-context { position: sticky; top: 0; z-index: 70; margin-bottom: 18px; padding: 14px 0 12px; background: rgba(246, 247, 249, .97); border-bottom: 1px solid rgba(216, 222, 232, .92); backdrop-filter: blur(10px); }
    .page-context header { margin-bottom: 0; }
    .page-actions { display: flex; gap: 8px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
    .page-actions a { min-height: 36px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 11px; background: #fff; color: var(--accent); text-decoration: none; font-weight: 750; }
    .page-actions a:hover { border-color: var(--accent); background: var(--accent-soft); }
    h1 { margin: 0; font-size: 28px; text-wrap: balance; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    h3 { margin: 0 0 10px; font-size: 16px; }
    p { line-height: 1.7; }
    .ops-kicker { margin: 0 0 6px; color: var(--muted); font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
    .muted { color: var(--muted); margin: 6px 0 0; line-height: 1.6; }
    a { color: var(--accent); text-decoration: none; font-weight: 650; }
    nav { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    nav a { white-space: nowrap; }
    .breadcrumbs { gap: 8px; margin: 0 0 12px; color: var(--muted); font-size: 13px; }
    .breadcrumbs a { color: var(--muted); font-weight: 650; }
    .breadcrumbs a:hover { color: var(--accent); }
    .crumb-separator { color: #98a2b3; }
    .view-tabs { display: flex; gap: 8px; flex-wrap: wrap; padding: 0 16px 16px; }
    .view-tab { min-height: 36px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 0 12px; background: #fff; color: var(--ink); text-decoration: none; font-weight: 700; touch-action: manipulation; }
    .view-tab:hover, .view-tab.active { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    section { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; margin-bottom: 18px; overflow: hidden; }
    .summary { display: grid; grid-template-columns: minmax(0, .82fr) minmax(360px, 1.18fr); gap: 14px; background: transparent; border: 0; overflow: visible; }
    .project-info, .metrics, .recommendation { padding: 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; }
    .project-info { min-height: 360px; display: flex; flex-direction: column; border-color: #b9e3d4; background: var(--accent-soft); }
    .status-explain { margin: 4px 0 10px; color: var(--muted); font-size: 13px; line-height: 1.5; }
    .recommendation { background: #fff; }
    .recommendation.command-panel { box-shadow: 0 8px 18px rgba(16, 24, 40, .06); }
    .recommendation-top { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 10px; }
    .recommendation-kicker { margin: 0 0 6px; color: var(--muted); font-size: 13px; font-weight: 700; }
    .mode-pill { display: inline-flex; align-items: center; min-height: 28px; border: 1px solid #b9e3d4; border-radius: 999px; padding: 0 10px; color: var(--accent); background: var(--accent-soft); font-size: 12px; font-weight: 750; white-space: nowrap; }
    .action-mode { display: inline-flex; align-items: center; min-height: 28px; border: 1px solid var(--line); border-radius: 999px; padding: 0 10px; color: #344054; background: #fff; font-size: 12px; font-weight: 750; white-space: nowrap; }
    .decision-note { margin-top: 10px; border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: #f8fafb; color: #3d4b5c; line-height: 1.6; }
    .decision-note strong { display: block; margin-bottom: 3px; color: var(--ink); }
    .recommendation-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 12px; }
    .recommendation-actions a { min-height: 44px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 12px; background: #fff; color: var(--accent); text-decoration: none; font-weight: 750; }
    .recommendation-actions a:hover { border-color: var(--accent); background: var(--accent-soft); }
    .status-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
    .status-strip a { display: block; border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: #fff; color: var(--ink); text-decoration: none; }
    .status-strip strong { display: block; margin-top: 3px; font-size: 20px; }
    .status-strip em { display: block; margin-top: 3px; color: var(--muted); font-style: normal; font-size: 12px; }
    .action-guide { display: block; margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; }
    .action-guide[open] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .action-guide summary { grid-column: 1 / -1; color: var(--muted); font-size: 13px; }
    .action-guide div { border-top: 1px solid var(--line); padding-top: 10px; }
    .action-guide strong { display: block; margin-bottom: 4px; font-size: 13px; }
    .action-guide span { display: block; color: var(--muted); font-size: 12px; line-height: 1.5; }
    .asset-action-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; padding: 0 16px 14px; }
    .asset-action-row .action-now { display: inline-flex; }
    .summary-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
    .summary-facts a, .summary-facts span { display: block; border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: #fff; color: var(--ink); text-decoration: none; }
    .summary-facts strong { display: block; margin-top: 3px; font-size: 20px; font-variant-numeric: tabular-nums; }
    .summary-facts em { display: block; margin-top: 3px; color: var(--muted); font-style: normal; font-size: 12px; }
    .project-info .action-bar { flex: 1; justify-content: center; align-content: center; align-items: center; margin: 18px auto 8px; padding: 20px 8px; max-width: 720px; }
    .drawer-button { min-height: 36px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 11px; background: #fff; color: var(--ink); font: inherit; font-weight: 750; cursor: pointer; }
    .drawer-button:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .side-dialog { width: min(520px, calc(100vw - 24px)); max-width: none; max-height: 100vh; height: 100vh; margin: 0 0 0 auto; padding: 0; border: 0; background: transparent; }
    .side-dialog::backdrop { background: rgba(15, 23, 42, .28); }
    .drawer-panel { min-height: 100%; padding: 18px; background: #fff; border-left: 1px solid var(--line); box-shadow: -24px 0 48px rgba(16, 24, 40, .18); overflow: auto; }
    .drawer-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
    .drawer-close { min-height: 34px; border: 1px solid var(--line); border-radius: 8px; padding: 0 10px; background: #fff; color: var(--ink); font: inherit; cursor: pointer; }
    .drawer-panel details { border-top: 1px solid var(--line); padding-top: 12px; }
    .director-edit-dialog { width: min(780px, calc(100vw - 24px)); }
    .director-edit-panel { display: flex; flex-direction: column; gap: 12px; }
    .director-edit-panel .drawer-head { position: sticky; top: -18px; z-index: 2; margin: -18px -18px 0; padding: 18px; border-bottom: 1px solid var(--line); background: rgba(255, 255, 255, .96); backdrop-filter: blur(8px); }
    .director-edit-panel .ops-kicker { margin: 0 0 4px; color: var(--muted); font-size: 12px; font-weight: 800; letter-spacing: 0; }
    .director-edit-panel h3 { margin: 0; font-size: 20px; }
    .director-edit-panel .muted { max-width: 560px; }
    .director-edit-form { display: grid; gap: 12px; }
    .director-edit-form label { display: grid; gap: 5px; font-weight: 700; color: var(--ink); }
    .director-edit-form input, .director-edit-form textarea { width: 100%; min-height: 38px; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: #fff; color: var(--ink); font: inherit; }
    .director-edit-form button.primary { color: #fff; background: var(--accent); border-color: var(--accent); }
    .drawer-action-row { position: sticky; bottom: -18px; display: flex; flex-wrap: wrap; gap: 8px; margin: 0 -18px -18px; padding: 12px 18px; border-top: 1px solid var(--line); background: rgba(255, 255, 255, .97); backdrop-filter: blur(8px); }
    .drawer-action-row button { min-height: 38px; border: 1px solid var(--line); border-radius: 8px; padding: 0 12px; background: #fff; color: var(--ink); font: inherit; font-weight: 750; cursor: pointer; }
    .metric-details { padding: 0; }
    .metric-details > summary { padding: 14px 16px; color: var(--accent); }
    .metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; padding: 0 16px 16px; }
    .metric { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: #fff; }
    .metric span { display: block; color: var(--muted); font-size: 13px; }
    .metric strong { display: block; margin-top: 6px; font-size: 22px; }
    .metric strong, .status-strip strong { font-variant-numeric: tabular-nums; }
    .section-title, .filters { padding: 14px 16px; }
    .quick-nav, .action-bar, .reader-toolbar, .filter-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .quick-nav { padding: 0 16px 16px; }
    .quick-nav a, .row-actions a, .row-actions button, .disabled-action, .reader-toolbar button, .reader-toolbar a, .action-bar a, .inline-form button, .action-detail button, .filter-chip { min-height: 36px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 11px; background: #fff; color: var(--accent); text-decoration: none; font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
    .quick-nav a:hover, .row-actions a:hover, .row-actions button:hover, .reader-toolbar button:hover, .reader-toolbar a:hover, .action-bar a:hover, .inline-form button:hover, .action-detail button:hover, .filter-chip:hover { border-color: var(--accent); background: var(--accent-soft); }
    .sticky-jump-section { position: sticky; top: 0; z-index: 30; box-shadow: 0 10px 24px rgba(16, 24, 40, .08); }
    .sticky-jump-section .section-title { padding-bottom: 8px; }
    .sticky-jump-section .quick-nav { flex-wrap: nowrap; overflow-x: auto; overscroll-behavior-inline: contain; -webkit-overflow-scrolling: touch; scrollbar-width: thin; }
    .sticky-jump-section .quick-nav a { white-space: nowrap; }
    .written-section { overflow: visible; }
    .written-section .reader-toolbar { position: sticky; top: 76px; z-index: 24; padding: 12px 16px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: rgba(255, 255, 255, .96); backdrop-filter: blur(8px); box-shadow: 0 8px 18px rgba(16, 24, 40, .06); }
    .inline-form { margin: 0; display: inline-flex; }
    .inline-form button { flex-direction: column; justify-content: center; align-items: flex-start; min-height: 44px; gap: 1px; }
    .inline-form button small { display: block; font-size: 11px; line-height: 1.2; font-weight: 650; opacity: .8; }
    .inline-form.action-now button.primary, .action-bar .primary { color: #fff; background: var(--accent); border-color: var(--accent); }
    .inline-form.action-queue button { border-color: var(--line); color: #344054; }
    button:disabled { opacity: .65; cursor: progress; }
    .disabled-action { color: var(--muted); border-color: var(--line); cursor: default; }
    .action-toast { position: fixed; right: 18px; bottom: 18px; z-index: 90; max-width: min(420px, calc(100vw - 36px)); border: 1px solid #b9e3d4; border-radius: 8px; padding: 12px 14px; background: #fff; color: var(--ink); box-shadow: 0 18px 44px rgba(16, 24, 40, .18); line-height: 1.55; }
    .action-toast strong { display: block; margin-bottom: 2px; }
    .action-toast.is-error { border-color: #f2b8b5; background: var(--danger-soft); color: var(--danger); }
    .action-toast[hidden] { display: none !important; }
    .management-detail { border-top: 1px solid var(--line); padding-top: 10px; }
    .management-detail form { margin-top: 10px; }
    .danger-detail { border-top: 1px solid #f2b8b5; padding-top: 10px; }
    .danger-detail summary { color: var(--danger); }
    .danger-detail button { border-color: #f2b8b5; color: var(--danger); background: #fff; }
    .manual-edit-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
    .manual-edit-actions button[value="direct_save"] { border-color: var(--line); color: #344054; }
    .regenerate-detail { min-width: min(100%, 520px); border: 1px solid #f2b8b5; border-radius: 8px; padding: 10px; background: var(--danger-soft); }
    .regenerate-detail form { display: grid; gap: 10px; margin-top: 10px; }
    .regenerate-detail label { display: grid; gap: 5px; font-weight: 700; color: var(--ink); }
    .regenerate-detail textarea { min-height: 70px; }
    .regenerate-detail button { align-items: flex-start; flex-direction: column; justify-content: center; min-height: 44px; width: fit-content; }
    .regenerate-detail button small { display: block; font-size: 11px; line-height: 1.2; font-weight: 650; opacity: .8; }
    .json-tools { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; margin: 10px 0; color: var(--muted); font-size: 13px; }
    .json-tools button { min-height: 34px; border: 1px solid var(--line); border-radius: 8px; padding: 0 10px; background: #fff; color: var(--ink); font: inherit; font-weight: 750; cursor: pointer; }
    .json-tools button:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .json-feedback { min-height: 18px; color: var(--muted); line-height: 1.4; }
    textarea.json-textarea { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.55; }
    textarea.is-valid { border-color: #b9e3d4; background: #fbfffd; }
    textarea.is-invalid { border-color: var(--danger); background: var(--danger-soft); }
    .json-feedback.is-invalid { color: var(--danger); }
    .json-feedback.is-valid { color: var(--accent); }
    .form-help { color: var(--muted); font-size: 12px; line-height: 1.45; }
    .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .catalog-grid, .chapter-grid, .fact-grid, .bible-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 0 16px 16px; }
    .catalog-item, .chapter-card, .fact-card, .bible-card { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fff; content-visibility: auto; contain-intrinsic-size: 280px; }
    .director-list { display: grid; gap: 14px; padding: 0 16px 16px; }
    .director-card { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fff; scroll-margin-top: 18px; }
    .director-card:target { outline: 2px solid var(--accent); }
    .director-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
    .director-panel { margin: 0; padding: 12px; background: #f8fafb; border: 1px solid var(--line); border-radius: 8px; }
    .director-panel h3 { margin-bottom: 8px; }
    .director-warning { margin: 10px 0; border: 1px solid #f0c36a; border-radius: 8px; padding: 10px; background: var(--warn-soft); color: var(--warn); }
    .director-warning strong { display: block; margin-bottom: 6px; color: var(--warn); }
    .director-segments { display: grid; gap: 8px; margin: 0; padding-left: 20px; }
    .director-segments li { padding: 8px 0 0; border-top: 1px solid var(--line); }
    .director-segments li:first-child { padding-top: 0; border-top: 0; }
    .director-json { min-height: 640px; height: calc(100vh - 300px); resize: vertical; }
    .fact-toolbar { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin: 0 16px 14px; padding: 14px; border: 1px solid var(--line); border-radius: 8px; background: #f8fafb; }
    .fact-maintenance-actions { display: grid; gap: 10px; min-width: min(100%, 520px); }
    .fact-create-trigger { width: fit-content; border-color: #b9e3d4; color: var(--accent); background: #fff; }
    .fact-create-form, .fact-edit form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
    .fact-create-form label, .fact-edit label { display: grid; gap: 5px; font-weight: 700; color: var(--ink); }
    .fact-create-form input, .fact-create-form select, .fact-create-form textarea, .fact-edit input, .fact-edit select, .fact-edit textarea { width: 100%; min-height: 38px; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; background: #fff; color: var(--ink); font: inherit; }
    .fact-create-form textarea, .fact-edit textarea { min-height: 120px; resize: vertical; }
    .fact-create-form .wide, .fact-edit .wide, .fact-create-form .async-feedback { grid-column: 1 / -1; }
    .fact-create-form button.primary, .fact-edit button.primary { width: fit-content; color: #fff; background: var(--accent); border-color: var(--accent); }
    .async-feedback { min-height: 20px; margin: 0; color: var(--muted); line-height: 1.5; }
    .async-feedback.is-error, .form-help.is-error { color: var(--danger); }
    .async-feedback.is-success, .form-help.is-success { color: var(--accent); }
    .fact-edit summary { color: var(--accent); font-weight: 800; cursor: pointer; }
    .fact-clear-form button { width: fit-content; border-color: #f2b8b5; color: var(--danger); background: #fff; }
    .fact-actions { display: grid; gap: 10px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
    .fact-status-form button { min-height: 34px; }
    .fact-edit { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: #f8fafb; }
    .chapter-card { contain-intrinsic-size: 460px; }
    .stale-chapter-history { margin: 0 16px 16px; border: 1px dashed #c7d1df; border-radius: 8px; background: #f8fafb; }
    .stale-chapter-history summary { padding: 12px 14px; color: #344054; font-weight: 800; cursor: pointer; }
    .stale-history-toolbar { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin: 0 14px 12px; }
    .stale-history-toolbar .muted { margin: 0; }
    .stale-cleanup-form button { width: fit-content; border-color: #f2b8b5; color: var(--danger); background: #fff; }
    .stale-chapter-card { background: #fbfcfd; }
    .stale-note { margin: 8px 0 10px; border-left: 3px solid #c7d1df; padding-left: 10px; color: var(--muted); line-height: 1.6; }
    .setting-text { margin: 0; color: #3d4b5c; line-height: 1.75; white-space: pre-wrap; }
    .setting-dl { display: grid; grid-template-columns: minmax(72px, max-content) minmax(0, 1fr); gap: 8px 12px; margin: 0; }
    .setting-dl dt { color: var(--muted); font-weight: 700; }
    .setting-dl dd { margin: 0; min-width: 0; color: #263545; line-height: 1.65; }
    .setting-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; }
    .setting-list.simple { list-style: disc; padding-left: 18px; }
    .setting-list > li { padding-top: 10px; border-top: 1px solid var(--line); color: #263545; line-height: 1.65; }
    .setting-list > li:first-child { padding-top: 0; border-top: 0; }
    .setting-list strong { display: block; margin-bottom: 6px; color: var(--ink); }
    .inline-list { margin: 0; padding-left: 18px; }
    .chip-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip-list span { min-height: 28px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 999px; padding: 0 10px; background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 750; }
    .overview-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 0 16px 16px; }
    .overview-card { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fff; min-width: 0; }
    .overview-card h3 { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .overview-card p { margin: 8px 0 12px; color: #3d4b5c; line-height: 1.65; }
    .overview-card a { min-height: 34px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 10px; background: #fff; color: var(--accent); text-decoration: none; font-weight: 700; }
    .overview-card a:hover { border-color: var(--accent); background: var(--accent-soft); }
    .overview-card strong { font-variant-numeric: tabular-nums; }
    .risk-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 0 16px 16px; }
    .risk-card { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fff; }
    .risk-card span { display: block; color: var(--muted); font-size: 13px; }
    .risk-card strong { display: block; margin-top: 6px; font-size: 22px; font-variant-numeric: tabular-nums; }
    .risk-card p { margin: 8px 0 0; color: #3d4b5c; line-height: 1.55; }
    .risk-card.good { border-color: #b9e3d4; background: var(--accent-soft); }
    .risk-card.warn { border-color: #f0c36a; background: var(--warn-soft); }
    .risk-card.bad { border-color: #f3b4ae; background: var(--danger-soft); }
    .chapter-card:target { outline: 2px solid var(--accent); scroll-margin-top: 18px; }
    .item-head { display: flex; justify-content: space-between; gap: 12px; align-items: start; margin-bottom: 12px; }
    .item-head span, .fact-card span { display: block; color: var(--muted); margin-top: 4px; font-size: 13px; }
    dl { display: grid; grid-template-columns: 96px 1fr; gap: 8px 10px; margin: 0 0 12px; }
    .compact-dl { grid-template-columns: 108px minmax(0, 1fr); }
    dt { color: var(--muted); }
    dd { margin: 0; min-width: 0; word-break: break-word; }
    .row-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; align-items: center; }
    .badge-row { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .badge { display: inline-block; border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 650; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .badge.good { color: var(--accent); background: var(--accent-soft); }
    .badge.warn { color: var(--warn); background: var(--warn-soft); }
    .badge.bad { color: var(--danger); background: var(--danger-soft); }
    .badge.muted { color: var(--muted); background: #f6f7f9; }
    .chapter-summary { margin: 0 0 12px; color: #3d4b5c; line-height: 1.7; }
    .chapter-evidence { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0 0 12px; }
    .chapter-evidence span { display: block; border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; color: #344054; background: #f8fafb; font-size: 13px; line-height: 1.45; }
    details { margin-top: 12px; }
    summary { cursor: pointer; color: var(--accent); font-weight: 750; }
    .ops-detail { margin: 0; padding: 16px; }
    .ops-detail > summary { min-height: 40px; display: flex; align-items: center; }
    .ops-detail .section-title { padding-left: 0; padding-right: 0; }
    .ops-detail .bible-grid { padding-left: 0; padding-right: 0; padding-bottom: 0; }
    pre, textarea.export-text { white-space: pre-wrap; word-break: break-word; width: 100%; max-width: 100%; margin: 10px 0 0; padding: 14px; border-radius: 8px; background: #f8fafb; border: 1px solid var(--line); line-height: 1.85; font: inherit; color: var(--ink); }
    textarea, input, select { width: 100%; min-width: 0; border: 1px solid var(--line); border-radius: 8px; padding: 10px; font: inherit; color: var(--ink); background: #fff; }
    select { min-height: 42px; appearance: auto; }
    textarea { min-height: 88px; resize: vertical; }
    textarea.large-textarea { min-height: 340px; line-height: 1.8; }
    label { display: grid; gap: 6px; margin: 10px 0; color: var(--muted); font-size: 13px; }
    .empty { text-align: center; color: var(--muted); padding: 28px; }
    .filter-empty { margin: 0 0 18px; }
    .history { margin: 0; padding-left: 18px; }
    .history li { margin: 0 0 10px; line-height: 1.6; }
    .history span { display: block; color: var(--muted); font-size: 13px; }
    .version-timeline { margin: 0; padding: 0; list-style: none; display: grid; gap: 12px; }
    .version-timeline li { position: relative; display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 10px; }
    .timeline-dot { width: 10px; height: 10px; border: 2px solid var(--accent); border-radius: 999px; margin-top: 7px; background: #fff; }
    .version-timeline li:not(:last-child)::before { content: ""; position: absolute; left: 4px; top: 20px; bottom: -12px; width: 2px; background: var(--line); }
    .timeline-body { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: #fff; }
    .version-timeline .is-latest .timeline-body { border-color: #b9e3d4; background: var(--accent-soft); }
    .timeline-head { display: flex; justify-content: space-between; gap: 10px; align-items: center; margin-bottom: 8px; }
    .timeline-head span { color: var(--muted); font-size: 13px; }
    .failure-actions { margin-top: 8px; }
    .error { color: var(--danger); }
    .export-box { padding: 0 16px 16px; }
    [hidden] { display: none !important; }
    a:focus-visible, button:focus-visible, summary:focus-visible, textarea:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #8fd4bd; outline-offset: 2px; }
    @media (max-width: 900px) {
      main, .app-shell > main { width: min(100% - 24px, 900px); margin: 16px auto 56px; }
      .app-shell { display: block; }
      .app-sidebar { position: static; height: auto; padding: 12px; border-right: 0; border-bottom: 1px solid var(--line); }
      .brand { display: none; }
      .side-nav { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 2px; }
      .side-nav a, .side-nav span { white-space: nowrap; }
      .side-primary { display: none; }
      header, .summary { display: block; }
      .page-actions { justify-content: flex-start; margin-top: 12px; }
      nav { margin-top: 12px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
      .metrics, .recommendation { margin-top: 14px; }
      .metric-grid, .catalog-grid, .chapter-grid, .fact-grid, .bible-grid, .overview-grid, .form-grid, .risk-grid, .director-grid { grid-template-columns: 1fr; padding: 0 12px 12px; }
      .director-list { padding: 0 12px 12px; }
      .fact-toolbar { display: grid; margin-left: 12px; margin-right: 12px; }
      .stale-history-toolbar { display: grid; }
      .stale-cleanup-form button { width: 100%; }
      .fact-maintenance-actions { min-width: 0; }
      .fact-create-form, .fact-edit form { grid-template-columns: 1fr; }
      .action-guide, .chapter-evidence, .status-strip, .summary-facts { grid-template-columns: 1fr; }
      .quick-nav, .section-title, .filters, .reader-toolbar, .export-box { padding-left: 12px; padding-right: 12px; }
      dl, .compact-dl, .setting-dl { grid-template-columns: 1fr; }
      .item-head { display: block; }
      .badge-row { justify-content: flex-start; margin-top: 8px; }
      .quick-nav, .action-bar { display: grid; }
      .recommendation-actions { display: grid; }
      .project-info { min-height: 0; }
      .project-info .action-bar { margin: 12px 0 0; padding: 12px 0 0; max-width: none; justify-content: stretch; align-content: stretch; }
      .reader-toolbar { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .reader-toolbar > * { white-space: nowrap; }
      .view-tabs { flex-wrap: nowrap; overflow-x: auto; padding-left: 12px; padding-right: 12px; -webkit-overflow-scrolling: touch; }
      .written-section .reader-toolbar { top: 0; }
      .inline-form { display: grid; }
      .director-json { min-height: 460px; height: 62vh; }
      .recommendation-top { display: block; }
      .mode-pill { margin-top: 8px; }
    }
  </style>
</head>
<body>
  <div class="app-shell">
  ${renderSidebar('项目列表')}
  <main>
    <div class="page-context">
    ${projectBreadcrumbHtml}
    <header>
      <div>
        <h1>小说项目控制台</h1>
        <p class="muted">${escapeHtml(row.title || '未命名项目')} / ${escapeHtml(row.genre || '未设置类型')} / ${escapeHtml(row.audience || '未设置读者')}</p>
      </div>
      <div class="page-actions">
        <button class="drawer-button" type="button" data-open-dialog="project-actions-drawer">项目操作</button>
        <a href="/webhook/novel-queue-status?project_id=${encodeURIComponent(projectId)}">查看队列</a>
      </div>
    </header>
    </div>

    <section class="summary" aria-label="项目总览">
      <div class="project-info">
        <h2>${escapeHtml(row.title || '未命名项目')} ${badge(liveProjectStatus.code, {}, liveProjectStatus.label)}</h2>
        ${liveProjectStatus.note ? `<p class="status-explain">${escapeHtml(liveProjectStatus.note)}，标题优先显示当前队列实时状态。</p>` : ''}
        <p>${escapeHtml(row.premise || '暂无核心创意')}</p>
        <div class="summary-facts" aria-label="项目关键数字">
          <a href="${escapeHtml(projectViewHref('chapters'))}"><span>进度</span><strong>${escapeHtml(row.current_chapter_no || 0)}/${escapeHtml(row.target_total_chapters || 0)}</strong><em>章节正文</em></a>
          <a href="/webhook/novel-review-list"><span>待审核</span><strong>${escapeHtml(reviewCount)}</strong><em>人工决策</em></a>
          <a href="${escapeHtml(projectViewHref('ops', '#ops-section'))}"><span>失败</span><strong>${escapeHtml(failedJobs.length)}</strong><em>运行排障</em></a>
        </div>
        <div class="action-bar">
          ${pendingBibleJob ? generationRunForm(projectId, 'GENERATE_BIBLE') : ''}
          ${pendingOutlineJob ? generationRunForm(projectId, 'GENERATE_OUTLINE') : ''}
          ${pendingDirectorJob ? generationRunForm(projectId, 'PLAN_CHAPTER_DIRECTOR', pendingDirectorJob) : ''}
          ${pendingChapterJob ? generationRunForm(projectId, 'GENERATE_CHAPTER', pendingChapterJob) : ''}
          ${activeRewriteActionJob ? rewriteRunForm(projectId, activeRewriteActionJob) : ''}
          ${canShowContinueForm ? continueForm(projectId) : ''}
          <button class="drawer-button" type="button" data-open-dialog="project-actions-drawer">项目操作抽屉</button>
          <a href="/webhook/novel-queue-status?project_id=${encodeURIComponent(projectId)}">查看队列</a>
          <a href="${escapeHtml(projectViewHref('export'))}">导出全文</a>
        </div>
      </div>
      <div>
        <div class="recommendation command-panel" aria-label="下一步动作区">
          <div class="recommendation-top">
            <div>
              <p class="recommendation-kicker">当前建议操作 / 下一步动作区</p>
              <h2>下一步动作区：${escapeHtml(recommendationInfo.title)}</h2>
            </div>
            <div class="badge-row">
              <span class="mode-pill">${escapeHtml(recommendationInfo.mode)}</span>
              <span class="action-mode">${escapeHtml(executionLabel(recommendationInfo))}</span>
            </div>
          </div>
          <p>${escapeHtml(recommendationInfo.body)}</p>
          ${activeRewriteActionJob ? `<div class="recommendation-actions">${rewriteRunForm(projectId, activeRewriteActionJob)}<a href="/webhook/novel-queue-status?project_id=${encodeURIComponent(projectId)}">查看队列</a></div>` : ''}
          ${pendingChapterWithoutReadyDirectorJob ? `<div class="recommendation-actions"><a href="${escapeHtml(projectViewHref('director'))}">查看导演台</a><a href="/webhook/novel-queue-status?project_id=${encodeURIComponent(projectId)}">查看队列</a></div>` : ''}
          <div class="decision-note"><strong>操作含义</strong>${escapeHtml(executionLabel(recommendationInfo))}。编辑、暂停、归档和审核仍必须通过 POST 表单提交；查看入口不会写入数据。</div>
          <details class="action-guide" aria-label="动作类型说明">
            <summary>展开动作类型说明</summary>
            <div><strong>启动后台任务</strong><span>提交后当前页会显示提交反馈并刷新，模型调用在后台继续执行。</span></div>
            ${hasFrontStartJob
              ? '<div><strong>队列观察</strong><span>启动后从队列页确认运行中、成功或失败；章节完成后去审核中心处理候选稿。</span></div>'
              : activeQueueCount
                ? '<div><strong>后台处理中</strong><span>已有任务在队列中等待或运行，先观察队列状态；不要重复排队下一步。</span></div>'
              : '<div><strong>排队下一步</strong><span>只创建缺失任务；已有章节生成任务时，项目页会切换为“启动章节生成”。</span></div>'}
          </details>
        </div>
        <details class="metrics metric-details" aria-label="章节统计">
          <summary>展开项目资产统计</summary>
          <div class="metric-grid">
            <div class="metric"><span>当前进度</span><strong>${escapeHtml(row.current_chapter_no || 0)}</strong></div>
            <div class="metric"><span>已写章节</span><strong>${escapeHtml(writtenCount)}</strong></div>
            <div class="metric"><span>目标章节</span><strong>${escapeHtml(row.target_total_chapters || 0)}</strong></div>
            <div class="metric"><span>待审核</span><strong>${escapeHtml(reviewCount)}</strong></div>
            <div class="metric"><span>队列中</span><strong>${escapeHtml(activeQueueCount)}</strong></div>
            <div class="metric"><span>失败任务</span><strong>${escapeHtml(failedJobs.length)}</strong></div>
            <div class="metric"><span>激活事实</span><strong>${escapeHtml(activeFacts)}</strong></div>
          </div>
        </details>
      </div>
    </section>

    <dialog class="side-dialog" id="project-actions-drawer" aria-label="项目操作抽屉">
      <div class="drawer-panel">
        <div class="drawer-head">
          <div>
            <p class="ops-kicker">操作抽屉</p>
            <h2>项目操作抽屉</h2>
            <p class="muted">低频管理动作从首屏移到这里；所有写入仍通过 POST 表单。</p>
          </div>
          <button class="drawer-close" type="button" data-close-dialog>关闭</button>
        </div>
        <section class="drawer-section">
          <h3>队列推进</h3>
          <p class="muted">用于补齐缺失的下一步任务；如果当前有待审核、失败或运行中的任务，后台会返回阻断原因。</p>
          ${hasFrontStartJob || activeQueueCount > 0 ? '<p class="muted">当前已有可启动或运行中的任务，先处理首屏推荐动作。</p>' : continueForm(projectId)}
        </section>
        ${projectTargetsForm(row)}
        ${projectPauseForms(row)}
        ${projectArchiveForms(row)}
      </div>
    </dialog>

    ${projectViewShell}
  </main>
  <script>
    (() => {
      const chapterFilterButtons = Array.from(document.querySelectorAll('[data-chapter-filter]'));
      const catalogItems = Array.from(document.querySelectorAll('.catalog-item'));
      const empty = document.querySelector('[data-catalog-empty]');
      const bodies = Array.from(document.querySelectorAll('.chapter-body'));
      const catalogValues = new Set(['all', 'written', 'current', 'review']);

      document.querySelectorAll('[data-open-dialog]').forEach((button) => {
        button.addEventListener('click', () => {
          const dialog = document.getElementById(button.dataset.openDialog || '');
          if (!dialog) return;
          if (typeof dialog.showModal === 'function') {
            dialog.showModal();
          } else {
            dialog.setAttribute('open', '');
          }
        });
      });
      document.querySelectorAll('[data-close-dialog]').forEach((button) => {
        button.addEventListener('click', () => {
          const dialog = button.closest('dialog');
          if (dialog && typeof dialog.close === 'function') {
            dialog.close();
          } else if (dialog) {
            dialog.removeAttribute('open');
          }
        });
      });
      document.querySelectorAll('dialog').forEach((dialog) => {
        dialog.addEventListener('click', (event) => {
          if (event.target === dialog && typeof dialog.close === 'function') dialog.close();
        });
      });

      const readSearchValue = (name, fallback, allowedValues) => {
        const params = new URLSearchParams(window.location.search);
        const value = params.get(name) || fallback;
        return allowedValues.has(value) ? value : fallback;
      };

      const writeSearchValue = (name, value, fallback) => {
        const params = new URLSearchParams(window.location.search);
        if (value === fallback) {
          params.delete(name);
        } else {
          params.set(name, value);
        }
        const query = params.toString();
        window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + (window.location.hash || ''));
      };

      const applyCatalogFilter = (value, options = {}) => {
        const activeValue = catalogValues.has(value) ? value : 'all';
        let visible = 0;
        catalogItems.forEach((item) => {
          const values = String(item.dataset.chapterValues || 'all').split(/\\s+/);
          const show = activeValue === 'all' || values.includes(activeValue);
          item.hidden = !show;
          if (show) visible += 1;
        });
        chapterFilterButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.chapterFilter === activeValue)));
        if (empty) empty.hidden = visible > 0;
        if (options.write !== false) writeSearchValue('catalog', activeValue, 'all');
      };

      chapterFilterButtons.forEach((button) => button.addEventListener('click', () => applyCatalogFilter(button.dataset.chapterFilter || 'all')));
      applyCatalogFilter(readSearchValue('catalog', 'all', catalogValues), {write: false});
      window.addEventListener('popstate', () => {
        applyCatalogFilter(readSearchValue('catalog', 'all', catalogValues), {write: false});
      });

      document.querySelectorAll('[data-body-action]').forEach((button) => {
        button.addEventListener('click', () => {
          const shouldOpen = button.dataset.bodyAction === 'expand-all';
          bodies.forEach((body) => {
            body.open = shouldOpen;
          });
        });
      });

      const setJsonState = (textarea, state, message) => {
        const feedback = textarea.closest('label')?.querySelector('[data-json-feedback]');
        textarea.classList.toggle('is-invalid', state === 'invalid');
        textarea.classList.toggle('is-valid', state === 'valid');
        if (feedback) {
          feedback.textContent = message;
          feedback.classList.toggle('is-invalid', state === 'invalid');
          feedback.classList.toggle('is-valid', state === 'valid');
        }
      };

      const validateJsonTextarea = (textarea) => {
        const value = textarea.value.trim();
        if (!value) {
          setJsonState(textarea, 'valid', '留空将使用默认结构');
          return true;
        }
        try {
          JSON.parse(value);
          setJsonState(textarea, 'valid', 'JSON 格式正常');
          return true;
        } catch (error) {
          setJsonState(textarea, 'invalid', 'JSON 格式错误：' + error.message);
          return false;
        }
      };

      const jsonTextareas = Array.from(document.querySelectorAll('textarea[data-json-field]'));
      jsonTextareas.forEach((textarea) => {
        validateJsonTextarea(textarea);
        textarea.addEventListener('input', () => validateJsonTextarea(textarea));
      });

      document.querySelectorAll('[data-format-json]').forEach((button) => {
        button.addEventListener('click', () => {
          const form = button.closest('form');
          const fields = Array.from(form?.querySelectorAll('textarea[data-json-field]') || []);
          let firstInvalid = null;
          fields.forEach((textarea) => {
            const value = textarea.value.trim();
            if (!value) {
              validateJsonTextarea(textarea);
              return;
            }
            try {
              textarea.value = JSON.stringify(JSON.parse(value), null, 2);
              validateJsonTextarea(textarea);
            } catch (error) {
              validateJsonTextarea(textarea);
              if (!firstInvalid) firstInvalid = textarea;
            }
          });
          if (firstInvalid) firstInvalid.focus();
        });
      });

      document.querySelectorAll('[data-resolve-director-gate]').forEach((button) => {
        button.addEventListener('click', () => {
          const form = button.closest('form');
          const textarea = form?.querySelector('textarea[name="card_payload_json"]');
          const feedback = form?.querySelector('[data-async-feedback]');
          if (!textarea) return;
          let payload;
          try {
            payload = JSON.parse(textarea.value || '{}');
          } catch (error) {
            validateJsonTextarea(textarea);
            textarea.focus();
            return;
          }
          const expectedSegments = Number(form?.dataset.expectedSegments || 0);
          const segments = Array.isArray(payload.segment_plan) ? payload.segment_plan : [];
          if (expectedSegments > 0 && segments.length !== expectedSegments) {
            if (feedback) {
              feedback.textContent = '还不能标记已解决：分段计划需要 ' + expectedSegments + ' 段，当前是 ' + segments.length + ' 段。';
              feedback.classList.add('is-error');
              feedback.classList.remove('is-success');
            }
            textarea.focus();
            return;
          }
          payload.quality_gate = {
            ...(payload.quality_gate && typeof payload.quality_gate === 'object' ? payload.quality_gate : {}),
            pass: true,
            blocking_issues: [],
          };
          textarea.value = JSON.stringify(payload, null, 2);
          validateJsonTextarea(textarea);
          if (feedback) {
            feedback.textContent = '已把质量闸门标记为通过；保存后会创建新的当前版本。';
            feedback.classList.add('is-success');
            feedback.classList.remove('is-error');
          }
        });
      });

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

      const restoreButton = (button, originalText) => {
        if (!button) return;
        button.disabled = false;
        button.textContent = originalText || button.dataset.originalText || '提交';
      };

      const resultMessageFromHtml = (html, fallback) => {
        try {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const strong = doc.querySelector('.result strong')?.textContent?.trim()
            || doc.querySelector('h1')?.textContent?.trim()
            || '';
          const detail = doc.querySelector('.result p')?.textContent?.trim()
            || doc.querySelector('p')?.textContent?.trim()
            || '';
          return [strong, detail].filter(Boolean).join('：') || fallback;
        } catch (error) {
          return fallback;
        }
      };

      document.querySelectorAll('form[method="POST"], form[method="post"]').forEach((form) => {
        form.addEventListener('submit', async (event) => {
          const fields = Array.from(form.querySelectorAll('textarea[data-json-field]'));
          const invalidField = fields.find((textarea) => !validateJsonTextarea(textarea));
          if (invalidField) {
            event.preventDefault();
            invalidField.focus();
            return;
          }
          const button = event.submitter || form.querySelector('button[type="submit"]');
          const message = button?.dataset.confirm || form.dataset.confirm || '确认执行？';
          if (!window.confirm(message)) {
            event.preventDefault();
            return;
          }
          event.preventDefault();

          const originalText = button?.textContent || '提交';
          const dialog = form.closest('dialog');
          const feedback = form.querySelector('[data-async-feedback]');
          if (feedback) {
            feedback.textContent = '正在提交...';
            feedback.classList.remove('is-error', 'is-success');
          }
          if (button) {
            button.disabled = true;
            button.dataset.originalText = originalText;
            button.textContent = form.classList.contains('action-now') ? '正在启动后台任务...' : '提交中...';
          }

          try {
            const body = new FormData(form);
            if (button?.name && !body.has(button.name)) body.append(button.name, button.value || '');
            const response = await fetch(form.action, {
              method: 'POST',
              body,
              credentials: 'same-origin',
              headers: {'X-Requested-With': 'fetch'},
            });
            const html = await response.text();
            if (!response.ok) {
              throw new Error(resultMessageFromHtml(html, '操作失败：HTTP ' + response.status));
            }
            if (feedback) {
              feedback.textContent = '已提交，正在刷新页面...';
              feedback.classList.add('is-success');
            }
            if (dialog && typeof dialog.close === 'function') dialog.close();
            showToast('操作已完成', '正在刷新当前页面...');
            window.setTimeout(() => window.location.reload(), 450);
          } catch (error) {
            if (feedback) {
              feedback.textContent = error.message || '操作失败，请稍后重试。';
              feedback.classList.add('is-error');
            }
            showToast('操作未完成', error.message || '操作失败，请稍后重试。', true);
            restoreButton(button, originalText);
          }
        });
      });

      document.querySelectorAll('[data-copy-text], [data-copy-target]').forEach((button) => {
        button.addEventListener('click', async () => {
          const text = button.dataset.copyText || document.getElementById(button.dataset.copyTarget || '')?.textContent || '';
          try {
            await navigator.clipboard.writeText(text);
            button.textContent = '已复制';
          } catch (error) {
            button.textContent = '复制失败';
          }
        });
      });

      const download = document.querySelector('[data-download-markdown]');
      if (download) {
        download.addEventListener('click', () => {
          const text = document.getElementById('approved-markdown')?.value || '';
          const blob = new Blob([text], {type: 'text/markdown;charset=utf-8'});
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = '${escapeHtml(String(row.title || 'novel').replace(/[^\\w\\u4e00-\\u9fa5-]+/g, '_'))}.md';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        });
      }

      applyCatalogFilter('all');
    })();
  </script>
  </div>
</body>
</html>`;

return [{json: {response_html: html, response_status_code: 200}}];
