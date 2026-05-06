// n8n Code node: Parse Novel Chapter Segment JSON
// Never throws for model JSON quality issues; parse failures are routed into DB failure handling.

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
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (error) {
      // Keep non-JSON strings usable for model fields that occasionally return one bare value.
    }
  }
  return [value];
}

function parsedArray(value) {
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

function normalizeParagraphs(value) {
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

function roughWordCount(value) {
  return Array.from(String(value || '')).filter((char) => !/\s/.test(char)).length;
}

const segmentPayloadKeys = new Set([
  'chapter_title',
  'title',
  'segment_no',
  'chapter_segment_no',
  'segment_body',
  'chapter_body',
  'body',
  'segment_summary',
  'chapter_summary',
  'summary',
  'bridge_to_next',
  'word_count_estimate',
  'word_count',
  'new_facts',
  'new_facts_json',
  'foreshadowing',
]);

function looksLikeNarrativeFragment(value) {
  const source = text(value).replace(/^n(?=[“「『"\u4e00-\u9fa5])/u, '');
  if (source.length < 12) return false;
  if (/^[\[{]/.test(source)) return false;
  return /[\u4e00-\u9fa5]/.test(source) && /[。！？!?，、；;：:\n“”「」『』——]/.test(source);
}

function strayNarrativeEntries(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  return Object.entries(payload)
    .filter(([key, value]) => {
      if (segmentPayloadKeys.has(key)) return false;
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

function strayNarrativeDiagnosis(payload, segmentBody, targetWords) {
  const entries = strayNarrativeEntries(payload);
  if (!entries.length) return null;
  const strayText = entries.map((entry) => entry.text).join('\n');
  const strayWords = roughWordCount(strayText);
  const bodyWords = roughWordCount(segmentBody);
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

function normalizeGeneratedSegment(segment) {
  const body = normalizeParagraphs(segment.segment_body || segment.chapter_body || segment.body);
  return {
    segment_no: number(segment.segment_no || segment.chapter_segment_no, 0),
    chapter_title: normalizeChapterTitle(segment.chapter_title || segment.title),
    segment_body: body,
    segment_summary: text(segment.segment_summary || segment.chapter_summary || segment.summary),
    bridge_to_next: text(segment.bridge_to_next),
    word_count_estimate: number(segment.word_count_estimate || segment.word_count, roughWordCount(body)),
    new_facts: parsedArray(segment.new_facts_json || segment.new_facts),
  };
}

const response = $input.first().json;
const rawText = extractText(response);
const cleaned = cleanJsonText(rawText);
const finishedAt = new Date().toISOString();
const currentSegmentNo = number(response.chapter_segment_no || response.segment_no || 1, 1);
const totalSegments = Math.max(1, number(response.chapter_segment_total, 1));
const carriedSegments = parsedArray(response.generated_segments_json || response.generated_segments)
  .map(normalizeGeneratedSegment)
  .filter((segment) => segment.segment_no && segment.segment_body);

let parsed = null;
let errorMessage = '';
try {
  parsed = JSON.parse(cleaned);
} catch (error) {
  errorMessage = `章节第 ${currentSegmentNo} 段输出不是合法 JSON：${error.message}`;
}

if (!errorMessage) {
  const segmentBody = normalizeParagraphs(parsed.segment_body || parsed.chapter_body || parsed.body);
  if (!segmentBody) {
    errorMessage = `章节第 ${currentSegmentNo} 段正文为空`;
  } else {
    const diagnosis = strayNarrativeDiagnosis(parsed, segmentBody, response.segment_target_words);
    if (diagnosis) {
      errorMessage = `章节第 ${currentSegmentNo} 段正文疑似散落在异常 JSON 字段中：正文约 ${diagnosis.body_words} 字，异常字段约 ${diagnosis.stray_words} 字，字段数 ${diagnosis.entry_count}；样例：${diagnosis.sample}`;
    }
  }
}

if (errorMessage) {
  return [{
    json: {
      ...response,
      ai_run_finished_at: finishedAt,
      parse_success: false,
      error_message: errorMessage,
      raw_text: rawText,
      parsed_payload_json: '{}',
      llm_response_json: JSON.stringify(response),
      new_facts: [],
      new_facts_json: '[]',
      generated_segments: carriedSegments,
      generated_segments_json: JSON.stringify(carriedSegments),
    },
  }];
}

const segmentBody = normalizeParagraphs(parsed.segment_body || parsed.chapter_body || parsed.body);
const segmentSummary = text(parsed.segment_summary || parsed.chapter_summary || parsed.summary);
const newFacts = [
  ...asArray(parsed.new_facts).map((item) => normalizeFact(item)),
  ...asArray(parsed.foreshadowing).map((item) => normalizeFact(item, 'foreshadowing')),
].filter((fact) => fact.fact_value);
const currentSegment = normalizeGeneratedSegment({
  ...parsed,
  segment_no: currentSegmentNo,
  segment_body: segmentBody,
  segment_summary: segmentSummary,
  new_facts: newFacts,
});
const chapterTitle = normalizeChapterTitle(parsed.chapter_title || parsed.title, response.outline_title);
const generatedSegments = [
  ...carriedSegments.filter((segment) => segment.segment_no !== currentSegmentNo),
  currentSegment,
].sort((a, b) => a.segment_no - b.segment_no);
const hasMoreSegments = currentSegmentNo < totalSegments;
const nextSegmentNo = hasMoreSegments ? currentSegmentNo + 1 : null;

return [{
  json: {
    ...response,
    run_type: 'GENERATE_CHAPTER',
    ai_run_finished_at: finishedAt,
    parse_success: true,
    raw_text: rawText,
    parsed_payload: {
      ...parsed,
      chapter_title: chapterTitle,
      segment_no: currentSegmentNo,
      segment_body: segmentBody,
      generated_segments: generatedSegments,
    },
    parsed_payload_json: JSON.stringify({
      ...parsed,
      chapter_title: chapterTitle,
      segment_no: currentSegmentNo,
      segment_body: segmentBody,
      generated_segments: generatedSegments,
    }),
    llm_response_json: JSON.stringify(response),
    chapter_title: chapterTitle,
    chapter_segment_no: currentSegmentNo,
    chapter_segment_total: totalSegments,
    next_chapter_segment_no: nextSegmentNo,
    has_more_segments: hasMoreSegments,
    segment_no: currentSegmentNo,
    segment_body: segmentBody,
    previous_segment_body: segmentBody,
    segment_summary: segmentSummary,
    previous_segment_summary: segmentSummary,
    bridge_to_next: text(parsed.bridge_to_next),
    word_count_estimate: number(parsed.word_count_estimate || parsed.word_count, roughWordCount(segmentBody)),
    new_facts: newFacts,
    new_facts_json: JSON.stringify(newFacts),
    generated_segments: generatedSegments,
    generated_segments_json: JSON.stringify(generatedSegments),
  },
}];
