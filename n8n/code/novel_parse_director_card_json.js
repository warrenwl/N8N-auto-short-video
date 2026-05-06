// n8n Code node: Parse and validate Novel Director Card JSON.
// Director cards are planning artifacts only: no prose body is allowed here.

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

function cleanJsonText(value) {
  let text = String(value || '').trim();
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  return text;
}

function text(value) {
  return String(value ?? '').trim();
}

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function positiveInteger(value, fallback = null) {
  const parsed = number(value, fallback);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function parseBool(value, fallback = false) {
  if (value === true || value === false) return value;
  const raw = text(value).toLowerCase();
  if (['true', 'yes', '1', 'pass', '通过'].includes(raw)) return true;
  if (['false', 'no', '0', 'fail', '不通过'].includes(raw)) return false;
  return fallback;
}

function shortText(value, maxLength = 220) {
  return Array.from(text(value)).slice(0, maxLength).join('');
}

function compactStrings(value, maxLength = 220) {
  return asArray(value)
    .map((item) => {
      if (typeof item === 'string') return shortText(item, maxLength);
      if (item && typeof item === 'object') return shortText(item.description || item.value || item.content || JSON.stringify(item), maxLength);
      return shortText(item, maxLength);
    })
    .filter(Boolean);
}

function assertNoBodyFields(payload) {
  const forbidden = ['chapter_body', 'segment_body', 'body', '正文'];
  const stack = [{path: '$', value: payload}];
  while (stack.length) {
    const current = stack.pop();
    const value = current.value;
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      value.forEach((item, index) => stack.push({path: `${current.path}[${index}]`, value: item}));
      continue;
    }
    for (const [key, child] of Object.entries(value)) {
      if (forbidden.includes(key)) {
        throw new Error(`导演台规划禁止包含正文字段：${current.path}.${key}`);
      }
      stack.push({path: `${current.path}.${key}`, value: child});
    }
  }
}

function normalizeSegmentPlan(plan) {
  return asArray(plan).map((segment, index) => {
    const raw = segment && typeof segment === 'object' ? segment : {};
    return {
      segment_no: number(raw.segment_no || raw.no || raw.index, index + 1),
      goal: shortText(raw.goal || raw.chapter_goal || raw.task, 160),
      conflict: shortText(raw.conflict || raw.conflict_point, 160),
      information_release: shortText(raw.information_release || raw.info || raw.reveal, 160),
      emotion_turn: shortText(raw.emotion_turn || raw.emotional_point || raw.emotion, 160),
      ending_hook: shortText(raw.ending_hook || raw.hook || raw.bridge_to_next, 160),
    };
  });
}

function segmentPlanIssues(segments, expectedCount) {
  if (expectedCount > 0 && segments.length !== expectedCount) {
    return [`导演台 segment_plan 数量必须等于正文分段数：期望 ${expectedCount}，实际 ${segments.length}`];
  }
  if (!segments.length) {
    return ['导演台 segment_plan 不能为空'];
  }
  return [];
}

function normalizeForeshadowingOps(value) {
  const allowedActions = new Set(['seed', 'touch', 'payoff', 'avoid_reveal']);
  return asArray(value).map((item) => {
    const raw = item && typeof item === 'object' ? item : {};
    const action = text(raw.action || 'touch').toLowerCase();
    return {
      thread_key: shortText(raw.thread_key || raw.key || raw.name, 80),
      action: allowedActions.has(action) ? action : 'touch',
      instruction: shortText(raw.instruction || raw.description || raw.note, 220),
      do_not_reveal: parseBool(raw.do_not_reveal, false),
      next_touch_chapter: positiveInteger(raw.next_touch_chapter, null),
      payoff_target_chapter: positiveInteger(raw.payoff_target_chapter, null),
      do_not_reveal_before: positiveInteger(raw.do_not_reveal_before, null),
      visibility: shortText(raw.visibility, 140),
    };
  }).filter((item) => item.thread_key || item.instruction);
}

function normalizeRisks(value) {
  return asArray(value).map((item) => {
    const raw = item && typeof item === 'object' ? item : {};
    return {
      risk: shortText(raw.risk || raw.title || item, 160),
      reason: shortText(raw.reason || raw.why, 220),
      fix: shortText(raw.fix || raw.solution || raw.suggestion, 220),
    };
  }).filter((item) => item.risk || item.reason || item.fix);
}

function normalizeFactSourceAudit(value) {
  const allowedVerdicts = new Set(['supported', 'neutralized', 'unsupported']);
  return asArray(value).map((item) => {
    const raw = item && typeof item === 'object' ? item : {};
    const verdict = text(raw.verdict || raw.status || raw.result || 'unsupported').toLowerCase();
    return {
      claim: shortText(raw.claim || raw.fact || raw.statement || item, 180),
      source_type: shortText(raw.source_type || raw.source || raw.basis_type, 80),
      source_evidence: shortText(raw.source_evidence || raw.evidence || raw.basis || raw.quote, 220),
      verdict: allowedVerdicts.has(verdict) ? verdict : 'unsupported',
    };
  }).filter((item) => item.claim || item.source_evidence);
}

function hasInstitutionalClaim(value) {
  return /案名?|证人|相关人等|奉命|受命|口谕|命令|通缉|罪名|官方|调查|追捕|看护|强制|转移|押送|羁押|逮捕|禁军|官府|衙门|警局|警方|法庭|审判|公文|诏书|圣旨/.test(text(value));
}

function hasWeakSourceType(value) {
  return /推断|本章新增|创作处理|临场|猜测|无|未知|none|unknown|inferred|inference|assumption/i.test(text(value));
}

