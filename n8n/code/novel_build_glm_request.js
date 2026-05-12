// n8n Code node: Build Novel GLM Request
// Reads /config/novel_generation_config.jsonc and builds an OpenAI-compatible request body.

const fs = require('fs');

const source = $json || {};
const configPath = $env.NOVEL_GENERATION_CONFIG_PATH || '/config/novel_generation_config.jsonc';

const fallbackConfig = {
  model: 'glm-5.1',
  temperature: 0.75,
  max_tokens: 12000,
  max_tokens_by_prompt: {
    story_treatment: 2800,
    director: 2200,
    chapter: 6000,
  },
  thinking: {
    type: 'disabled',
  },
  prompt_version: 'novel-v1-20260504',
  defaults: {
    genre: '都市逆袭',
    audience: '男频爽文读者',
    style: '节奏快、冲突强、章末留钩子',
    target_total_chapters: 20,
    target_words_per_chapter: 2000,
  },
  blocked_topics: ['未成年人不当内容', '高风险违法行为教学', '现实个人隐私'],
  system_prompts: {
    story_treatment: '你是一名成熟的小说开发编辑和类型片策划。必须只输出严格 JSON。',
    bible: '你是一名成熟的商业网文策划编辑。必须只输出严格 JSON。',
    outline: '你是一名商业网文大纲策划。必须只输出严格 JSON。',
    director: '你是一名商业网文导演和连续性编辑。必须只输出严格 JSON，不写正文。',
    chapter: '你是一名成熟的商业网文作者。必须只输出严格 JSON。',
    review: '你是一名严格的商业网文编辑。必须只输出严格 JSON。',
    rewrite: '你是一名商业网文改稿编辑。必须只输出严格 JSON。',
  },
  user_prompt_templates: {
    story_treatment: '请根据小说项目资料生成创作母本 Story Treatment。输出严格 JSON。',
    bible: '请根据小说项目资料生成小说 Bible。输出严格 JSON。',
    outline: '请根据小说 Bible 生成章节大纲。输出严格 JSON。',
    director: '请为当前章节生成导演台规划。只输出严格 JSON，不写正文。',
    chapter: '请根据上下文生成当前章节正文。输出严格 JSON。',
    review: '请审查章节正文。输出严格 JSON。',
    rewrite: '请根据审稿意见重写章节。输出严格 JSON。',
  },
};

