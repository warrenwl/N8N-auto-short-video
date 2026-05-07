// n8n Code node: Parse Novel GLM JSON
// Extracts text from an OpenAI-compatible response and normalizes useful fields.

function extractText(json) {
  if (!json || typeof json !== 'object') return '';
  if (json.llm_response?.choices?.[0]?.message?.content) return json.llm_response.choices[0].message.content;
  if (json.choices?.[0]?.message?.content) return json.choices[0].message.content;
  if (typeof json.output === 'string') return json.output;
  if (typeof json.text === 'string') return json.text;
  if (typeof json.response === 'string') return json.response;
  if (typeof json.message?.content === 'string') return json.message.content;
  return JSON.stringify(json);
}

function cleanJsonText(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return s;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function text(value) {
  return String(value ?? '').trim();
}

function normalizeChapterTitle(value, fallback = '') {
  const raw = text(value);
  const fallbackText = text(fallback);
  if (!raw) return fallbackText;
  const cleaned = raw
    .replace(/^第\s*(?:[0-9０-９]+|[一二三四五六七八九十百千万零〇两]+|[Xx]+)\s*章\s*[：:、，,.．。-]?\s*/, '')
    .trim();
  return cleaned || fallbackText || raw;
}

function splitLongNarration(value, maxLength = 120) {
  const source = text(value);
  if (!source) return [];
  const sentences = source.match(/[^。！？!?；;]+[。！？!?；;]+[”」』’]?|[^。！？!?；;]+$/g) || [source];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;
    if (current && (current.length + piece.length > maxLength || startsNewBeat(piece))) {
      chunks.push(current);
      current = '';
    }
    if (piece.length > maxLength * 1.5) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      const clauses = piece.match(/[^，,、]+[，,、]?|[^，,、]+$/g) || [piece];
      let clauseBuffer = '';
      for (const clause of clauses) {
        const cleanedClause = clause.trim();
        if (!cleanedClause) continue;
        if (clauseBuffer && clauseBuffer.length + cleanedClause.length > maxLength) {
          chunks.push(clauseBuffer);
          clauseBuffer = cleanedClause;
        } else {
          clauseBuffer += cleanedClause;
        }
      }
      if (clauseBuffer) chunks.push(clauseBuffer);
      continue;
    }
    current += piece;
  }

  if (current) chunks.push(current);
  return chunks;
}

function splitDialoguePieces(sentence) {
  const source = text(sentence);
  if (!source) return [];
  const quotePattern = /[“「『][^”」』]{1,260}[”」』]/g;
  const pieces = [];
  let lastIndex = 0;
  let match;

  while ((match = quotePattern.exec(source)) !== null) {
    const before = source.slice(lastIndex, match.index).trim();
    const quote = match[0];
    const quoteInner = quote.slice(1, -1);
    const after = source.slice(match.index + quote.length).trim();
    const quoteLooksLikeDialogue =
      /[：:]$/.test(before) ||
      /[。！？!?]$/.test(quoteInner) ||
      quoteInner.length >= 14 ||
      /^(一声|两字|两个字|这句|这话)/.test(after);
    if (!quoteLooksLikeDialogue) continue;

    if (before) {
      const attachToQuote = /[：:]$/.test(before) && before.length <= 12;
      if (attachToQuote) {
        pieces.push(`${before}${quote}`);
      } else {
        pieces.push(...splitLongNarration(before, 120));
        pieces.push(quote);
      }
    } else {
      pieces.push(quote);
    }
    lastIndex = match.index + quote.length;
  }

  const tail = source.slice(lastIndex).trim();
  if (tail) pieces.push(...splitLongNarration(tail, 120));
  return pieces.length ? pieces : [source];
}

function isDialoguePiece(value) {
  return /^[“「『].+[”」』]$/.test(value) || /^[^。！？!?；;]{0,48}[：:][“「『]/.test(value);
}

function startsNewBeat(value) {
  return /^(这时|就在这时|突然|下一秒|与此同时|然而|可是|但|只是|不对|念头|前世|电话|手机|屏幕|门外|身后|空气|办公室|会议室|电梯|人群|协议书|合同|他|她|我|你|陆泽|沈清秋|方凯|赵强|苏雅)/.test(value);
}

