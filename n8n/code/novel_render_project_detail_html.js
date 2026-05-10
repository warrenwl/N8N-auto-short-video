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
  GENERATE_BIBLE_PATCH: '生成扩写设定补丁',
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
  GENERATE_BIBLE_PATCH: '生成扩写设定补丁',
  GENERATE_OUTLINE: '生成大纲',
  PLAN_CHAPTER_DIRECTOR: '导演台规划',
  GENERATE_CHAPTER: '生成章节',
  REVIEW_CHAPTER: '智能审稿',
  REWRITE_CHAPTER: '重写章节',
};

const factTypeOptions = [
  ['character', '人物'],
  ['item', '物品'],
  ['location', '地点'],
  ['ability', '能力'],
  ['relationship', '关系'],
  ['foreshadowing', '伏笔'],
  ['timeline', '时间线'],
  ['rule', '规则'],
  ['other', '其他'],
];

const factTypeLabel = Object.fromEntries(factTypeOptions);

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
  BIBLE_PATCH_CREATED: '扩写设定补丁已生成',
  BIBLE_PATCH_APPLIED: '扩写设定补丁已应用',
  BIBLE_PATCH_REJECTED: '扩写设定补丁已拒绝',
  BIBLE_PATCH_REGENERATE_REQUESTED: '扩写设定补丁重跑已排队',
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
  FACT_CREATED: '事实已新增',
  FACT_UPDATED: '事实已编辑',
  FACT_ACTIVATED: '事实已激活',
  FACT_DEACTIVATED: '事实已失效',
  FACTS_CLEARED: '失效事实已清理',
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
  organizations: '组织势力',
  type: '类型',
  leader: '负责人',
  representative: '代表人物',
  interest: '利益诉求',
  first_touch_suggestion: '初次触达建议',
  locations: '关键地点',
  owner: '所属方',
  story_function: '剧情功能',
  plot_constraints: '剧情约束',
  constraint: '约束',
  until_chapter: '截止章节',
  expansion_notes: '扩写备注',
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

function structuredPlainText(value) {
  const data = normalizeStructuredValue(value);
  if (isEmptyStructuredValue(data)) return '';
  if (Array.isArray(data)) {
    return data.map(structuredPlainText).filter(Boolean).join('；');
  }
  if (data && typeof data === 'object') {
    const preferred = ['name', '姓名', 'title', '标题', 'identity', '身份', 'role', '定位', 'goal', '目标', 'motivation', '动机', 'relationship_with_mc', '与主角关系', 'conflict_with_mc', '与主角冲突'];
    const picked = preferred
      .filter((key) => !isEmptyStructuredValue(data[key]))
      .map((key) => `${humanizeBibleKey(key)}：${structuredPlainText(data[key])}`);
    const pairs = picked.length ? picked : Object.entries(data)
      .filter(([, val]) => !isEmptyStructuredValue(val))
      .slice(0, 4)
      .map(([key, val]) => `${humanizeBibleKey(key)}：${structuredPlainText(val)}`);
    return pairs.join('；');
  }
  return String(data || '').replace(/\s+/g, ' ').trim();
}