function stripJsonComments(text) {
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function readConfig() {
  try {
    if (!fs.existsSync(configPath)) return fallbackConfig;
    const data = JSON.parse(stripJsonComments(fs.readFileSync(configPath, 'utf8')));
    return {
      ...fallbackConfig,
      ...data,
      defaults: {
        ...fallbackConfig.defaults,
        ...(data.defaults || {}),
      },
      max_tokens_by_prompt: {
        ...fallbackConfig.max_tokens_by_prompt,
        ...(data.max_tokens_by_prompt || {}),
      },
      system_prompts: {
        ...fallbackConfig.system_prompts,
        ...(data.system_prompts || {}),
      },
      user_prompt_templates: {
        ...fallbackConfig.user_prompt_templates,
        ...(data.user_prompt_templates || {}),
      },
    };
  } catch (error) {
    throw new Error(`读取小说生成配置失败：${configPath}；${error.message}`);
  }
}

function normalizeRunType(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (['GENERATE_STORY_TREATMENT', 'STORY_TREATMENT', 'TREATMENT', '创作母本'].includes(raw)) return 'GENERATE_STORY_TREATMENT';
  if (['GENERATE_BIBLE', 'BIBLE'].includes(raw)) return 'GENERATE_BIBLE';
  if (['GENERATE_BIBLE_PATCH', 'BIBLE_PATCH', 'PATCH_BIBLE'].includes(raw)) return 'GENERATE_BIBLE_PATCH';
  if (['GENERATE_OUTLINE', 'OUTLINE'].includes(raw)) return 'GENERATE_OUTLINE';
  if (['PLAN_CHAPTER_DIRECTOR', 'DIRECTOR', 'DIRECTOR_CARD'].includes(raw)) return 'PLAN_CHAPTER_DIRECTOR';
  if (['GENERATE_CHAPTER', 'CHAPTER'].includes(raw)) return 'GENERATE_CHAPTER';
  if (['REVIEW_CHAPTER', 'REVIEW'].includes(raw)) return 'REVIEW_CHAPTER';
  if (['REWRITE_CHAPTER', 'REWRITE'].includes(raw)) return 'REWRITE_CHAPTER';
  return raw || 'GENERATE_CHAPTER';
}

function promptKey(runType) {
  return {
    GENERATE_STORY_TREATMENT: 'story_treatment',
    GENERATE_BIBLE: 'bible',
    GENERATE_BIBLE_PATCH: 'bible_patch',
    GENERATE_OUTLINE: 'outline',
    PLAN_CHAPTER_DIRECTOR: 'director',
    GENERATE_CHAPTER: 'chapter',
    REVIEW_CHAPTER: 'review',
    REWRITE_CHAPTER: 'rewrite',
  }[runType] || 'chapter';
}

function stringifyForPrompt(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
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

function maxChapterNo(value) {
  return jsonArray(value).reduce((max, item) => {
    const chapterNo = Number(item?.chapter_no);
    return Number.isFinite(chapterNo) && chapterNo > max ? Math.round(chapterNo) : max;
  }, 0);
}

function renderTemplate(template, values) {
  return String(template || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const value = values[key];
    return value === undefined || value === null || value === '' ? '' : stringifyForPrompt(value);
  });
}

function buildCreativeBrief(values) {
  const genre = values.genre || '未设置类型';
  const audience = values.audience || '未设置读者';
  const style = values.style || '未设置文风';
  const totalChapters = values.target_total_chapters || '未设置';
  const words = values.target_words_per_chapter || '未设置';
  return [
    '【创作约束】',
    `类型：${genre}。类型决定核心爽点、冲突形态、升级路径和章节钩子，禁止写成全类型通用故事。`,
    `目标读者：${audience}。情绪兑现、信息密度和追更理由都要贴合这类读者。`,
    `文风：${style}。这是硬约束，正文、标题、钩子、审稿和重写都要按它执行。`,
    `篇幅：目标共 ${totalChapters} 章，每章 ${words} 字左右；正文允许上下浮动 15%，但不得明显短章或灌水。`,
  ].join('\n');
}

function buildStoryTreatmentInstruction(runType) {
  if (runType !== 'GENERATE_STORY_TREATMENT') return '';
  return [
    '【创作母本规则】',
    'Story Treatment 只负责小说感、情绪引擎、真相阶梯和读者承诺；不要写成角色表或世界观百科。',
    '必须把恐惧/爽点/情感兑现拆成可执行的 reveal_ladder 和 emotional_arc，避免只写一句“揭示真相”。',
    'mystery_stack 必须区分 reader_question、misdirection、truth、payoff_hint。',
    'reveal_ladder 每一项必须包含 chapter_range、visible_clue、misread、truth_progress、emotional_payoff、do_not_reveal。',
    'symbolic_motifs 要写清 motif、meaning、first_use、payoff_use。',
  ].join('\n');
}

function buildBibleTreatmentInstruction(runType, values) {
  if (runType !== 'GENERATE_BIBLE' || isBlankPromptValue(values.story_treatment)) return '';
  return [
    '【创作母本】',
    values.story_treatment,
    '设定集必须服务创作母本：保留主题内核、读者承诺、真相阶梯、情绪弧线、主角内伤、象征意象和结尾兑现。',
    '不要把创作母本压缩成几条设定；需要把它转化为角色动机、关系张力、长期约束、locations/organizations/plot_constraints 和 tone_rules。',
  ].join('\n');
}

function buildOutlineSceneBeatInstruction(runType, values) {
  if (runType !== 'GENERATE_OUTLINE') return '';
  return [
    '【场景阶梯硬规则】',
    isBlankPromptValue(values.story_treatment) ? '' : `创作母本：${values.story_treatment}`,
    '每个 chapters[] 对象必须包含 scene_beats，数量 4-8 个；每个 beat 是一个独立阅读体验，不是 summary 的改写。',
    'scene_beats[].beat_no 必须从 1 连续编号；每项必须包含 beat_goal、scene_image、new_information、emotional_shift、reader_question、do_not_reveal。',
    '如果本章承担真相揭露，必须拆成“线索 -> 误判 -> 修正 -> 情绪兑现”，不要用一句“揭示真相”概括。',
    '每章可额外包含 reader_questions 数组，记录读者读完本章应该继续追问的问题。',
  ].filter(Boolean).join('\n');
}

function buildDirectorSceneBeatInstruction(runType, values) {
  if (runType !== 'PLAN_CHAPTER_DIRECTOR') return '';
  return [
    '【本章场景阶梯】',
    values.scene_beats || '[]',
    '导演台必须优先使用 scene_beats 组织 segment_plan：每个 segment_plan 至少承接一个 beat_goal 或 emotional_shift。',
    'segment_plan 每项必须包含 source_beat_nos 数组，列出本段承接的 scene_beats[].beat_no；所有 scene_beats 至少被一个 segment_plan 覆盖。',
    '如果某个 beat 被合并、拆分或延后，必须在 causal_chain 或 abruptness_risks 说明原因。',
    '不得跳过 scene_beats 中标记 do_not_reveal 的保密边界；如果需要调整顺序，必须在 causal_chain 或 abruptness_risks 说明原因。',
  ].join('\n');
}

function buildChapterSceneBeatInstruction(runType, values) {
  if (!['GENERATE_CHAPTER', 'REWRITE_CHAPTER'].includes(runType) || isBlankPromptValue(values.scene_beats)) return '';
  return [
    '【正文场景阶梯】',
    values.scene_beats,
    '正文必须按 scene_beats 的场景推进写成具体场景；每个 beat 至少落实为可见动作、线索、情绪变化或读者疑问。',
    '正文不能把多个 beat 压缩成摘要句；每个 beat 至少要有一段可见场景承接。',
    '不得提前揭露 do_not_reveal 标记的内容。',
  ].join('\n');
}

function buildParagraphInstruction(runType) {
  if (!['GENERATE_CHAPTER', 'REWRITE_CHAPTER'].includes(runType)) return '';
  return [
    '【正文换行硬规则】',
    'chapter_body 必须使用 \\n 做常规网文节奏换行，不要输出整块大段。',
    '对话必须单独成段；对话前后的动作、反应、心理活动要分段。',
    '每段只承载一个动作、一次对话、一段心理或一个转折；普通段建议 40-120 个中文字符，单段超过 160 字视为失败。',
    '不要用空行凑段，不要把多轮对话写在同一段。',
  ].join('\n');
}

function buildNamingInstruction(runType) {
  if (runType === 'GENERATE_BIBLE') {
    return [
      '【角色命名一致性】',
      '每个角色必须建立唯一主名：name 是后续大纲和正文的唯一主名。',
      '如需要真实身份、公开身份、伪名、昵称或亲昵称呼，必须写入 aliases、public_name 或 identity_note，不得留给大纲或正文阶段临时创造。',
      '【设定集语言规则】',
      'JSON 字段名可以保持示例里的机器字段，但所有字段值、描述、角色设定内容必须使用中文。',
      '不要在字段值中输出 name、goal、identity、relationship_with_mc 等英文 schema 说明；这些只是机器字段，不是用户可读文案。',
    ].join('\n');
  }
  if (runType === 'GENERATE_OUTLINE') {
    return [
      '【角色称呼一致性】',
      '章节大纲只能使用 Bible 中已登记的 name、aliases 或 public_name。',
      '如果 Bible 没有登记别名，不得写“X（实为Y）”这类临时双名；如果公开称呼和真实身份并存，首次出现必须明确“主名（公开称呼：别名）”，后续保持一致。',
    ].join('\n');
  }
  if (['GENERATE_CHAPTER', 'REWRITE_CHAPTER'].includes(runType)) {
    return [
      '【角色称呼一致性】',
      '正文必须以 Bible 中的 name 为唯一主名；只有 Bible 明确登记 aliases 或 public_name 时才可使用别名。',
      '大纲中若出现未登记的括号身份说明，以 Bible 为准，不得把角色改名；同一角色在正文中称呼必须前后一致。',
    ].join('\n');
  }
  return '';
}

function buildChapterTitleInstruction(runType) {
  if (runType === 'GENERATE_OUTLINE') {
    return [
      '【章节标题规则】',
      'chapters[].title 只写标题本身，不要带“第1章”“第一章”“第X章”等章节序号前缀。',
      '章节序号只能写在 chapter_no 字段里；标题字段示例：“雨夜重逢”，不要写成“第2章 雨夜重逢”。',
    ].join('\n');
  }
  if (['GENERATE_CHAPTER', 'REWRITE_CHAPTER'].includes(runType)) {
    return [
      '【章节标题规则】',
      'chapter_title 只写标题本身，不要带“第1章”“第一章”“第X章”等章节序号前缀。',
      '章节序号由系统根据 chapter_no 统一展示；标题字段示例：“雨夜重逢”，不要写成“第2章 雨夜重逢”。',
    ].join('\n');
  }
  return '';
}

function buildRewriteReviewInstruction(runType) {
  if (runType !== 'REWRITE_CHAPTER') return '';
  return [
    '【重写依据优先级】',
    '必须逐条阅读并落实【审稿问题】和【修改建议】；这些是本次重写的主要修改清单，不得只做轻微润色。',
    '如果【人工意见】与智能审稿一致或为空，按智能审稿的问题与建议逐条修改。',
    '如果【人工意见】提出额外要求，优先满足人工意见，同时保留智能审稿中不冲突的问题修复。',
    '高/中风险问题必须在新正文中明显修正；低风险建议至少吸收为节奏、细节或钩子优化。',
  ].join('\n');
}

function buildOutlineContinuityInstruction(runType) {
  if (runType !== 'GENERATE_OUTLINE') return '';
  return [
    '【章节连续性与镜头转换】',
    '生成整本大纲时必须把每一章当成连续剧集，而不是互不相干的剧情节点。',
    'chapters[].summary 每章第一句必须说明它如何承接上一章的结尾压力、人物位置、未解决动作或情绪余波；第 1 章除外。',
    '允许镜头转换、视角转换、人物切换、时间跳过或剧情概述，但只能在有明确叙事目的时使用，并且不能连续多章高频使用。',
    '如果某章需要跳切，必须在 summary 中写清“转场原因 + 时间/地点变化 + 人物为何到达新场景”；不要让读者感觉上一章刚离开 A 地，下一章突然已在 B 地执行新任务。',
    '相邻章节之间必须有因果钩子：上一章 hook 要自然推到下一章 trigger；不要只靠“几天后”“与此同时”硬切。',
    '每个章节对象可额外包含 transition_from_previous、opening_state、scene_transition_mode 字段，用短中文说明跨章承接；即使系统只展示核心大纲，也要把这些信息融入 summary。',
  ].join('\n');
}

function isBlankPromptValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return !trimmed || trimmed === '{}' || trimmed === '[]' || trimmed === 'null';
  }
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function buildRewriteDirectorInstruction(runType, values) {
  if (runType !== 'REWRITE_CHAPTER' || isBlankPromptValue(values.director_card)) return '';
  return [
    '【导演台重写约束】',
    '本次重写必须继续遵守下方当前章导演台；审稿意见和人工意见用于修正正文表达、节奏和漏洞，但不能推翻导演台确认的本章功能、因果链、连续性约束和伏笔边界。',
    '若审稿/人工意见与导演台冲突，优先保留导演台的 chapter_intent、causal_chain、continuity_constraints、foreshadowing_ops 和 segment_plan，再用正文处理方式解决问题。',
    '不得提前揭露 do_not_reveal=true 的伏笔；不得删除导演台要求的不可逆结果、章末承接和关键铺垫。',
    `【当前章导演台】${values.director_card}`,
  ].join('\n');
}