function splitNarrativeUnits(paragraph) {
  const source = text(paragraph);
  if (!source) return [];
  const units = [];
  let current = '';

  function flush() {
    if (current.trim()) units.push(current.trim());
    current = '';
  }

  for (const piece of splitDialoguePieces(source)) {
    const pieces = isDialoguePiece(piece) ? [piece] : splitLongNarration(piece, 120);
    for (const candidate of pieces) {
      const cleaned = candidate.trim();
      if (!cleaned) continue;
      if (isDialoguePiece(cleaned)) {
        flush();
        units.push(cleaned);
        continue;
      }
      if (
        current &&
        (current.length + cleaned.length > 100 ||
          startsNewBeat(cleaned) ||
          /[”」』’]$/.test(current))
      ) {
        flush();
      }
      current += cleaned;
      if (current.length >= 120 || /[！？!?]$/.test(cleaned)) flush();
    }
  }

  flush();
  return units;
}

function normalizeNovelParagraphs(value) {
  const raw = text(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!raw) return '';

  const paragraphs = [];
  for (const block of raw.split(/\n+/).map((item) => item.trim()).filter(Boolean)) {
    for (const unit of splitNarrativeUnits(block)) {
      const chunks = isDialoguePiece(unit) ? [unit] : splitLongNarration(unit, 140);
      for (const chunk of chunks) {
        const cleaned = chunk.trim();
        if (cleaned) paragraphs.push(cleaned);
      }
    }
  }

  return paragraphs.join('\n');
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function score(value, fallback = 0, options = {}) {
  const parsed = number(value, fallback);
  const scaled = options.scaleTenPoint && parsed > 0 && parsed <= 10
    ? parsed * 10
    : parsed;
  return Math.min(Math.max(Math.round(scaled), 0), 100);
}

function shouldScaleTenPointScores(values) {
  const scores = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return scores.length > 0 && scores.every((value) => value >= 0 && value <= 10) && scores.some((value) => value > 0);
}

function base64Text(value) {
  return Buffer.from(String(value ?? ''), 'utf8').toString('base64');
}

const allowedFactTypes = new Set([
  'character',
  'item',
  'location',
  'ability',
  'relationship',
  'foreshadowing',
  'timeline',
  'rule',
  'other',
]);

function normalizeFactType(value, fallbackType = 'other') {
  const raw = text(value || fallbackType) || fallbackType;
  return allowedFactTypes.has(raw) ? raw : (allowedFactTypes.has(fallbackType) ? fallbackType : 'other');
}

function normalizeFact(fact, fallbackType = 'other') {
  return {
    fact_type: normalizeFactType(fact.fact_type || fact.type, fallbackType),
    fact_key: text(fact.fact_key || fact.key || fact.name),
    fact_value: text(fact.fact_value || fact.value || fact.description || fact.content),
    confidence: Math.min(Math.max(number(fact.confidence, 0.8), 0), 1),
  };
}

const bibleTopLevelAlias = {
  世界设定: 'world_setting',
  世界观: 'world_setting',
  故事核心: 'story_core',
  核心故事: 'story_core',
  主角: 'main_character',
  主角设定: 'main_character',
  配角: 'supporting_characters',
  配角设定: 'supporting_characters',
  反派: 'villain_setting',
  反派设定: 'villain_setting',
  能力体系: 'power_system',
  人物关系: 'relationship_map',
  关系图谱: 'relationship_map',
  文风规则: 'tone_rules',
  禁忌规则: 'forbidden_rules',
  禁止事项: 'forbidden_rules',
  卖点: 'selling_points',
  商业卖点: 'selling_points',
};

const bibleCharacterAlias = {
  姓名: 'name',
  名字: 'name',
  主名: 'name',
  别名: 'aliases',
  昵称: 'aliases',
  公开称呼: 'public_name',
  对外身份: 'public_name',
  真实姓名: 'real_name',
  年龄: 'age',
  身份: 'identity',
  身份说明: 'identity_note',
  真实身份: 'identity_note',
  性格: 'personality',
  人物性格: 'personality',
  目标: 'goal',
  人物目标: 'goal',
  动机: 'motivation',
  欲望: 'motivation',
  弱点: 'weakness',
  缺陷: 'weakness',
  成长线: 'growth_arc',
  人物弧光: 'growth_arc',
  定位: 'role',
  角色定位: 'role',
  作用: 'function',
  背景: 'background',
  出身: 'origin',
  与主角关系: 'relationship_with_mc',
  和主角关系: 'relationship_with_mc',
  与主角冲突: 'conflict_with_mc',
  和主角冲突: 'conflict_with_mc',
  冲突点: 'conflict_point',
  描述: 'description',
  外貌: 'appearance',
  特征: 'traits',
  冲突: 'conflict',
  秘密: 'secret',
  能力: 'ability',
  技能: 'skills',
  限制: 'limitation',
  阵营: 'faction',
  家族: 'family',
  组织: 'organization',
  状态: 'status',
  人物线: 'arc',
  情感线: 'emotional_arc',
  威胁等级: 'threat_level',
  反派定位: 'antagonist_role',
  来源角色: 'from',
  目标角色: 'to',
  原因: 'reason',
  内容: 'value',
  备注: 'note',
};

function normalizeBibleKey(key, aliases) {
  const raw = text(key);
  return aliases[raw] || raw;
}

function normalizeBibleStructuredValue(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeBibleStructuredValue(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, val]) => [
    normalizeBibleKey(key, bibleCharacterAlias),
    normalizeBibleStructuredValue(val),
  ]));
}

function normalizeBiblePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const normalized = {};
  for (const [key, value] of Object.entries(payload)) {
    const canonicalKey = normalizeBibleKey(key, bibleTopLevelAlias);
    normalized[canonicalKey] = normalizeBibleStructuredValue(value);
  }
  return normalized;
}

const chapterPayloadKeys = new Set([
  'chapter_title',
  'title',
  'chapter_body',
  'body',
  'chapter_summary',
  'summary',
  'word_count_estimate',
  'word_count',
  'new_facts',
  'new_facts_json',
  'foreshadowing',
]);

function roughWordCount(value) {
  return Array.from(String(value || '')).filter((char) => !/\s/.test(char)).length;
}

function looksLikeNarrativeFragment(value) {
  const source = text(value).replace(/^n(?=[“「『"\u4e00-\u9fa5])/u, '');
  if (source.length < 12) return false;
  if (/^[\[{]/.test(source)) return false;
  return /[\u4e00-\u9fa5]/.test(source) && /[。！？!?，、；;：:\n“”「」『』——]/.test(source);
}

function strayNarrativeEntries(payload, allowedKeys) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  return Object.entries(payload)
    .filter(([key, value]) => {
      if (allowedKeys.has(key)) return false;
      if (!looksLikeNarrativeFragment(key)) return false;
      if (value !== null && value !== undefined && typeof value !== 'string' && typeof value !== 'number') return false;
      return true;
    })
    .map(([key, value]) => ({
      key,
      value: text(value),
      text: `${text(key).replace(/^n(?=[“「『"\u4e00-\u9fa5])/u, '')}${value ? `\n${text(value)}` : ''}`,
    }));
}

function strayNarrativeDiagnosis(payload, allowedKeys, body, targetWords) {
  const entries = strayNarrativeEntries(payload, allowedKeys);
  if (!entries.length) return null;
  const strayText = entries.map((entry) => entry.text).join('\n');
  const strayWords = roughWordCount(strayText);
  const bodyWords = roughWordCount(body);
  const expectedWords = number(targetWords, 0);
  const bodyTooShort = expectedWords > 0 && bodyWords < Math.round(expectedWords * 0.65);
  const strayTooLarge = strayWords >= 80 || strayWords > Math.max(60, Math.round(bodyWords * 0.35));
  if (!bodyTooShort && !strayTooLarge) return null;

  return {
    entry_count: entries.length,
    stray_words: strayWords,
    body_words: bodyWords,
    sample: entries.slice(0, 2).map((entry) => entry.key).join(' / '),
  };
}

function normalizeVerdict(value) {
  const raw = text(value).toUpperCase();
  if (['PASS', 'REWRITE', 'MANUAL_REVIEW'].includes(raw)) return raw;
  if (raw.includes('REWRITE')) return 'REWRITE';
  if (raw.includes('PASS')) return 'PASS';
  return 'MANUAL_REVIEW';
}

function normalizeReviewIssues(issues, source) {
  const targetWords = number(source.target_words_per_chapter, 0);
  const chapterWords = number(source.chapter_word_count || source.word_count || source.word_count_estimate, 0);
  const lowerBound = targetWords > 0 ? Math.round(targetWords * 0.85) : 0;
  const upperBound = targetWords > 0 ? Math.round(targetWords * 1.15) : 0;

  return asArray(issues).map((issue) => {
    const normalizedIssue = typeof issue === 'object' && issue !== null
      ? {...issue}
      : {type: '问题', description: text(issue), severity: 'low'};
    const typeAndDescription = `${text(normalizedIssue.type)} ${text(normalizedIssue.description)}`;
    const isLengthIssue = /字数|篇幅|短章|目标字/.test(typeAndDescription);
    if (!isLengthIssue || !targetWords || !chapterWords) return normalizedIssue;

    if (chapterWords >= lowerBound && chapterWords <= upperBound) {
      return {
        ...normalizedIssue,
        severity: 'low',
        description: `系统统计字数为${chapterWords}字，位于允许范围${lowerBound}-${upperBound}字内；不应作为主要问题，仅可关注内容密度和节奏。`,
      };
    }

    const ratio = chapterWords / targetWords;
    const severity = ratio < 0.7 ? 'high' : 'medium';
    const direction = chapterWords < lowerBound ? '低于' : '高于';
    const impact = chapterWords < lowerBound
      ? '可能压缩商业爽点、情绪铺垫或关键动作细节'
      : '可能造成节奏拖沓或信息密度下降';
    return {
      ...normalizedIssue,
      severity,
      description: `系统统计字数为${chapterWords}字，${direction}允许范围${lowerBound}-${upperBound}字；当前约为目标字数的${Math.round(ratio * 100)}%，${impact}。`,
    };
  });
}

function normalizeTransitionReview(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const allowedModes = new Set([
    'direct_continuation',
    'natural_scene_cut',
    'pov_shift',
    'time_skip',
    'summary_bridge',
  ]);
  const mode = text(raw.mode || raw.transition_mode || raw.type || 'direct_continuation').toLowerCase();
  return {
    mode: allowedModes.has(mode) ? mode : 'direct_continuation',
    allowed: raw.allowed === undefined ? true : ['true', '1', 'yes', '通过', '合理'].includes(text(raw.allowed).toLowerCase()) || raw.allowed === true,
    evidence: text(raw.evidence || raw.reason || raw.analysis),
    risk: text(raw.risk || raw.problem),
    fix: text(raw.fix || raw.suggestion),
    should_block: raw.should_block === true || ['true', '1', 'yes', '阻断'].includes(text(raw.should_block).toLowerCase()),
  };
}

function compactForTransition(value, maxLength = 450) {
  return text(value).replace(/\s+/g, '').slice(0, maxLength);
}

function hasExplicitOpeningBridge(opening) {
  return /半路|途中|路上|一路|刚回|回到|尚未回|还未回|未到|离开后|抵达前|抵达后|醒来后|一夜过去|次日|翌日|翌晨|几日后|半个时辰|一个时辰|昨夜|入夜后|抵达|到了|转送|带到|送到|押到|安置到|安排到|被[^。！？\n]{0,24}(截|拦|请|带|送|押)|(?:车|船|飞行器|交通工具)[^。！？\n]{0,48}(转|停|驶|到|靠岸|降落)/.test(opening);
}

function hardenTransitionReview(review, response) {
  const previous = compactForTransition(response.previous_chapter_ending || response.previous_chapter_summary, 900);
  const opening = compactForTransition(response.chapter_body || response.body || response.chapter_opening, 450);
  const evidence = compactForTransition(`${review.evidence} ${review.risk}`, 900);
  const modelSawSceneJump = /直接转场|时间流逝|空间转换|换地点|另一个地点|已经在|转场至|跳到/.test(evidence);
  const directContinuationContradiction = review.mode === 'direct_continuation' && modelSawSceneJump;
  const previousHasUnresolvedTravel = /上车|乘车|上船|交通工具|送.*回|前往|返回|离开|驶远|出门|出城|进城|受伤|昏迷|被押|被带走|被转移/.test(previous);
  const openingIsNewScene = /(?:^|。|！|？|\n)[^。！？\n]{0,80}(门|墙|院|府|宫|殿|牢|楼|阁|街|巷|山|林|船|车|客栈|书房|屋内|窗|屋顶|码头|城门|办公室|会议室|医院|学校|车站|仓库|基地|飞船|舱室)/.test(opening);
  const missingBridge = previousHasUnresolvedTravel && openingIsNewScene && !hasExplicitOpeningBridge(opening);

  if (!directContinuationContradiction && !missingBridge) return review;

  const hardened = {...review};
  if (hardened.mode === 'direct_continuation') {
    hardened.mode = /时间|几日|次日|翌日|已经/.test(evidence) ? 'time_skip' : 'natural_scene_cut';
  }
  hardened.allowed = false;
  hardened.should_block = true;
  hardened.evidence = hardened.evidence
    ? `${hardened.evidence}（系统兜底：该描述不是同场同动作续写，不能按 direct_continuation 放行。）`
    : '系统兜底：上一章结尾与当前章开头存在未交代的时间/地点/行动链跳转。';
  hardened.risk = hardened.risk || '上一章未收束的人物去向、地点变化或动作后果没有在本章开头被交代，读者会感到跨章断链。';
  hardened.fix = hardened.fix || '在开头 300 字内补写上一章结尾到本章开场的过桥段：谁安排转场、时间过去多久、人物为何到达新地点。';
  return hardened;
}

function transitionIssueIsOnlyNoise(issue, transitionReview) {
  if (!text(issue.type).includes('跨章')) return false;
  if (transitionReview.allowed !== true || transitionReview.should_block) return false;
  const severity = text(issue.severity).toLowerCase();
  const description = text(issue.description || issue.reason || issue.fix);
  return (
    !severity ||
    ['low', 'info', 'minor', '低', '低风险'].includes(severity) ||
    /合理|自然|流畅|无.*断链|未产生严重断链|无需/.test(description)
  );
}

const response = $input.first().json;
const rawText = extractText(response);
const cleaned = cleanJsonText(rawText);
const finishedAt = new Date().toISOString();

let parsed;
try {
  parsed = JSON.parse(cleaned);
} catch (error) {
  throw new Error(`小说 GLM 输出不是合法 JSON：${error.message}\n原始输出：${rawText.slice(0, 1500)}`);
}

const runType = text(response.run_type || response.job_type).toUpperCase();
const newFacts = [
  ...asArray(parsed.new_facts).map((item) => normalizeFact(item)),
  ...asArray(parsed.foreshadowing).map((item) => normalizeFact(item, 'foreshadowing')),
].filter((fact) => fact.fact_value);

const normalized = {
  ...response,
  ai_run_finished_at: finishedAt,
  raw_text: rawText,
  parsed_payload: parsed,
  parsed_payload_json: JSON.stringify(parsed),
  llm_response_json: JSON.stringify(response),
  new_facts: newFacts,
  new_facts_json: JSON.stringify(newFacts),
};

const biblePayload = normalizeBiblePayload(parsed);
if (biblePayload.world_setting || biblePayload.story_core || biblePayload.main_character) {
  Object.assign(normalized, {
    run_type: runType || 'GENERATE_BIBLE',
    parsed_payload: biblePayload,
    parsed_payload_json: JSON.stringify(biblePayload),
    world_setting: text(biblePayload.world_setting),
    story_core: text(biblePayload.story_core),
    main_character_json: JSON.stringify(biblePayload.main_character || {}),
    supporting_characters_json: JSON.stringify(asArray(biblePayload.supporting_characters)),
    villain_setting_json: JSON.stringify(asArray(biblePayload.villain_setting)),
    power_system: text(biblePayload.power_system),
    relationship_map_json: JSON.stringify(asArray(biblePayload.relationship_map)),
    tone_rules: text(biblePayload.tone_rules),
    forbidden_rules: text(biblePayload.forbidden_rules),
    selling_points_json: JSON.stringify(asArray(biblePayload.selling_points)),
  });
}

if (Array.isArray(parsed.chapters)) {
  const chapters = parsed.chapters.map((chapter) => ({
    ...chapter,
    title: normalizeChapterTitle(chapter.title),
  }));
  Object.assign(normalized, {
    run_type: runType || 'GENERATE_OUTLINE',
    parsed_payload: {...parsed, chapters},
    parsed_payload_json: JSON.stringify({...parsed, chapters}),
    chapters,
    chapters_json: JSON.stringify(chapters),
  });
}

if (parsed.chapter_body || parsed.chapter_title || parsed.chapter_summary) {
  const chapterTitle = normalizeChapterTitle(
    parsed.chapter_title || parsed.title,
    response.outline_title || response.chapter_title
  );
  const chapterBody = normalizeNovelParagraphs(parsed.chapter_body || parsed.body);
  const chapterSummary = text(parsed.chapter_summary || parsed.summary);
  const diagnosis = strayNarrativeDiagnosis(
    parsed,
    chapterPayloadKeys,
    chapterBody,
    response.target_words_per_chapter || response.chapter_target_words
  );
  if (diagnosis) {
    throw new Error(`章节正文疑似散落在异常 JSON 字段中：正文约 ${diagnosis.body_words} 字，异常字段约 ${diagnosis.stray_words} 字，字段数 ${diagnosis.entry_count}；样例：${diagnosis.sample}`);
  }
  const chapterPayload = {
    ...parsed,
    chapter_title: chapterTitle,
    chapter_body: chapterBody,
    chapter_summary: chapterSummary,
  };
  if (parsed.body !== undefined) chapterPayload.body = chapterBody;
  Object.assign(normalized, {
    run_type: runType || 'GENERATE_CHAPTER',
    parsed_payload: chapterPayload,
    parsed_payload_json: JSON.stringify(chapterPayload),
    chapter_title: chapterTitle,
    chapter_body: chapterBody,
    chapter_summary: chapterSummary,
    chapter_title_base64: base64Text(chapterTitle),
    chapter_body_base64: base64Text(chapterBody),
    chapter_summary_base64: base64Text(chapterSummary),
    word_count_estimate: number(parsed.word_count_estimate || parsed.word_count, 0),
  });
}

if (
  parsed.consistency_score !== undefined ||
  parsed.readability_score !== undefined ||
  parsed.plot_score !== undefined ||
  parsed.commercial_score !== undefined ||
  parsed.total_score !== undefined
) {
  const scaleTenPointScores = shouldScaleTenPointScores([
    parsed.consistency_score,
    parsed.readability_score,
    parsed.plot_score,
    parsed.commercial_score,
    parsed.total_score,
  ]);
  const consistencyScore = score(parsed.consistency_score, 0, {scaleTenPoint: scaleTenPointScores});
  const readabilityScore = score(parsed.readability_score, 0, {scaleTenPoint: scaleTenPointScores});
  const plotScore = score(parsed.plot_score, 0, {scaleTenPoint: scaleTenPointScores});
  const commercialScore = score(parsed.commercial_score, 0, {scaleTenPoint: scaleTenPointScores});
  const totalScore = score(parsed.total_score, 0, {scaleTenPoint: scaleTenPointScores});
  const reviewIssues = normalizeReviewIssues(parsed.issues, response);
  const reviewSuggestions = asArray(parsed.suggestions);
  const transitionReview = hardenTransitionReview(
    normalizeTransitionReview(parsed.cross_chapter_transition_review),
    response
  );
  const filteredReviewIssues = reviewIssues.filter((issue) => !transitionIssueIsOnlyNoise(issue, transitionReview));
  if ((transitionReview.should_block || transitionReview.allowed === false) && !reviewIssues.some((issue) => text(issue.type).includes('跨章'))) {
    filteredReviewIssues.push({
      type: '跨章断链',
      severity: transitionReview.should_block ? 'high' : 'medium',
      description: transitionReview.risk || transitionReview.evidence || '当前章开头与上一章结尾之间缺少必要的时间、地点、人物去向或动机承接。',
      fix: transitionReview.fix || '补写上一章结尾到本章开场之间的过桥段，交代镜头转换原因。',
    });
  }
  const reviewPayload = {
    ...parsed,
    consistency_score: consistencyScore,
    readability_score: readabilityScore,
    plot_score: plotScore,
    commercial_score: commercialScore,
    total_score: totalScore,
    issues: filteredReviewIssues,
    suggestions: reviewSuggestions,
    cross_chapter_transition_review: transitionReview,
    score_scale_normalized_from: scaleTenPointScores ? '0-10' : '0-100',
  };
  Object.assign(normalized, {
    run_type: runType || 'REVIEW_CHAPTER',
    parsed_payload: reviewPayload,
    parsed_payload_json: JSON.stringify(reviewPayload),
    consistency_score: consistencyScore,
    readability_score: readabilityScore,
    plot_score: plotScore,
    commercial_score: commercialScore,
    total_score: totalScore,
    issues_json: JSON.stringify(filteredReviewIssues),
    suggestions_json: JSON.stringify(reviewSuggestions),
    cross_chapter_transition_review: transitionReview,
    cross_chapter_transition_review_json: JSON.stringify(transitionReview),
    verdict: normalizeVerdict(parsed.verdict),
  });
}

return [{json: normalized}];