function factSourceAuditIssues(parsed, auditItems) {
  const issues = [];
  if (!Object.prototype.hasOwnProperty.call(parsed, 'fact_source_audit')) {
    issues.push('导演台缺少 fact_source_audit，无法确认本章制度性理由和转场依据是否来自已知事实。');
  }
  for (const item of auditItems) {
    if (item.verdict === 'unsupported') {
      issues.push(`事实来源不足：${item.claim || '未命名设定'}`);
      continue;
    }
    if (
      item.verdict === 'supported' &&
      hasInstitutionalClaim(`${item.claim} ${item.source_evidence}`) &&
      (hasWeakSourceType(item.source_type) || !item.source_evidence)
    ) {
      issues.push(`制度性理由不能用推断来源判定为 supported：${item.claim || '未命名设定'}`);
    }
  }
  return issues;
}

function normalizeTransition(value) {
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
    allowed: parseBool(raw.allowed, true),
    reason: shortText(raw.reason || raw.why, 220),
    opening_bridge: shortText(raw.opening_bridge || raw.bridge || raw.handoff, 260),
    risk: shortText(raw.risk || raw.abruptness_risk, 220),
    needs_explicit_bridge: parseBool(raw.needs_explicit_bridge, mode !== 'direct_continuation'),
  };
}

function normalizePlotThreads(ops, source) {
  const chapterNo = positiveInteger(source.chapter_no, null);
  return ops
    .filter((op) => op.thread_key)
    .map((op) => {
      const status = {
        seed: 'SEEDING',
        touch: 'TOUCHING',
        payoff: 'PAYOFF_READY',
        avoid_reveal: 'ACTIVE',
      }[op.action] || 'ACTIVE';
      return {
        thread_key: op.thread_key,
        thread_type: 'foreshadowing',
        status,
        introduced_chapter: op.action === 'seed' ? chapterNo : null,
        last_touched_chapter: chapterNo,
        next_touch_chapter: op.next_touch_chapter,
        payoff_target_chapter: op.payoff_target_chapter,
        do_not_reveal_before: op.do_not_reveal_before,
        visibility: op.visibility,
        notes: op.instruction,
      };
    });
}

const source = $input.first().json || {};
const rawText = extractText(source);
const cleaned = cleanJsonText(rawText);
const finishedAt = new Date().toISOString();

let parsed;
try {
  parsed = JSON.parse(cleaned);
} catch (error) {
  throw new Error(`导演台 GLM 输出不是合法 JSON：${error.message}\n原始输出：${rawText.slice(0, 1200)}`);
}

assertNoBodyFields(parsed);

const expectedSegments = number(source.chapter_segment_total || source.segment_count, 0);
const segmentPlan = normalizeSegmentPlan(parsed.segment_plan);
const segmentIssues = segmentPlanIssues(segmentPlan, expectedSegments);
const foreshadowingOps = normalizeForeshadowingOps(parsed.foreshadowing_ops);
const factSourceAudit = normalizeFactSourceAudit(parsed.fact_source_audit);
const auditIssues = factSourceAuditIssues(parsed, factSourceAudit);
const qualityGate = parsed.quality_gate && typeof parsed.quality_gate === 'object' ? parsed.quality_gate : {};
const blockingIssues = [...compactStrings(qualityGate.blocking_issues, 220), ...auditIssues, ...segmentIssues];
const gatePass = parseBool(qualityGate.pass, blockingIssues.length === 0);
const normalized = {
  chapter_intent: shortText(parsed.chapter_intent, 260),
  causal_chain: {
    from_previous: shortText(parsed.causal_chain?.from_previous, 260),
    trigger: shortText(parsed.causal_chain?.trigger, 260),
    character_motives: compactStrings(parsed.causal_chain?.character_motives, 220),
    obstacles: compactStrings(parsed.causal_chain?.obstacles, 220),
    irreversible_result: shortText(parsed.causal_chain?.irreversible_result, 260),
    to_next: shortText(parsed.causal_chain?.to_next, 260),
  },
  continuity_constraints: {
    must_remember: compactStrings(parsed.continuity_constraints?.must_remember, 220),
    must_not_break: compactStrings(parsed.continuity_constraints?.must_not_break, 220),
    future_outline_guardrails: compactStrings(parsed.continuity_constraints?.future_outline_guardrails, 220),
  },
  foreshadowing_ops: foreshadowingOps,
  abruptness_risks: normalizeRisks(parsed.abruptness_risks),
  fact_source_audit: factSourceAudit,
  cross_chapter_transition: normalizeTransition(parsed.cross_chapter_transition),
  quality_gate: {
    pass: gatePass && blockingIssues.length === 0,
    blocking_issues: blockingIssues,
  },
  segment_plan: segmentPlan,
};

const directorStatus = normalized.quality_gate.pass ? 'READY' : 'NEEDS_REVIEW';
const plotThreads = normalizePlotThreads(foreshadowingOps, source);

return [{
  json: {
    ...source,
    run_type: 'PLAN_CHAPTER_DIRECTOR',
    ai_run_finished_at: finishedAt,
    raw_text: rawText,
    parsed_payload: normalized,
    parsed_payload_json: JSON.stringify(normalized),
    llm_response_json: JSON.stringify(source.llm_response || source),
    card_payload: normalized,
    card_payload_json: JSON.stringify(normalized),
    director_status: directorStatus,
    quality_gate_pass: normalized.quality_gate.pass,
    blocking_issues: blockingIssues,
    blocking_issues_json: JSON.stringify(blockingIssues),
    plot_threads: plotThreads,
    plot_threads_json: JSON.stringify(plotThreads),
    chapter_segment_total: expectedSegments || normalized.segment_plan.length,
  },
}];