function buildFactGroundingInstruction(runType) {
  if (runType === 'PLAN_CHAPTER_DIRECTOR') {
    return [
      '【事实来源闸门】',
      '导演台只能整合 Bible、当前章大纲、已通过章节摘要/尾巴、连续性事实和伏笔账本中已经存在的事实；不得把“道具线索、人物怀疑、私下推测”擅自升级成正式案名、罪名、权力机构命令、强制措施、通缉、公开身份或制度性理由。',
      '凡出现“案名、证人身份、奉命、受命、通缉、罪名、官方调查、公开追捕、集中看护”等制度性理由，必须能在当前章大纲、已激活连续性事实或上一章已通过正文中找到同等事实依据；找不到时必须改用中性措辞，例如“保护相关人物”“暂时看护”“安全转移”，并在 abruptness_risks 写明需要铺垫。',
      '不要把“某个道具/线索属于某人”自动写成“某某案/某某案相关身份”；除非上下文明确已经存在这个案名、身份或官方调查。',
      '输出 JSON 顶层必须包含 fact_source_audit，最多 6 条，逐条审计本章用到的制度性理由、新案名、新身份、新命令、新强制措施或关键转场依据；每条包含 claim、source_type、source_evidence、verdict。',
      'fact_source_audit.verdict 只能是 supported、neutralized、unsupported；unsupported 的 claim 不得进入 causal_chain、cross_chapter_transition 或 segment_plan。',
      '制度性理由的 source_type 不能写“推断”“本章新增”“创作处理”后仍判 supported；推断只允许 neutralized 或 unsupported。',
      '从“某个物品/线索属于某人”升级为“某个案名、相关人等、口头命令、集中看护、强制转移”等，属于制度性升级，必须有同级来源证据，不能靠推断成立。',
      '只要 fact_source_audit 存在 unsupported，或缺少必须审计的制度性理由，quality_gate.pass 必须为 false，blocking_issues 必须写明缺少哪条来源。',
      '如果本章需要用官方理由完成转场，但依据不足，quality_gate.pass 必须为 false，blocking_issues 写明缺少哪条前置事实。',
    ].join('\n');
  }
  if (runType === 'REVIEW_CHAPTER') {
    return [
      '【审稿事实边界】',
      '审稿可以指出断链并给出桥段修法，但不得在 suggestions 中创造新的案名、罪名、权力机构命令、强制措施、公开身份、亲属关系或制度性理由。',
      '补桥段时只能沿用正文、导演台、大纲或连续性事实中已经出现的称谓；不得把“某个线索/道具”扩写成未铺垫的“某某案相关身份”。',
      '如果正文出现了未铺垫的新官方案名或新法律理由，issues 必须加入 type="新造设定" 或 type="连续性事实污染" 的问题，说明它没有来源。',
      '合理转场只写入 cross_chapter_transition_review；allowed=true 且 should_block=false 时，不要把“跨章断链”写入 issues。',
    ].join('\n');
  }
  if (runType === 'REWRITE_CHAPTER') {
    return [
      '【重写事实边界】',
      '审稿建议和人工意见是修法清单，不是新增设定来源；不得把建议里的临时举例改写成正文事实。',
      '任何新的案名、罪名、权力机构命令、强制措施、通缉、公开身份、亲属关系或制度性理由，必须已存在于 Bible、当前章大纲、导演台、已激活连续性事实或原正文中。',
      '如果审稿建议为了修断链而提出了上下文没有的制度性理由，必须改写为已有事实的中性过桥，例如“保护相关人物”“安全看护”“在前往既定地点途中被已有势力拦下”，不得新造案名或身份。',
    ].join('\n');
  }
  return '';
}

