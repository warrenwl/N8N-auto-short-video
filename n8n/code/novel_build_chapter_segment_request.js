// n8n Code node: Build Novel Chapter Segment GLM Request
// Generates one chapter slice at a time so long chapters do not hit upstream timeouts.

const fs = require('fs');

const source = $json || {};
const configPath = $env.NOVEL_GENERATION_CONFIG_PATH || '/config/novel_generation_config.jsonc';

const fallbackConfig = {
  model: 'glm-5.1',
  temperature: 0.72,
  max_tokens: 12000,
  max_tokens_by_prompt: {
    chapter_segment: 2200,
    chapter_segment_1: 2400,
    chapter_segment_2: 1800,
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
    };
  } catch (error) {
    throw new Error(`读取小说生成配置失败：${configPath}；${error.message}`);
  }
}

function text(value, fallback = '') {
  const result = String(value ?? '').trim();
  return result || fallback;
}

function jsonText(value) {
  if (value === undefined || value === null || value === '') return '无';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function intValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function tailText(value, maxLength) {
  return Array.from(String(value || '')).slice(-maxLength).join('');
}

function asArray(value) {
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

function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (!value || typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function shortText(value, maxLength = 240) {
  return Array.from(text(value)).slice(0, maxLength).join('');
}

function compactArray(value, maxItems = 5, maxLength = 180) {
  return asArray(value)
    .map((item) => {
      if (typeof item === 'string') return shortText(item, maxLength);
      if (item && typeof item === 'object') return shortText(item.description || item.value || item.content || item.fix || JSON.stringify(item), maxLength);
      return shortText(item, maxLength);
    })
    .filter(Boolean)
    .slice(0, maxItems);
}

function compactDirectorCard(card, segmentNo) {
  if (!card || typeof card !== 'object' || !Object.keys(card).length) {
    return {global: '无', currentSegment: '无'};
  }
  const segmentPlan = asArray(card.segment_plan);
  const currentSegment = segmentPlan.find((item, index) => {
    const no = intValue(item?.segment_no || item?.no || index + 1, index + 1);
    return no === segmentNo;
  }) || {};
  const global = {
    chapter_intent: shortText(card.chapter_intent, 220),
    causal_chain: {
      from_previous: shortText(card.causal_chain?.from_previous, 180),
      trigger: shortText(card.causal_chain?.trigger, 180),
      character_motives: compactArray(card.causal_chain?.character_motives, 6, 160),
      obstacles: compactArray(card.causal_chain?.obstacles, 4, 160),
      irreversible_result: shortText(card.causal_chain?.irreversible_result, 180),
      to_next: shortText(card.causal_chain?.to_next, 180),
    },
    continuity_constraints: {
      must_remember: compactArray(card.continuity_constraints?.must_remember, 6, 160),
      must_not_break: compactArray(card.continuity_constraints?.must_not_break, 6, 160),
      future_outline_guardrails: compactArray(card.continuity_constraints?.future_outline_guardrails, 4, 160),
    },
    foreshadowing_ops: asArray(card.foreshadowing_ops).slice(0, 6).map((op) => ({
      thread_key: shortText(op?.thread_key || op?.key, 80),
      action: shortText(op?.action, 30),
      instruction: shortText(op?.instruction || op?.description, 180),
      do_not_reveal: Boolean(op?.do_not_reveal),
    })).filter((op) => op.thread_key || op.instruction),
    cross_chapter_transition: {
      mode: shortText(card.cross_chapter_transition?.mode, 40),
      allowed: card.cross_chapter_transition?.allowed !== false,
      reason: shortText(card.cross_chapter_transition?.reason, 180),
      opening_bridge: shortText(card.cross_chapter_transition?.opening_bridge, 220),
      risk: shortText(card.cross_chapter_transition?.risk, 180),
      needs_explicit_bridge: Boolean(card.cross_chapter_transition?.needs_explicit_bridge),
    },
    abruptness_risks: asArray(card.abruptness_risks).slice(0, 5).map((risk) => ({
      risk: shortText(risk?.risk || risk?.title, 120),
      fix: shortText(risk?.fix || risk?.solution || risk?.suggestion, 180),
    })).filter((risk) => risk.risk || risk.fix),
  };
  return {
    global: JSON.stringify(global, null, 2),
    currentSegment: JSON.stringify(currentSegment, null, 2),
  };
}

function segmentCountForTarget(targetWords) {
  if (targetWords <= 1500) return 1;
  if (targetWords <= 2500) return 2;
  if (targetWords <= 3500) return 3;
  if (targetWords <= 4500) return 4;
  if (targetWords <= 6500) return 5;
  return 7;
}

function segmentTargetFor(totalTarget, totalSegments, segmentNo) {
  if (totalSegments <= 1) return totalTarget;
  const weights = Array.from({length: totalSegments}, (_, index) => {
    if (index === 0) return 1.08;
    if (index === totalSegments - 1) return 0.92;
    return 1;
  });
  const sum = weights.reduce((acc, value) => acc + value, 0);
  const target = Math.round(totalTarget * weights[segmentNo - 1] / sum);
  return Math.max(520, target);
}

function buildCreativeBrief(values, totalSegments) {
  const sliceInstruction = totalSegments <= 1
    ? '本章一次生成完整正文，但仍按 segment_body 字段返回。'
    : `本章按 ${totalSegments} 个短切片生成；当前只写指定切片，禁止一次生成全章。`;
  return [
    '【创作约束】',
    `类型：${values.genre || '未设置类型'}。类型决定核心爽点、冲突形态、升级路径和章节钩子。`,
    `目标读者：${values.audience || '未设置读者'}。情绪兑现、信息密度和追更理由都要贴合这类读者。`,
    `文风：${values.style || '未设置文风'}。正文、对白、节奏和章末钩子都要按它执行。`,
    `篇幅：本章目标约 ${values.target_words_per_chapter || '未设置'} 字。${sliceInstruction}`,
  ].join('\n');
}

function summarizeGeneratedSegments(segments) {
  return segments
    .map((segment) => {
      const no = intValue(segment.segment_no, 0);
      const summary = text(segment.segment_summary || segment.summary);
      return no && summary ? `第 ${no} 段：${summary}` : '';
    })
    .filter(Boolean)
    .join('\n') || '无';
}

const config = readConfig();
const defaults = config.defaults || {};
const targetWords = Math.max(1000, intValue(source.target_words_per_chapter || defaults.target_words_per_chapter, 2000));
const carriedTotalSegments = intValue(source.chapter_segment_total, 0);
const totalSegments = clamp(carriedTotalSegments || segmentCountForTarget(targetWords), 1, 7);
const generatedSegments = asArray(source.generated_segments_json || source.generated_segments)
  .filter((segment) => text(segment.segment_body || segment.body))
  .sort((a, b) => intValue(a.segment_no, 0) - intValue(b.segment_no, 0));
const lastGeneratedSegment = generatedSegments[generatedSegments.length - 1] || {};
const requestedSegmentNo = source.next_chapter_segment_no
  || (source.parse_success ? intValue(source.segment_no || source.chapter_segment_no, generatedSegments.length) + 1 : undefined)
  || source.chapter_segment_no
  || source.segment_no
  || 1;
const segmentNo = clamp(intValue(requestedSegmentNo, 1), 1, totalSegments);
const hasMoreSegments = segmentNo < totalSegments;
const nextSegmentNo = hasMoreSegments ? segmentNo + 1 : null;
const segmentTarget = segmentTargetFor(targetWords, totalSegments, segmentNo);
const lowWords = Math.max(500, Math.round(segmentTarget * 0.85));
const highWords = Math.round(segmentTarget * 1.15);
const values = {
  ...defaults,
  ...source,
  target_words_per_chapter: targetWords,
};
const creativeBrief = buildCreativeBrief(values, totalSegments);
const blockedTopics = Array.isArray(config.blocked_topics) ? config.blocked_topics.join('、') : text(config.blocked_topics);
const previousSegmentBody = text(
  source.previous_segment_body ||
    lastGeneratedSegment.segment_body ||
    lastGeneratedSegment.body ||
    (segmentNo > 1 ? source.segment_body : '')
);
const previousSegmentSummary = text(
  source.previous_segment_summary ||
    lastGeneratedSegment.segment_summary ||
    lastGeneratedSegment.summary ||
    (segmentNo > 1 ? source.segment_summary : '')
);
const previousSegmentTail = tailText(previousSegmentBody, 420);
const previousChapterEnding = tailText(source.previous_chapter_ending || source.previous_chapter_tail, 900);
const generatedSegmentSummary = summarizeGeneratedSegments(generatedSegments);
const segmentRole = (() => {
  if (totalSegments <= 1) {
    return '完整章节：开头快速入场，中段推进冲突，结尾兑现本章事件并留下追更钩子；不要把正文写成单段长文本。';
  }
  if (segmentNo === 1) {
    return '开篇切片：开头 200 字内进入冲突或悬念，建立场景、目标和第一轮压力；停在可承接的升级点。';
  }
  if (segmentNo === totalSegments) {
    return '收束切片：承接前文，不复述；推进冲突兑现，收束本章主要事件，并留下强章末钩子。';
  }
  return '中段切片：承接上一切片，不复述；只推进一个清晰动作、对话或危机升级，并给下一切片留下自然接口。';
})();
const directorCard = parseObject(source.director_card || source.director_card_payload || source.card_payload);
const directorBrief = compactDirectorCard(directorCard, segmentNo);
const transition = directorCard.cross_chapter_transition || {};
const continuity = segmentNo === 1
  ? [
      `【上一章已批准摘要】${text(source.previous_chapter_summary, '无')}`,
      `【上一章结尾片段】${previousChapterEnding || '无'}`,
    ].join('\n')
  : [
      `【已生成分段摘要】${generatedSegmentSummary}`,
      `【上一分段摘要】${previousSegmentSummary || '无'}`,
      `【上一分段结尾片段】${previousSegmentTail || '无'}`,
    ].join('\n');

const systemPrompt = [
  '你是一名成熟的商业网文作者。',
  totalSegments <= 1
    ? '你现在负责生成一个完整章节，但必须仍用 segment_body 字段返回。'
    : '你现在只负责生成当前章节的一个短切片，不要生成全章，不要复述已生成切片。',
  '必须只输出严格 JSON，不要 Markdown，不要解释。',
].join('\n');

const userPrompt = [
  `请生成第 ${source.chapter_no || '?'} 章的第 ${segmentNo}/${totalSegments} 段正文。`,
  '',
  `【小说标题】${text(source.novel_title)}`,
  `【世界观】${text(source.world_setting)}`,
  `【故事核心】${text(source.story_core)}`,
  `【主角设定】${jsonText(source.main_character)}`,
  `【配角设定】${jsonText(source.supporting_characters)}`,
  `【反派设定】${jsonText(source.villain_setting)}`,
  `【人物关系】${jsonText(source.relationship_map)}`,
  `【组织势力】${jsonText(source.organizations)}`,
  `【关键地点】${jsonText(source.locations)}`,
  `【剧情约束】${jsonText(source.plot_constraints)}`,
  `【扩写备注】${text(source.expansion_notes)}`,
  `【能力体系】${text(source.power_system)}`,
  `【文风规则】${text(source.tone_rules)}`,
  `【禁止事项】${text(source.forbidden_rules)}；${blockedTopics}`,
  continuity,
  `【必须保持一致的关键事实】${jsonText(source.continuity_facts)}`,
  `【当前章节】第 ${source.chapter_no || '?'} 章：${text(source.outline_title)}`,
  `【本章大纲】${text(source.outline_summary)}`,
  `【本章目标】${text(source.chapter_goal)}`,
  `【本章冲突】${text(source.conflict_point)}`,
  `【情绪点】${text(source.emotional_point)}`,
  `【结尾钩子】${text(source.hook)}`,
  `【导演台全局约束】${directorBrief.global}`,
  `【当前分段导演计划】${directorBrief.currentSegment}`,
  segmentNo === 1
    ? `【跨章承接要求】转场模式：${text(transition.mode, 'direct_continuation')}；开场过桥：${text(transition.opening_bridge, '承接上一章结尾，交代人物去向、时间地点变化和本章第一幕触发原因。')}`
    : '',
  '',
  creativeBrief,
  '',
  `【切片计划】本章目标约 ${targetWords} 字，系统会分为 ${totalSegments} 段生成；当前只写第 ${segmentNo}/${totalSegments} 段。`,
  `【当前分段任务】${segmentRole}`,
  `【单段字数】控制在 ${lowWords}-${highWords} 个中文字符左右。`,
  '【导演台执行要求】必须优先遵守导演台的因果链、连续性约束、伏笔操作和当前分段计划；如果大纲与导演台冲突，以导演台为准；不得提前揭露 do_not_reveal=true 的伏笔。',
  '【事实来源硬规则】正文不得把道具线索、人物怀疑或私下推测擅自升级成新的案名、罪名、权力机构命令、强制措施、通缉、公开身份或制度性理由；如果需要制度性转场理由，只能使用大纲、导演台和已激活事实中已有的准确措辞，不得新造案名或身份。',
  segmentNo === 1 ? '【开场承接硬规则】如果不是直接续写上一章最后一幕，必须在开头 300 字内自然交代镜头转换：谁从上一章场景离开、为何到达新场景、时间过去多久、当前行动为什么现在发生。' : '',
  segmentNo > 1 ? '【承接要求】只根据已生成分段摘要和上一分段结尾续写，不要复述、复制或重写前文。' : '',
  '【角色称呼一致性】以主角设定、配角设定和反派设定中的 name 为唯一主名；只有设定集明确登记 aliases、public_name、称呼或伪名时才可使用别名；大纲里的括号身份说明必须服从设定集，不得临时创造新姓名；同一角色在正文中称呼必须前后一致。',
  '【章节标题规则】chapter_title 只写标题本身，不要带“第1章”“第一章”“第X章”等章节序号前缀；章节序号由系统根据 chapter_no 统一展示。',
  '【段落格式】segment_body 必须包含自然段换行，使用 \\n 做常规网文节奏换行；对话必须单独成段，对话前后的动作、反应、心理活动要分段；每段只承载一个动作、一次对话、一段心理或一个转折；普通段建议 40-120 个中文字符，单段超过 160 字视为失败；不要用空行凑段，不要把多轮对话写在同一段。',
  '【JSON安全】正文只能写在 segment_body 字符串里，正文不得散落到其他 JSON 字段名；不要把任何小说句子、对白、动作或心理描写作为 JSON key；正文内不要使用半角英文双引号 " 表示对白、拟声或强调，统一使用中文引号“”；半角双引号容易截断 JSON 字符串；输出前自检 JSON 顶层只能包含指定字段。',
  '【写作要求】具体场景优先；对白推动剧情；避免设定说明；不要总结代替描写；不要输出其他分段内容。',
  '',
  '输出 JSON：{"chapter_title":"","segment_no":1,"segment_body":"","segment_summary":"","bridge_to_next":"","word_count_estimate":0,"new_facts":[{"fact_type":"character","fact_key":"","fact_value":"","confidence":0.8}]}',
].filter((line) => line !== '').join('\n');

const maxTokensByPrompt = config.max_tokens_by_prompt || {};
const dynamicMaxTokens = Math.min(3600, Math.max(1800, Math.round(segmentTarget * 1.8)));
const configuredMaxTokens = maxTokensByPrompt[`chapter_segment_${segmentNo}`]
  ?? maxTokensByPrompt.chapter_segment
  ?? 0;
const maxTokens = source.max_tokens
  ?? Math.max(configuredMaxTokens, dynamicMaxTokens);
const startedAt = new Date().toISOString();

return [{
  json: {
    ...source,
    run_type: 'GENERATE_CHAPTER',
    prompt_key: `chapter_segment_${segmentNo}`,
    prompt_version: `${config.prompt_version || 'novel-v1'}-segment-${segmentNo}`,
    chapter_segment_no: segmentNo,
    chapter_segment_total: totalSegments,
    next_chapter_segment_no: nextSegmentNo,
    has_more_segments: hasMoreSegments,
    segment_target_words: segmentTarget,
    generated_segments: generatedSegments,
    generated_segments_json: JSON.stringify(generatedSegments),
    ai_run_started_at: startedAt,
    llm_request_body: {
      model: source.model || config.model || 'glm-5.1',
      temperature: source.temperature ?? config.temperature ?? 0.72,
      max_tokens: maxTokens,
      thinking: config.thinking || {type: 'disabled'},
      response_format: {type: 'json_object'},
      messages: [
        {role: 'system', content: systemPrompt},
        {role: 'user', content: userPrompt},
      ],
    },
  },
}];
