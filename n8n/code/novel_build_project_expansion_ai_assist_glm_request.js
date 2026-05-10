// n8n Code node: Build Novel Project Expansion AI Assist GLM Request
// Builds an OpenAI-compatible GLM request for project expansion planning assistance.

const source = $json || {};

function text(value) {
  return String(value ?? '').trim();
}

function compact(value, limit) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const normalized = text(raw).replace(/\s+/g, ' ');
  if (!limit || normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit)}...`;
}

function toJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function expansionScopeLabel(value) {
  return {
    append_only: '只追加新章节',
    rewrite_unwritten: '重排未写章节',
    regenerate_outline: '高风险重排全部大纲',
  }[text(value) || 'append_only'] || '只追加新章节';
}

const userRequest = compact(source.expansion_request || source.user_request, 1200);
const title = compact(source.title, 80);
const genre = text(source.genre || '商业网文');
const audience = text(source.audience || '中文网文读者');
const style = text(source.style || '节奏快、冲突强、章末留钩子');
const scope = text(source.expansion_scope || 'append_only');
const targetTotalChapters = Number(source.target_total_chapters || 20);
const targetWordsPerChapter = Number(source.target_words_per_chapter || 2000);
const constraints = compact(source.expansion_constraints, 900);
const bible = toJson(source.novel_bible || source.bible, {});
const outlines = toJson(source.existing_outlines || source.outlines, []);
const approvedChapters = toJson(source.approved_chapters, []);
const facts = toJson(source.continuity_facts || source.facts, []);

const systemPrompt = [
  '你是一名成熟的中文商业网文责编和长篇连载剧情策划。',
  '你只输出严格 JSON，不要 Markdown，不要解释，不要代码块。',
  '你的任务是生成“可直接放入项目扩写计划文本框”的后续剧情设计，不保存、不改正文、不激活事实。',
].join('\n');

const outputSchema = [
  '输出 JSON 顶层只能包含：',
  '{"expansion_request":"","beat_design":[],"setting_additions":[],"risk_notes":[],"message":""}',
  'expansion_request：300 到 900 个中文字符，写成编辑可确认的扩写要求，必须包含新增人物线/冲突/反派或势力/伏笔/章节落点/保留约束。',
  'beat_design：3 到 6 条后续桥段设计，每条包含 chapter_range、purpose、conflict、hook。',
  'setting_additions：建议新增的人物、组织/商会/家族/势力、地点或剧情约束。',
  'risk_notes：与已批准正文、既有事实或人物动机可能冲突的风险和规避方案。',
  'message：40 字内中文提示。',
].join('\n');

const userPrompt = [
  '请根据当前项目资料，生成后续剧情扩写设计。',
  '',
  '【项目资料】',
  `小说名：${title || '未命名'}`,
  `类型/读者/文风：${genre} / ${audience} / ${style}`,
  `目标篇幅：${Number.isFinite(targetTotalChapters) ? targetTotalChapters : 20} 章，每章 ${Number.isFinite(targetWordsPerChapter) ? targetWordsPerChapter : 2000} 字左右`,
  `扩写范围：${expansionScopeLabel(scope)}`,
  `保留约束：${constraints || '已批准正文不改；已激活事实不破坏；新增剧情承接现有大纲。'}`,
  '',
  '【用户粗略要求】',
  userRequest || '用户还没有填写具体要求，请基于当前项目最自然的后续矛盾，提出一条可执行的扩写剧情设计。',
  '',
  '【当前设定集】',
  compact(bible, 4500),
  '',
  '【已有大纲】',
  compact(outlines, 3800),
  '',
  '【已批准章节摘要】',
  compact(approvedChapters, 2600),
  '',
  '【已激活连续性事实】',
  compact(facts, 2200),
  '',
  '要求：',
  '1. 不要要求修改已批准正文；如果需要解释旧章节，只能写成后续补充或反转伏笔。',
  '2. 如果选择只追加新章节，新增冲突必须从现有最后一段剧情自然延展。',
  '3. 如果用户提到人物、商会、家族、势力、感情线或伏笔，必须具体化为后续桥段和设定补丁方向。',
  '4. 输出的 expansion_request 要能被后续设定补丁、大纲和导演台直接读取，避免抽象口号。',
  '5. 风险要写清“可能冲突点”和“规避写法”，不要为了创意强行推翻既有事实。',
  outputSchema,
].join('\n');

const messages = [
  {role: 'system', content: systemPrompt},
  {role: 'user', content: userPrompt},
];

return [{
  json: {
    ...source,
    run_type: 'PROJECT_EXPANSION_ASSIST',
    prompt_key: 'project_expansion_assist',
    prompt_version: 'novel-expansion-assist-v1-20260509',
    prompt_messages_json: JSON.stringify(messages),
    ai_run_started_at: new Date().toISOString(),
    llm_request_body: {
      model: source.model || 'glm-5.1',
      temperature: 0.86,
      top_p: 0.9,
      max_tokens: 1600,
      thinking: {type: 'disabled'},
      response_format: {type: 'json_object'},
      messages,
    },
  },
}];