function buildDirectorTransitionInstruction(runType, values) {
  if (runType !== 'PLAN_CHAPTER_DIRECTOR') return '';
  return [
    '【跨章镜头调度】',
    `上一章结尾片段：${values.previous_chapter_ending || '无'}`,
    `近期跨章转场记录：${stringifyForPrompt(values.previous_transition_modes || []) || '[]'}`,
    '允许合理镜头转换，但必须声明原因；不要让每一章都默认跳切。',
    'cross_chapter_transition.mode 只能是 direct_continuation、natural_scene_cut、pov_shift、time_skip、summary_bridge 之一。',
    '如果使用 natural_scene_cut、pov_shift、time_skip 或 summary_bridge，必须说明转换人物、地点、时间或剧情交代的必要性，并在 opening_bridge 写清第一段如何自然过渡。',
    '如果上一章结尾与本章开场之间缺少人物去向、地点变化或动机承接，quality_gate.pass 必须为 false，或在 abruptness_risks 中给出明确修法。',
    '输出 JSON 必须额外包含 cross_chapter_transition：{"mode":"","allowed":true,"reason":"","opening_bridge":"","risk":"","needs_explicit_bridge":true}。',
  ].join('\n');
}

function buildDirectorRepairInstruction(runType, values) {
  if (runType !== 'PLAN_CHAPTER_DIRECTOR' || isBlankPromptValue(values.director_repair_context)) return '';
  return [
    '【导演台阻断修复】',
    '这是一次针对当前章导演台阻断问题的修复重跑，不是普通重写规划。',
    `人工备注：${values.director_request_comment || '无'}`,
    `当前阻断上下文：${values.director_repair_context}`,
    '必须逐条解决 current_blocking_issues / blocking_issues：能用已有 Bible、大纲、已通过章节、连续性事实或伏笔账本支持的才可保留；没有来源的宫宴名目、案名、罪名、身份、命令或制度性理由必须删除、泛化或改成已有来源支持的中性说法，不得编造新来源硬撑。',
    `segment_plan 数量必须严格等于【正文分段数】${values.chapter_segment_total || ''}；如果上一版段数不足，本版必须补齐对应段计划。`,
    '只有在上述阻断都已实质解决时，quality_gate.pass 才能为 true 且 blocking_issues 为空；如果仍有无法解决的前置事实缺口，保持 pass=false 并只列剩余阻断。',
  ].join('\n');
}