function excerpt(value, maxLength = 96) {
  const text = structuredPlainText(value);
  if (!text) return '未记录';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function countStructuredItems(value) {
  const data = normalizeStructuredValue(value);
  if (isEmptyStructuredValue(data)) return 0;
  return Array.isArray(data) ? data.length : 1;
}

function jsonInputValue(value, fallback) {
  const data = value === undefined || value === null || value === '' ? fallback : normalizeStructuredValue(value);
  try {
    return JSON.stringify(data);
  } catch (error) {
    return String(data || '');
  }
}

function bibleFieldValues(bible) {
  return {
    story_core: bible.story_core || '',
    world_setting: bible.world_setting || '',
    power_system: bible.power_system || '',
    tone_rules: bible.tone_rules || '',
    forbidden_rules: bible.forbidden_rules || '',
    main_character_json: jsonInputValue(bible.main_character, {}),
    supporting_characters_json: jsonInputValue(bible.supporting_characters, []),
    villain_setting_json: jsonInputValue(bible.villain_setting, []),
    relationship_map_json: jsonInputValue(bible.relationship_map, []),
    organizations_json: jsonInputValue(bible.organizations, []),
    locations_json: jsonInputValue(bible.locations, []),
    plot_constraints_json: jsonInputValue(bible.plot_constraints, []),
    expansion_notes: bible.expansion_notes || '',
    selling_points_json: jsonInputValue(bible.selling_points, []),
  };
}

function bibleFieldConfigs(bible) {
  return [
    {name: 'story_core', label: '故事核心', group: '核心摘要', type: 'text', value: bible.story_core, help: '只保存故事核心，不影响其他设定项。'},
    {name: 'world_setting', label: '世界设定', group: '核心摘要', type: 'text', value: bible.world_setting, help: '只保存时代、环境和世界规则。'},
    {name: 'tone_rules', label: '文风规则', group: '核心摘要', type: 'text', value: bible.tone_rules, help: '只保存正文、大纲和审稿会参考的文风规则。'},
    {name: 'main_character_json', label: '主角设定', group: '人物设定', type: 'json', value: bible.main_character, fallback: {}, help: '只保存主角身份、目标和成长线。'},
    {name: 'supporting_characters_json', label: '配角设定', group: '人物设定', type: 'json', value: bible.supporting_characters, fallback: [], help: '只保存配角列表。'},
    {name: 'villain_setting_json', label: '反派设定', group: '人物设定', type: 'json', value: bible.villain_setting, fallback: [], help: '只保存反派和阻力角色。'},
    {name: 'relationship_map_json', label: '人物关系', group: '人物设定', type: 'json', value: bible.relationship_map, fallback: [], help: '只保存人物关系线。'},
    {name: 'organizations_json', label: '组织势力', group: '势力版图', type: 'json', value: bible.organizations, fallback: [], help: '只保存商会、家族、宗门、公司或机构。'},
    {name: 'locations_json', label: '关键地点', group: '势力版图', type: 'json', value: bible.locations, fallback: [], help: '只保存据点、地盘、禁区和关键场所。'},
    {name: 'power_system', label: '能力体系', group: '生成约束', type: 'text', value: bible.power_system, help: '只保存能力、限制和升级规则。'},
    {name: 'plot_constraints_json', label: '剧情约束', group: '生成约束', type: 'json', value: bible.plot_constraints, fallback: [], help: '只保存长期伏笔、揭露时机和不可破坏边界。'},
    {name: 'expansion_notes', label: '扩写备注', group: '生成约束', type: 'text', value: bible.expansion_notes, help: '只保存扩写产生的编辑备注。'},
    {name: 'forbidden_rules', label: '禁忌规则', group: '生成约束', type: 'text', value: bible.forbidden_rules, help: '只保存后续生成不可突破的边界。'},
    {name: 'selling_points_json', label: '卖点', group: '生成约束', type: 'json', value: bible.selling_points, fallback: [], help: '只保存商业卖点。'},
  ];
}

function bibleHiddenFields(projectId, bible, activeName) {
  const values = bibleFieldValues(bible);
  return [
    formHidden('project_id', projectId),
    formHidden('reviewer', 'local_user'),
    ...Object.entries(values)
      .filter(([name]) => name !== activeName)
      .map(([name, value]) => formHidden(name, value)),
  ].join('');
}

function bibleSingleFieldEditForm(projectId, bible, config) {
  const isJson = config.type === 'json';
  const currentValue = bibleFieldValues(bible)[config.name] || '';
  const inputHtml = isJson
    ? jsonTextareaField(config.name, `${config.label}（单项编辑）`, config.value, config.fallback, {localizeKeys: true})
    : `<label><span>${escapeHtml(config.label)}（单项编辑）</span><textarea name="${escapeHtml(config.name)}">${escapeHtml(currentValue)}</textarea></label>`;
  return `
    <form class="bible-single-edit-form" method="POST" action="/webhook/novel-bible-update" data-confirm="确认只保存“${escapeHtml(config.label)}”？其他设定项会保持当前值。">
      ${bibleHiddenFields(projectId, bible, config.name)}
      ${isJson ? `<div class="json-tools compact"><button type="button" data-format-json>格式化${escapeHtml(config.label)}</button><span>${escapeHtml(config.help || '只保存当前设定项。')}</span></div>` : `<p class="form-help">${escapeHtml(config.help || '只保存当前设定项。')}</p>`}
      ${inputHtml}
      <label>
        <span>修改说明</span>
        <textarea name="comment" placeholder="例如：补充${escapeHtml(config.label)}…"></textarea>
      </label>
      <div class="drawer-action-row inline-sticky">
        <button class="primary" type="submit">保存${escapeHtml(config.label)}</button>
      </div>
    </form>`;
}

function bibleFieldEditDialog(projectId, bible, config, drawerId) {
  return `
    <dialog class="side-dialog bible-field-edit-dialog" id="${escapeHtml(drawerId)}" aria-label="编辑${escapeHtml(config.label)}抽屉">
      <div class="drawer-panel bible-edit-panel">
        <div class="drawer-head">
          <div>
            <p class="ops-kicker">单项编辑</p>
            <h2>编辑${escapeHtml(config.label)}</h2>
            <p class="muted">只保存当前设定项；其他设定会保持当前值。</p>
          </div>
          <button class="drawer-close" type="button" data-close-dialog>关闭</button>
        </div>
        ${bibleSingleFieldEditForm(projectId, bible, config)}
      </div>
    </dialog>`;
}

function bibleCard(title, contentHtml, options = {}) {
  const drawerId = options.drawerId || `bible-card-${title}`;
  const editDrawerId = options.editDrawerId || '';
  const summary = options.summary || '未记录';
  const meta = options.meta || '';
  const isEmpty = summary === '未记录';
  return `
    <article class="bible-card bible-work-card${isEmpty ? ' is-empty' : ''}">
      <div class="bible-card-summary">
        <span>${escapeHtml(title)}</span>
        <strong>${escapeHtml(summary)}</strong>
        ${meta ? `<small>${escapeHtml(meta)}</small>` : ''}
      </div>
      <div class="bible-card-actions">
        <button type="button" data-open-dialog="${escapeHtml(drawerId)}">打开详情</button>
        ${editDrawerId ? `<button type="button" data-open-dialog="${escapeHtml(editDrawerId)}">编辑</button>` : ''}
      </div>
      <dialog class="side-dialog bible-card-dialog" id="${escapeHtml(drawerId)}" aria-label="${escapeHtml(title)}抽屉">
        <div class="drawer-panel bible-card-panel">
          <div class="drawer-head">
            <div>
              <p class="ops-kicker">设定集</p>
              <h2>${escapeHtml(title)}</h2>
              ${meta ? `<p class="muted">${escapeHtml(meta)}</p>` : ''}
            </div>
            <button class="drawer-close" type="button" data-close-dialog>关闭</button>
          </div>
          <div class="bible-card-content">${contentHtml}</div>
        </div>
      </dialog>
      ${options.editDialogHtml || ''}
    </article>`;
}

function bibleWorkspaceGroup(title, description, cardsHtml) {
  return `
    <section class="bible-workspace-section" aria-label="${escapeHtml(title)}">
      <div class="section-title compact-title">
        <h2>${escapeHtml(title)}</h2>
        <p class="muted">${escapeHtml(description)}</p>
      </div>
      <div class="bible-workspace-grid">${cardsHtml}</div>
    </section>`;
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

function continueForm(projectId, options = {}) {
  const labelText = options.label || '排队下一步';
  const subText = options.subText || '不直接调用模型';
  const confirmText = options.confirm || '继续写作只会补齐缺失的下一步队列任务，不会直接调用模型；如果页面已经出现“启动设定集生成”或“启动大纲生成”，建议优先点击对应按钮。确认补齐任务？';
  return `
    <form class="inline-form action-queue" method="POST" action="/webhook/novel-project-continue" data-confirm="${escapeHtml(confirmText)}">
      ${formHidden('project_id', projectId)}
      ${formHidden('reviewer', 'local_user')}
      <button type="submit"><span>${escapeHtml(labelText)}</span><small>${escapeHtml(subText)}</small></button>
    </form>`;
}

function generationRunForm(projectId, jobType, job = {}, options = {}) {
  const isRejectedRetry = jobType === 'PLAN_CHAPTER_DIRECTOR' && isRejectedRetryDirectorJob(job);
  const rejectedRetryChapter = job.chapter_no ? `第 ${job.chapter_no} 章` : '当前章节';
  const config = {
    GENERATE_BIBLE: {
      action: '/webhook/novel-generate-bible-now',
      step: 'bible',
      label: '启动设定集生成',
      confirm: '这会启动后台模型任务；提交完成后会留在当前项目页并刷新状态。确认启动？',
    },
    GENERATE_BIBLE_PATCH: {
      action: '/webhook/novel-generate-bible-patch-now',
      step: 'bible_patch',
      label: '启动扩写设定补丁',
      subText: '先生成待确认设定',
      confirm: '这会根据扩写计划生成待确认的设定集补丁，不会直接改正式设定集。确认启动？',
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
      label: isRejectedRetry
        ? `继续重写${rejectedRetryChapter}`
        : (job.chapter_no ? `启动第 ${job.chapter_no} 章导演台` : '启动导演台'),
      subText: isRejectedRetry ? '先过导演台，再生成正文' : '后台执行并刷新状态',
      confirm: isRejectedRetry
        ? `这会继续重写${rejectedRetryChapter}；系统会先运行导演台检查，质量通过后再排正文生成。确认继续？`
        : '这会领取当前项目已排队的导演台任务；提交完成后会留在当前项目页并刷新状态，模型调用会继续在 n8n 后台执行。确认启动？',
    },
    GENERATE_CHAPTER: {
      action: '/webhook/novel-generate-chapter-now',
      step: 'chapter',
      label: job.chapter_no ? `启动第 ${job.chapter_no} 章生成` : '启动章节生成',
      confirm: '这会领取当前项目已排队的章节生成任务；提交完成后会留在当前项目页并刷新状态，模型调用会继续在 n8n 后台执行。确认启动？',
    },
  }[jobType];
  if (!projectId || !config) return '';
  const labelText = options.label || config.label;
  const subText = options.subText || config.subText || '后台执行并刷新状态';
  const confirmText = options.confirm || config.confirm;
  return `
    <form class="inline-form action-now" method="POST" action="${escapeHtml(config.action)}" data-confirm="${escapeHtml(confirmText)}">
      ${formHidden('project_id', projectId)}
      ${formHidden('step', config.step)}
      <button class="primary" type="submit"><span>${escapeHtml(labelText)}</span><small>${escapeHtml(subText)}</small></button>
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
  const drawerId = isBible ? 'regenerate-bible-drawer' : 'regenerate-outline-drawer';
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
    <button class="drawer-button regenerate-trigger" type="button" data-open-dialog="${escapeHtml(drawerId)}">${escapeHtml(labelText)}</button>
    <dialog class="side-dialog regenerate-dialog" id="${escapeHtml(drawerId)}" aria-label="${escapeHtml(labelText)}抽屉">
      <div class="drawer-panel regenerate-panel">
        <div class="drawer-head">
          <div>
            <p class="ops-kicker">高风险重生成</p>
            <h2>${escapeHtml(labelText)}</h2>
            <p class="muted">${escapeHtml(smallText)}</p>
          </div>
          <button class="drawer-close" type="button" data-close-dialog>关闭</button>
        </div>
        <form class="regenerate-form" method="POST" action="/webhook/novel-project-regenerate" data-confirm="${escapeHtml(confirmText)}">
          ${formHidden('project_id', projectId)}
          ${formHidden('step', step)}
          ${formHidden('reviewer', 'local_user')}
          <p class="muted">${escapeHtml(note)}</p>
          <label><span>${escapeHtml(textareaLabel)}</span><textarea name="${escapeHtml(textareaName)}" placeholder="${escapeHtml(textareaPlaceholder)}"></textarea></label>
          ${isBible ? '<input type="hidden" name="comment" value="以新的核心创意重新生成设定集" />' : ''}
          <div class="drawer-action-row">
            <button class="danger-submit" type="submit"><span>${escapeHtml(labelText)}</span><small>${escapeHtml(smallText)}</small></button>
            <button type="button" data-close-dialog>取消</button>
          </div>
        </form>
      </div>
    </dialog>`;
}

function projectTargetsForm(row) {
  const defaultExpansionConstraints = row.expansion_constraints || '已批准正文不改；已激活事实不破坏；新增剧情优先承接现有大纲和连续性事实。';
  return `
    <details class="action-detail management-detail project-action-card">
      <summary><span>项目目标与扩写计划</span><small>章节、字数和新增剧情要求</small></summary>
      <form method="POST" action="/webhook/novel-project-targets-update" data-confirm="确认保存项目目标与扩写计划？如果目标章节数增加，后续继续写作可能会先补齐大纲。">
        ${formHidden('project_id', row.id)}
        ${formHidden('reviewer', 'local_user')}
        <p class="project-action-card-note">后续大纲和导演台会读取扩写计划；已经批准的正文不会被自动改写。</p>
        <div class="form-grid project-target-grid">
          <label>
            <span>目标章节数</span>
            <input name="target_total_chapters" type="number" min="1" step="1" inputmode="numeric" value="${escapeHtml(row.target_total_chapters || 20)}" />
          </label>
          <label>
            <span>每章目标字数</span>
            <select name="target_words_per_chapter">${renderWordCountOptions(row.target_words_per_chapter || 2000)}</select>
            <small class="form-help">字数越高，导演台分段数和生成耗时通常也会增加。</small>
          </label>
        </div>
        <label class="expansion-request-field">
          <span class="field-head"><span>新增剧情要求</span><button type="button" class="ai-assist" data-ai-expansion>AI创意</button></span>
          <textarea name="expansion_request" data-expansion-request placeholder="例如：从第 21 章开始新增女主身世线，加入新反派商会，埋下男二背叛伏笔，结尾接回主线大战…">${escapeHtml(row.expansion_request || '')}</textarea>
          <small class="form-help">写清要增加的人物线、冲突、反派、感情线或伏笔；留空则只按章节/字数目标推进。</small>
          <p class="async-feedback expansion-ai-feedback" data-expansion-ai-feedback role="status" aria-live="polite"></p>
        </label>
        <label>
          <span>扩写范围</span>
          <select name="expansion_scope">${renderExpansionScopeOptions(row.expansion_scope)}</select>
          <small class="form-help">“只追加新章节”最稳；重排未写章节会覆盖未生成/未批准的大纲；全大纲重排风险最高。</small>
        </label>
        <label>
          <span>保留约束</span>
          <textarea name="expansion_constraints" placeholder="例如：已批准正文不改；已激活事实不破坏；主角能力边界不升级过快…">${escapeHtml(defaultExpansionConstraints)}</textarea>
        </label>
        <label>
          <span>修改说明</span>
          <textarea name="comment" placeholder="例如：第一季扩展到三十章，并追加新反派线…"></textarea>
        </label>
        <button type="submit">保存目标与扩写计划</button>
      </form>
    </details>`;
}

function projectPauseForms(row) {
  const isPaused = row.status === 'PAUSED';
  const action = isPaused ? 'RESUME' : 'PAUSE';
  const labelText = isPaused ? '恢复项目' : '暂停项目';
  const helperText = isPaused ? '重新允许队列领取任务' : '保留任务但停止自动推进';
  const confirmText = isPaused
    ? '恢复后队列可以继续领取该项目任务，确认恢复？'
    : '暂停后待处理任务会保留，但队列会跳过该项目，确认暂停？';
  return `
    <details class="action-detail management-detail project-action-card">
      <summary><span>${escapeHtml(labelText)}</span><small>${escapeHtml(helperText)}</small></summary>
      <form method="POST" action="/webhook/novel-project-status-toggle" data-confirm="${escapeHtml(confirmText)}">
        ${formHidden('project_id', row.id)}
        ${formHidden('desired_action', action)}
        ${formHidden('reviewer', 'local_user')}
        <p class="project-action-card-note">${escapeHtml(isPaused ? '恢复后不会立刻调用模型，只是让项目重新进入可领取队列。' : '暂停不会删除任务，适合等待人工调整设定、大纲或正文时使用。')}</p>
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
      <details class="action-detail danger-detail project-action-card">
        <summary><span>恢复归档项目</span><small>重新出现在管理列表</small></summary>
        <form method="POST" action="/webhook/novel-project-archive-toggle" data-confirm="恢复后项目会重新出现在可管理状态；已取消的旧任务不会自动恢复，需要手动继续写作。确认恢复？">
          ${formHidden('project_id', row.id)}
          ${formHidden('desired_action', 'RESTORE')}
          ${formHidden('reviewer', 'local_user')}
          <p class="project-action-card-note">恢复只改变项目管理状态；旧的已取消队列不会自动恢复。</p>
          <label>
            <span>恢复说明</span>
            <textarea name="comment" placeholder="例如：重新打开项目，准备继续调整正文…"></textarea>
          </label>
          <button type="submit">恢复归档项目</button>
        </form>
      </details>`;
  }
  return `
    <details class="action-detail danger-detail project-action-card">
      <summary><span>归档项目</span><small>取消待处理任务</small></summary>
      <form method="POST" action="/webhook/novel-project-archive-toggle" data-confirm="归档会取消待处理任务，并停止项目继续推进；项目数据仍保留。确认归档？" data-confirm-title="${escapeHtml(row.title || '')}">
        ${formHidden('project_id', row.id)}
        ${formHidden('desired_action', 'ARCHIVE')}
        ${formHidden('reviewer', 'local_user')}
        <p class="project-action-card-note">归档相当于软删除：不会物理删除设定集、大纲、章节和日志，但待处理任务会被取消。</p>
        <label>
          <span>输入项目名确认</span>
          <input name="confirm_title" autocomplete="off" required placeholder="请输入完整项目名：${escapeHtml(row.title || '')}" />
        </label>
        <p class="async-feedback" data-async-feedback role="status" aria-live="polite">必须完整输入项目名，不能只保留占位提示。</p>
        <label>
          <span>归档说明</span>
          <textarea name="comment" placeholder="例如：测试项目不再继续写作…"></textarea>
        </label>
        <button type="submit">归档项目</button>
      </form>
    </details>`;
}

const biblePatchStatusLabel = {
  PENDING: '待确认',
  APPROVED: '已确认',
  REJECTED: '已拒绝',
  APPLIED: '已应用',
  FAILED: '生成失败',
};

function biblePatchActionForm(patch, action, labelText, options = {}) {
  if (!patch?.id) return '';
  const confirmText = options.confirm || `确认${labelText}？`;
  const buttonClass = options.danger ? 'danger-submit' : (options.primary ? 'primary' : '');
  return `
    <form class="inline-form bible-patch-action-form" method="POST" action="/webhook/novel-bible-patch-action" data-confirm="${escapeHtml(confirmText)}">
      ${formHidden('patch_id', patch.id)}
      ${formHidden('patch_action', action)}
      ${formHidden('reviewer', 'local_user')}
      ${options.comment ? `<input type="hidden" name="comment" value="${escapeHtml(options.comment)}" />` : ''}
      <button class="${escapeHtml(buttonClass)}" type="submit">${escapeHtml(labelText)}</button>
    </form>`;
}

function biblePatchCard(patch) {
  const payload = parseObject(patch.patch_payload);
  const riskNotes = parseArray(patch.risk_notes || payload.risk_notes);
  const status = String(patch.status || 'PENDING');
  const canDecide = ['PENDING', 'APPROVED'].includes(status);
  const summary = payload.summary || patch.expansion_request || '扩写设定补丁';
  return `
    <article class="bible-patch-card" id="bible-patch-${escapeHtml(patch.id || '')}">
      <div class="bible-patch-head">
        <div>
          <span class="badge ${status === 'APPLIED' ? 'good' : (status === 'REJECTED' || status === 'FAILED' ? 'bad' : 'warn')}">${escapeHtml(label(biblePatchStatusLabel, status, status || '待确认'))}</span>
          <h3>${escapeHtml(excerpt(summary, 80))}</h3>
          <p class="muted">来源：${escapeHtml(patch.expansion_scope || 'append_only')}；创建时间 ${escapeHtml(formatLocalTime(patch.created_at))}</p>
        </div>
      </div>
      <div class="bible-patch-grid">
        <section>
          <h4>新增人物</h4>
          ${settingEntries(payload.new_characters, '人物')}
        </section>
        <section>
          <h4>新增反派/阻力</h4>
          ${settingEntries(payload.new_villains, '反派')}
        </section>
        <section>
          <h4>组织/商会/家族</h4>
          ${settingEntries(payload.new_organizations, '组织')}
        </section>
        <section>
          <h4>关键地点</h4>
          ${settingEntries(payload.new_locations, '地点')}
        </section>
        <section>
          <h4>关系更新</h4>
          ${settingEntries(payload.relationship_updates, '关系')}
        </section>
        <section>
          <h4>剧情约束</h4>
          ${settingEntries(payload.plot_constraints, '约束')}
        </section>
      </div>
      ${riskNotes.length ? `<div class="bible-patch-risk"><strong>风险提示</strong>${settingEntries(riskNotes, '风险')}</div>` : ''}
      ${canDecide ? `
        <div class="bible-patch-actions">
          ${biblePatchActionForm(patch, 'APPLY', '应用到设定集', {primary: true, confirm: '应用后会把新增人物、组织、地点、关系和约束合并进正式设定集；不会自动改正文。确认应用？'})}
          ${biblePatchActionForm(patch, 'REGENERATE', '重新生成补丁', {comment: '重新生成扩写设定补丁', confirm: '这会重新排队生成一个设定集补丁，不会应用当前补丁。确认重新生成？'})}
          ${biblePatchActionForm(patch, 'REJECT', '拒绝补丁', {danger: true, comment: '拒绝扩写设定补丁', confirm: '拒绝后不会写入正式设定集。确认拒绝？'})}
        </div>` : ''}
    </article>`;
}

function biblePatchSectionHtml(patches, pendingJob, runningJob) {
  const visiblePatches = patches.slice().sort((a, b) =>
    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
  if (!visiblePatches.length && !pendingJob && !runningJob) return '';
  return `
    <section class="bible-workspace-section bible-patch-section" id="bible-patch-section" aria-label="扩写设定补丁">
      <div class="bible-workspace-section-head">
        <div>
          <h2>扩写设定补丁</h2>
          <p class="muted">扩写计划新增的人物、商会、家族、势力和地点先在这里确认，再进入正式设定集。</p>
        </div>
        ${pendingJob ? generationRunForm(projectId, 'GENERATE_BIBLE_PATCH') : (runningJob ? '<span class="disabled-action">补丁正在生成</span>' : '')}
      </div>
      <div class="bible-patch-list">
        ${visiblePatches.length ? visiblePatches.map(biblePatchCard).join('') : '<article class="empty">补丁任务已排队，启动后会生成待确认设定。</article>'}
      </div>
    </section>`;
}

function renderExpansionScopeOptions(selectedValue) {
  const selected = String(selectedValue || 'append_only');
  return renderOptions([
    ['append_only', '只追加新章节'],
    ['rewrite_unwritten', '重排未写章节'],
    ['regenerate_outline', '高风险重排全部大纲'],
  ], selected);
}

function outlineEditForm(projectId, outline) {
  const drawerId = `outline-edit-${outline.id || outline.chapter_no}`;
  return `
    <button type="button" data-open-dialog="${escapeHtml(drawerId)}">编辑本章大纲</button>
    <dialog class="side-dialog outline-edit-dialog" id="${escapeHtml(drawerId)}" aria-label="编辑本章大纲抽屉">
      <div class="drawer-panel outline-edit-panel">
        <div class="drawer-head">
          <div>
            <p class="ops-kicker">大纲编排</p>
            <h2>编辑本章大纲</h2>
            <p class="muted">${escapeHtml(chapterHeading(outline.chapter_no, outline.title || '未命名章节'))}。保存后续生成会读取新的大纲。</p>
          </div>
          <button class="drawer-close" type="button" data-close-dialog>关闭</button>
        </div>
        <form class="outline-edit-form" method="POST" action="/webhook/novel-outline-update" data-confirm="确认保存本章大纲？后续生成会读取新的大纲。">
          ${formHidden('project_id', projectId)}
          ${formHidden('outline_id', outline.id)}
          ${formHidden('reviewer', 'local_user')}
          ${formHidden('volume_no', outline.volume_no || 1)}
          <div class="form-grid">
            <div class="readonly-field"><span>卷号</span><strong>第 ${escapeHtml(outline.volume_no || 1)} 卷</strong><small>卷归属由大纲结构决定，编辑章节时不可修改。</small></div>
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
          <div class="drawer-action-row">
            <button class="primary" type="submit">保存本章大纲</button>
            <button type="button" data-close-dialog>取消</button>
          </div>
        </form>
      </div>
    </dialog>`;
}

function rewriteForm(chapter) {
  if (!chapter.is_current || !['APPROVED', 'PUBLISHED'].includes(chapter.status)) return '';
  const drawerId = `chapter-rewrite-${chapter.id || chapter.chapter_no}`;
  return `
    <button type="button" data-open-dialog="${escapeHtml(drawerId)}">申请重写此章</button>
    <dialog class="side-dialog chapter-action-dialog" id="${escapeHtml(drawerId)}" aria-label="申请重写此章抽屉">
      <div class="drawer-panel chapter-drawer-panel">
        <div class="drawer-head">
          <div>
            <p class="ops-kicker">章节操作</p>
            <h2>申请重写此章</h2>
            <p class="muted">${escapeHtml(chapterHeading(chapter.chapter_no, chapter.title || '未命名章节'))}。旧正式版本会继续保留，重写只会创建后台任务。</p>
          </div>
          <button class="drawer-close" type="button" data-close-dialog>关闭</button>
        </div>
      <form class="chapter-drawer-form" method="POST" action="/webhook/novel-chapter-rewrite-request" data-confirm="这会为当前正式版本创建重写任务。旧正式版本会继续保持当前可续写，确认申请重写？">
        ${formHidden('chapter_id', chapter.id)}
        ${formHidden('review_token', chapter.review_token)}
        ${formHidden('reviewer', 'local_user')}
        <label>
          <span>重写要求</span>
          <textarea name="comment" placeholder="例如：强化冲突、压缩铺垫、保留结尾钩子…"></textarea>
        </label>
        <p class="form-help" data-async-feedback>提交后会刷新页面；可在队列页观察重写任务。</p>
        <div class="drawer-action-row">
          <button class="primary" type="submit">提交重写申请</button>
          <button type="button" data-close-dialog>取消</button>
        </div>
      </form>
      </div>
    </dialog>`;
}

function manualEditForm(chapter) {
  if (!chapter.body || !['DRAFT_READY', 'AI_REVIEWED', 'NEED_REVIEW', 'APPROVED', 'PUBLISHED'].includes(chapter.status)) return '';
  const canSaveCandidate = chapter.is_current && ['APPROVED', 'PUBLISHED'].includes(chapter.status);
  const drawerId = `chapter-manual-edit-${chapter.id || chapter.chapter_no}`;
  return `
    <button type="button" data-open-dialog="${escapeHtml(drawerId)}">手动编辑正文</button>
    <dialog class="side-dialog chapter-edit-dialog" id="${escapeHtml(drawerId)}" aria-label="手动编辑正文抽屉">
      <div class="drawer-panel chapter-drawer-panel">
        <div class="drawer-head">
          <div>
            <p class="ops-kicker">人工改稿</p>
            <h2>手动编辑正文</h2>
            <p class="muted">${escapeHtml(chapterHeading(chapter.chapter_no, chapter.title || '未命名章节'))}。可直接保存当前版本，也可创建候选稿并送审。</p>
          </div>
          <button class="drawer-close" type="button" data-close-dialog>关闭</button>
        </div>
      <form class="chapter-drawer-form" method="POST" action="/webhook/novel-chapter-manual-edit" data-confirm="确认保存正文？">
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
        <p class="form-help" data-async-feedback>保存后页面会刷新；如果要保持旧正式版本，优先选择候选稿送审。</p>
        <div class="drawer-action-row manual-edit-actions">
          ${canSaveCandidate ? '<button type="submit" name="edit_mode" value="candidate_review" data-confirm="这会创建新的人工编辑候选稿，不覆盖当前正式版本；候选稿会进入智能审稿队列。确认保存为候选稿并送审？">保存为候选稿并送审</button>' : '<span class="disabled-action">候选稿送审仅支持当前正式版本</span>'}
          <button type="submit" name="edit_mode" value="direct_save" data-confirm="这会直接保存当前章节版本，不创建候选稿、不调用模型、不新增审稿任务。确认直接保存？">直接保存</button>
          <button type="button" data-close-dialog>取消</button>
        </div>
      </form>
      </div>
    </dialog>`;
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

function directorJobDisabledAction(activeJob, fallback = '导演台生成中') {
  if (!['PENDING', 'RUNNING'].includes(String(activeJob?.status || ''))) return '';
  const text = activeJob.status === 'PENDING' ? '导演台排队中' : fallback;
  return `<span class="disabled-action">${escapeHtml(text)}</span>`;
}

function directorRegenerateForm(projectId, chapterNo, cardId = '', activeJob = null) {
  if (!projectId || !chapterNo) return '';
  const disabledAction = directorJobDisabledAction(activeJob);
  if (disabledAction) return disabledAction;
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

function directorResolveBlockersForm(projectId, chapterNo, cardId, blockingIssues, activeJob = null) {
  if (!projectId || !chapterNo || !parseArray(blockingIssues).length) return '';
  const disabledAction = directorJobDisabledAction(activeJob, '导演台生成中');
  if (disabledAction) return disabledAction;
  const issueSummary = directorValueText(blockingIssues).slice(0, 900);
  return `
    <form class="inline-form action-repair" method="POST" action="/webhook/novel-director-card-regenerate" data-submitting-label="生成中..." data-confirm="这会带着当前阻断清单重新生成导演台，新版本通过质量闸门后才会自动排正文。确认重跑解决阻断？">
      ${formHidden('project_id', projectId)}
      ${formHidden('director_card_id', cardId || '')}
      ${formHidden('chapter_no', chapterNo)}
      ${formHidden('director_action', 'REGENERATE')}
      ${formHidden('reviewer', 'local_user')}
      ${formHidden('comment', `解决导演台阻断：${issueSummary}`)}
      <button type="submit" data-submitting-label="生成中..."><span>重跑解决阻断</span><small>带阻断清单</small></button>
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
  const hasCurrent = chapters.some((chapter) => chapter.is_current);
  const hasReview = chapters.some((chapter) => chapter.status === 'NEED_REVIEW');
  const directorBlocked = director?.status === 'NEEDS_REVIEW';
  const noDirector = !director && !directorJob;
  const shouldOpen = Boolean(chapters.some((chapter) => chapter.status === 'NEED_REVIEW') || directorJob?.status === 'PENDING' || directorJob?.status === 'RUNNING');
  const filterValues = ['all'];
  if (!hasBody) filterValues.push('unwritten');
  if (hasBody) filterValues.push('written');
  if (hasCurrent) filterValues.push('current');
  if (hasReview) filterValues.push('review');
  if (directorBlocked) filterValues.push('director-blocked');
  if (noDirector) filterValues.push('no-director');
  const chapterHref = hasBody ? projectViewHref('chapters', `#chapter-${encodeURIComponent(outline.chapter_no || '')}`) : '';
  return `
    <details class="catalog-item catalog-panel${directorBlocked ? ' is-blocked' : ''}${!hasBody ? ' is-unwritten' : ''}" id="catalog-${escapeHtml(outline.chapter_no || '')}" data-chapter-values="${escapeHtml(filterValues.join(' '))}"${shouldOpen ? ' open' : ''}>
      <summary class="catalog-panel-summary">
        <div class="catalog-summary-text">
          <strong>${escapeHtml(chapterHeading(outline.chapter_no, latest?.title || outline.title || '未命名章节'))}</strong>
          <span>第 ${escapeHtml(outline.volume_no || 1)} 卷 · ${escapeHtml(excerpt(outline.summary || outline.chapter_goal || '', 72))}</span>
        </div>
        <div class="badge-row">${directorCardBadge(director, directorJob)}${latest ? badge(latest.status, chapterStatusLabel) : badge(outline.status, outlineStatusLabel)}</div>
      </summary>
      <div class="catalog-panel-body">
      <dl class="outline-detail-grid">
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
        ${directorBlocked ? `<a href="${escapeHtml(projectViewHref('director', `#director-${encodeURIComponent(outline.chapter_no || '')}`))}">处理导演台</a>` : ''}
        ${outline.id ? outlineEditForm(projectId, outline) : ''}
      </div>
      </div>
    </details>`;
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

function chapterDrawer(drawerId, kicker, title, description, content, options = {}) {
  const {buttonLabel = title, dialogClass = 'chapter-info-dialog'} = options;
  return `
    <button type="button" data-open-dialog="${escapeHtml(drawerId)}">${escapeHtml(buttonLabel)}</button>
    <dialog class="side-dialog ${escapeHtml(dialogClass)}" id="${escapeHtml(drawerId)}" aria-label="${escapeHtml(title)}抽屉">
      <div class="drawer-panel chapter-drawer-panel">
        <div class="drawer-head">
          <div>
            <p class="ops-kicker">${escapeHtml(kicker)}</p>
            <h2>${escapeHtml(title)}</h2>
            ${description ? `<p class="muted">${escapeHtml(description)}</p>` : ''}
          </div>
          <button class="drawer-close" type="button" data-close-dialog>关闭</button>
        </div>
        <div class="chapter-drawer-content">${content}</div>
      </div>
    </dialog>`;
}

function chapterCard(chapter, options = {}) {
  const title = chapter.title || '未命名章节';
  const body = chapter.body || '';
  const stale = options.stale || isStaleChapter(chapter);
  const history = options.history || [chapter];
  const historyDrawer = stale ? {button: '', dialog: ''} : chapterHistoryTimeline(chapter, history);
  const current = chapter.is_current ? '<span class="badge good">当前正式版本</span>' : '';
  const staleBadge = stale ? '<span class="badge muted">旧大纲历史</span>' : '';
  const chapterKey = chapter.id || `${stale ? 'stale-' : ''}${chapter.chapter_no || 'chapter'}`;
  const chapterTitle = chapterHeading(chapter.chapter_no, title);
  const chapterOpen = Boolean(!stale && chapter.status === 'NEED_REVIEW');
  const bodyDrawer = chapterDrawer(
    `chapter-body-drawer-${chapterKey}`,
    '章节正文',
    '章节正文',
    chapterTitle,
    `<pre id="body-${escapeHtml(chapter.id || chapterKey)}">${escapeHtml(body || '暂无正文')}</pre>`,
    {dialogClass: 'chapter-body-dialog'}
  );
  const reviewDrawer = chapterDrawer(
    `chapter-review-drawer-${chapterKey}`,
    '智能审稿',
    '审稿报告',
    chapterTitle,
    reviewReportBlock(chapter)
  );
  const humanDrawer = chapterDrawer(
    `chapter-human-drawer-${chapterKey}`,
    '人工记录',
    '人工审核记录',
    chapterTitle,
    humanReviewBlock(chapter)
  );
  const runsDrawer = chapterDrawer(
    `chapter-runs-drawer-${chapterKey}`,
    '模型调用',
    '章节模型调用',
    chapterTitle,
    chapterAiRunsBlock(chapter)
  );
  const actions = stale
    ? '<span class="disabled-action">旧大纲历史只读</span>'
    : `
        ${reviewLink(chapter) || '<span class="disabled-action">只读正文</span>'}
        ${historyDrawer.button}
        ${copyReviewButton(chapter)}
        <button type="button" data-copy-target="body-${escapeHtml(chapter.id || chapterKey)}">复制正文</button>
        ${remindForm(chapter)}
      `;
  return `
    <details id="${stale ? 'stale-' : ''}chapter-${escapeHtml(chapter.chapter_no)}" class="chapter-card chapter-panel${stale ? ' stale-chapter-card' : ''}" data-written-status="${escapeHtml(chapter.status || '')}" data-version-kind="${stale ? 'stale' : (chapter.is_current ? 'current' : 'candidate')}"${chapterOpen ? ' open' : ''}>
      <summary class="chapter-panel-summary">
        <div>
          <strong>${escapeHtml(chapterTitle)}</strong>
          <span>版本 ${escapeHtml(chapter.generation_version || 1)} / 字数 ${escapeHtml(chapter.word_count || 0)} / ${escapeHtml(formatLocalTime(chapter.updated_at || chapter.created_at))}</span>
        </div>
        <div class="badge-row">${badge(chapter.status, chapterStatusLabel)}${current}${staleBadge}</div>
      </summary>
      <div class="chapter-panel-body">
        ${stale ? '<p class="stale-note">这份正文生成于当前大纲更新之前，仅作为历史记录保留，不再参与当前章节审核和下一步判断。</p>' : ''}
        <p class="chapter-summary">${escapeHtml(chapter.summary || '暂无章节摘要')}</p>
        ${chapterEvidenceStrip(chapter)}
        <div class="row-actions">
          ${actions}
          ${stale ? '' : rewriteForm(chapter)}
          ${stale ? '' : manualEditForm(chapter)}
          ${bodyDrawer}
          ${reviewDrawer}
          ${humanDrawer}
          ${runsDrawer}
        </div>
        ${historyDrawer.dialog}
      </div>
    </details>`;
}

function parseInlineJsonValue(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !['{', '['].includes(trimmed[0])) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function directorValueText(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.map(directorValueText).filter(Boolean).join('；');
  if (typeof value === 'string') {
    const parsed = parseInlineJsonValue(value);
    return parsed ? directorValueText(parsed) : value;
  }
  if (typeof value === 'object') {
    return Object.values(value).map(directorValueText).filter(Boolean).join('；');
  }
  return String(value);
}

function directorListItem(item) {
  if (typeof item === 'string') {
    const parsed = parseInlineJsonValue(item);
    return parsed ? directorListItem(parsed) : escapeHtml(item);
  }
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

function directorPanelHtml(title, content, options = {}) {
  const {drawerId = '', summary = ''} = options;
  const safeDrawerId = drawerId || `director-panel-${title}`;
  return `
    <article class="director-panel director-drawer-card">
      <button class="director-panel-trigger" type="button" data-open-dialog="${escapeHtml(safeDrawerId)}">
        <span>${escapeHtml(title)}</span>
        ${summary ? `<small>${escapeHtml(summary)}</small>` : ''}
      </button>
      <dialog class="side-dialog director-panel-dialog" id="${escapeHtml(safeDrawerId)}" aria-label="${escapeHtml(title)}抽屉">
        <div class="drawer-panel director-panel-drawer">
          <div class="drawer-head">
            <div>
              <p class="ops-kicker">导演台</p>
              <h2>${escapeHtml(title)}</h2>
              ${summary ? `<p class="muted">${escapeHtml(summary)}</p>` : ''}
            </div>
            <button class="drawer-close" type="button" data-close-dialog>关闭</button>
          </div>
          <div class="director-panel-body">${content}</div>
        </div>
      </dialog>
    </article>`;
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
  const hasActiveWork = ['PENDING', 'RUNNING'].includes(activeJob?.status) || ['PENDING', 'RUNNING'].includes(chapterJob?.status);
  const chapterOpen = Boolean(blockingIssues.length || hasActiveWork || card?.manual_override);
  const chainContent = directorDl([
    ['章节意图', payload.chapter_intent],
    ['前因', chain.from_previous],
    ['触发', chain.trigger],
    ['不可逆结果', chain.irreversible_result],
    ['推向后续', chain.to_next],
  ]);
  const motives = parseArray(chain.character_motives);
  const rememberCount = parseArray(constraints.must_remember).length;
  const breakCount = parseArray(constraints.must_not_break).length;
  const guardrailCount = parseArray(constraints.future_outline_guardrails).length;
  const ops = parseArray(payload.foreshadowing_ops);
  const risks = parseArray(payload.abruptness_risks);
  const segments = parseArray(payload.segment_plan);
  const repairAction = directorResolveBlockersForm(projectId, chapterNo, card?.id, blockingIssues, activeJob);
  const actions = card?.id
    ? `
      ${directorStartChapterForm(projectId, card, chapterJob, chapter)}
      ${directorRegenerateForm(projectId, chapterNo, card.id, activeJob)}
      ${directorSaveForm(projectId, card)}
      <a href="${escapeHtml(projectViewHref('facts', '#facts-section'))}">查看伏笔账本</a>
      <a href="${escapeHtml(projectViewHref('ops', '#ops-section'))}">查看 AI 调用</a>
    `
    : `${directorRegenerateForm(projectId, chapterNo, '', activeJob) || '<span class="disabled-action">等待大纲</span>'}`;
  return `
    <details id="director-${escapeHtml(chapterNo)}" class="director-card director-chapter-panel"${chapterOpen ? ' open' : ''}>
      <summary class="director-chapter-summary">
        <div>
          <strong>第 ${escapeHtml(chapterNo || '-')} 章：${escapeHtml(title)}</strong>
          <span>${escapeHtml(sourceText)} / ${escapeHtml(formatLocalTime(card?.updated_at || card?.created_at || activeJob?.updated_at))}</span>
        </div>
        <div class="badge-row">${statusBadgeHtml}${card?.manual_override ? '<span class="badge warn">已手改</span>' : ''}</div>
      </summary>
      ${blockingIssues.length ? `<div class="director-warning"><strong>阻断问题</strong><p class="muted">这些来自导演台原始结构里的质量闸门；保存后仍有阻断内容时，状态会继续显示待调整。也可以直接带着这份清单重跑导演台，让模型只处理阻断。</p>${directorList(blockingIssues)}${repairAction ? `<div class="director-warning-actions">${repairAction}</div>` : ''}</div>` : ''}
      <div class="director-grid">
        ${directorPanelHtml('情节因果链', chainContent, {drawerId: `director-panel-${chapterNo}-chain`, summary: chain.from_previous ? '前后承接' : '未记录'})}
        ${directorPanelHtml('人物动机', directorList(chain.character_motives), {drawerId: `director-panel-${chapterNo}-motives`, summary: motives.length ? `${motives.length} 条动机` : '未记录'})}
        ${directorPanelHtml('连续性约束', directorDl([
          ['必须记住', parseArray(constraints.must_remember).join('；')],
          ['不能打破', parseArray(constraints.must_not_break).join('；')],
          ['后文护栏', parseArray(constraints.future_outline_guardrails).join('；')],
        ]), {drawerId: `director-panel-${chapterNo}-constraints`, summary: `${rememberCount + breakCount + guardrailCount} 条约束`})}
        ${directorPanelHtml('伏笔操作', directorForeshadowingOpsHtml(payload.foreshadowing_ops), {drawerId: `director-panel-${chapterNo}-foreshadow`, summary: ops.length ? `${ops.length} 条伏笔` : '未记录'})}
        ${directorPanelHtml('突兀风险', directorList(payload.abruptness_risks), {drawerId: `director-panel-${chapterNo}-risks`, summary: risks.length ? `${risks.length} 条风险` : '未记录'})}
        ${directorPanelHtml('分段计划', directorSegmentPlanHtml(payload), {drawerId: `director-panel-${chapterNo}-segments`, summary: segments.length ? `${segments.length} 段` : '未记录'})}
      </div>
      <div class="row-actions">${actions}</div>
    </details>`;
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
  return selectOptions(factTypeOptions, selected || 'other');
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

function factTypeFilterControls(facts) {
  const counts = facts.reduce((acc, fact) => {
    const type = String(fact.fact_type || 'other');
    acc.set(type, (acc.get(type) || 0) + 1);
    return acc;
  }, new Map());
  const buttons = [
    ['all', '全部', facts.length],
    ...factTypeOptions.map(([type, text]) => [type, text, counts.get(type) || 0]),
  ].map(([type, text, count]) => `
      <button class="fact-filter-chip" type="button" data-fact-type-filter="${escapeHtml(type)}" aria-pressed="${type === 'all' ? 'true' : 'false'}">
        <span>${escapeHtml(text)}</span><small>${escapeHtml(count)}</small>
      </button>
    `).join('');
  return `
    <div class="fact-filter-panel" data-fact-filter-panel>
      <div>
        <strong>按事实类型筛选</strong>
        <p class="muted" data-fact-filter-count>当前显示 ${escapeHtml(facts.length)} 条事实</p>
      </div>
      <div class="fact-filter-chips" role="group" aria-label="按事实类型筛选">${buttons}</div>
    </div>`;
}

function factCard(fact) {
  return `
    <article class="fact-card" data-fact-card data-fact-type="${escapeHtml(fact.fact_type || 'other')}">
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
const biblePatches = parseArray(row.bible_patches);
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

const nextRejectedChapter = latestChapters.find((chapter) =>
  chapter.status === 'REJECTED'
    && Number(chapter.chapter_no || 0) === Number(row.current_chapter_no || 0) + 1
) || latestChapters.find((chapter) => chapter.status === 'REJECTED');

function isRejectedRetryDirectorJob(job) {
  if (!job || job.job_type !== 'PLAN_CHAPTER_DIRECTOR') return false;
  const payload = parseObject(job.payload);
  if (payload.trigger_source === 'chapter_rejected_retry') return true;
  const chapter = latestChapterByNo.get(Number(job.chapter_no || 0));
  return chapter?.status === 'REJECTED';
}

function rejectedRetryLabel(chapterNo) {
  return chapterNo ? `第 ${chapterNo} 章` : '当前章节';
}

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
function isActionableQueueJob(job) {
  const status = String(job?.status || '');
  if (!['PENDING', 'RUNNING'].includes(status)) return false;
  if (job.job_type !== 'NOTIFY_REVIEW') return true;
  return latestChapters.some((chapter) =>
    Number(chapter.chapter_no || 0) === Number(job.chapter_no || 0)
      && chapter.status === 'NEED_REVIEW'
  );
}

const waitingCount = jobs.filter((job) => isActionableQueueJob(job) && job.status === 'PENDING').length;
const runningCount = jobs.filter((job) => isActionableQueueJob(job) && job.status === 'RUNNING').length;
const failedJobs = jobs.filter((job) => job.status === 'FAILED');
const activeQueueCount = waitingCount + runningCount;
const activeFacts = facts.filter((fact) => fact.status === 'ACTIVE').length;
const inactiveFacts = facts.filter((fact) => fact.status === 'INACTIVE').length;
const pendingHumanReviewChapter = latestChapters.find((chapter) => chapter.status === 'NEED_REVIEW');
const pendingBibleJob = jobs.find((job) => job.job_type === 'GENERATE_BIBLE' && job.status === 'PENDING');
const pendingBiblePatchJob = jobs.find((job) => job.job_type === 'GENERATE_BIBLE_PATCH' && job.status === 'PENDING');
const pendingOutlineJob = jobs.find((job) => job.job_type === 'GENERATE_OUTLINE' && job.status === 'PENDING');
const pendingDirectorJob = jobs.find((job) => job.job_type === 'PLAN_CHAPTER_DIRECTOR' && job.status === 'PENDING');
const chapterJobHasReadyDirector = (job) => {
  const card = currentDirectorByNo.get(Number(job.chapter_no || 0));
  return Boolean(card && card.status === 'READY');
};
const pendingChapterJob = jobs.find((job) => job.job_type === 'GENERATE_CHAPTER' && job.status === 'PENDING' && chapterJobHasReadyDirector(job));
const pendingChapterWithoutReadyDirectorJob = jobs.find((job) => job.job_type === 'GENERATE_CHAPTER' && job.status === 'PENDING' && !chapterJobHasReadyDirector(job));
const runningBibleJob = jobs.find((job) => job.job_type === 'GENERATE_BIBLE' && job.status === 'RUNNING');
const runningBiblePatchJob = jobs.find((job) => job.job_type === 'GENERATE_BIBLE_PATCH' && job.status === 'RUNNING');
const runningOutlineJob = jobs.find((job) => job.job_type === 'GENERATE_OUTLINE' && job.status === 'RUNNING');
const runningDirectorJob = jobs.find((job) => job.job_type === 'PLAN_CHAPTER_DIRECTOR' && job.status === 'RUNNING');
const runningChapterJob = jobs.find((job) => job.job_type === 'GENERATE_CHAPTER' && job.status === 'RUNNING');
const activeQueueJobs = jobs
  .filter(isActionableQueueJob)
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
const pendingBiblePatch = biblePatches.find((patch) => patch.status === 'PENDING' || patch.status === 'APPROVED');
const appliedBiblePatchCount = biblePatches.filter((patch) => patch.status === 'APPLIED').length;
const hasFrontStartJob = Boolean(pendingBibleJob || pendingBiblePatchJob || pendingOutlineJob || pendingDirectorJob || pendingChapterJob);
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
  if (runningBiblePatchJob) return withBase('RUNNING', '扩写设定补丁生成中');
  if (pendingBiblePatchJob) return withBase('PENDING', '扩写设定补丁待启动');
  if (pendingBiblePatch) return withBase('PENDING', '扩写设定补丁待确认');
  if (runningOutlineJob) return withBase('RUNNING', '大纲生成中');
  if (pendingOutlineJob) return withBase('PENDING', '大纲待启动');
  if (runningDirectorJob) {
    return withBase('RUNNING', isRejectedRetryDirectorJob(runningDirectorJob)
      ? `${chapterLabel(runningDirectorJob)}重写规划中`
      : `${chapterLabel(runningDirectorJob)}导演台规划中`);
  }
  if (pendingDirectorJob) {
    return withBase('PENDING', isRejectedRetryDirectorJob(pendingDirectorJob)
      ? `${chapterLabel(pendingDirectorJob)}待继续重写`
      : `${chapterLabel(pendingDirectorJob)}导演台待启动`);
  }
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
    title: isRejectedRetryDirectorJob(pendingDirectorJob)
      ? `继续重写${rejectedRetryLabel(pendingDirectorJob.chapter_no)}`
      : (pendingDirectorJob.chapter_no ? `启动第 ${pendingDirectorJob.chapter_no} 章导演台` : '启动导演台'),
    body: isRejectedRetryDirectorJob(pendingDirectorJob)
      ? `上一稿已拒绝，${rejectedRetryLabel(pendingDirectorJob.chapter_no)}不会被跳过。点击“继续重写${rejectedRetryLabel(pendingDirectorJob.chapter_no)}”后，系统会先跑导演台检查因果链、人物动机、连续性约束和伏笔账本；通过后再自动排正文生成。`
      : (pendingDirectorJob.chapter_no
        ? `第 ${pendingDirectorJob.chapter_no} 章导演台任务已排队。点击“启动第 ${pendingDirectorJob.chapter_no} 章导演台”会先检查因果链、人物动机、连续性约束和伏笔账本；通过后才会自动排正文生成。`
        : '导演台任务已排队。点击“启动导演台”会先检查因果链、人物动机、连续性约束和伏笔账本；通过后才会自动排正文生成。'),
    intent: isRejectedRetryDirectorJob(pendingDirectorJob) ? '继续重写章节' : '生成导演台规划',
    mode: '后台执行',
  };
  if (runningDirectorJob) return {
    title: isRejectedRetryDirectorJob(runningDirectorJob)
      ? `${rejectedRetryLabel(runningDirectorJob.chapter_no)}重写规划中`
      : (runningDirectorJob.chapter_no ? `第 ${runningDirectorJob.chapter_no} 章导演台规划中` : '导演台规划中'),
    body: isRejectedRetryDirectorJob(runningDirectorJob)
      ? '重写规划正在后台执行。完成后若通过质量闸门会自动排正文任务；若存在突兀或断裂风险，会停在导演台视图等待调整。'
      : '导演台模型调用正在后台执行。完成后若通过质量闸门会自动排正文任务；若存在突兀或断裂风险，会停在导演台视图等待调整。',
    intent: isRejectedRetryDirectorJob(runningDirectorJob) ? '观察重写规划' : '观察导演台',
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
    title: nextRejectedChapter ? `继续重写${rejectedRetryLabel(nextRejectedChapter.chapter_no)}` : '排队下一步',
    body: nextRejectedChapter
      ? `${rejectedRetryLabel(nextRejectedChapter.chapter_no)}上一稿已拒绝。点击“继续重写${rejectedRetryLabel(nextRejectedChapter.chapter_no)}”只会先补齐重写所需任务；后续会经过导演台检查，再生成新的候选正文。`
      : '当前没有待处理任务。点击“排队下一步”只会补齐下一步任务，后续由队列或后台启动入口推进。',
    intent: nextRejectedChapter ? '继续重写章节' : '补齐任务',
    mode: '不直接调用模型',
  };
}

const recommendationInfo = recommendationState();

const rejectedRetryContinueOptions = nextRejectedChapter ? {
  label: `继续重写${rejectedRetryLabel(nextRejectedChapter.chapter_no)}`,
  subText: '先补齐任务',
  confirm: `这会继续重写${rejectedRetryLabel(nextRejectedChapter.chapter_no)}；系统会先补齐导演台/正文生成所需任务，不会跳到下一章。确认继续？`,
} : null;

function executionLabel(info) {
  if (info.mode === '后台执行') return '会调用模型';
  if (info.mode === '后台运行中') return info.title.includes('提醒') ? '只发送提醒' : '会调用模型';
  if (info.mode === '等待调度') return info.title.includes('提醒') ? '只发送提醒' : '队列待执行';
  if (info.mode === '不直接调用模型' || info.title === '排队下一步') return '只排队';
  if (info.intent === '管理项目') return '危险操作需确认';
  return '不会调用模型';
}

function commandExecutionHint(info) {
  if (hasFrontStartJob || activeRewriteActionJob) return '启动后台任务';
  if (activeQueueCount > 0) return '队列观察';
  if (canShowContinueForm) return '排队下一步';
  return executionLabel(info);
}

function riskItem(title, value, detail, tone = '') {
  return `
    <article class="risk-card ${escapeHtml(tone)}">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(detail)}</p>
    </article>`;
}

function outlineHasBody(outline) {
  return (chaptersByNo.get(Number(outline.chapter_no || 0)) || []).some((chapter) => chapter.body);
}

function outlineHasReview(outline) {
  return (chaptersByNo.get(Number(outline.chapter_no || 0)) || []).some((chapter) => chapter.status === 'NEED_REVIEW');
}

function outlineDirectorBlocked(outline) {
  return currentDirectorByNo.get(Number(outline.chapter_no || 0))?.status === 'NEEDS_REVIEW';
}

function outlineHasNoDirector(outline) {
  const chapterNo = Number(outline.chapter_no || 0);
  return !currentDirectorByNo.has(chapterNo) && !directorJobsByNo.has(chapterNo);
}

function outlineVolumeStats(volumeOutlines) {
  const written = volumeOutlines.filter(outlineHasBody).length;
  const review = volumeOutlines.filter(outlineHasReview).length;
  const blocked = volumeOutlines.filter(outlineDirectorBlocked).length;
  return `${volumeOutlines.length} 章 · 已写 ${written} · 待审 ${review} · 阻断 ${blocked}`;
}

const outlineTotalCount = syntheticOutlines.length;
const outlineUnwrittenCount = syntheticOutlines.filter((outline) => !outlineHasBody(outline)).length;
const outlineReviewCount = syntheticOutlines.filter(outlineHasReview).length;
const outlineDirectorBlockedCount = syntheticOutlines.filter(outlineDirectorBlocked).length;
const outlineNoDirectorCount = syntheticOutlines.filter(outlineHasNoDirector).length;

const outlineVolumeGroups = Array.from(syntheticOutlines.reduce((acc, outline) => {
  const volumeNo = Number(outline.volume_no || 1);
  if (!acc.has(volumeNo)) acc.set(volumeNo, []);
  acc.get(volumeNo).push(outline);
  return acc;
}, new Map()).entries()).sort(([a], [b]) => a - b);

const catalogHtml = outlineVolumeGroups.length
  ? outlineVolumeGroups.map(([volumeNo, volumeOutlines]) => `
      <section class="outline-volume-section" aria-label="第 ${escapeHtml(volumeNo)} 卷大纲">
        <div class="section-title compact-title outline-volume-head">
          <div>
            <p class="ops-kicker">卷轴</p>
            <h2>第 ${escapeHtml(volumeNo)} 卷</h2>
            <p class="muted">${escapeHtml(outlineVolumeStats(volumeOutlines))}</p>
          </div>
        </div>
        <div class="catalog-grid">${volumeOutlines.map((outline) => outlineCard(outline, chaptersByNo, projectId, currentDirectorByNo, directorJobsByNo)).join('')}</div>
      </section>`).join('')
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

function commandLink(href, labelText, subText = '', className = '') {
  return `<a class="command-button ${escapeHtml(className)}" href="${escapeHtml(href)}"><span>${escapeHtml(labelText)}</span>${subText ? `<small>${escapeHtml(subText)}</small>` : ''}</a>`;
}

function commandDialogButton(dialogId, labelText, subText = '') {
  return `<button class="command-button" type="button" data-open-dialog="${escapeHtml(dialogId)}"><span>${escapeHtml(labelText)}</span>${subText ? `<small>${escapeHtml(subText)}</small>` : ''}</button>`;
}

function commandAssetCard(labelText, value, detail, href, tone = '') {
  return `
    <a class="asset-status-card ${escapeHtml(tone)}" href="${escapeHtml(href)}">
      <span>${escapeHtml(labelText)}</span>
      <strong>${escapeHtml(value)}</strong>
      <em>${escapeHtml(detail)}</em>
    </a>`;
}

function projectPrimaryAction() {
  if (pendingBibleJob) return generationRunForm(projectId, 'GENERATE_BIBLE');
  if (pendingBiblePatchJob) return generationRunForm(projectId, 'GENERATE_BIBLE_PATCH');
  if (pendingBiblePatch) return commandLink(projectViewHref('bible', '#bible-patch-section'), '确认设定补丁', '先合并新增设定');
  if (pendingOutlineJob) return generationRunForm(projectId, 'GENERATE_OUTLINE');
  if (pendingDirectorJob) return generationRunForm(projectId, 'PLAN_CHAPTER_DIRECTOR', pendingDirectorJob);
  if (pendingChapterJob) return generationRunForm(projectId, 'GENERATE_CHAPTER', pendingChapterJob);
  if (activeRewriteActionJob) return rewriteRunForm(projectId, activeRewriteActionJob);
  if (needsReviewDirector) return commandLink(projectViewHref('director', `#director-${encodeURIComponent(needsReviewDirector.chapter_no || '')}`), '处理导演台', '查看阻断');
  if (pendingChapterWithoutReadyDirectorJob) return commandLink(projectViewHref('director'), '查看导演台', '补齐规划');
  if (failedJobs.length) return commandLink(projectViewHref('ops', '#ops-section'), '排查失败', '查看日志');
  if (reviewCount) return commandLink('/webhook/novel-review-list', '处理审核', '人工决策');
  if (activeQueueCount) return commandLink(`/webhook/novel-queue-status?project_id=${encodeURIComponent(projectId)}`, '查看队列', '观察后台');
  if (canShowContinueForm) return continueForm(projectId, rejectedRetryContinueOptions || {});
  if (row.status === 'PAUSED' || row.status === 'ARCHIVED') return commandDialogButton('project-actions-drawer', '项目操作', '恢复/管理');
  if (row.status === 'COMPLETED') return commandLink(projectViewHref('export'), '打开导出', '整理成稿');
  return commandLink(projectViewHref(activeView), '查看当前视图', '继续工作');
}

const queueSummary = failedJobs.length
  ? `${failedJobs.length} 失败`
  : (activeQueueCount ? `${activeQueueCount} 队列中` : '队列空闲');
const queueTone = failedJobs.length ? 'bad' : (activeQueueCount ? 'warn' : 'good');
const bibleAssetState = hasBibleAsset ? '已生成' : (runningBibleJob ? '生成中' : (pendingBibleJob ? '待启动' : '待生成'));
const outlineAssetState = syntheticOutlines.length ? `${syntheticOutlines.length} 章` : (runningOutlineJob ? '生成中' : (pendingOutlineJob ? '待启动' : '待生成'));
const directorAssetState = needsReviewDirectorCount ? `${needsReviewDirectorCount} 阻断` : `${readyDirectorCount}/${syntheticOutlines.length || 0}`;
const directorTone = needsReviewDirectorCount ? 'warn' : (readyDirectorCount ? 'good' : '');
const reviewTone = reviewCount ? 'warn' : 'good';
const commandAssetHtml = [
  commandAssetCard('设定集', bibleAssetState, hasBibleAsset ? '可查看/编辑' : '等待生成', projectViewHref('bible'), hasBibleAsset ? 'good' : 'warn'),
  commandAssetCard('大纲', outlineAssetState, syntheticOutlines.length ? '章节规划' : '等待目录', projectViewHref('outline'), syntheticOutlines.length ? 'good' : 'warn'),
  commandAssetCard('导演台', directorAssetState, needsReviewDirectorCount ? '需调整' : '质量闸门', projectViewHref('director'), directorTone),
  commandAssetCard('章节', `${writtenCount}/${row.target_total_chapters || 0}`, `${currentCount} 正式`, projectViewHref('chapters'), writtenCount ? 'good' : ''),
  commandAssetCard('审核', `${reviewCount} 待审`, reviewCount ? '先决策' : '无阻塞', '/webhook/novel-review-list', reviewTone),
  commandAssetCard('事实', `${activeFacts}/${facts.length}`, '连续性记忆', projectViewHref('facts'), activeFacts ? 'good' : ''),
  commandAssetCard('运行', queueSummary, failedJobs.length ? '需排查' : (activeQueueCount ? '观察中' : '可推进'), projectViewHref('ops'), queueTone),
].join('');
const projectCommandCenterHtml = `
    <section class="project-command-center" aria-label="项目指挥台">
      <div class="project-identity-bar">
        <div class="project-identity-copy">
          <div class="project-title-row">
            <h2>${escapeHtml(row.title || '未命名项目')}</h2>
            ${badge(liveProjectStatus.code, {}, liveProjectStatus.label)}
          </div>
          ${liveProjectStatus.note ? `<p class="status-explain">${escapeHtml(liveProjectStatus.note)}，标题优先显示当前队列实时状态。</p>` : ''}
          <div class="project-meta-line" aria-label="项目基础信息">
            <span>${escapeHtml(row.genre || '未设置类型')}</span>
            <span>${escapeHtml(row.audience || '未设置读者')}</span>
            <span>${escapeHtml(row.style || '未设置文风')}</span>
            <span>进度 ${escapeHtml(row.current_chapter_no || 0)}/${escapeHtml(row.target_total_chapters || 0)}</span>
            <span class="${escapeHtml(queueTone)}">${escapeHtml(queueSummary)}</span>
          </div>
          <p class="command-premise">${escapeHtml(row.premise || '暂无核心创意')}</p>
        </div>
        <div class="command-actions">
          ${commandDialogButton('project-actions-drawer', '项目操作')}
          ${commandLink(`/webhook/novel-queue-status?project_id=${encodeURIComponent(projectId)}`, '查看队列')}
          ${commandLink(projectViewHref('export'), '导出')}
        </div>
      </div>
      <div class="next-action-strip" aria-label="下一步动作区">
        <div class="next-action-copy">
          <p class="ops-kicker">当前建议操作 / 下一步动作区</p>
          <h2>下一步动作区：${escapeHtml(recommendationInfo.title)}</h2>
          <p>${escapeHtml(recommendationInfo.body)}</p>
          <div class="command-mode-row">
            <span class="mode-pill">${escapeHtml(recommendationInfo.mode)}</span>
            <span class="action-mode">${escapeHtml(executionLabel(recommendationInfo))}</span>
            <span class="action-mode">${escapeHtml(commandExecutionHint(recommendationInfo))}</span>
          </div>
        </div>
        <div class="next-action-primary">${projectPrimaryAction()}</div>
      </div>
      <div class="asset-status-grid" aria-label="项目资产状态条">${commandAssetHtml}</div>
    </section>`;

const projectActionsDrawerHtml = `
    <dialog class="side-dialog project-actions-dialog" id="project-actions-drawer" aria-label="项目操作抽屉">
      <div class="drawer-panel project-actions-panel">
        <div class="drawer-head">
          <div>
            <p class="ops-kicker">操作抽屉</p>
            <h2>项目操作抽屉</h2>
            <p class="muted">把低频管理动作集中在这里；所有写入仍通过 POST 表单并需要确认。</p>
          </div>
          <button class="drawer-close" type="button" data-close-dialog>关闭</button>
        </div>
        <div class="project-action-stack">
          <section class="project-action-section" aria-label="项目设置">
            <div class="project-action-section-head">
              <p class="ops-kicker">管理设置</p>
              <h3>项目目标与推进状态</h3>
              <p class="muted">目标修改和暂停恢复都只影响后续推进；需要填写原因的动作默认折叠，打开后再提交。</p>
            </div>
            ${projectTargetsForm(row)}
            ${projectPauseForms(row)}
          </section>
          <section class="project-action-section project-action-danger-zone" aria-label="危险区">
            <div class="project-action-section-head">
              <p class="ops-kicker">危险区</p>
              <h3>归档管理</h3>
              <p class="muted">归档会停止项目继续推进并取消待处理任务，但不会物理删除正文、设定和日志。</p>
            </div>
            ${projectArchiveForms(row)}
          </section>
        </div>
      </div>
    </dialog>`;

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

const bibleEditConfigs = new Map(bibleFieldConfigs(bible).map((config) => [config.name, config]));
function bibleEditOptions(fieldName, drawerId) {
  const config = bibleEditConfigs.get(fieldName);
  if (!config) return {};
  return {
    editDrawerId: drawerId,
    editDialogHtml: bibleFieldEditDialog(projectId, bible, config, drawerId),
  };
}

const bibleCoreCardsHtml = [
  bibleCard('故事核心', settingText(bible.story_core), {
    drawerId: 'bible-card-story-core',
    summary: excerpt(bible.story_core, 120),
    meta: '全书主线、核心爽点和追更理由',
    ...bibleEditOptions('story_core', 'bible-edit-story-core'),
  }),
  bibleCard('世界设定', settingText(bible.world_setting), {
    drawerId: 'bible-card-world-setting',
    summary: excerpt(bible.world_setting, 120),
    meta: '时代、环境、规则和基础舞台',
    ...bibleEditOptions('world_setting', 'bible-edit-world-setting'),
  }),
  bibleCard('文风规则', settingText(bible.tone_rules), {
    drawerId: 'bible-card-tone-rules',
    summary: excerpt(bible.tone_rules, 110),
    meta: '正文、大纲和审稿都会参考',
    ...bibleEditOptions('tone_rules', 'bible-edit-tone-rules'),
  }),
].join('');
const bibleCharacterCardsHtml = [
  bibleCard('主角设定', settingEntries(bible.main_character, '主角'), {
    drawerId: 'bible-card-main-character',
    summary: excerpt(bible.main_character, 120),
    meta: countStructuredItems(bible.main_character) ? '主名、身份、目标和成长线' : '缺少主角设定',
    ...bibleEditOptions('main_character_json', 'bible-edit-main-character'),
  }),
  bibleCard('配角设定', settingEntries(bible.supporting_characters, '配角'), {
    drawerId: 'bible-card-supporting-characters',
    summary: excerpt(bible.supporting_characters, 120),
    meta: `${countStructuredItems(bible.supporting_characters)} 个配角`,
    ...bibleEditOptions('supporting_characters_json', 'bible-edit-supporting-characters'),
  }),
  bibleCard('反派设定', settingEntries(bible.villain_setting, '反派'), {
    drawerId: 'bible-card-villains',
    summary: excerpt(bible.villain_setting, 120),
    meta: `${countStructuredItems(bible.villain_setting)} 个反派/阻力`,
    ...bibleEditOptions('villain_setting_json', 'bible-edit-villains'),
  }),
  bibleCard('人物关系', settingEntries(bible.relationship_map, '关系'), {
    drawerId: 'bible-card-relationships',
    summary: excerpt(bible.relationship_map, 120),
    meta: `${countStructuredItems(bible.relationship_map)} 条关系线`,
    ...bibleEditOptions('relationship_map_json', 'bible-edit-relationships'),
  }),
].join('');
const bibleOrganizationCardsHtml = [
  bibleCard('组织势力', settingEntries(bible.organizations, '组织'), {
    drawerId: 'bible-card-organizations',
    summary: excerpt(bible.organizations, 120),
    meta: `${countStructuredItems(bible.organizations)} 个商会/家族/势力`,
    ...bibleEditOptions('organizations_json', 'bible-edit-organizations'),
  }),
  bibleCard('关键地点', settingEntries(bible.locations, '地点'), {
    drawerId: 'bible-card-locations',
    summary: excerpt(bible.locations, 120),
    meta: `${countStructuredItems(bible.locations)} 个地点/据点`,
    ...bibleEditOptions('locations_json', 'bible-edit-locations'),
  }),
].join('');
const bibleConstraintCardsHtml = [
  bibleCard('能力体系', settingText(bible.power_system), {
    drawerId: 'bible-card-power-system',
    summary: excerpt(bible.power_system, 120),
    meta: '能力、限制、升级或资源规则',
    ...bibleEditOptions('power_system', 'bible-edit-power-system'),
  }),
  bibleCard('剧情约束', settingEntries(bible.plot_constraints, '约束'), {
    drawerId: 'bible-card-plot-constraints',
    summary: excerpt(bible.plot_constraints, 120),
    meta: `${countStructuredItems(bible.plot_constraints)} 条长期约束`,
    ...bibleEditOptions('plot_constraints_json', 'bible-edit-plot-constraints'),
  }),
  bibleCard('扩写备注', settingText(bible.expansion_notes), {
    drawerId: 'bible-card-expansion-notes',
    summary: excerpt(bible.expansion_notes, 120),
    meta: '扩写后沉淀的编辑备注',
    ...bibleEditOptions('expansion_notes', 'bible-edit-expansion-notes'),
  }),
  bibleCard('禁忌规则', settingText(bible.forbidden_rules), {
    drawerId: 'bible-card-forbidden-rules',
    summary: excerpt(bible.forbidden_rules, 120),
    meta: '后续生成不可突破的边界',
    ...bibleEditOptions('forbidden_rules', 'bible-edit-forbidden-rules'),
  }),
  bibleCard('卖点', settingChips(bible.selling_points), {
    drawerId: 'bible-card-selling-points',
    summary: excerpt(bible.selling_points, 120),
    meta: `${countStructuredItems(bible.selling_points)} 个卖点`,
    ...bibleEditOptions('selling_points_json', 'bible-edit-selling-points'),
  }),
].join('');
const bibleWorkspaceHtml = [
  biblePatchSectionHtml(biblePatches, pendingBiblePatchJob, runningBiblePatchJob),
  bibleWorkspaceGroup('核心摘要', '先看故事气质、舞台和文风是否稳定。', bibleCoreCardsHtml),
  bibleWorkspaceGroup('人物设定', '对比主角、配角、反派与关系线，避免称呼和动机漂移。', bibleCharacterCardsHtml),
  bibleWorkspaceGroup('势力版图', '新增商会、家族、组织和关键地点会在后续生成中作为正式来源。', bibleOrganizationCardsHtml),
  bibleWorkspaceGroup('生成约束', '后续大纲、导演台和正文会参考这些规则。', bibleConstraintCardsHtml),
].join('');

const bibleSectionHtml = `
    <section id="bible-section" aria-label="设定集">
      ${Object.keys(bible).length ? `
        <div class="bible-workspace">${bibleWorkspaceHtml}</div>` : `<article class="empty">暂无设定集。${pendingBibleJob ? '点击“启动设定集生成”会把模型调用交给后台完成。' : '排队下一步会优先补齐生成设定集任务。'}</article>`}
    </section>`;

const outlineSectionHtml = `
    <section id="catalog-section" class="outline-workbench" aria-label="大纲与目录">
      <div class="outline-dashboard" aria-label="大纲状态条">
        ${riskItem('总章节', `${outlineTotalCount} 章`, '当前大纲内的章节规划总数。', outlineTotalCount ? 'good' : '')}
        ${riskItem('已写正文', `${writtenCount} 章`, '已有正文的章节可以直接跳到章节视图。', writtenCount ? 'good' : '')}
        ${riskItem('待审核', `${outlineReviewCount} 章`, outlineReviewCount ? '先处理候选稿，避免后续续写上下文阻塞。' : '当前没有候选稿待人工审核。', outlineReviewCount ? 'warn' : 'good')}
        ${riskItem('导演台阻断', `${outlineDirectorBlockedCount} 章`, outlineDirectorBlockedCount ? '这些章节正文生成会暂停，先到导演台处理。' : `无导演台 ${outlineNoDirectorCount} 章。`, outlineDirectorBlockedCount ? 'warn' : 'good')}
      </div>
      <div class="outline-toolbar" aria-label="目录筛选">
        <div class="filter-row">
          <strong>目录筛选</strong>
          <button class="filter-chip" type="button" data-chapter-filter="all" aria-pressed="false">全部</button>
          <button class="filter-chip" type="button" data-chapter-filter="unwritten" aria-pressed="false">未写</button>
          <button class="filter-chip" type="button" data-chapter-filter="written" aria-pressed="false">已写</button>
          <button class="filter-chip" type="button" data-chapter-filter="review" aria-pressed="false">待审核</button>
          <button class="filter-chip" type="button" data-chapter-filter="director-blocked" aria-pressed="false">导演台阻断</button>
          <button class="filter-chip" type="button" data-chapter-filter="no-director" aria-pressed="false">无导演台</button>
        </div>
        <div class="outline-toolbar-actions">
          <button type="button" data-catalog-action="expand-all">展开全部</button>
          <button type="button" data-catalog-action="collapse-all">收起全部</button>
        </div>
      </div>
      <div class="outline-volume-list">${catalogHtml}</div>
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
        <button type="button" data-body-action="expand-all">展开全部章节</button>
        <button type="button" data-body-action="collapse-all">收起全部章节</button>
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
      ${factTypeFilterControls(facts)}
      <div class="fact-grid">
        ${facts.length ? facts.map(factCard).join('') : '<article class="empty">暂无连续性事实。</article>'}
        <article class="empty fact-filter-empty" data-fact-filter-empty hidden>当前类型暂无事实。</article>
      </div>
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
const activeViewActionControl = {
  bible: bibleRegenerateControl,
  outline: outlineRegenerateControl,
}[activeView] || '';

const projectViewShell = `
    <section class="sticky-jump-section" aria-label="项目二级导航">
      <div class="section-title view-shell-title">
        <div>
          <p class="ops-kicker">项目二级视图</p>
          <h2>${escapeHtml(viewConfig[activeView].title)}</h2>
          <p class="muted">${escapeHtml(viewConfig[activeView].description)}</p>
        </div>
        ${activeViewActionControl ? `<div class="view-shell-actions">${activeViewActionControl}</div>` : ''}
      </div>
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
    .project-command-center { display: grid; gap: 10px; padding: 12px; overflow: visible; border-color: #cbd6e2; background: #fff; box-shadow: 0 8px 18px rgba(16, 24, 40, .05); }
    .project-identity-bar { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 10px; }
    .project-identity-copy { min-width: 0; }
    .project-title-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .project-title-row h2 { margin: 0; font-size: 22px; line-height: 1.25; }
    .status-explain { margin: 4px 0 10px; color: var(--muted); font-size: 13px; line-height: 1.5; }
    .project-meta-line { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; }
    .project-meta-line span { min-height: 26px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 999px; padding: 0 9px; background: #f8fafb; color: #344054; font-size: 12px; font-weight: 750; white-space: nowrap; }
    .project-meta-line span.good { border-color: #b9e3d4; color: var(--accent); background: var(--accent-soft); }
    .project-meta-line span.warn { border-color: #f0c36a; color: var(--warn); background: var(--warn-soft); }
    .project-meta-line span.bad { border-color: #f3b4ae; color: var(--danger); background: var(--danger-soft); }
    .command-premise { max-width: 920px; margin: 8px 0 0; color: #3d4b5c; line-height: 1.55; }
    .command-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; align-items: center; }
    .command-button, .next-action-primary .inline-form button { min-height: 42px; display: inline-flex; flex-direction: column; justify-content: center; align-items: flex-start; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 12px; background: #fff; color: var(--accent); text-decoration: none; font: inherit; font-weight: 800; cursor: pointer; touch-action: manipulation; }
    .command-button:hover, .next-action-primary .inline-form button:hover { border-color: var(--accent); background: var(--accent-soft); }
    .command-button small, .next-action-primary .inline-form button small { display: block; margin-top: 1px; font-size: 11px; line-height: 1.2; font-weight: 650; opacity: .78; }
    .next-action-strip { display: grid; grid-template-columns: minmax(0, 1fr) minmax(190px, auto); gap: 12px; align-items: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 12px; background: var(--accent-soft); }
    .next-action-copy { min-width: 0; }
    .next-action-copy h2 { margin-bottom: 4px; }
    .next-action-copy p:not(.ops-kicker) { margin: 0; color: #3d4b5c; line-height: 1.55; }
    .next-action-primary { display: flex; justify-content: flex-end; align-items: center; }
    .next-action-primary .inline-form { width: 100%; max-width: 260px; }
    .next-action-primary .inline-form button, .next-action-primary .command-button { width: 100%; min-height: 48px; }
    .command-mode-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .mode-pill { display: inline-flex; align-items: center; min-height: 28px; border: 1px solid #b9e3d4; border-radius: 999px; padding: 0 10px; color: var(--accent); background: var(--accent-soft); font-size: 12px; font-weight: 750; white-space: nowrap; }
    .action-mode { display: inline-flex; align-items: center; min-height: 28px; border: 1px solid var(--line); border-radius: 999px; padding: 0 10px; color: #344054; background: #fff; font-size: 12px; font-weight: 750; white-space: nowrap; }
    .asset-status-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
    .asset-status-card { min-width: 0; border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; background: #fff; color: var(--ink); text-decoration: none; }
    .asset-status-card:hover { border-color: var(--accent); background: #fbfffd; }
    .asset-status-card span { display: block; color: var(--muted); font-size: 12px; font-weight: 800; }
    .asset-status-card strong { display: block; margin-top: 3px; font-size: 18px; line-height: 1.15; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .asset-status-card em { display: block; margin-top: 4px; color: var(--muted); font-style: normal; font-size: 12px; line-height: 1.3; }
    .asset-status-card.good { border-color: #b9e3d4; background: #fbfffd; }
    .asset-status-card.warn { border-color: #f0c36a; background: var(--warn-soft); }
    .asset-status-card.bad { border-color: #f3b4ae; background: var(--danger-soft); }
    .drawer-button { min-height: 36px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 11px; background: #fff; color: var(--ink); font: inherit; font-weight: 750; cursor: pointer; }
    .drawer-button:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .regenerate-trigger { border-color: #f2b8b5; color: var(--danger); background: #fff; }
    .regenerate-trigger:hover { border-color: var(--danger); color: var(--danger); background: var(--danger-soft); }
    .side-dialog { width: min(520px, calc(100vw - 24px)); max-width: none; max-height: 100vh; height: 100vh; margin: 0 0 0 auto; padding: 0; border: 0; background: transparent; }
    .side-dialog::backdrop { background: rgba(15, 23, 42, .28); }
    .drawer-panel { min-height: 100%; padding: 18px; background: #fff; border-left: 1px solid var(--line); box-shadow: -24px 0 48px rgba(16, 24, 40, .18); overflow: auto; }
    .drawer-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
    .drawer-close { min-height: 34px; border: 1px solid var(--line); border-radius: 8px; padding: 0 10px; background: #fff; color: var(--ink); font: inherit; cursor: pointer; }
    .drawer-panel details { border-top: 1px solid var(--line); padding-top: 12px; }
    .chapter-action-dialog, .chapter-info-dialog { width: min(620px, calc(100vw - 24px)); }
    .chapter-edit-dialog, .chapter-body-dialog { width: min(860px, calc(100vw - 24px)); }
    .chapter-drawer-panel { display: flex; flex-direction: column; gap: 12px; }
    .chapter-drawer-panel .drawer-head { position: sticky; top: -18px; z-index: 2; margin: -18px -18px 0; padding: 18px; border-bottom: 1px solid var(--line); background: rgba(255, 255, 255, .96); backdrop-filter: blur(8px); }
    .chapter-drawer-form { display: grid; gap: 10px; }
    .chapter-drawer-form label { display: grid; gap: 6px; margin: 0; color: var(--muted); font-size: 13px; }
    .chapter-drawer-content pre { max-height: calc(100vh - 180px); overflow: auto; }
    .chapter-drawer-content .history { padding-right: 8px; }
    .bible-field-edit-dialog, .bible-card-dialog, .outline-edit-dialog { width: min(760px, calc(100vw - 24px)); }
    .bible-edit-panel, .bible-card-panel, .outline-edit-panel { display: flex; flex-direction: column; gap: 12px; }
    .bible-edit-panel .drawer-head, .bible-card-panel .drawer-head, .outline-edit-panel .drawer-head { position: sticky; top: -18px; z-index: 2; margin: -18px -18px 0; padding: 18px; border-bottom: 1px solid var(--line); background: rgba(255, 255, 255, .96); backdrop-filter: blur(8px); }
    .bible-single-edit-form { display: grid; gap: 10px; padding: 12px; }
    .bible-single-edit-form label { display: grid; gap: 6px; margin: 0; font-weight: 700; color: var(--ink); }
    .json-tools.compact { margin: 0; }
    .bible-card-content { padding-top: 4px; overflow-x: auto; }
    .outline-edit-form { display: grid; gap: 12px; }
    .outline-edit-form label { display: grid; gap: 6px; font-weight: 700; color: var(--ink); }
    .readonly-field { display: grid; gap: 5px; margin: 10px 0; border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: #f8fafb; }
    .readonly-field span { color: var(--muted); font-size: 13px; font-weight: 700; }
    .readonly-field strong { color: var(--ink); font-size: 16px; }
    .readonly-field small { color: var(--muted); line-height: 1.45; }
    .director-edit-dialog { width: min(780px, calc(100vw - 24px)); }
    .regenerate-dialog { width: min(620px, calc(100vw - 24px)); }
    .director-panel-dialog { width: min(720px, calc(100vw - 24px)); }
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
    .drawer-action-row.inline-sticky { position: static; margin: 0; padding: 0; border-top: 0; background: transparent; backdrop-filter: none; }
    .drawer-action-row button { min-height: 38px; border: 1px solid var(--line); border-radius: 8px; padding: 0 12px; background: #fff; color: var(--ink); font: inherit; font-weight: 750; cursor: pointer; }
    .drawer-action-row button.primary { color: #fff; background: var(--accent); border-color: var(--accent); }
    .metric-details { padding: 0; }
    .metric-details > summary { padding: 14px 16px; color: var(--accent); }
    .metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; padding: 0 16px 16px; }
    .metric { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: #fff; }
    .metric span { display: block; color: var(--muted); font-size: 13px; }
    .metric strong { display: block; margin-top: 6px; font-size: 22px; }
    .metric strong, .status-strip strong { font-variant-numeric: tabular-nums; }
    .section-title, .filters { padding: 14px 16px; }
    .view-shell-title { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
    .view-shell-title > div:first-child { min-width: 0; }
    .view-shell-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; align-items: flex-start; margin-left: auto; }
    .quick-nav, .action-bar, .reader-toolbar, .filter-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .quick-nav { padding: 0 16px 16px; }
    .quick-nav a, .row-actions a, .row-actions button, .disabled-action, .reader-toolbar button, .reader-toolbar a, .action-bar a, .inline-form button, .action-detail button, .filter-chip { min-height: 36px; display: inline-flex; align-items: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 11px; background: #fff; color: var(--accent); text-decoration: none; font: inherit; font-weight: 650; cursor: pointer; touch-action: manipulation; }
    .quick-nav a:hover, .row-actions a:hover, .row-actions button:hover, .reader-toolbar button:hover, .reader-toolbar a:hover, .action-bar a:hover, .inline-form button:hover, .action-detail button:hover, .filter-chip:hover { border-color: var(--accent); background: var(--accent-soft); }
    .filter-chip[aria-pressed="true"] { border-color: var(--accent); background: var(--accent); color: #fff; box-shadow: 0 6px 14px rgba(31, 122, 92, .18); }
    .filter-chip[aria-pressed="true"]:hover { background: #16684e; color: #fff; }
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
    button:disabled { opacity: .65; cursor: not-allowed; }
    button.is-submitting:disabled { cursor: progress; }
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
    .project-actions-dialog { width: min(600px, calc(100vw - 24px)); }
    .project-actions-panel { display: grid; align-content: start; gap: 14px; background: #fbfcfd; }
    .project-actions-panel .drawer-head { position: sticky; top: -18px; z-index: 2; margin: -18px -18px 0; padding: 18px; border-bottom: 1px solid var(--line); background: rgba(255, 255, 255, .96); backdrop-filter: blur(8px); }
    .project-action-section-head h3 { margin: 0; color: var(--ink); font-size: 18px; line-height: 1.3; }
    .project-action-section-head p:not(.ops-kicker) { margin: 6px 0 0; line-height: 1.55; }
    .project-action-stack { display: grid; gap: 12px; }
    .project-action-section { border: 1px solid var(--line); border-radius: 8px; padding: 12px; background: #fff; }
    .project-action-danger-zone { border-color: #f2b8b5; background: #fffafa; }
    .project-actions-panel .project-action-card { margin-top: 10px; border: 1px solid var(--line); border-radius: 8px; padding: 0; background: #fff; overflow: hidden; }
    .project-actions-panel .project-action-card.danger-detail { border-color: #f2b8b5; background: #fff; }
    .project-action-card > summary { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; padding: 11px 12px; cursor: pointer; list-style: none; color: var(--ink); }
    .project-action-card > summary::-webkit-details-marker { display: none; }
    .project-action-card > summary span { min-width: 0; font-weight: 850; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .project-action-card > summary small { color: var(--muted); font-size: 12px; font-weight: 700; white-space: nowrap; }
    .project-action-card > summary::after { content: '打开'; min-height: 28px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 9px; color: var(--muted); font-size: 12px; font-weight: 750; }
    .project-action-card[open] > summary { border-bottom: 1px solid var(--line); background: #fbfcfd; }
    .project-action-card[open] > summary::after { content: '收起'; color: var(--accent); border-color: #b9e3d4; background: var(--accent-soft); }
    .project-action-card.danger-detail > summary span, .project-action-card.danger-detail[open] > summary::after { color: var(--danger); }
    .project-action-card.danger-detail > summary::after { border-color: #f2b8b5; color: var(--danger); }
    .project-actions-panel .project-action-card form { display: grid; gap: 10px; margin: 0; padding: 12px; }
    .project-actions-panel .project-action-card label { display: grid; gap: 6px; margin: 0; color: var(--ink); font-weight: 700; }
    .project-action-card-note { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
    .project-actions-panel .project-action-card button[type="submit"] { min-height: 40px; justify-content: center; font-weight: 800; }
    .field-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; }
    .field-head > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ai-assist { min-width: 76px; min-height: 32px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 10px; background: var(--accent-soft); color: var(--accent); font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; white-space: nowrap; }
    .ai-assist:hover { border-color: var(--accent); background: #e2f3eb; }
    .ai-assist:disabled { opacity: .72; cursor: wait; }
    .ai-assist.is-loading { border-color: var(--accent); background: #fff; }
    .expansion-ai-feedback { min-height: 20px; margin: 0; }
    .expansion-ai-feedback.is-error { color: var(--danger); }
    .expansion-ai-feedback.is-success { color: var(--accent); }
    .project-actions-panel .form-grid { padding: 0; }
    .project-target-grid { align-items: start; }
    .project-target-grid label { grid-template-rows: auto 42px minmax(18px, auto); align-content: start; }
    .project-target-grid input, .project-target-grid select { height: 42px; min-height: 42px; }
    .project-target-grid .form-help { margin: 0; min-height: 18px; }
    .manual-edit-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
    .manual-edit-actions button[value="direct_save"] { border-color: var(--line); color: #344054; }
    .regenerate-panel { display: flex; flex-direction: column; gap: 12px; }
    .regenerate-panel .drawer-head { position: sticky; top: -18px; z-index: 2; margin: -18px -18px 0; padding: 18px; border-bottom: 1px solid var(--line); background: rgba(255, 255, 255, .96); backdrop-filter: blur(8px); }
    .regenerate-form { display: grid; gap: 12px; }
    .regenerate-form label { display: grid; gap: 6px; font-weight: 700; color: var(--ink); }
    .regenerate-form textarea { width: 100%; min-height: 120px; border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: #fff; color: var(--ink); font: inherit; resize: vertical; }
    .regenerate-form .danger-submit { align-items: flex-start; flex-direction: column; justify-content: center; min-height: 44px; border-color: #f2b8b5; color: var(--danger); background: #fff; }
    .regenerate-form .danger-submit:hover { border-color: var(--danger); background: var(--danger-soft); }
    .regenerate-form button small { display: block; font-size: 11px; line-height: 1.2; font-weight: 650; opacity: .8; }
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
    .catalog-grid, .chapter-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; padding: 0 16px 16px; }
    .fact-grid, .bible-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 0 16px 16px; }
    .catalog-item, .chapter-card, .fact-card, .bible-card { border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fff; content-visibility: auto; contain-intrinsic-size: 280px; }
    .bible-workspace { display: grid; gap: 16px; padding-bottom: 16px; }
    .bible-workspace-section { background: transparent; border: 0; margin: 0; overflow: visible; }
    .bible-workspace-section .compact-title { padding-bottom: 10px; }
    .bible-workspace-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 0 16px; }
    .bible-patch-section { border: 1px solid #f1ce96; border-radius: 8px; margin: 0 16px; padding: 14px; background: #fffaf0; }
    .bible-patch-section .bible-workspace-section-head { display: flex; justify-content: space-between; gap: 12px; align-items: start; margin-bottom: 12px; }
    .bible-patch-section h2, .bible-patch-section h3, .bible-patch-section h4 { margin: 0; }
    .bible-patch-list { display: grid; gap: 12px; }
    .bible-patch-card { border: 1px solid #ecd39c; border-radius: 8px; padding: 12px; background: #fff; }
    .bible-patch-head { display: flex; justify-content: space-between; gap: 12px; align-items: start; margin-bottom: 12px; }
    .bible-patch-head h3 { margin-top: 8px; color: var(--ink); font-size: 17px; line-height: 1.4; }
    .bible-patch-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .bible-patch-grid section, .bible-patch-risk { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: #fbfcfd; }
    .bible-patch-grid h4 { margin-bottom: 8px; color: #344054; font-size: 13px; }
    .bible-patch-risk { margin-top: 10px; border-color: #f2b8b5; background: #fff7f6; }
    .bible-patch-risk > strong { display: block; margin-bottom: 8px; color: var(--danger); }
    .bible-patch-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .bible-patch-action-form { display: inline-flex; }
    .bible-patch-action-form button { min-height: 36px; }
    .bible-work-card { min-height: 198px; display: flex; flex-direction: column; padding: 0; overflow: hidden; content-visibility: visible; contain-intrinsic-size: auto; }
    .bible-card-summary { flex: 1 1 auto; min-height: 132px; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 8px; align-items: start; padding: 14px; background: #fff; }
    .bible-card-summary span { color: var(--muted); font-size: 12px; font-weight: 850; letter-spacing: .04em; }
    .bible-card-summary strong { color: #263545; line-height: 1.55; font-weight: 750; }
    .bible-card-summary small { color: var(--muted); line-height: 1.45; }
    .bible-work-card.is-empty .bible-card-summary { background: #f8fafb; }
    .bible-card-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; align-items: stretch; margin-top: auto; border-top: 1px solid var(--line); padding: 10px 14px; background: #fbfcfd; }
    .bible-card-actions button { width: 100%; height: 34px; min-height: 34px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid #b9e3d4; border-radius: 8px; padding: 0 11px; background: #fff; color: var(--accent); font: inherit; font-size: 13px; font-weight: 750; line-height: 1; white-space: nowrap; cursor: pointer; }
    .bible-card-actions button:hover { border-color: var(--accent); background: var(--accent-soft); }
    .outline-workbench { overflow: visible; }
    .outline-dashboard { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding: 16px; }
    .outline-dashboard .risk-card { padding: 12px; }
    .outline-toolbar { position: sticky; top: 76px; z-index: 24; display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: rgba(255, 255, 255, .96); backdrop-filter: blur(8px); box-shadow: 0 8px 18px rgba(16, 24, 40, .06); }
    .outline-toolbar-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; }
    .outline-toolbar-actions button { min-height: 36px; display: inline-flex; align-items: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 11px; background: #fff; color: #344054; font: inherit; font-weight: 650; cursor: pointer; }
    .outline-toolbar-actions button:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .outline-volume-list { display: grid; gap: 16px; padding-bottom: 16px; }
    .outline-volume-section { background: transparent; border: 0; margin: 0; overflow: visible; }
    .outline-volume-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding-bottom: 10px; }
    .catalog-panel { padding: 0; overflow: hidden; scroll-margin-top: 18px; }
    .catalog-panel-summary { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; padding: 14px; cursor: pointer; list-style: none; }
    .catalog-summary-text { min-width: 0; display: grid; gap: 4px; }
    .catalog-summary-text strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .catalog-summary-text span { color: var(--muted); font-size: 13px; line-height: 1.45; }
    .catalog-panel-summary::-webkit-details-marker { display: none; }
    .catalog-panel-summary::after { content: '展开'; min-height: 28px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 9px; color: var(--muted); font-size: 12px; font-weight: 750; }
    .catalog-panel[open] > .catalog-panel-summary { border-bottom: 1px solid var(--line); background: #fbfcfd; }
    .catalog-panel[open] > .catalog-panel-summary::after { content: '收起'; color: var(--accent); border-color: #b9e3d4; background: var(--accent-soft); }
    .catalog-panel.is-blocked { border-color: #f0c36a; background: #fffaf0; }
    .catalog-panel.is-unwritten:not(.is-blocked) { background: #fbfcfd; }
    .catalog-panel-body { padding: 14px; }
    .outline-detail-grid { grid-template-columns: 108px minmax(0, 1fr); }
    .director-list { display: grid; gap: 14px; padding: 0 16px 16px; }
    .director-card { border: 1px solid var(--line); border-radius: 8px; background: #fff; scroll-margin-top: 18px; overflow: hidden; }
    .director-card:target { outline: 2px solid var(--accent); }
    .director-chapter-summary { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; padding: 14px; cursor: pointer; list-style: none; }
    .director-chapter-summary::-webkit-details-marker { display: none; }
    .director-chapter-summary::after { content: '展开'; min-height: 28px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 9px; color: var(--muted); font-size: 12px; font-weight: 750; }
    .director-card[open] > .director-chapter-summary { border-bottom: 1px solid var(--line); background: #fbfcfd; }
    .director-card[open] > .director-chapter-summary::after { content: '收起'; color: var(--accent); border-color: #b9e3d4; background: var(--accent-soft); }
    .director-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 0 14px 14px; }
    .director-card > .row-actions { margin-top: 0; padding: 0 14px 14px; }
    .director-panel { margin: 0; padding: 0; background: #f8fafb; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    .director-panel-trigger { width: 100%; min-height: 52px; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; border: 0; border-radius: 0; padding: 10px 12px; background: transparent; color: var(--ink); text-align: left; font: inherit; cursor: pointer; }
    .director-panel-trigger span { font-weight: 800; }
    .director-panel-trigger small { color: var(--muted); font-weight: 650; white-space: nowrap; }
    .director-panel-trigger::after { content: '打开'; min-height: 28px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 9px; color: var(--muted); font-size: 12px; font-weight: 750; }
    .director-panel-trigger:hover { background: #fff; }
    .director-panel-trigger:hover::after { color: var(--accent); border-color: #b9e3d4; background: var(--accent-soft); }
    .director-panel-body { padding: 12px; }
    .director-panel-drawer { display: flex; flex-direction: column; gap: 0; }
    .director-panel-drawer .drawer-head { position: sticky; top: -18px; z-index: 2; margin: -18px -18px 0; padding: 18px; border-bottom: 1px solid var(--line); background: rgba(255, 255, 255, .96); backdrop-filter: blur(8px); }
    .director-panel-drawer .director-panel-body { padding: 16px 0 0; overflow-x: auto; }
    .director-warning { margin: 10px 14px; border: 1px solid #f0c36a; border-radius: 8px; padding: 10px; background: var(--warn-soft); color: var(--warn); }
    .director-warning strong { display: block; margin-bottom: 6px; color: var(--warn); }
    .director-warning-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(167, 101, 8, .24); }
    .inline-form.action-repair button { border-color: #f0c36a; color: var(--warn); background: #fffaf0; }
    .inline-form.action-repair button:hover { border-color: var(--warn); background: #fff3d6; }
    .director-segments { display: grid; gap: 8px; margin: 0; padding-left: 20px; }
    .director-segments li { padding: 8px 0 0; border-top: 1px solid var(--line); }
    .director-segments li:first-child { padding-top: 0; border-top: 0; }
    .director-json { min-height: 640px; height: calc(100vh - 300px); resize: vertical; }
    .fact-toolbar { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; margin: 0 16px 14px; padding: 14px; border: 1px solid var(--line); border-radius: 8px; background: #f8fafb; }
    .fact-maintenance-actions { display: grid; gap: 10px; min-width: min(100%, 520px); }
    .fact-create-trigger { width: fit-content; border-color: #b9e3d4; color: var(--accent); background: #fff; }
    .fact-filter-panel { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin: 0 16px 14px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
    .fact-filter-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
    .fact-filter-chip { min-height: 34px; display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--line); border-radius: 999px; padding: 0 12px; color: #344054; background: #fff; cursor: pointer; font: inherit; font-weight: 750; }
    .fact-filter-chip small { min-width: 22px; height: 22px; display: inline-grid; place-items: center; border-radius: 999px; background: #eef4f2; color: #40665a; font-size: 12px; }
    .fact-filter-chip[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
    .fact-filter-chip[aria-pressed="true"] small { background: #fff; color: var(--accent); }
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
    .chapter-panel { padding: 0; overflow: hidden; scroll-margin-top: 18px; }
    .chapter-panel-summary { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; padding: 14px; cursor: pointer; list-style: none; }
    .chapter-panel-summary::-webkit-details-marker { display: none; }
    .chapter-panel-summary::after { content: '展开'; min-height: 28px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 9px; color: var(--muted); font-size: 12px; font-weight: 750; }
    .chapter-panel[open] > .chapter-panel-summary { border-bottom: 1px solid var(--line); background: #fbfcfd; }
    .chapter-panel[open] > .chapter-panel-summary::after { content: '收起'; color: var(--accent); border-color: #b9e3d4; background: var(--accent-soft); }
    .chapter-panel-body { padding: 14px; }
    .chapter-panel-body .row-actions { margin-bottom: 0; }
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
      .view-shell-title { display: grid; gap: 10px; }
      .view-shell-actions { justify-content: flex-start; margin-left: 0; }
      .view-shell-actions .drawer-button, .view-shell-actions .inline-form, .view-shell-actions .inline-form button { width: 100%; }
      nav { margin-top: 12px; flex-wrap: nowrap; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
      .project-command-center { padding: 10px; }
      .project-identity-bar, .next-action-strip { grid-template-columns: 1fr; }
      .project-title-row h2 { font-size: 20px; }
      .command-actions { justify-content: stretch; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .command-actions .command-button { width: 100%; align-items: center; padding-left: 8px; padding-right: 8px; text-align: center; }
      .next-action-primary { justify-content: stretch; }
      .next-action-primary .inline-form { max-width: none; }
      .asset-status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .project-actions-dialog { width: min(100vw, 620px); }
      .project-action-card > summary { grid-template-columns: minmax(0, 1fr) auto; }
      .project-action-card > summary small { grid-column: 1 / -1; white-space: normal; }
      .project-actions-panel .form-grid { grid-template-columns: 1fr; padding: 0; }
      .bible-patch-section { margin: 0 12px; }
      .bible-patch-section .bible-workspace-section-head, .bible-patch-head { display: grid; }
      .bible-patch-grid { grid-template-columns: 1fr; }
      .metric-grid, .catalog-grid, .chapter-grid, .fact-grid, .bible-grid, .bible-workspace-grid, .overview-grid, .form-grid, .risk-grid, .director-grid, .outline-dashboard { grid-template-columns: 1fr; padding: 0 12px 12px; }
      .director-card > .row-actions { padding: 0 12px 12px; }
      .director-chapter-summary { grid-template-columns: minmax(0, 1fr) auto; padding: 12px; }
      .director-chapter-summary .badge-row { grid-column: 1 / -1; justify-content: flex-start; }
      .catalog-panel-summary { grid-template-columns: minmax(0, 1fr) auto; padding: 12px; }
      .catalog-panel-summary .badge-row { grid-column: 1 / -1; justify-content: flex-start; }
      .catalog-summary-text strong { white-space: normal; }
      .catalog-panel-body { padding: 12px; }
      .chapter-panel-summary { grid-template-columns: minmax(0, 1fr) auto; padding: 12px; }
      .chapter-panel-summary .badge-row { grid-column: 1 / -1; justify-content: flex-start; }
      .chapter-panel-body { padding: 12px; }
      .director-panel-trigger { grid-template-columns: minmax(0, 1fr) auto; }
      .director-panel-trigger small { grid-column: 1 / -1; }
      .director-list { padding: 0 12px 12px; }
      .fact-toolbar { display: grid; margin-left: 12px; margin-right: 12px; }
      .fact-filter-panel { display: grid; margin-left: 12px; margin-right: 12px; }
      .fact-filter-chips { justify-content: flex-start; }
      .stale-history-toolbar { display: grid; }
      .stale-cleanup-form button { width: 100%; }
      .fact-maintenance-actions { min-width: 0; }
      .fact-create-form, .fact-edit form { grid-template-columns: 1fr; }
      .chapter-evidence { grid-template-columns: 1fr; }
      .quick-nav, .section-title, .filters, .reader-toolbar, .export-box, .outline-toolbar { padding-left: 12px; padding-right: 12px; }
      .outline-toolbar { position: static; display: grid; }
      .outline-toolbar-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); justify-content: stretch; }
      .outline-toolbar-actions button { justify-content: center; }
      dl, .compact-dl, .setting-dl, .outline-detail-grid { grid-template-columns: 1fr; }
      .item-head { display: block; }
      .badge-row { justify-content: flex-start; margin-top: 8px; }
      .quick-nav, .action-bar { display: grid; }
      .reader-toolbar { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .reader-toolbar > * { white-space: nowrap; }
      .view-tabs { flex-wrap: nowrap; overflow-x: auto; padding-left: 12px; padding-right: 12px; -webkit-overflow-scrolling: touch; }
      .written-section .reader-toolbar { top: 0; }
      .inline-form { display: grid; }
      .director-json { min-height: 460px; height: 62vh; }
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
        <p class="muted">项目指挥台 / ${escapeHtml(viewConfig[activeView].label)}</p>
      </div>
    </header>
    </div>

    ${projectCommandCenterHtml}

    ${projectActionsDrawerHtml}

    ${projectViewShell}
  </main>
  <script>
    (() => {
      const chapterFilterButtons = Array.from(document.querySelectorAll('[data-chapter-filter]'));
      const catalogItems = Array.from(document.querySelectorAll('.catalog-item'));
      const empty = document.querySelector('[data-catalog-empty]');
      const bodies = Array.from(document.querySelectorAll('.chapter-panel'));
      const catalogValues = new Set(['all', 'unwritten', 'written', 'current', 'review', 'director-blocked', 'no-director']);

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

      const openHashTargetPanel = () => {
        if (!window.location.hash) return;
        let id = window.location.hash.slice(1);
        try {
          id = decodeURIComponent(id);
        } catch (error) {
          return;
        }
        const target = document.getElementById(id);
        if (!target) return;
        if (target.tagName === 'DETAILS') target.open = true;
      };
      openHashTargetPanel();
      window.addEventListener('hashchange', openHashTargetPanel);

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
      document.querySelectorAll('[data-catalog-action]').forEach((button) => {
        button.addEventListener('click', () => {
          const shouldOpen = button.dataset.catalogAction === 'expand-all';
          catalogItems.forEach((item) => {
            if (!item.hidden) item.open = shouldOpen;
          });
        });
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
        button.classList.remove('is-submitting');
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

      const navigateOrReload = (nextUrl) => {
        const currentUrl = new URL(window.location.href);
        const sameDocument = currentUrl.origin === nextUrl.origin
          && currentUrl.pathname === nextUrl.pathname
          && currentUrl.search === nextUrl.search;
        const targetHref = nextUrl.toString();
        window.setTimeout(() => {
          if (sameDocument) {
            if (targetHref !== window.location.href) {
              window.history.replaceState({}, '', targetHref);
            }
            window.location.reload();
            return;
          }
          window.location.assign(targetHref);
        }, 650);
      };

      const setupFactFilters = () => {
        const panel = document.querySelector('[data-fact-filter-panel]');
        if (!panel) return;
        const buttons = Array.from(panel.querySelectorAll('[data-fact-type-filter]'));
        const cards = Array.from(document.querySelectorAll('[data-fact-card]'));
        const empty = document.querySelector('[data-fact-filter-empty]');
        const countLabel = document.querySelector('[data-fact-filter-count]');
        const params = new URLSearchParams(window.location.search);
        const knownTypes = new Set(buttons.map((button) => button.dataset.factTypeFilter));
        const initialType = knownTypes.has(params.get('fact_type')) ? params.get('fact_type') : 'all';

        const applyFilter = (type, updateUrl = true) => {
          const selected = knownTypes.has(type) ? type : 'all';
          let visibleCount = 0;
          buttons.forEach((button) => {
            button.setAttribute('aria-pressed', button.dataset.factTypeFilter === selected ? 'true' : 'false');
          });
          cards.forEach((card) => {
            const visible = selected === 'all' || card.dataset.factType === selected;
            card.hidden = !visible;
            if (visible) visibleCount += 1;
          });
          if (empty) empty.hidden = visibleCount > 0;
          if (countLabel) {
            const label = selected === 'all'
              ? '全部类型'
              : (buttons.find((button) => button.dataset.factTypeFilter === selected)?.querySelector('span')?.textContent || '当前类型');
            countLabel.textContent = '当前显示 ' + visibleCount + ' 条事实 / ' + label;
          }
          if (updateUrl) {
            const url = new URL(window.location.href);
            if (selected === 'all') url.searchParams.delete('fact_type');
            else url.searchParams.set('fact_type', selected);
            window.history.replaceState({}, '', url.toString());
          }
        };

        buttons.forEach((button) => {
          button.addEventListener('click', () => applyFilter(button.dataset.factTypeFilter || 'all'));
        });
        applyFilter(initialType, false);
      };

      setupFactFilters();

      document.querySelectorAll('[data-ai-expansion]').forEach((button) => {
        button.addEventListener('click', async () => {
          const form = button.closest('form');
          const textarea = form?.querySelector('textarea[name="expansion_request"]');
          const feedback = form?.querySelector('[data-expansion-ai-feedback]');
          if (!form || !textarea) return;

          const originalText = button.textContent || 'AI创意';
          if (feedback) {
            feedback.textContent = textarea.value.trim()
              ? '正在根据当前要求生成后续剧情设计...'
              : '正在读取项目上下文生成后续剧情设计...';
            feedback.classList.remove('is-error', 'is-success');
          }
          button.disabled = true;
          button.dataset.originalText = originalText;
          button.classList.add('is-loading');
          button.textContent = '生成中...';

          try {
            const body = new FormData(form);
            body.set('assist_nonce', String(Date.now()) + '-' + Math.random().toString(16).slice(2));
            const response = await fetch('/webhook/novel-project-expansion-ai-assist', {
              method: 'POST',
              body,
              credentials: 'same-origin',
              headers: {'X-Requested-With': 'fetch'},
            });
            const raw = await response.text();
            let payload = {};
            try {
              payload = raw ? JSON.parse(raw) : {};
            } catch (error) {
              throw new Error(resultMessageFromHtml(raw, 'AI创意返回内容格式异常。'));
            }
            if (!response.ok || payload.ok === false) {
              throw new Error(payload.message || 'AI创意生成失败，请稍后重试。');
            }
            if (!payload.expansion_request) {
              throw new Error('AI创意没有返回可填入的剧情要求。');
            }
            textarea.value = payload.expansion_request;
            textarea.dispatchEvent(new Event('input', {bubbles: true}));
            if (feedback) {
              feedback.textContent = payload.message || '已生成后续剧情设计，可继续微调后保存。';
              feedback.classList.add('is-success');
            }
            showToast('AI创意已生成', '已填入新增剧情要求，确认后再保存。');
          } catch (error) {
            if (feedback) {
              feedback.textContent = error.message || 'AI创意生成失败，请稍后重试。';
              feedback.classList.add('is-error');
            }
            showToast('AI创意未完成', error.message || 'AI创意生成失败，请稍后重试。', true);
          } finally {
            button.classList.remove('is-loading');
            restoreButton(button, originalText);
          }
        });
      });

      document.querySelectorAll('form[data-confirm-title] [name="confirm_title"]').forEach((input) => {
        input.addEventListener('input', () => input.setCustomValidity(''));
      });

      document.querySelectorAll('form[method="POST"], form[method="post"]').forEach((form) => {
        form.addEventListener('submit', async (event) => {
          const fields = Array.from(form.querySelectorAll('textarea[data-json-field]'));
          const invalidField = fields.find((textarea) => !validateJsonTextarea(textarea));
          if (invalidField) {
            event.preventDefault();
            invalidField.focus();
            return;
          }
          const expectedTitle = String(form.dataset.confirmTitle || '').trim();
          if (expectedTitle) {
            const titleInput = form.querySelector('[name="confirm_title"]');
            const actualTitle = String(titleInput?.value || '').trim();
            if (actualTitle !== expectedTitle) {
              event.preventDefault();
              if (titleInput) {
                titleInput.setCustomValidity('请输入完整项目名：' + expectedTitle);
                titleInput.reportValidity();
                titleInput.focus();
              }
              const feedback = form.querySelector('[data-async-feedback]');
              if (feedback) {
                feedback.textContent = '归档确认项目名不匹配，请完整输入：' + expectedTitle;
                feedback.classList.add('is-error');
                feedback.classList.remove('is-success');
              }
              showToast('归档未提交', '请完整输入项目名后再归档。', true);
              return;
            }
            if (titleInput) titleInput.setCustomValidity('');
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
            button.classList.add('is-submitting');
            button.textContent = button.dataset.submittingLabel
              || form.dataset.submittingLabel
              || (form.classList.contains('action-now') ? '正在启动后台任务...' : '提交中...');
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
            const resultMessage = resultMessageFromHtml(html, '操作已完成');
            if (feedback) {
              feedback.textContent = resultMessage + '，正在刷新页面...';
              feedback.classList.add('is-success');
            }
            if (dialog && typeof dialog.close === 'function') dialog.close();
            showToast('操作已完成', resultMessage);
            const nextUrl = new URL(window.location.href);
            if (form.action.includes('/webhook/novel-project-fact-action')) {
              nextUrl.searchParams.set('view', 'facts');
              const action = String(body.get('fact_action') || '');
              const factType = String(body.get('fact_type') || '');
              if (['CREATE', 'UPDATE'].includes(action) && factType) nextUrl.searchParams.set('fact_type', factType);
              if (action === 'CLEAR_INACTIVE') nextUrl.searchParams.delete('fact_type');
              nextUrl.hash = 'facts-section';
            }
            navigateOrReload(nextUrl);
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
