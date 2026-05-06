// n8n Code node: Combine Novel Chapter Segments
// Builds the final candidate chapter payload from all successful short model calls.

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
  if (typeof value === 'object') return [value];
  return [];
}

function base64Text(value) {
  return Buffer.from(String(value ?? ''), 'utf8').toString('base64');
}

function roughWordCount(value) {
  return Array.from(String(value || '')).filter((char) => !/\s/.test(char)).length;
}

function normalizeSegment(segment) {
  const body = text(segment.segment_body || segment.chapter_body || segment.body);
  return {
    segment_no: Number(segment.segment_no || segment.chapter_segment_no || 0),
    chapter_title: normalizeChapterTitle(segment.chapter_title || segment.title),
    segment_body: body,
    segment_summary: text(segment.segment_summary || segment.chapter_summary || segment.summary),
    bridge_to_next: text(segment.bridge_to_next),
    word_count_estimate: Number(segment.word_count_estimate || segment.word_count || roughWordCount(body)),
    new_facts: asArray(segment.new_facts_json || segment.new_facts),
  };
}

function uniqueSegments(segments) {
  const byNo = new Map();
  for (const segment of segments.map(normalizeSegment)) {
    if (!segment.segment_no || !segment.segment_body) continue;
    byNo.set(segment.segment_no, segment);
  }
  return [...byNo.values()].sort((a, b) => a.segment_no - b.segment_no);
}

function fallbackTwoSegmentInput(finalSegment) {
  try {
    const first = $('代码 - 解析章节第1段 GLM响应').first().json;
    return [first, finalSegment];
  } catch (error) {
    return [finalSegment];
  }
}

const source = $input.first().json;
const segments = uniqueSegments(
  asArray(source.generated_segments_json || source.generated_segments).length
    ? asArray(source.generated_segments_json || source.generated_segments)
    : fallbackTwoSegmentInput(source)
);

if (!segments.length) {
  throw new Error('章节分段合并失败：没有可合并的分段正文');
}

const chapterTitle = normalizeChapterTitle(
  source.outline_title ||
    source.chapter_title ||
    segments.find((segment) => segment.chapter_title)?.chapter_title,
  `第 ${source.chapter_no || ''} 章`
);
const chapterBody = segments.map((segment) => segment.segment_body).filter(Boolean).join('\n\n');
const chapterSummary = segments.map((segment) => segment.segment_summary).filter(Boolean).join('；');
const combinedFacts = segments.flatMap((segment) => asArray(segment.new_facts));
const parsedPayload = {
  chapter_title: chapterTitle,
  chapter_body: chapterBody,
  chapter_summary: chapterSummary,
  word_count_estimate: roughWordCount(chapterBody),
  segments: segments.map((segment) => ({
    segment_no: segment.segment_no,
    segment_summary: segment.segment_summary,
    word_count_estimate: segment.word_count_estimate || roughWordCount(segment.segment_body),
  })),
  new_facts: combinedFacts,
};

return [{
  json: {
    ...source,
    run_type: 'GENERATE_CHAPTER',
    prompt_key: 'chapter_segments_combined',
    prompt_version: `${source.prompt_version || 'novel-v1'}-combined-${segments.length}`,
    llm_request_body: {
      model: source.llm_request_body?.model || 'glm-5.1',
      segments: segments.map((segment) => ({
        segment_no: segment.segment_no,
        word_count_estimate: segment.word_count_estimate,
      })),
    },
    llm_response_json: JSON.stringify({segments}),
    parsed_payload: parsedPayload,
    parsed_payload_json: JSON.stringify(parsedPayload),
    chapter_title: chapterTitle,
    chapter_body: chapterBody,
    chapter_summary: chapterSummary,
    chapter_title_base64: base64Text(chapterTitle),
    chapter_body_base64: base64Text(chapterBody),
    chapter_summary_base64: base64Text(chapterSummary),
    word_count_estimate: parsedPayload.word_count_estimate,
    new_facts: combinedFacts,
    new_facts_json: JSON.stringify(combinedFacts),
  },
}];