function buildDirectorSegmentInstruction(runType, values) {
  if (runType !== 'PLAN_CHAPTER_DIRECTOR') return '';
  const segmentTotal = Number(values.chapter_segment_total || 0);
  if (!Number.isFinite(segmentTotal) || segmentTotal <= 0) return '';
  return [
    '【segment_plan 数量硬规则】',
    `本章正文分段数是 ${segmentTotal}。segment_plan 必须精确输出 ${segmentTotal} 个对象，segment_no 必须从 1 连续编号到 ${segmentTotal}。`,
    '输出 JSON 示例里的 segment_plan 只有 1 项，那只是单项字段示例；不得只复制示例第一项。',
    '每个 segment_plan 对象都必须填写 goal、conflict、information_release、emotion_turn、ending_hook，不得留空。',
  ].join('\n');
}

function buildReviewTransitionInstruction(runType, values) {
  if (runType !== 'REVIEW_CHAPTER') return '';
  return [
    '【跨章承接审稿】',
    `上一章摘要：${values.previous_chapter_summary || '无'}`,
    `上一章结尾片段：${values.previous_chapter_ending || '无'}`,
    `当前章导演台：${values.director_card || '无'}`,
    '请单独判断当前章开头与上一章结尾的关系。镜头转换是允许的，但必须属于转换视角、转换人物、交代剧情、时间/地点自然过渡等合理情况。',
    'direct_continuation 只允许用于同一时间、同一地点、同一行动链的无缝续写；只要人物已经换地点、换时间、换视角，或上一章目标地点与本章开场地点不同，就不能标 direct_continuation。',
    '如果上一章明确写了“离开当前地点、前往某处、受伤、昏迷、被带走/被押走”等未收束动作，而当前章开头已经在另一个地点或另一个任务中，前 300 字必须交代“谁安排/带走/转送、时间过去多久、为何到达新场景”。缺少这些桥段时 allowed 必须为 false，should_block 必须为 true。',
    '如果当前章频繁跳过“人物为何到新地点、上一章动作如何收束、谁把谁带到哪里、时间过去多久”等必要桥段，应判为跨章断链风险。',
    '如果是合理镜头转换，也要在分析中说明 mode、依据和过渡手法，但不要把“跨章断链”写进 issues；只有不合理断链才在 issues 加入 type="跨章断链" 的问题，并给出可操作修法。',
    'mode 只能是 direct_continuation、natural_scene_cut、pov_shift、time_skip、summary_bridge 之一；“直接转场”“时间流逝”“空间转换”不能写成 direct_continuation。',
    '输出 JSON 必须额外包含 cross_chapter_transition_review：{"mode":"","allowed":true,"evidence":"","risk":"","fix":"","should_block":false}。',
  ].join('\n');
}

