// n8n Code node: Build Novel Project AI Assist GLM Request
// Builds a small OpenAI-compatible GLM request for create-page title/idea assistance.

const source = $json || {};

function text(value) {
  return String(value ?? '').trim();
}

function compact(value, limit) {
  const normalized = text(value).replace(/\s+/g, ' ');
  if (!limit || normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit)}...`;
}

const assistType = text(source.assist_type) === 'title' ? 'title' : 'idea';
const title = compact(source.title, 80);
const premise = compact(source.premise, 800);
const creativeDirection = compact(source.creative_direction, 1000);
const previousAiTitle = compact(source.previous_ai_title, 80);
const previousAiPremise = compact(source.previous_ai_premise, 800);
const genre = text(source.genre || '都市逆袭');
const audience = text(source.audience || '中文网文读者');
const style = text(source.style || '节奏快、冲突强、章末留钩子');
const targetTotalChapters = Number(source.target_total_chapters || 20);
const targetWordsPerChapter = Number(source.target_words_per_chapter || 2000);
const taskLabel = assistType === 'title' ? '小说标题' : '核心创意';
const assistNonce = text(source.assist_nonce || source.requested_at || new Date().toISOString());
const hasCreativeDirection = assistType === 'idea' && Boolean(creativeDirection);

function hash(value) {
  let result = 0;
  const raw = String(value || '');
  for (let index = 0; index < raw.length; index += 1) {
    result = ((result << 5) - result + raw.charCodeAt(index)) | 0;
  }
  return Math.abs(result);
}

function pick(list, seed, offset) {
  return list[(seed + offset) % list.length];
}

function genreInstruction(value) {
  if (/玄幻|仙侠|异世界|东方玄幻/.test(value)) {
    return '玄幻/仙侠：必须围绕修炼体系、境界压力、宗门/家族/秘境冲突、传承代价或天命反噬展开；不得写成都市商业重生。';
  }
  if (/悬疑|灵异/.test(value)) {
    return '悬疑/灵异：必须围绕案件、线索、证词、失踪/死亡谜团、身份反转或超自然规则展开；爽点是破局和真相逼近，不是单纯升级或商战。';
  }
  if (/言情|甜宠|豪门/.test(value)) {
    return '言情/甜宠：必须围绕亲密关系、身份差、误会/契约/重逢、情绪拉扯和双向选择展开；爽点是情绪兑现和关系推进。';
  }
  if (/科幻|末世/.test(value)) {
    return '科幻/末世：必须围绕技术异常、灾变倒计时、生存秩序、资源压力、系统漏洞或未来信号展开；爽点是技术破局和危机升级。';
  }
  if (/历史|架空/.test(value)) {
    return '历史/架空：必须围绕权谋处境、身份阶层、制度压力、战局/朝堂/家族利益展开；爽点是谋略反杀和局势翻盘。';
  }
  if (/游戏|竞技/.test(value)) {
    return '游戏/竞技：必须围绕规则理解、版本差、团队协作、赛事/副本目标和操作反转展开；爽点是战术破局和高光胜利。';
  }
  if (/种田|经营/.test(value)) {
    return '种田/经营：必须围绕资源经营、产业搭建、人情关系、危机周转和阶段性收益展开；爽点是从小局面滚出大规模优势。';
  }
  if (/都市|现实/.test(value)) {
    return '都市/现实：必须围绕现实压力、职业/商业/家庭/阶层困境、资源争夺和人际背叛展开；爽点是短目标兑现和压迫释放。';
  }
  return '通用商业网文：必须让类型、主角职业、主要冲突和爽点强绑定，不能写成任何类型都能套用的抽象故事。';
}

function audienceInstruction(value) {
  if (/男频|爽文/.test(value)) return '男频/爽文读者：目标清晰、压力直接、反击快，必须有可视化收益或地位反转。';
  if (/女频|情感/.test(value)) return '女频/情感读者：人物关系和情绪动机必须清楚，外部事件要推动关系选择和自我成长。';
  if (/悬疑|烧脑/.test(value)) return '悬疑烧脑读者：每个设定都要带线索价值，必须有可追踪谜面和反证空间。';
  if (/轻松|下饭/.test(value)) return '轻松读者：压力不能过度沉重，冲突要清楚，反转要有趣且易读。';
  return '中文网文读者：开局目标、持续矛盾、爽点兑现和追更理由都必须明确。';
}

function styleInstruction(value) {
  if (/悬疑|反转|克制/.test(value)) return '文风执行：少口号，多线索；用反证、误导和信息差制造推进。';
  if (/甜宠|互动|情绪/.test(value)) return '文风执行：多关系张力和场景互动，冲突要落在人心选择上。';
  if (/幽默|轻松/.test(value)) return '文风执行：用误会、反差和轻快对白推进，避免沉重复仇腔。';
  if (/热血|升级/.test(value)) return '文风执行：阶段目标、能力增长和强敌压迫要清晰，结尾必须抬高下一关。';
  if (/现实|细节/.test(value)) return '文风执行：动机和细节要可信，爽点来自现实逻辑下的漂亮反击。';
  return '文风执行：节奏要快，冲突要强，章末必须留下新的问题或危机。';
}

function diversityBrief(seed) {
  const protagonist = [
    '主角身份必须具体到职业/阶层/能力缺口',
    '主角必须有一个会反噬自己的隐秘优势',
    '主角开局不能是万能强者，必须被一个现实困境卡住',
    '主角的目标必须能在前三章产生可见结果',
  ];
  const engine = [
    '叙事引擎选“倒计时压力”',
    '叙事引擎选“身份伪装/误认”',
    '叙事引擎选“资源争夺”',
    '叙事引擎选“规则漏洞”',
    '叙事引擎选“旧关系反咬”',
    '叙事引擎选“公开危机倒逼选择”',
  ];
  const opening = [
    '开篇场景从一场失败或羞辱开始',
    '开篇场景从一次交易/审判/考核开始',
    '开篇场景从一个不可解释的证据开始',
    '开篇场景从主角被迫保护某个关键人/物开始',
    '开篇场景从倒计时或最后通牒开始',
  ];
  const payoff = [
    '核心爽点偏“反杀布局”',
    '核心爽点偏“关系选择”',
    '核心爽点偏“线索闭环”',
    '核心爽点偏“经营滚雪球”',
    '核心爽点偏“越级突破”',
    '核心爽点偏“技术/规则破局”',
  ];
  return [
    pick(protagonist, seed, 1),
    pick(engine, seed, 3),
    pick(opening, seed, 5),
    pick(payoff, seed, 7),
  ].join('；');
}

const diversitySeed = hash([assistNonce, assistType, genre, audience, style, title, premise, creativeDirection, previousAiTitle, previousAiPremise].join('|'));
const avoidPrevious = [
  previousAiTitle ? `上一轮 AI 标题：${previousAiTitle}` : '',
  previousAiPremise ? `上一轮 AI 创意：${previousAiPremise}` : '',
].filter(Boolean).join('\n');
const creativeDirectionBlock = assistType === 'idea' && creativeDirection
  ? [
    '【创意建议方向】',
    creativeDirection,
    '这是本次生成的最高内容约束，优先级高于类型/读者/文风差异化、请求随机种子和上一轮避重要求。',
    '必须从以上方向中提取人物关系、情绪走向、伏笔/势力/冲突等硬要素，并把这些硬要素明确写进 premise 正文。',
    '如果创意建议方向与类型/读者/文风存在冲突，以创意建议方向为准，再把类型要求改写成兼容表达。',
    '可以补全结构、商业钩子和差异化细节，但不得反向违背、弱化、跳过或只在 rationale/message 中提到这些方向。',
    '',
  ]
  : [];

const systemPrompt = [
  '你是一名成熟的中文商业网文策划编辑。',
  '你只输出严格 JSON，不要 Markdown，不要解释，不要代码块。',
  '生成内容必须适合创建小说项目，避免未成年人不当内容、高风险违法教学、现实个人隐私和露骨内容。',
  '当用户提供创意建议方向时，必须优先服从该方向；随机性只能用于补充细节，不能覆盖方向。',
].join('\n');

const outputSchema = [
  '输出 JSON 顶层只能包含：',
  '{"title":"","premise":"","alternatives":[],"rationale":"","message":""}',
  'title：2 到 10 个中文字符，像正式书名；不要书名号，不要“第X章”，不要泛泛写类型名。',
  'premise：120 到 260 个中文字符；必须包含主角身份、触发事件、主要冲突、爽点/情绪兑现、章末或长线钩子。',
  'alternatives：2 到 4 个备选短标题。',
  'rationale/message：短中文说明，最多 40 字。',
].join('\n');

const userPrompt = [
  `请生成${taskLabel}。`,
  '',
  '【项目约束】',
  `类型：${genre}`,
  `目标读者：${audience}`,
  `文风：${style}`,
  `篇幅：目标 ${Number.isFinite(targetTotalChapters) ? targetTotalChapters : 20} 章，每章 ${Number.isFinite(targetWordsPerChapter) ? targetWordsPerChapter : 2000} 字左右`,
  `已有标题：${title || '未填写'}`,
  `已有核心创意：${premise || '未填写'}`,
  `请求随机种子：${assistNonce}`,
  '',
  ...creativeDirectionBlock,
  '【类型/读者/文风差异化硬约束】',
  genreInstruction(genre),
  audienceInstruction(audience),
  styleInstruction(style),
  `本次差异化方向：${diversityBrief(diversitySeed)}`,
  avoidPrevious ? `【避开上一轮】\n${avoidPrevious}\n必须换主角身份、冲突来源、开篇场景或叙事引擎中的至少两项；不得只替换标题同义词。` : '',
  '',
  assistType === 'title'
    ? '【本次任务】优先生成 title；如果已有核心创意为空，请同时补一条与标题匹配的 premise。'
    : hasCreativeDirection
      ? '【本次任务】优先生成 premise；premise 必须显式落实“创意建议方向”的关键要求，如果已有标题为空，请同时给出一个 title。'
      : '【本次任务】优先生成 premise；如果已有标题为空，请同时给出一个 title。',
  '生成结果要有商业网文的明确钩子，不能只是抽象口号。不同类型之间必须明显不同：主角身份、冲突系统、爽点兑现和开篇压力都要随类型变化。',
  hasCreativeDirection ? '最终自检：premise 正文里必须能看出创意建议方向，不允许只在解释字段里说“已遵循”。' : '',
  outputSchema,
].join('\n');

const messages = [
  {role: 'system', content: systemPrompt},
  {role: 'user', content: userPrompt},
];

return [{
  json: {
    ...source,
    run_type: 'PROJECT_CREATE_ASSIST',
    prompt_key: `project_create_${assistType}`,
    prompt_version: 'novel-create-assist-v1-20260510-direction-lock',
    diversity_seed: diversitySeed,
    creative_direction_applied: hasCreativeDirection,
    prompt_messages_json: JSON.stringify(messages),
    ai_run_started_at: new Date().toISOString(),
    llm_request_body: {
      model: source.model || 'glm-5.1',
      temperature: hasCreativeDirection ? 0.72 : 0.98,
      top_p: hasCreativeDirection ? 0.86 : 0.92,
      max_tokens: 900,
      thinking: {type: 'disabled'},
      response_format: {type: 'json_object'},
      messages,
    },
  },
}];