function buildReviewScoreInstruction(runType) {
  if (runType !== 'REVIEW_CHAPTER') return '';
  return [
    '【评分硬规则】',
    '所有评分字段 consistency_score、readability_score、plot_score、commercial_score、total_score 必须使用 0-100 分制整数。',
    '禁止使用 0-10 分制或 1-10 分制；例如优秀章节应输出 90、92、95，不要输出 9、9.2、9.5。',
    'total_score 必须是 0-100 的综合分，不是四项平均后的 0-10 小数。',
  ].join('\n');
}

function buildJsonSafetyInstruction(runType) {
  if (!['GENERATE_CHAPTER', 'REWRITE_CHAPTER'].includes(runType)) return '';
  return [
    '【JSON字段白名单】',
    '输出顶层只能包含 chapter_title、chapter_body、chapter_summary、word_count_estimate、new_facts、foreshadowing。',
    '正文只能写在 chapter_body 字符串里，正文不得散落到其他 JSON 字段名；不要把任何小说句子、对白、动作或心理描写作为 JSON key。',
    '正文内不要使用半角英文双引号 " 表示对白、拟声或强调，统一使用中文引号“”；半角双引号容易截断 JSON 字符串。',
    'new_facts[].fact_key 必须是中文短标题，例如“宋岩动机”“红纸扎女尸失踪”；不得输出 songyan_reaction、red_corpse_disappearance 这类英文/下划线机器键。',
  ].join('\n');
}

function expansionScopeLabel(value) {
  return {
    append_only: '只追加新章节',
    rewrite_unwritten: '重排未写章节',
    regenerate_outline: '高风险重排全部大纲',
  }[String(value || 'append_only')] || '只追加新章节';
}

function buildExpansionInstruction(runType, values) {
  if (!['GENERATE_OUTLINE', 'PLAN_CHAPTER_DIRECTOR'].includes(runType)) return '';
  const request = String(values.expansion_request || '').trim();
  if (!request) return '';
  const constraints = String(values.expansion_constraints || '').trim()
    || '已批准正文不改；已激活事实不破坏；新增剧情必须承接现有大纲、连续性事实和人物动机。';
  const shared = [
    '【项目扩写计划】',
    `新增剧情要求：${request}`,
    `扩写范围：${expansionScopeLabel(values.expansion_scope)}`,
    `保留约束：${constraints}`,
  ];
  if (runType === 'GENERATE_OUTLINE') {
    const targetTotal = Number(values.target_total_chapters || 0);
    const scope = String(values.expansion_scope || 'append_only');
    const approvedMax = maxChapterNo(values.approved_chapters_raw);
    const existingMax = maxChapterNo(values.existing_outlines_raw);
    const outlineRequestComment = String(values.outline_request_comment || '').trim();
    const expectedStart = scope === 'regenerate_outline'
      ? 1
      : (scope === 'rewrite_unwritten'
        ? Math.max(1, approvedMax + 1)
        : Math.max(1, existingMax + 1));
    const coverageRule = Number.isFinite(targetTotal) && targetTotal > 0 && expectedStart <= targetTotal
      ? [
          '【大纲覆盖范围规则】',
          `系统根据目标章节数、扩写范围、已批准正文和已有大纲动态计算出本次需要生成：第 ${expectedStart} 章到第 ${Math.round(targetTotal)} 章。`,
          `chapters[].chapter_no 必须覆盖这个范围内的每一个整数；最大 chapter_no 必须等于当前目标总章数 ${Math.round(targetTotal)}。`,
          '不要沿用旧目标章节数停在旧大纲最后一章；如果目标章节数变化，必须按当前目标补齐。',
          '如果已有大纲、设定备注或旧草稿在小于当前目标总章数的章节出现“大结局、全书完、主线收束、全书收束、故事落幕”等旧结局表述，必须视为旧版本参考或阶段性误导，不得在该章节提前完结；真正终局只能安排在当前目标最后一章。',
          '除最后一章外，chapters[].title、summary、chapter_goal、conflict_point、emotional_point、hook 不得使用“大结局、全书完、全书完结、主线收束、全书收束、故事落幕、落下帷幕”等终局式表达。',
        ].join('\n')
      : '';
    return [
      ...shared,
      outlineRequestComment ? `本次大纲请求备注：${outlineRequestComment}` : '',
      coverageRule,
      `已有大纲：${values.existing_outlines || '[]'}`,
      `已批准章节摘要：${values.approved_chapters || '[]'}`,
      '扩写执行规则：',
      '1. 如果扩写范围是“只追加新章节”，必须保留已有大纲的章节编号、标题和已批准章节事实；新增章节从现有大纲之后自然延展，不要重写已经存在的章节。',
      '2. 如果扩写范围是“重排未写章节”，可以调整尚未生成/尚未批准章节的大纲，但必须把已批准章节当作硬事实。',
      '3. 如果扩写范围是“高风险重排全部大纲”，也不能要求修改已批准正文；需要把已批准正文转化为新大纲的既定前史。',
      '4. 新增剧情要求必须具体落到章节 summary、chapter_goal、conflict_point、emotional_point 或 hook 中，不要只在总述里提到。',
      '5. 重大秘密、身世、幕后真相、感情确认、反派底牌等信息必须按“新增剧情要求”和“本次大纲请求备注”里的节奏分层释放；如果用户要求缓慢揭示、后期揭露或先甜后虐，前段只能安排线索、误导、局部证据和情绪铺垫，不得直接写成“真相大白/身份大白/全部揭露”。',
      '6. 当最新项目扩写要求与旧大纲、旧扩写备注或设定建议冲突时，以最新项目扩写要求和本次大纲请求备注为准；旧内容只作为连续性参考。',
    ].join('\n');
  }
  return [
    ...shared,
    '导演台执行规则：当前章如果属于扩写新增/重排范围，必须落实新增剧情要求；如果当前章已经受已批准正文约束，优先保证连续性和保留约束。',
  ].join('\n');
}

function includesAny(value, markers) {
  return markers.some((marker) => String(value || '').includes(marker));
}

function appendInstructionOnce(prompt, markers, instruction) {
  if (!instruction) return prompt;
  const markerList = Array.isArray(markers) ? markers : [markers];
  return includesAny(prompt, markerList) ? prompt : `${prompt}\n\n${instruction}`;
}

const config = readConfig();
const defaults = config.defaults || {};
const runType = normalizeRunType(source.run_type || source.job_type || source.type);
const key = promptKey(runType);
const startedAt = new Date().toISOString();
const chapterBody = String(source.chapter_body || source.body || '');
const chapterWordCount = Number(source.chapter_word_count ?? source.word_count ?? source.word_count_estimate);
const targetWords = Number(source.target_words_per_chapter || defaults.target_words_per_chapter || 0);
const directorCardText = stringifyForPrompt(source.director_card || source.director_card_payload || source.card_payload);
const baseValues = {
  ...defaults,
  ...source,
  blocked_topics: Array.isArray(config.blocked_topics) ? config.blocked_topics.join('、') : String(config.blocked_topics || ''),
  main_character: stringifyForPrompt(source.main_character),
  supporting_characters: stringifyForPrompt(source.supporting_characters),
  villain_setting: stringifyForPrompt(source.villain_setting),
  relationship_map: stringifyForPrompt(source.relationship_map),
  organizations: stringifyForPrompt(source.organizations),
  locations: stringifyForPrompt(source.locations),
  plot_constraints: stringifyForPrompt(source.plot_constraints),
  expansion_notes: String(source.expansion_notes || ''),
  selling_points: stringifyForPrompt(source.selling_points),
  story_treatment: stringifyForPrompt(source.story_treatment),
  scene_beats: stringifyForPrompt(source.scene_beats || source.outline_scene_beats),
  reader_questions: stringifyForPrompt(source.reader_questions || source.outline_reader_questions),
  existing_outlines: stringifyForPrompt(source.existing_outlines),
  existing_outlines_raw: source.existing_outlines,
  approved_chapters: stringifyForPrompt(source.approved_chapters),
  approved_chapters_raw: source.approved_chapters,
  expansion_request: String(source.expansion_request || ''),
  expansion_scope: String(source.expansion_scope || 'append_only'),
  expansion_constraints: String(source.expansion_constraints || ''),
  continuity_facts: stringifyForPrompt(source.continuity_facts || source.facts),
  director_repair_context: stringifyForPrompt(source.director_repair_context),
  director_request_comment: String(source.director_request_comment || ''),
  director_card: directorCardText,
  director_card_payload: directorCardText,
  novel_bible: stringifyForPrompt(source.novel_bible || source.bible),
  issues: stringifyForPrompt(source.issues),
  suggestions: stringifyForPrompt(source.suggestions),
  chapter_word_count: Number.isFinite(chapterWordCount) && chapterWordCount > 0
    ? Math.round(chapterWordCount)
    : Array.from(chapterBody).filter((char) => !/\s/.test(char)).length,
  chapter_body_chars: Array.from(chapterBody).length,
  target_word_lower_bound: targetWords > 0 ? Math.round(targetWords * 0.85) : '',
  target_word_upper_bound: targetWords > 0 ? Math.round(targetWords * 1.15) : '',
};
const values = {
  ...baseValues,
  creative_brief: buildCreativeBrief(baseValues),
};

const systemPrompt = renderTemplate(config.system_prompts[key], values);
const renderedUserPrompt = renderTemplate(config.user_prompt_templates[key], values);
let maxTokens = source.max_tokens ?? (config.max_tokens_by_prompt || {})[key] ?? config.max_tokens ?? 12000;
if (runType === 'PLAN_CHAPTER_DIRECTOR' && source.max_tokens === undefined) {
  const segmentTotal = Number(source.chapter_segment_total || 0);
  if (segmentTotal >= 6) {
    maxTokens = Math.max(Number(maxTokens) || 0, 4200);
  } else if (segmentTotal >= 4) {
    maxTokens = Math.max(Number(maxTokens) || 0, 3200);
  }
}
const userPromptWithBrief = renderedUserPrompt.includes('【创作约束】')
  ? renderedUserPrompt
  : `${renderedUserPrompt}\n\n${values.creative_brief}`;
const userPromptWithTreatment = appendInstructionOnce(
  appendInstructionOnce(
    userPromptWithBrief,
    '【创作母本规则】',
    buildStoryTreatmentInstruction(runType)
  ),
  '【创作母本】',
  buildBibleTreatmentInstruction(runType, values)
);
const userPromptWithNaming = appendInstructionOnce(
  userPromptWithTreatment,
  ['角色命名必须建立唯一主名', '【角色命名一致性】', '角色称呼一致性'],
  buildNamingInstruction(runType)
);
const userPromptWithTitle = appendInstructionOnce(
  userPromptWithNaming,
  '【章节标题规则】',
  buildChapterTitleInstruction(runType)
);
const userPromptWithExpansion = appendInstructionOnce(
  userPromptWithTitle,
  '【项目扩写计划】',
  buildExpansionInstruction(runType, values)
);
const userPromptWithOutlineContinuity = appendInstructionOnce(
  appendInstructionOnce(
    userPromptWithExpansion,
    '【场景阶梯硬规则】',
    buildOutlineSceneBeatInstruction(runType, values)
  ),
  '【章节连续性与镜头转换】',
  buildOutlineContinuityInstruction(runType)
);
const userPromptWithRewriteReview = appendInstructionOnce(
  userPromptWithOutlineContinuity,
  ['【重写依据优先级】', '重写依据优先级'],
  buildRewriteReviewInstruction(runType)
);
const userPromptWithRewriteDirector = appendInstructionOnce(
  userPromptWithRewriteReview,
  '【导演台重写约束】',
  buildRewriteDirectorInstruction(runType, values)
);
const userPromptWithFactGrounding = appendInstructionOnce(
  userPromptWithRewriteDirector,
  ['【事实来源闸门】', '【审稿事实边界】', '【重写事实边界】'],
  buildFactGroundingInstruction(runType, values)
);
const userPromptWithDirectorTransition = appendInstructionOnce(
  appendInstructionOnce(
    appendInstructionOnce(
      userPromptWithFactGrounding,
      '【本章场景阶梯】',
      buildDirectorSceneBeatInstruction(runType, values)
    ),
    '【正文场景阶梯】',
    buildChapterSceneBeatInstruction(runType, values)
  ),
  '【跨章镜头调度】',
  buildDirectorTransitionInstruction(runType, values)
);
const userPromptWithDirectorSegments = appendInstructionOnce(
  userPromptWithDirectorTransition,
  '【segment_plan 数量硬规则】',
  buildDirectorSegmentInstruction(runType, values)
);
const userPromptWithReviewTransition = appendInstructionOnce(
  appendInstructionOnce(
    userPromptWithDirectorSegments,
    '【导演台阻断修复】',
    buildDirectorRepairInstruction(runType, values)
  ),
  '【跨章承接审稿】',
  buildReviewTransitionInstruction(runType, values)
);
const userPromptWithReviewScore = appendInstructionOnce(
  userPromptWithReviewTransition,
  '【评分硬规则】',
  buildReviewScoreInstruction(runType)
);
const paragraphInstruction = buildParagraphInstruction(runType);
const userPromptWithParagraph = appendInstructionOnce(
  userPromptWithReviewScore,
  '【正文换行硬规则】',
  paragraphInstruction
);
const userPrompt = appendInstructionOnce(
  userPromptWithParagraph,
  '【JSON字段白名单】',
  buildJsonSafetyInstruction(runType)
);
const messages = [
  {role: 'system', content: systemPrompt},
  {role: 'user', content: userPrompt},
];

return [{
  json: {
    ...source,
    run_type: runType,
    prompt_key: key,
    prompt_version: config.prompt_version || 'novel-v1',
    prompt_config_path: configPath,
    prompt_messages_json: JSON.stringify(messages),
    ai_run_started_at: startedAt,
    llm_request_body: {
      model: source.model || config.model || 'glm-5.1',
      temperature: source.temperature ?? config.temperature ?? 0.75,
      max_tokens: maxTokens,
      thinking: config.thinking || {type: 'disabled'},
      response_format: {type: 'json_object'},
      messages,
    },
  },
}];
