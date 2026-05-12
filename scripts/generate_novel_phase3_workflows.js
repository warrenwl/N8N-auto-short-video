#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function code(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const excludeStaleNotifyReviewJobsSql = `AND NOT (
      j.job_type = 'NOTIFY_REVIEW'
      AND j.status IN ('PENDING', 'RUNNING')
      AND NOT EXISTS (
        SELECT 1
        FROM novel_chapters nc
        WHERE nc.project_id = j.project_id
          AND nc.chapter_no = j.chapter_no
          AND nc.status = 'NEED_REVIEW'
      )
    )`;

function postgresNode(id, name, position, query, queryReplacement = null) {
  return {
    parameters: {
      operation: 'executeQuery',
      query,
      ...(queryReplacement
        ? {options: {queryReplacement}}
        : {options: {}}),
    },
    id,
    name,
    type: 'n8n-nodes-base.postgres',
    typeVersion: 2.6,
    position,
    credentials: {
      postgres: {
        id: 'postgresVideoAgent',
        name: 'Postgres video_agent',
      },
    },
  };
}

function codeNode(id, name, position, jsCode, options = {}) {
  const node = {
    parameters: {jsCode},
    id,
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
  };
  if (options.continueErrorOutput) {
    node.onError = 'continueErrorOutput';
  }
  return node;
}

function ifNode(id, name, position, leftValue, conditionId) {
  return {
    parameters: {
      conditions: {
        options: {
          caseSensitive: true,
          leftValue: '',
          typeValidation: 'strict',
          version: 2,
        },
        conditions: [
          {
            id: conditionId,
            leftValue,
            rightValue: true,
            operator: {
              type: 'boolean',
              operation: 'true',
              singleValue: true,
            },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    id,
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position,
  };
}

function executeWorkflowNode(id, name, position, workflowId) {
  return {
    parameters: {
      source: 'database',
      workflowId,
      mode: 'once',
      options: {
        waitForSubWorkflow: false,
      },
    },
    id,
    name,
    type: 'n8n-nodes-base.executeWorkflow',
    typeVersion: 1,
    position,
  };
}

function webhookNode(id, name, position, httpMethod, pathName, webhookId) {
  return {
    parameters: {
      httpMethod,
      path: pathName,
      responseMode: 'responseNode',
      options: {},
    },
    id,
    name,
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position,
    webhookId,
  };
}

function respondNode(id, name, position, responseBody, responseCode, contentType) {
  return {
    parameters: {
      respondWith: 'text',
      responseBody,
      options: {
        responseCode,
        responseHeaders: {
          entries: [
            {
              name: 'Content-Type',
              value: contentType,
            },
          ],
        },
      },
    },
    id,
    name,
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.4,
    position,
  };
}

function httpGlmNode(id, name, position, options = {}) {
  const node = {
    parameters: {
      method: 'POST',
      url: '={{ $env.GLM_API_BASE_URL || "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions" }}',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          {
            name: 'Authorization',
            value: '={{ "Bearer " + $env.GLM_API_KEY }}',
          },
          {
            name: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
      sendBody: true,
      contentType: 'json',
      jsonBody: '={{ { ...$json.llm_request_body, model: $env.GLM_MODEL || $json.llm_request_body.model } }}',
      options: {
        response: {
          response: {
            responseFormat: 'json',
          },
        },
        timeout: 300000,
      },
      specifyBody: 'json',
    },
    id,
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
  };
  if (options.continueErrorOutput) {
    node.onError = 'continueErrorOutput';
  }
  return node;
}

function sticky(id, name, position, content) {
  return {
    parameters: {
      content,
      height: 180,
      width: 320,
      color: 4,
    },
    id,
    name,
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position,
  };
}

function manualNode(id, name, position) {
  return {
    parameters: {},
    id,
    name,
    type: 'n8n-nodes-base.manualTrigger',
    typeVersion: 1,
    position,
  };
}

function workflowBase(id, name, nodes, connections) {
  return {
    id,
    name,
    active: true,
    nodes,
    connections,
    settings: {
      executionOrder: 'v1',
    },
    versionId: `${id}-v1`,
    meta: {
      templateCredsSetupCompleted: true,
    },
    description: 'Novel workflow V1 generated from project SQL/code files.',
  };
}

const listProjectsQuery = `-- Novel project list query with project-level observability.

WITH listed AS (
  SELECT
    false AS is_empty,
    p.id,
    p.title,
    p.genre,
    p.audience,
    p.style,
    p.premise,
    p.target_total_chapters,
    p.target_words_per_chapter,
    p.current_chapter_no,
    p.status,
    p.error,
    p.created_at,
    p.updated_at,
    (COALESCE(job_stats.waiting_job_count, 0) + COALESCE(job_stats.running_job_count, 0))::integer AS pending_job_count,
    COALESCE(job_stats.waiting_job_count, 0)::integer AS waiting_job_count,
    COALESCE(job_stats.running_job_count, 0)::integer AS running_job_count,
    COALESCE(job_stats.failed_job_count, 0)::integer AS failed_job_count,
    COALESCE(job_stats.cancelled_job_count, 0)::integer AS cancelled_job_count,
    COALESCE(chapter_stats.need_review_count, 0)::integer AS need_review_count,
    COALESCE(chapter_stats.approved_chapter_count, 0)::integer AS approved_chapter_count,
    COALESCE(chapter_stats.failed_chapter_count, 0)::integer AS failed_chapter_count,
    latest_job.id AS latest_job_id,
    latest_job.job_type AS latest_job_type,
    latest_job.status AS latest_job_status,
    latest_job.attempt_count AS latest_job_attempt_count,
    latest_job.error_message AS latest_job_error_message,
    latest_job.updated_at AS latest_job_updated_at,
    latest_ai.run_type AS latest_ai_run_type,
    latest_ai.model AS latest_ai_model,
    latest_ai.success AS latest_ai_success,
    latest_ai.duration_ms AS latest_ai_duration_ms,
    latest_ai.created_at AS latest_ai_created_at,
    latest_ai.error_message AS latest_ai_error_message,
    review_chapter.id AS need_review_chapter_id,
    review_chapter.review_token AS need_review_token,
    review_chapter.chapter_no AS need_review_chapter_no,
    review_chapter.title AS need_review_chapter_title
  FROM novel_projects p
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE j.status = 'PENDING')::integer AS waiting_job_count,
      COUNT(*) FILTER (WHERE j.status = 'RUNNING')::integer AS running_job_count,
      COUNT(*) FILTER (WHERE j.status = 'FAILED')::integer AS failed_job_count,
      COUNT(*) FILTER (WHERE j.status = 'CANCELLED')::integer AS cancelled_job_count
    FROM novel_generation_jobs j
    WHERE j.project_id = p.id
      ${excludeStaleNotifyReviewJobsSql}
  ) job_stats ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE c.status = 'NEED_REVIEW')::integer AS need_review_count,
      COUNT(*) FILTER (WHERE c.is_current = TRUE AND c.status IN ('APPROVED', 'PUBLISHED'))::integer AS approved_chapter_count,
      COUNT(*) FILTER (WHERE c.status = 'FAILED')::integer AS failed_chapter_count
    FROM novel_chapters c
    WHERE c.project_id = p.id
  ) chapter_stats ON true
  LEFT JOIN LATERAL (
    SELECT j.*
    FROM novel_generation_jobs j
    WHERE j.project_id = p.id
      ${excludeStaleNotifyReviewJobsSql}
    ORDER BY
      CASE
        WHEN j.status = 'RUNNING' THEN 0
        WHEN j.status = 'PENDING' THEN 1
        ELSE 2
      END,
      j.updated_at DESC,
      j.created_at DESC
    LIMIT 1
  ) latest_job ON true
  LEFT JOIN LATERAL (
    SELECT ai.*
    FROM novel_ai_runs ai
    WHERE ai.project_id = p.id
    ORDER BY ai.created_at DESC
    LIMIT 1
  ) latest_ai ON true
  LEFT JOIN LATERAL (
    SELECT c.*
    FROM novel_chapters c
    WHERE c.project_id = p.id
      AND c.status = 'NEED_REVIEW'
    ORDER BY c.updated_at DESC, c.created_at DESC
    LIMIT 1
  ) review_chapter ON true
  ORDER BY p.updated_at DESC, p.created_at DESC
  LIMIT 100
)
SELECT * FROM listed
UNION ALL
SELECT
  true AS is_empty,
  NULL::uuid AS id,
  NULL::text AS title,
  NULL::text AS genre,
  NULL::text AS audience,
  NULL::text AS style,
  NULL::text AS premise,
  NULL::integer AS target_total_chapters,
  NULL::integer AS target_words_per_chapter,
  NULL::integer AS current_chapter_no,
  NULL::text AS status,
  NULL::text AS error,
  NULL::timestamptz AS created_at,
  NULL::timestamptz AS updated_at,
  0::integer AS pending_job_count,
  0::integer AS waiting_job_count,
  0::integer AS running_job_count,
  0::integer AS failed_job_count,
  0::integer AS cancelled_job_count,
  0::integer AS need_review_count,
  0::integer AS approved_chapter_count,
  0::integer AS failed_chapter_count,
  NULL::uuid AS latest_job_id,
  NULL::text AS latest_job_type,
  NULL::text AS latest_job_status,
  NULL::integer AS latest_job_attempt_count,
  NULL::text AS latest_job_error_message,
  NULL::timestamptz AS latest_job_updated_at,
  NULL::text AS latest_ai_run_type,
  NULL::text AS latest_ai_model,
  NULL::boolean AS latest_ai_success,
  NULL::integer AS latest_ai_duration_ms,
  NULL::timestamptz AS latest_ai_created_at,
  NULL::text AS latest_ai_error_message,
  NULL::uuid AS need_review_chapter_id,
  NULL::text AS need_review_token,
  NULL::integer AS need_review_chapter_no,
  NULL::text AS need_review_chapter_title
WHERE NOT EXISTS (SELECT 1 FROM listed);`;

const projectDetailQuery = `-- Read-only novel project detail query.

WITH input AS (
  SELECT
    NULLIF($1, '')::uuid AS project_id,
    LOWER(COALESCE(NULLIF($2, ''), 'overview')) AS requested_view
), project AS (
  SELECT p.*
  FROM novel_projects p
  WHERE p.id = (SELECT project_id FROM input)
), bible AS (
  SELECT COALESCE(jsonb_build_object(
    'id', b.id,
    'world_setting', b.world_setting,
    'story_core', b.story_core,
    'main_character', b.main_character,
    'supporting_characters', b.supporting_characters,
    'villain_setting', b.villain_setting,
    'power_system', b.power_system,
    'relationship_map', b.relationship_map,
    'organizations', b.organizations,
    'locations', b.locations,
    'plot_constraints', b.plot_constraints,
    'expansion_notes', b.expansion_notes,
    'tone_rules', b.tone_rules,
    'forbidden_rules', b.forbidden_rules,
    'selling_points', b.selling_points,
    'generation_model', b.generation_model,
    'updated_at', b.updated_at
  ), '{}'::jsonb) AS bible
  FROM project p
  LEFT JOIN novel_bibles b ON b.project_id = p.id
), outlines AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'chapter_no', o.chapter_no,
    'volume_no', o.volume_no,
    'title', o.title,
    'summary', o.summary,
    'chapter_goal', o.chapter_goal,
    'conflict_point', o.conflict_point,
    'emotional_point', o.emotional_point,
    'hook', o.hook,
    'status', o.status,
    'updated_at', o.updated_at
  ) ORDER BY o.chapter_no), '[]'::jsonb) AS outlines
  FROM novel_chapter_outlines o
  WHERE o.project_id = (SELECT project_id FROM input)
), director_cards AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'outline_id', d.outline_id,
    'job_id', d.job_id,
    'chapter_no', d.chapter_no,
    'version', d.version,
    'is_current', d.is_current,
    'status', d.status,
    'source', d.source,
    'manual_override', d.manual_override,
    'card_payload', d.card_payload,
    'error', d.error,
    'created_at', d.created_at,
    'updated_at', d.updated_at
  ) ORDER BY d.chapter_no, d.is_current DESC, d.version DESC), '[]'::jsonb) AS director_cards
  FROM novel_chapter_director_cards d
  WHERE d.project_id = (SELECT project_id FROM input)
), chapters AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'outline_id', c.outline_id,
    'chapter_no', c.chapter_no,
    'title', c.title,
    'summary', c.summary,
    'body', c.body,
    'word_count', c.word_count,
    'status', c.status,
    'generation_version', c.generation_version,
    'is_current', c.is_current,
    'review_token', c.review_token,
    'latest_review_report', COALESCE(review_report.latest_review_report, '{}'::jsonb),
    'human_reviews', COALESCE(human_reviews.human_reviews, '[]'::jsonb),
    'ai_runs', COALESCE(chapter_ai_runs.ai_runs, '[]'::jsonb),
    'outline_updated_at', co.updated_at,
    'is_stale', CASE
      WHEN co.id IS NOT NULL AND c.created_at < co.updated_at THEN TRUE
      ELSE FALSE
    END,
    'created_at', c.created_at,
    'updated_at', c.updated_at
  ) ORDER BY c.chapter_no, c.is_current DESC, c.generation_version DESC), '[]'::jsonb) AS chapters
  FROM novel_chapters c
  LEFT JOIN novel_chapter_outlines co ON co.id = c.outline_id
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'id', r.id,
      'ai_run_id', r.ai_run_id,
      'consistency_score', r.consistency_score,
      'readability_score', r.readability_score,
      'plot_score', r.plot_score,
      'commercial_score', r.commercial_score,
      'total_score', r.total_score,
      'issues', r.issues,
      'suggestions', r.suggestions,
      'verdict', r.verdict,
      'created_at', r.created_at
    ) AS latest_review_report
    FROM novel_review_reports r
    WHERE r.chapter_id = c.id
    ORDER BY r.created_at DESC
    LIMIT 1
  ) review_report ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', h.id,
      'action', h.action,
      'comment', h.comment,
      'reviewer', h.reviewer,
      'created_at', h.created_at
    ) ORDER BY h.created_at DESC), '[]'::jsonb) AS human_reviews
    FROM novel_human_reviews h
    WHERE h.chapter_id = c.id
  ) human_reviews ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', ai.id,
      'run_type', ai.run_type,
      'model', ai.model,
      'prompt_version', ai.prompt_version,
      'success', ai.success,
      'duration_ms', ai.duration_ms,
      'request_payload', ai.request_payload,
      'error_message', ai.error_message,
      'created_at', ai.created_at
    ) ORDER BY ai.created_at DESC), '[]'::jsonb) AS ai_runs
    FROM (
      SELECT *
      FROM novel_ai_runs ai
      WHERE ai.chapter_id = c.id
      ORDER BY ai.created_at DESC
      LIMIT 5
    ) ai
  ) chapter_ai_runs ON true
  WHERE c.project_id = (SELECT project_id FROM input)
), facts AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'chapter_id', f.chapter_id,
    'chapter_no', f.chapter_no,
    'chapter_generation_version', f.chapter_generation_version,
    'fact_type', f.fact_type,
    'fact_key', f.fact_key,
    'fact_value', f.fact_value,
    'source', f.source,
    'confidence', f.confidence,
    'status', f.status,
    'created_at', f.created_at
  ) ORDER BY
    CASE f.status WHEN 'ACTIVE' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,
    f.created_at DESC
  ), '[]'::jsonb) AS facts
  FROM (
    SELECT *
    FROM novel_continuity_facts f
    WHERE f.project_id = (SELECT project_id FROM input)
    ORDER BY
      CASE f.status WHEN 'ACTIVE' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,
      f.created_at DESC
    LIMIT 120
  ) f
), bible_patches AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', bp.id,
    'job_id', bp.job_id,
    'ai_run_id', bp.ai_run_id,
    'source', bp.source,
    'expansion_request', bp.expansion_request,
    'expansion_scope', bp.expansion_scope,
    'expansion_constraints', bp.expansion_constraints,
    'patch_payload', bp.patch_payload,
    'risk_notes', bp.risk_notes,
    'status', bp.status,
    'reviewer', bp.reviewer,
    'comment', bp.comment,
    'applied_at', bp.applied_at,
    'created_at', bp.created_at,
    'updated_at', bp.updated_at
  ) ORDER BY
    CASE bp.status WHEN 'PENDING' THEN 0 WHEN 'APPROVED' THEN 1 WHEN 'FAILED' THEN 2 ELSE 3 END,
    bp.created_at DESC
  ), '[]'::jsonb) AS bible_patches
  FROM (
    SELECT *
    FROM novel_bible_patches bp
    WHERE bp.project_id = (SELECT project_id FROM input)
    ORDER BY created_at DESC
    LIMIT 20
  ) bp
), plot_threads AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'director_card_id', t.director_card_id,
    'thread_key', t.thread_key,
    'thread_type', t.thread_type,
    'status', t.status,
    'introduced_chapter', t.introduced_chapter,
    'last_touched_chapter', t.last_touched_chapter,
    'next_touch_chapter', t.next_touch_chapter,
    'payoff_target_chapter', t.payoff_target_chapter,
    'do_not_reveal_before', t.do_not_reveal_before,
    'visibility', t.visibility,
    'notes', t.notes,
    'updated_at', t.updated_at
  ) ORDER BY
    CASE t.status WHEN 'PAYOFF_READY' THEN 0 WHEN 'TOUCHING' THEN 1 WHEN 'ACTIVE' THEN 2 WHEN 'SEEDING' THEN 3 ELSE 4 END,
    t.updated_at DESC), '[]'::jsonb) AS plot_threads
  FROM (
    SELECT *
    FROM novel_plot_threads t
    WHERE t.project_id = (SELECT project_id FROM input)
    ORDER BY updated_at DESC
    LIMIT 120
  ) t
), ai_runs AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ai.id,
    'chapter_id', ai.chapter_id,
    'chapter_no', c.chapter_no,
    'run_type', ai.run_type,
    'model', ai.model,
    'prompt_version', ai.prompt_version,
    'success', ai.success,
    'duration_ms', ai.duration_ms,
    'request_payload', ai.request_payload,
    'error_message', ai.error_message,
    'created_at', ai.created_at
  ) ORDER BY ai.created_at DESC), '[]'::jsonb) AS ai_runs
  FROM (
    SELECT *
    FROM novel_ai_runs ai
    WHERE ai.project_id = (SELECT project_id FROM input)
    ORDER BY ai.created_at DESC
    LIMIT 30
  ) ai
  LEFT JOIN novel_chapters c ON c.id = ai.chapter_id
), jobs AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', j.id,
    'chapter_id', j.chapter_id,
    'chapter_no', COALESCE(j.chapter_no, c.chapter_no),
    'job_type', j.job_type,
    'status', j.status,
    'attempt_count', j.attempt_count,
    'max_attempts', j.max_attempts,
    'error_message', j.error_message,
    'payload', j.payload,
    'created_at', j.created_at,
    'started_at', j.started_at,
    'finished_at', j.finished_at,
    'updated_at', j.updated_at
  ) ORDER BY
    CASE j.status WHEN 'FAILED' THEN 0 WHEN 'RUNNING' THEN 1 WHEN 'PENDING' THEN 2 ELSE 3 END,
    j.updated_at DESC
  ), '[]'::jsonb) AS jobs
  FROM (
    SELECT *
    FROM novel_generation_jobs j
    WHERE j.project_id = (SELECT project_id FROM input)
      ${excludeStaleNotifyReviewJobsSql}
    ORDER BY
      CASE j.status WHEN 'FAILED' THEN 0 WHEN 'RUNNING' THEN 1 WHEN 'PENDING' THEN 2 ELSE 3 END,
      j.updated_at DESC
    LIMIT 40
  ) j
  LEFT JOIN novel_chapters c ON c.id = j.chapter_id
), project_events AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'event_type', e.event_type,
    'actor', e.actor,
    'comment', e.comment,
    'bible_id', e.bible_id,
    'outline_id', e.outline_id,
    'outline_chapter_no', o.chapter_no,
    'chapter_id', e.chapter_id,
    'created_at', e.created_at
  ) ORDER BY e.created_at DESC), '[]'::jsonb) AS project_events
  FROM (
    SELECT *
    FROM novel_project_events e
    WHERE e.project_id = (SELECT project_id FROM input)
    ORDER BY e.created_at DESC
    LIMIT 40
  ) e
  LEFT JOIN novel_chapter_outlines o ON o.id = e.outline_id
)
SELECT
  false AS is_empty,
  p.id,
  p.title,
  p.genre,
  p.audience,
  p.style,
  p.premise,
  p.target_total_chapters,
  p.target_words_per_chapter,
  p.expansion_request,
  p.expansion_scope,
  p.expansion_constraints,
  p.current_chapter_no,
  p.status,
  p.error,
  p.created_at,
  p.updated_at,
  (SELECT requested_view FROM input) AS requested_view,
  bible.bible,
  outlines.outlines,
  director_cards.director_cards,
  chapters.chapters,
  facts.facts,
  bible_patches.bible_patches,
  plot_threads.plot_threads,
  ai_runs.ai_runs,
  jobs.jobs,
  project_events.project_events
FROM project p, bible, outlines, director_cards, chapters, facts, bible_patches, plot_threads, ai_runs, jobs, project_events
UNION ALL
SELECT
  true AS is_empty,
  NULL::uuid AS id,
  NULL::text AS title,
  NULL::text AS genre,
  NULL::text AS audience,
  NULL::text AS style,
  NULL::text AS premise,
  NULL::integer AS target_total_chapters,
  NULL::integer AS target_words_per_chapter,
  NULL::text AS expansion_request,
  'append_only'::text AS expansion_scope,
  NULL::text AS expansion_constraints,
  NULL::integer AS current_chapter_no,
  NULL::text AS status,
  NULL::text AS error,
  NULL::timestamptz AS created_at,
  NULL::timestamptz AS updated_at,
  (SELECT requested_view FROM input) AS requested_view,
  '{}'::jsonb AS bible,
  '[]'::jsonb AS outlines,
  '[]'::jsonb AS director_cards,
  '[]'::jsonb AS chapters,
  '[]'::jsonb AS facts,
  '[]'::jsonb AS bible_patches,
  '[]'::jsonb AS plot_threads,
  '[]'::jsonb AS ai_runs,
  '[]'::jsonb AS jobs,
  '[]'::jsonb AS project_events
WHERE NOT EXISTS (SELECT 1 FROM project);`;

const projectExpansionAssistContextQuery = `-- Read project context for expansion AI assist.

WITH input AS (
  SELECT
    NULLIF($1, '')::uuid AS project_id,
    NULLIF($2, '') AS user_expansion_request,
    COALESCE(NULLIF($3, ''), 'append_only') AS expansion_scope,
    NULLIF($4, '') AS expansion_constraints,
    CASE WHEN NULLIF($5::text, '') ~ '^[0-9]+$' THEN NULLIF($5::text, '')::integer ELSE NULL END AS target_total_chapters,
    CASE WHEN NULLIF($6::text, '') ~ '^[0-9]+$' THEN NULLIF($6::text, '')::integer ELSE NULL END AS target_words_per_chapter,
    NULLIF($7, '') AS assist_nonce,
    NULLIF($8, '') AS requested_at
), project AS (
  SELECT p.*
  FROM novel_projects p
  JOIN input i ON i.project_id = p.id
)
SELECT
  COALESCE(p.id, i.project_id) AS project_id,
  COALESCE(p.title, '') AS title,
  COALESCE(p.genre, '') AS genre,
  COALESCE(p.audience, '') AS audience,
  COALESCE(p.style, '') AS style,
  COALESCE(p.premise, '') AS premise,
  GREATEST(1, COALESCE(i.target_total_chapters, p.target_total_chapters, 20)) AS target_total_chapters,
  GREATEST(300, COALESCE(i.target_words_per_chapter, p.target_words_per_chapter, 2000)) AS target_words_per_chapter,
  COALESCE(i.user_expansion_request, p.expansion_request, '') AS expansion_request,
  COALESCE(i.expansion_scope, p.expansion_scope, 'append_only') AS expansion_scope,
  COALESCE(i.expansion_constraints, p.expansion_constraints, '已批准正文不改；已激活事实不破坏；新增剧情必须承接现有大纲和人物动机。') AS expansion_constraints,
  COALESCE(i.assist_nonce, '') AS assist_nonce,
  COALESCE(i.requested_at, '') AS requested_at,
  CASE WHEN p.id IS NULL THEN false ELSE true END AS project_found,
  bible.novel_bible,
  outlines.existing_outlines,
  chapters.approved_chapters,
  facts.continuity_facts
FROM input i
LEFT JOIN project p ON true
LEFT JOIN LATERAL (
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'world_setting', b.world_setting,
      'story_core', b.story_core,
      'main_character', b.main_character,
      'supporting_characters', b.supporting_characters,
      'villain_setting', b.villain_setting,
      'power_system', b.power_system,
      'relationship_map', b.relationship_map,
      'organizations', b.organizations,
      'locations', b.locations,
      'plot_constraints', b.plot_constraints,
      'expansion_notes', b.expansion_notes,
      'tone_rules', b.tone_rules,
      'forbidden_rules', b.forbidden_rules,
      'selling_points', b.selling_points
    )
    FROM novel_bibles b
    WHERE b.project_id = COALESCE(p.id, i.project_id)
    ORDER BY b.updated_at DESC
    LIMIT 1
  ), '{}'::jsonb) AS novel_bible
) bible ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'chapter_no', picked.chapter_no,
    'volume_no', picked.volume_no,
    'title', picked.title,
    'summary', picked.summary,
    'chapter_goal', picked.chapter_goal,
    'conflict_point', picked.conflict_point,
    'emotional_point', picked.emotional_point,
    'hook', picked.hook,
    'status', picked.status
  ) ORDER BY picked.chapter_no), '[]'::jsonb) AS existing_outlines
  FROM (
    SELECT *
    FROM novel_chapter_outlines o
    WHERE o.project_id = COALESCE(p.id, i.project_id)
    ORDER BY o.chapter_no
    LIMIT 120
  ) picked
) outlines ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'chapter_no', picked.chapter_no,
    'title', picked.title,
    'summary', picked.summary,
    'word_count', picked.word_count,
    'updated_at', picked.updated_at
  ) ORDER BY picked.chapter_no), '[]'::jsonb) AS approved_chapters
  FROM (
    SELECT c.chapter_no, c.title, c.summary, c.word_count, c.updated_at
    FROM novel_chapters c
    WHERE c.project_id = COALESCE(p.id, i.project_id)
      AND c.is_current = TRUE
      AND c.status IN ('APPROVED', 'PUBLISHED')
    ORDER BY c.chapter_no DESC
    LIMIT 30
  ) picked
) chapters ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'chapter_no', picked.chapter_no,
    'fact_type', picked.fact_type,
    'fact_key', picked.fact_key,
    'fact_value', picked.fact_value,
    'confidence', picked.confidence,
    'source', picked.source
  ) ORDER BY picked.chapter_no NULLS LAST, picked.created_at DESC), '[]'::jsonb) AS continuity_facts
  FROM (
    SELECT *
    FROM novel_continuity_facts f
    WHERE f.project_id = COALESCE(p.id, i.project_id)
      AND f.status = 'ACTIVE'
    ORDER BY f.created_at DESC
    LIMIT 120
  ) picked
) facts ON true;`;

const queueStatusQuery = `-- Read-only novel queue status query.

WITH input AS (
  SELECT
    CASE
      WHEN NULLIF($1, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN NULLIF($1, '')::uuid
      ELSE NULL
    END AS project_id
), scoped_jobs AS (
  SELECT j.*
  FROM novel_generation_jobs j
  CROSS JOIN input i
  WHERE (i.project_id IS NULL OR j.project_id = i.project_id)
    ${excludeStaleNotifyReviewJobsSql}
), stats AS (
  SELECT
    COUNT(*)::integer AS queue_total_count,
    COUNT(*) FILTER (WHERE status = 'PENDING')::integer AS queue_waiting_count,
    COUNT(*) FILTER (WHERE status = 'RUNNING')::integer AS queue_running_count,
    COUNT(*) FILTER (WHERE status = 'FAILED')::integer AS queue_failed_count,
    COUNT(*) FILTER (
      WHERE status = 'SUCCEEDED'
        AND COALESCE(finished_at, updated_at, created_at) >= date_trunc('day', NOW())
    )::integer AS queue_succeeded_today_count
  FROM scoped_jobs
), listed AS (
  SELECT
    false AS is_empty,
    stats.queue_total_count,
    stats.queue_waiting_count,
    stats.queue_running_count,
    stats.queue_failed_count,
    stats.queue_succeeded_today_count,
    j.id AS job_id,
    j.project_id,
    p.title AS project_title,
    j.chapter_id,
    COALESCE(j.chapter_no, c.chapter_no) AS chapter_no,
    c.title AS chapter_title,
    j.job_type,
    j.status,
    j.attempt_count,
    j.max_attempts,
    j.error_message,
    j.created_at,
    j.started_at,
    j.finished_at,
    j.updated_at,
    latest_ai.run_type AS latest_ai_run_type,
    latest_ai.success AS latest_ai_success,
    latest_ai.duration_ms AS latest_ai_duration_ms,
    latest_ai.error_message AS latest_ai_error_message,
    latest_ai.created_at AS latest_ai_created_at
  FROM stats
  JOIN scoped_jobs j ON true
  JOIN novel_projects p ON p.id = j.project_id
  LEFT JOIN novel_chapters c ON c.id = j.chapter_id
  LEFT JOIN LATERAL (
    SELECT ai.*
    FROM novel_ai_runs ai
    WHERE ai.job_id = j.id
       OR (
         j.chapter_id IS NOT NULL
         AND ai.project_id = j.project_id
         AND ai.chapter_id = j.chapter_id
       )
       OR (
         j.chapter_id IS NULL
         AND ai.project_id = j.project_id
         AND ai.chapter_id IS NULL
         AND ai.run_type = j.job_type
       )
    ORDER BY ai.created_at DESC
    LIMIT 1
  ) latest_ai ON true
  ORDER BY
    CASE j.status
      WHEN 'FAILED' THEN 0
      WHEN 'RUNNING' THEN 1
      WHEN 'PENDING' THEN 2
      ELSE 3
    END,
    j.updated_at DESC,
    j.created_at DESC
  LIMIT 120
)
SELECT * FROM listed
UNION ALL
SELECT
  true AS is_empty,
  stats.queue_total_count,
  stats.queue_waiting_count,
  stats.queue_running_count,
  stats.queue_failed_count,
  stats.queue_succeeded_today_count,
  NULL::uuid AS job_id,
  NULL::uuid AS project_id,
  NULL::text AS project_title,
  NULL::uuid AS chapter_id,
  NULL::integer AS chapter_no,
  NULL::text AS chapter_title,
  NULL::text AS job_type,
  NULL::text AS status,
  NULL::integer AS attempt_count,
  NULL::integer AS max_attempts,
  NULL::text AS error_message,
  NULL::timestamptz AS created_at,
  NULL::timestamptz AS started_at,
  NULL::timestamptz AS finished_at,
  NULL::timestamptz AS updated_at,
  NULL::text AS latest_ai_run_type,
  NULL::boolean AS latest_ai_success,
  NULL::integer AS latest_ai_duration_ms,
  NULL::text AS latest_ai_error_message,
  NULL::timestamptz AS latest_ai_created_at
FROM stats
WHERE NOT EXISTS (SELECT 1 FROM scoped_jobs);`;

const dailyReportQuery = `-- Read-only novel daily report query.

WITH bounds AS (
  SELECT
    date_trunc('day', NOW()) AS day_start,
    date_trunc('day', NOW()) + interval '1 day' AS day_end
), job_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE COALESCE(j.finished_at, j.updated_at, j.created_at) >= b.day_start AND COALESCE(j.finished_at, j.updated_at, j.created_at) < b.day_end)::integer AS today_job_total_count,
    COUNT(*) FILTER (WHERE j.status = 'SUCCEEDED' AND COALESCE(j.finished_at, j.updated_at, j.created_at) >= b.day_start AND COALESCE(j.finished_at, j.updated_at, j.created_at) < b.day_end)::integer AS today_job_succeeded_count,
    COUNT(*) FILTER (WHERE j.status = 'FAILED' AND COALESCE(j.finished_at, j.updated_at, j.created_at) >= b.day_start AND COALESCE(j.finished_at, j.updated_at, j.created_at) < b.day_end)::integer AS today_job_failed_count,
    COUNT(*) FILTER (WHERE j.status = 'CANCELLED' AND COALESCE(j.finished_at, j.updated_at, j.created_at) >= b.day_start AND COALESCE(j.finished_at, j.updated_at, j.created_at) < b.day_end)::integer AS today_job_cancelled_count,
    COUNT(*) FILTER (WHERE j.status = 'PENDING')::integer AS waiting_job_count,
    COUNT(*) FILTER (WHERE j.status = 'RUNNING')::integer AS running_job_count,
    COUNT(*) FILTER (WHERE j.status = 'FAILED')::integer AS failed_job_count
  FROM novel_generation_jobs j
  CROSS JOIN bounds b
), ai_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE ai.created_at >= b.day_start AND ai.created_at < b.day_end)::integer AS today_ai_run_count,
    COUNT(*) FILTER (WHERE ai.success = TRUE AND ai.created_at >= b.day_start AND ai.created_at < b.day_end)::integer AS today_ai_success_count,
    COUNT(*) FILTER (WHERE ai.success = FALSE AND ai.created_at >= b.day_start AND ai.created_at < b.day_end)::integer AS today_ai_failed_count,
    ROUND(AVG(ai.duration_ms) FILTER (WHERE ai.created_at >= b.day_start AND ai.created_at < b.day_end))::integer AS avg_ai_duration_ms,
    MAX(ai.duration_ms) FILTER (WHERE ai.created_at >= b.day_start AND ai.created_at < b.day_end)::integer AS max_ai_duration_ms
  FROM novel_ai_runs ai
  CROSS JOIN bounds b
), chapter_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE c.status = 'NEED_REVIEW')::integer AS need_review_count
  FROM novel_chapters c
), project_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE p.status IN ('CREATED', 'BIBLE_READY', 'OUTLINE_READY', 'WRITING', 'REVIEWING'))::integer AS active_project_count,
    COUNT(*) FILTER (WHERE p.status = 'COMPLETED')::integer AS completed_project_count
  FROM novel_projects p
), latest_failed AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'project_title', x.project_title,
    'chapter_no', x.chapter_no,
    'chapter_title', x.chapter_title,
    'job_type', x.job_type,
    'status', x.status,
    'error_message', x.error_message,
    'updated_at', x.updated_at
  ) ORDER BY x.updated_at DESC), '[]'::jsonb) AS latest_failed_jobs
  FROM (
    SELECT
      p.title AS project_title,
      COALESCE(j.chapter_no, c.chapter_no) AS chapter_no,
      c.title AS chapter_title,
      j.job_type,
      j.status,
      j.error_message,
      j.updated_at
    FROM novel_generation_jobs j
    JOIN novel_projects p ON p.id = j.project_id
    LEFT JOIN novel_chapters c ON c.id = j.chapter_id
    WHERE j.status = 'FAILED'
    ORDER BY j.updated_at DESC, j.created_at DESC
    LIMIT 8
  ) x
), slow_runs AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'project_title', x.project_title,
    'chapter_no', x.chapter_no,
    'run_type', x.run_type,
    'success', x.success,
    'duration_ms', x.duration_ms,
    'created_at', x.created_at
  ) ORDER BY x.duration_ms DESC NULLS LAST, x.created_at DESC), '[]'::jsonb) AS slow_ai_runs
  FROM (
    SELECT
      p.title AS project_title,
      c.chapter_no,
      ai.run_type,
      ai.success,
      ai.duration_ms,
      ai.created_at
    FROM novel_ai_runs ai
    LEFT JOIN novel_projects p ON p.id = ai.project_id
    LEFT JOIN novel_chapters c ON c.id = ai.chapter_id
    CROSS JOIN bounds b
    WHERE ai.created_at >= b.day_start
      AND ai.created_at < b.day_end
    ORDER BY ai.duration_ms DESC NULLS LAST, ai.created_at DESC
    LIMIT 8
  ) x
), snapshot_history AS (
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'report_date', s.report_date,
    'captured_at', s.captured_at,
    'today_job_total_count', s.today_job_total_count,
    'today_job_failed_count', s.today_job_failed_count,
    'today_ai_run_count', s.today_ai_run_count,
    'waiting_job_count', s.waiting_job_count,
    'failed_job_count', s.failed_job_count,
    'need_review_count', s.need_review_count
  ) ORDER BY s.report_date DESC), '[]'::jsonb) AS snapshot_history
  FROM (
    SELECT *
    FROM novel_daily_report_snapshots
    ORDER BY report_date DESC
    LIMIT 7
  ) s
)
SELECT
  false AS is_empty,
  to_char((SELECT day_start FROM bounds), 'YYYY-MM-DD') AS report_date,
  job_stats.today_job_total_count,
  job_stats.today_job_succeeded_count,
  job_stats.today_job_failed_count,
  job_stats.today_job_cancelled_count,
  ai_stats.today_ai_run_count,
  ai_stats.today_ai_success_count,
  ai_stats.today_ai_failed_count,
  COALESCE(ai_stats.avg_ai_duration_ms, 0)::integer AS avg_ai_duration_ms,
  COALESCE(ai_stats.max_ai_duration_ms, 0)::integer AS max_ai_duration_ms,
  job_stats.waiting_job_count,
  job_stats.running_job_count,
  job_stats.failed_job_count,
  chapter_stats.need_review_count,
  project_stats.active_project_count,
  project_stats.completed_project_count,
  latest_failed.latest_failed_jobs,
  slow_runs.slow_ai_runs,
  snapshot_history.snapshot_history
FROM job_stats, ai_stats, chapter_stats, project_stats, latest_failed, slow_runs, snapshot_history;`;

const createProjectQuery = `-- Create a novel project and enqueue Bible generation.

WITH project AS (
  INSERT INTO novel_projects (
    title,
    genre,
    audience,
    style,
    premise,
    target_total_chapters,
    target_words_per_chapter,
    status
  )
  VALUES (
    trim($1),
    trim($2),
    NULLIF(trim($3), ''),
    NULLIF(trim($4), ''),
    NULLIF(trim($5), ''),
    COALESCE(NULLIF($6::text, '')::integer, 20),
    COALESCE(NULLIF($7::text, '')::integer, 2000),
    'CREATED'
  )
  RETURNING *
), job AS (
  INSERT INTO novel_generation_jobs (project_id, job_type, status)
  SELECT id, 'GENERATE_BIBLE', 'PENDING'
  FROM project
  ON CONFLICT DO NOTHING
  RETURNING *
)
SELECT
  true AS success,
  'NOVEL_PROJECT_CREATED'::text AS result_code,
  201 AS response_status_code,
  project.id,
  project.title,
  project.genre,
  project.status,
  project.target_total_chapters,
  project.target_words_per_chapter,
  job.id AS generation_job_id,
  job.job_type,
  job.status AS job_status
FROM project
LEFT JOIN job ON true;`;

const continueProjectQuery = `-- Continue a novel project by enqueueing the next safe job.
SELECT *
FROM continue_novel_project(
  $1::uuid,
  NULLIF($2, ''),
  COALESCE(NULLIF($3, ''), 'local_user')
);`;

const regenerateProjectAssetQuery = `-- Request Bible or outline regeneration for a project.
SELECT *
FROM request_novel_project_regeneration(
  $1::uuid,
  $2,
  NULLIF($3, ''),
  COALESCE(NULLIF($4, ''), 'local_user'),
  NULLIF($5, '')
);`;

const requestApprovedRewriteQuery = `-- Request rewrite for the current approved chapter version.
SELECT *
FROM request_novel_current_chapter_rewrite(
  $1::uuid,
  $2,
  NULLIF($3, ''),
  COALESCE(NULLIF($4, ''), 'local_user')
);`;

const startRewriteWorkerQuery = `-- Start or recover an existing rewrite job from the project console.
WITH input AS (
  SELECT
    $1::uuid AS project_id,
    $2::uuid AS job_id
), target AS (
  SELECT
    j.id,
    j.project_id,
    j.job_type,
    COALESCE(j.chapter_no, c.chapter_no) AS chapter_no,
    j.status AS job_status,
    j.attempt_count,
    j.max_attempts,
    j.started_at,
    p.status AS project_status,
    c.status AS chapter_status,
    (j.status = 'RUNNING' AND j.started_at < NOW() - INTERVAL '6 minutes') AS should_recover
  FROM input i
  JOIN novel_generation_jobs j ON j.id = i.job_id AND j.project_id = i.project_id
  JOIN novel_projects p ON p.id = j.project_id
  LEFT JOIN novel_chapters c ON c.id = j.chapter_id
  WHERE j.job_type = 'REWRITE_CHAPTER'
    AND j.status IN ('PENDING', 'RUNNING')
    AND j.attempt_count < j.max_attempts
    AND p.status NOT IN ('PAUSED', 'ARCHIVED')
  LIMIT 1
), recovered AS (
  UPDATE novel_generation_jobs j
  SET
    status = 'PENDING',
    error_message = '手动恢复：重写任务运行超时，重新排队',
    started_at = NULL,
    updated_at = NOW()
  FROM target t
  WHERE j.id = t.id
    AND t.should_recover = TRUE
  RETURNING j.id
), startable AS (
  SELECT
    t.*,
    EXISTS (SELECT 1 FROM recovered r WHERE r.id = t.id) AS was_recovered
  FROM target t
  WHERE t.job_status = 'PENDING'
     OR t.should_recover = TRUE
)
SELECT
  true AS success,
  CASE WHEN startable.was_recovered THEN 'REWRITE_WORKER_RECOVERED' ELSE 'REWRITE_WORKER_START_REQUESTED' END::text AS result_code,
  'START_REWRITE_WORKER'::text AS action,
  startable.project_id,
  startable.project_status,
  startable.job_type,
  startable.chapter_no,
  startable.id AS job_id,
  startable.chapter_status,
  CASE
    WHEN startable.was_recovered THEN '已将运行超时的第 ' || COALESCE(startable.chapter_no::text, '?') || ' 章重写任务恢复为待执行，并重新启动后台 worker。'
    ELSE '已启动第 ' || COALESCE(startable.chapter_no::text, '?') || ' 章重写任务，模型调用会在后台执行。'
  END AS message
FROM startable
UNION ALL
SELECT
  false AS success,
  CASE
    WHEN EXISTS (SELECT 1 FROM target t WHERE t.job_status = 'RUNNING') THEN 'REWRITE_JOB_STILL_RUNNING'
    ELSE 'REWRITE_JOB_NOT_STARTABLE'
  END::text AS result_code,
  'START_REWRITE_WORKER'::text AS action,
  input.project_id,
  NULL::text AS project_status,
  NULL::text AS job_type,
  NULL::integer AS chapter_no,
  input.job_id,
  NULL::text AS chapter_status,
  CASE
    WHEN EXISTS (SELECT 1 FROM target t WHERE t.job_status = 'RUNNING') THEN '重写任务仍在运行，尚未超过 6 分钟恢复阈值；请稍后再恢复或查看队列。'
    ELSE '没有可启动或可恢复的重写任务。任务可能已完成、已失败，或项目已暂停/归档。'
  END AS message
FROM input
WHERE NOT EXISTS (SELECT 1 FROM startable);`;

const prepareApprovedRewriteLaunchCode = `// n8n Code node: Prepare async rewrite launch after a project console rewrite request.
const row = $json || {};
const success = row.success === true || row.success === 'true';
const shouldLaunch = success && row.action === 'REQUEST_APPROVED_REWRITE' && row.job_id;
return [{
  json: {
    ...row,
    should_launch_rewrite_worker: Boolean(shouldLaunch),
    job_id: row.job_id || '',
    rewrite_job_id: row.job_id || '',
  },
}];`;

const prepareRewriteStartLaunchCode = `// n8n Code node: Prepare async rewrite launch for an existing pending rewrite job.
const row = $json || {};
const success = row.success === true || row.success === 'true';
const shouldLaunch = success && row.action === 'START_REWRITE_WORKER' && row.job_id;
return [{
  json: {
    ...row,
    should_launch_rewrite_worker: Boolean(shouldLaunch),
    job_id: row.job_id || '',
    rewrite_job_id: row.job_id || '',
  },
}];`;

const resendReviewNotificationQuery = `-- Recreate review notification job for a NEED_REVIEW chapter.
SELECT *
FROM request_novel_review_notification(
  $1::uuid,
  $2,
  NULLIF($3, ''),
  COALESCE(NULLIF($4, ''), 'local_user')
);`;

const updateBibleManualQuery = `-- Manually update a novel Bible.
SELECT *
FROM update_novel_bible_manual(
  $1::uuid,
  NULLIF($2, ''),
  NULLIF($3, ''),
  COALESCE(NULLIF($4, '')::jsonb, '{}'::jsonb),
  COALESCE(NULLIF($5, '')::jsonb, '[]'::jsonb),
  COALESCE(NULLIF($6, '')::jsonb, '[]'::jsonb),
  NULLIF($7, ''),
  COALESCE(NULLIF($8, '')::jsonb, '[]'::jsonb),
  NULLIF($9, ''),
  NULLIF($10, ''),
  COALESCE(NULLIF($11, '')::jsonb, '[]'::jsonb),
  NULLIF($12, ''),
  COALESCE(NULLIF($13, ''), 'local_user'),
  COALESCE(NULLIF($14, '')::jsonb, '[]'::jsonb),
  COALESCE(NULLIF($15, '')::jsonb, '[]'::jsonb),
  COALESCE(NULLIF($16, '')::jsonb, '[]'::jsonb),
  NULLIF($17, '')
);`;

const updateOutlineManualQuery = `-- Manually update a chapter outline.
SELECT *
FROM update_novel_outline_manual(
  $1::uuid,
  $2::uuid,
  $3::integer,
  NULLIF($4, ''),
  NULLIF($5, ''),
  NULLIF($6, ''),
  NULLIF($7, ''),
  NULLIF($8, ''),
  NULLIF($9, ''),
  NULLIF($10, ''),
  COALESCE(NULLIF($11, ''), 'local_user')
);`;

const updateProjectTargetsQuery = `-- Update project target chapters and words per chapter.
SELECT *
FROM update_novel_project_targets(
  $1::uuid,
  $2::integer,
  $3::integer,
  NULLIF($4, ''),
  COALESCE(NULLIF($5, ''), 'local_user'),
  NULLIF($6, ''),
  COALESCE(NULLIF($7, ''), 'append_only'),
  NULLIF($8, '')
);`;

const toggleProjectPauseQuery = `-- Pause or resume a novel project.
SELECT *
FROM set_novel_project_pause_state(
  $1::uuid,
  $2,
  NULLIF($3, ''),
  COALESCE(NULLIF($4, ''), 'local_user')
);`;

const manualChapterEditQuery = `-- Save manual chapter edits either as a review candidate or in place.
WITH input AS (
  SELECT COALESCE(NULLIF($8, ''), 'CANDIDATE_REVIEW') AS edit_mode
), direct_save AS (
  SELECT saved.*
  FROM input,
    LATERAL save_novel_chapter_manual_edit(
      $1::uuid,
      $2,
      NULLIF($3, ''),
      $4,
      NULLIF($5, ''),
      NULLIF($6, ''),
      COALESCE(NULLIF($7, ''), 'local_user')
    ) saved
  WHERE input.edit_mode = 'DIRECT_SAVE'
), candidate_review AS (
  SELECT candidate.*
  FROM input,
    LATERAL create_novel_manual_chapter_candidate(
      $1::uuid,
      $2,
      NULLIF($3, ''),
      $4,
      NULLIF($5, ''),
      NULLIF($6, ''),
      COALESCE(NULLIF($7, ''), 'local_user')
    ) candidate
  WHERE input.edit_mode <> 'DIRECT_SAVE'
)
SELECT * FROM direct_save
UNION ALL
SELECT * FROM candidate_review;`;

const toggleProjectArchiveQuery = `-- Archive or restore a novel project.
SELECT *
FROM set_novel_project_archive_state(
  $1::uuid,
  $2,
  NULLIF($3, ''),
  NULLIF($4, ''),
  COALESCE(NULLIF($5, ''), 'local_user')
);`;

const clearArchivedProjectsQuery = `-- Permanently clear archived novel projects.
SELECT *
FROM clear_novel_archived_projects(
  NULLIF($1, ''),
  COALESCE(NULLIF($2, ''), 'local_user')
);`;

const manageProjectFactQuery = `-- Create or update one continuity fact from the project console.
SELECT *
FROM manage_novel_project_fact(
  $1::uuid,
  NULLIF($2, '')::uuid,
  $3,
  $4,
  NULLIF($5, ''),
  NULLIF($6, ''),
  NULLIF($7::text, '')::integer,
  NULLIF($8, ''),
  NULLIF($9, ''),
  COALESCE(NULLIF($10, ''), 'local_user')
);`;

const clearStaleChaptersQuery = `-- Clear stale chapter versions generated before the current outline update.
SELECT *
FROM clear_novel_stale_chapters(
  $1::uuid,
  NULLIF($2, ''),
  COALESCE(NULLIF($3, ''), 'local_user')
);`;

const claimBibleQuery = `-- Claim one pending GENERATE_BIBLE job.
WITH claimed AS (
  SELECT j.id
  FROM novel_generation_jobs j
  JOIN novel_projects p ON p.id = j.project_id
  WHERE j.job_type = 'GENERATE_BIBLE'
    AND j.status = 'PENDING'
    AND j.attempt_count < j.max_attempts
    AND p.status NOT IN ('PAUSED', 'ARCHIVED')
  ORDER BY j.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE novel_generation_jobs j
SET
  status = 'RUNNING',
  started_at = NOW(),
  attempt_count = attempt_count + 1,
  updated_at = NOW()
FROM claimed
WHERE j.id = claimed.id
RETURNING j.*;`;

const claimOutlineQuery = claimBibleQuery.replace(/GENERATE_BIBLE/g, 'GENERATE_OUTLINE');
const claimBiblePatchQuery = claimBibleQuery.replace(/GENERATE_BIBLE/g, 'GENERATE_BIBLE_PATCH');

const claimBibleForProjectQuery = `-- Claim one pending GENERATE_BIBLE job for a specific project and always return browser-friendly state.
WITH requested AS (
  SELECT $1::uuid AS project_id
), project AS (
  SELECT id, status
  FROM novel_projects
  WHERE id = (SELECT project_id FROM requested)
), claimed AS (
  SELECT j.id
  FROM novel_generation_jobs j
  JOIN novel_projects p ON p.id = j.project_id
  WHERE j.project_id = (SELECT project_id FROM requested)
    AND j.job_type = 'GENERATE_BIBLE'
    AND j.status = 'PENDING'
    AND j.attempt_count < j.max_attempts
    AND p.status NOT IN ('PAUSED', 'ARCHIVED')
  ORDER BY j.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1
), updated AS (
  UPDATE novel_generation_jobs j
  SET
    status = 'RUNNING',
    started_at = NOW(),
    attempt_count = attempt_count + 1,
    payload = COALESCE(j.payload, '{}'::jsonb) || jsonb_build_object('trigger_source', 'front_immediate'),
    updated_at = NOW()
  FROM claimed
  WHERE j.id = claimed.id
  RETURNING j.*
)
SELECT TRUE AS claim_success, NULL::text AS claim_reason, updated.*
FROM updated
UNION ALL
SELECT
  FALSE AS claim_success,
  CASE
    WHEN (SELECT status FROM project) = 'PAUSED' THEN 'PROJECT_PAUSED'
    WHEN (SELECT status FROM project) = 'ARCHIVED' THEN 'PROJECT_ARCHIVED'
    ELSE 'JOB_NOT_FOUND_OR_ALREADY_CLAIMED'
  END AS claim_reason,
  NULL::uuid AS id,
  (SELECT project_id FROM requested) AS project_id,
  NULL::uuid AS chapter_id,
  'GENERATE_BIBLE'::text AS job_type,
  NULL::integer AS chapter_no,
  '{}'::jsonb AS payload,
  NULL::text AS status,
  NULL::integer AS attempt_count,
  NULL::integer AS max_attempts,
  NULL::text AS error_message,
  NULL::timestamptz AS created_at,
  NULL::timestamptz AS started_at,
  NULL::timestamptz AS finished_at,
  NULL::timestamptz AS updated_at
WHERE NOT EXISTS (SELECT 1 FROM updated);`;

const claimOutlineForProjectQuery = claimBibleForProjectQuery.replace(/GENERATE_BIBLE/g, 'GENERATE_OUTLINE');
const claimBiblePatchForProjectQuery = claimBibleForProjectQuery.replace(/GENERATE_BIBLE/g, 'GENERATE_BIBLE_PATCH');

const readProjectForBibleQuery = `-- Read project data for Bible generation.
WITH job AS (
  SELECT *
  FROM novel_generation_jobs
  WHERE id = $1::uuid
)
  SELECT
    p.id,
    p.title,
    p.genre,
    p.audience,
    p.style,
    COALESCE(job.payload->>'premise_override', job.payload->>'regenerate_prompt', p.premise) AS premise,
    p.target_total_chapters,
    p.target_words_per_chapter,
    p.current_chapter_no,
    p.status,
    p.error,
    p.created_at,
    p.updated_at,
    p.id AS project_id,
    $1::uuid AS job_id,
    COALESCE(job.payload->>'trigger_source', 'queue') AS trigger_source,
    job.payload->>'requested_by' AS requested_by,
    job.payload->>'regenerate_prompt' AS regenerate_prompt,
    'GENERATE_BIBLE'::text AS run_type
FROM novel_projects p
LEFT JOIN job ON job.project_id = p.id
WHERE p.id = $2::uuid;`;

const readProjectForBiblePatchQuery = `-- Read project, Bible, outline, approved text, and facts for expansion Bible patch generation.
WITH job AS (
  SELECT *
  FROM novel_generation_jobs
  WHERE id = $1::uuid
)
SELECT
  p.id,
  p.id AS project_id,
  p.title,
  p.genre,
  p.audience,
  p.style,
  p.premise,
  p.target_total_chapters,
  p.target_words_per_chapter,
  p.expansion_request,
  p.expansion_scope,
  p.expansion_constraints,
  p.current_chapter_no,
  p.status,
  $1::uuid AS job_id,
  COALESCE(job.payload->>'trigger_source', 'queue') AS trigger_source,
  job.payload->>'requested_by' AS requested_by,
  job.payload->>'comment' AS bible_patch_request_comment,
  'GENERATE_BIBLE_PATCH'::text AS run_type,
  jsonb_build_object(
    'world_setting', b.world_setting,
    'story_core', b.story_core,
    'main_character', b.main_character,
    'supporting_characters', b.supporting_characters,
    'villain_setting', b.villain_setting,
    'organizations', b.organizations,
    'locations', b.locations,
    'power_system', b.power_system,
    'relationship_map', b.relationship_map,
    'plot_constraints', b.plot_constraints,
    'expansion_notes', b.expansion_notes,
    'tone_rules', b.tone_rules,
    'forbidden_rules', b.forbidden_rules,
    'selling_points', b.selling_points
  ) AS novel_bible,
  COALESCE(existing.existing_outlines, '[]'::jsonb) AS existing_outlines,
  COALESCE(approved.approved_chapters, '[]'::jsonb) AS approved_chapters,
  COALESCE(facts.continuity_facts, '[]'::jsonb) AS continuity_facts
FROM novel_projects p
JOIN novel_bibles b ON b.project_id = p.id
LEFT JOIN job ON job.project_id = p.id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'chapter_no', o.chapter_no,
    'title', o.title,
    'summary', o.summary,
    'chapter_goal', o.chapter_goal,
    'conflict_point', o.conflict_point,
    'hook', o.hook,
    'status', o.status
  ) ORDER BY o.chapter_no) AS existing_outlines
  FROM novel_chapter_outlines o
  WHERE o.project_id = p.id
) existing ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'chapter_no', c.chapter_no,
    'title', c.title,
    'summary', c.summary,
    'ending_excerpt', right(COALESCE(c.body, ''), 400)
  ) ORDER BY c.chapter_no) AS approved_chapters
  FROM novel_chapters c
  WHERE c.project_id = p.id
    AND c.is_current = TRUE
    AND c.status IN ('APPROVED', 'PUBLISHED')
) approved ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'fact_type', f.fact_type,
    'fact_key', f.fact_key,
    'fact_value', f.fact_value,
    'chapter_no', f.chapter_no,
    'source', f.source
  ) ORDER BY f.chapter_no NULLS LAST, f.created_at DESC) AS continuity_facts
  FROM novel_continuity_facts f
  WHERE f.project_id = p.id
    AND f.status = 'ACTIVE'
) facts ON true
WHERE p.id = $2::uuid;`;

const readProjectForOutlineQuery = `-- Read project and Bible data for outline generation.
WITH job AS (
  SELECT *
  FROM novel_generation_jobs
  WHERE id = $1::uuid
)
  SELECT
    p.id,
    p.title,
    p.genre,
    p.audience,
    p.style,
    p.premise,
    p.target_total_chapters,
    p.target_words_per_chapter,
    p.expansion_request,
    p.expansion_scope,
    p.expansion_constraints,
    p.current_chapter_no,
    p.status,
    p.error,
    p.created_at,
    p.updated_at,
    p.id AS project_id,
    $1::uuid AS job_id,
    COALESCE(job.payload->>'trigger_source', 'queue') AS trigger_source,
    job.payload->>'requested_by' AS requested_by,
    job.payload->>'comment' AS outline_request_comment,
    'GENERATE_OUTLINE'::text AS run_type,
  b.world_setting,
  b.story_core,
  b.main_character,
  b.supporting_characters,
  b.villain_setting,
  b.power_system,
  b.relationship_map,
  b.organizations,
  b.locations,
  b.plot_constraints,
  b.expansion_notes,
  b.tone_rules,
  b.forbidden_rules,
  b.selling_points,
  COALESCE(existing.existing_outlines, '[]'::jsonb) AS existing_outlines,
  COALESCE(approved.approved_chapters, '[]'::jsonb) AS approved_chapters
FROM novel_projects p
JOIN novel_bibles b ON b.project_id = p.id
LEFT JOIN job ON job.project_id = p.id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'chapter_no', o.chapter_no,
    'volume_no', o.volume_no,
    'title', o.title,
    'summary', o.summary,
    'chapter_goal', o.chapter_goal,
    'conflict_point', o.conflict_point,
    'emotional_point', o.emotional_point,
    'hook', o.hook,
    'status', o.status
  ) ORDER BY o.chapter_no) AS existing_outlines
  FROM novel_chapter_outlines o
  WHERE o.project_id = p.id
) existing ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'chapter_no', c.chapter_no,
    'title', c.title,
    'summary', c.summary,
    'ending_excerpt', right(COALESCE(c.body, ''), 500)
  ) ORDER BY c.chapter_no) AS approved_chapters
  FROM novel_chapters c
  WHERE c.project_id = p.id
    AND c.is_current = TRUE
    AND c.status IN ('APPROVED', 'PUBLISHED')
) approved ON true
WHERE p.id = $2::uuid;`;

const recordAiRunQuery = `-- Record one AI run.
WITH input AS (
  SELECT
    NULLIF($12, '')::timestamptz AS started_at,
    NULLIF($13, '')::timestamptz AS finished_at
)
INSERT INTO novel_ai_runs (
  project_id,
  chapter_id,
  job_id,
  run_type,
  model,
  prompt_version,
  request_payload,
  response_payload,
  parsed_payload,
  success,
  error_message,
  started_at,
  finished_at,
  duration_ms
)
SELECT
  NULLIF($1, '')::uuid,
  NULLIF($2, '')::uuid,
  NULLIF($3, '')::uuid,
  $4,
  NULLIF($5, ''),
  NULLIF($6, ''),
  COALESCE(NULLIF($7, '')::jsonb, '{}'::jsonb),
  COALESCE(NULLIF($8, '')::jsonb, '{}'::jsonb),
  COALESCE(NULLIF($9, '')::jsonb, '{}'::jsonb),
  COALESCE(NULLIF($10::text, '')::boolean, TRUE),
  NULLIF($11, ''),
  input.started_at,
  input.finished_at,
  CASE
    WHEN input.started_at IS NOT NULL AND input.finished_at IS NOT NULL
      THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (input.finished_at - input.started_at)) * 1000)::integer)
    ELSE NULL
  END
FROM input
RETURNING *;`;

const upsertBibleQuery = `-- Upsert generated Bible and enqueue outline generation.
WITH bible AS (
  INSERT INTO novel_bibles (
    project_id,
    world_setting,
    story_core,
    main_character,
    supporting_characters,
    villain_setting,
    power_system,
    relationship_map,
    organizations,
    locations,
    plot_constraints,
    expansion_notes,
    tone_rules,
    forbidden_rules,
    selling_points,
    generation_model,
    raw_payload
  )
  VALUES (
    $1::uuid,
    $2,
    $3,
    COALESCE(NULLIF($4, '')::jsonb, '{}'::jsonb),
    COALESCE(NULLIF($5, '')::jsonb, '[]'::jsonb),
    COALESCE(NULLIF($6, '')::jsonb, '[]'::jsonb),
    $7,
    COALESCE(NULLIF($8, '')::jsonb, '[]'::jsonb),
    COALESCE(NULLIF($9, '')::jsonb, '[]'::jsonb),
    COALESCE(NULLIF($10, '')::jsonb, '[]'::jsonb),
    COALESCE(NULLIF($11, '')::jsonb, '[]'::jsonb),
    NULLIF($12, ''),
    $13,
    $14,
    COALESCE(NULLIF($15, '')::jsonb, '[]'::jsonb),
    $16,
    COALESCE(NULLIF($17, '')::jsonb, '{}'::jsonb)
  )
  ON CONFLICT (project_id) DO UPDATE
  SET
    world_setting = EXCLUDED.world_setting,
    story_core = EXCLUDED.story_core,
    main_character = EXCLUDED.main_character,
    supporting_characters = EXCLUDED.supporting_characters,
    villain_setting = EXCLUDED.villain_setting,
    power_system = EXCLUDED.power_system,
    relationship_map = EXCLUDED.relationship_map,
    organizations = EXCLUDED.organizations,
    locations = EXCLUDED.locations,
    plot_constraints = EXCLUDED.plot_constraints,
    expansion_notes = EXCLUDED.expansion_notes,
    tone_rules = EXCLUDED.tone_rules,
    forbidden_rules = EXCLUDED.forbidden_rules,
    selling_points = EXCLUDED.selling_points,
    generation_model = EXCLUDED.generation_model,
    raw_payload = EXCLUDED.raw_payload,
    updated_at = NOW()
  RETURNING *
), project AS (
  UPDATE novel_projects
  SET status = 'BIBLE_READY'
  WHERE id = $1::uuid
  RETURNING *
), job AS (
  INSERT INTO novel_generation_jobs (project_id, job_type, status)
  VALUES ($1::uuid, 'GENERATE_OUTLINE', 'PENDING')
  ON CONFLICT DO NOTHING
  RETURNING *
)
SELECT
  bible.*,
  (SELECT id FROM job LIMIT 1) AS outline_job_id
FROM bible;`;

const saveBiblePatchQuery = `-- Save generated expansion Bible patch for human confirmation.
WITH input AS (
  SELECT
    $1::uuid AS project_id,
    $2::uuid AS job_id,
    NULLIF($3, '')::uuid AS ai_run_id,
    COALESCE(NULLIF($4, '')::jsonb, '{}'::jsonb) AS patch_payload,
    NULLIF($5, '') AS generation_model
), inserted AS (
  INSERT INTO novel_bible_patches (
    project_id,
    job_id,
    ai_run_id,
    source,
    expansion_request,
    expansion_scope,
    expansion_constraints,
    patch_payload,
    risk_notes,
    status
  )
  SELECT
    p.id,
    input.job_id,
    input.ai_run_id,
    'AI',
    p.expansion_request,
    p.expansion_scope,
    p.expansion_constraints,
    input.patch_payload,
    COALESCE(input.patch_payload->'risk_notes', '[]'::jsonb),
    'PENDING'
  FROM input
  JOIN novel_projects p ON p.id = input.project_id
  RETURNING *
), event AS (
  INSERT INTO novel_project_events (
    project_id,
    event_type,
    actor,
    comment,
    after_payload
  )
  SELECT
    inserted.project_id,
    'BIBLE_PATCH_CREATED',
    'ai',
    '扩写设定补丁已生成，等待人工确认',
    to_jsonb(inserted)
  FROM inserted
  RETURNING *
)
SELECT
  inserted.*,
  input.generation_model
FROM inserted, input;`;

const manageBiblePatchQuery = `-- Apply, reject, or regenerate an expansion Bible patch.
SELECT *
FROM manage_novel_bible_patch(
  $1::uuid,
  $2,
  NULLIF($3, ''),
  COALESCE(NULLIF($4, ''), 'local_user')
);`;

const upsertOutlineQuery = `-- Bulk upsert generated chapter outlines and enqueue chapter 1 director planning.
WITH input AS (
  SELECT
    $1::uuid AS project_id,
    COALESCE(NULLIF($2, '')::jsonb, '[]'::jsonb) AS chapters_json,
    COALESCE((
      SELECT expansion_scope
      FROM novel_projects
      WHERE id = $1::uuid
    ), 'append_only') AS expansion_scope
), chapters AS (
  SELECT
    value,
    (value->>'chapter_no')::integer AS chapter_no
  FROM input, jsonb_array_elements(input.chapters_json) AS value
  WHERE NULLIF(value->>'chapter_no', '') IS NOT NULL
), writable_chapters AS (
  SELECT c.*
  FROM chapters c
  CROSS JOIN input i
  WHERE (
      i.expansion_scope <> 'append_only'
      OR NOT EXISTS (
        SELECT 1
        FROM novel_chapter_outlines existing
        WHERE existing.project_id = i.project_id
          AND existing.chapter_no = c.chapter_no
      )
    )
    AND (
      i.expansion_scope = 'regenerate_outline'
      OR NOT EXISTS (
        SELECT 1
        FROM novel_chapters approved
        WHERE approved.project_id = i.project_id
          AND approved.chapter_no = c.chapter_no
          AND approved.is_current = TRUE
          AND approved.status IN ('APPROVED', 'PUBLISHED')
      )
    )
), upserted AS (
  INSERT INTO novel_chapter_outlines (
    project_id,
    chapter_no,
    volume_no,
    title,
    summary,
    chapter_goal,
    conflict_point,
    emotional_point,
    hook,
    status
  )
  SELECT
    (SELECT project_id FROM input),
    chapter_no,
    COALESCE(NULLIF(value->>'volume_no', '')::integer, 1),
    NULLIF(value->>'title', ''),
    NULLIF(value->>'summary', ''),
    NULLIF(value->>'chapter_goal', ''),
    NULLIF(value->>'conflict_point', ''),
    NULLIF(value->>'emotional_point', ''),
    NULLIF(value->>'hook', ''),
    'READY'
  FROM writable_chapters
  ON CONFLICT (project_id, chapter_no) DO UPDATE
  SET
    volume_no = EXCLUDED.volume_no,
    title = EXCLUDED.title,
    summary = EXCLUDED.summary,
    chapter_goal = EXCLUDED.chapter_goal,
    conflict_point = EXCLUDED.conflict_point,
    emotional_point = EXCLUDED.emotional_point,
    hook = EXCLUDED.hook,
    status = 'READY',
    updated_at = NOW()
  RETURNING *
), project AS (
  UPDATE novel_projects
  SET status = 'OUTLINE_READY'
  WHERE id = (SELECT project_id FROM input)
    AND EXISTS (SELECT 1 FROM upserted)
  RETURNING *
), job AS (
  INSERT INTO novel_generation_jobs (project_id, job_type, chapter_no, status)
  SELECT (SELECT project_id FROM input), 'PLAN_CHAPTER_DIRECTOR', next.first_chapter_no, 'PENDING'
  FROM (
    SELECT MIN(chapter_no) AS first_chapter_no
    FROM upserted
  ) next
  WHERE next.first_chapter_no IS NOT NULL
  ON CONFLICT DO NOTHING
  RETURNING *
)
SELECT
  (SELECT project_id FROM input) AS project_id,
  (SELECT COUNT(*) FROM upserted) AS outline_count,
  (SELECT id FROM job LIMIT 1) AS first_chapter_job_id,
  (SELECT status FROM project LIMIT 1) AS project_status;`;

const markJobSucceededQuery = `-- Mark a novel generation job succeeded.
UPDATE novel_generation_jobs
SET
  status = 'SUCCEEDED',
  error_message = NULL,
  finished_at = NOW(),
  updated_at = NOW()
WHERE id = $1::uuid
RETURNING *;`;

const mergeBibleCode = `// n8n Code node: Merge Bible GLM Response Context
const context = $('代码 - 构建Bible GLM请求').first().json;
const response = $json;
return [{json: {...context, llm_response: response}}];`;

const mergeBiblePatchCode = `// n8n Code node: Merge Bible patch GLM Response Context
const context = $('代码 - 构建Bible补丁 GLM请求').first().json;
const response = $json;
return [{json: {...context, llm_response: response}}];`;

const mergeFrontBibleCode = `// n8n Code node: Merge front-end Bible GLM Response Context
const context = $('代码 - 构建前端Bible GLM请求').first().json;
const response = $json;
return [{json: {...context, llm_response: response}}];`;

const mergeFrontBiblePatchCode = `// n8n Code node: Merge front-end Bible patch GLM Response Context
const context = $('代码 - 构建前端Bible补丁 GLM请求').first().json;
const response = $json;
return [{json: {...context, llm_response: response}}];`;

const mergeOutlineCode = `// n8n Code node: Merge Outline GLM Response Context
const context = $('代码 - 构建大纲 GLM请求').first().json;
const response = $json;
return [{json: {...context, llm_response: response}}];`;

const mergeFrontOutlineCode = `// n8n Code node: Merge front-end outline GLM Response Context
const context = $('代码 - 构建前端大纲 GLM请求').first().json;
const response = $json;
return [{json: {...context, llm_response: response}}];`;

const mergeCreateAssistCode = `// n8n Code node: Merge create-page GLM assist response context
const context = $('代码 - 构建创建页 GLM助手请求').first().json;
const response = $json;
return [{json: {...context, llm_response: response}}];`;

const mergeExpansionAssistCode = `// n8n Code node: Merge project expansion AI assist response context
const context = $('代码 - 构建扩写剧情 AI创意请求').first().json;
const response = $json;
return [{json: {...context, llm_response: response}}];`;

const centerWorkflow = workflowBase(
  'novelCenterV1Workflow11',
  '11_小说工作台_项目列表_创建与目录',
  [
    webhookNode('webhook-novel-center-11', 'Webhook - 小说工作台', [-720, -300], 'GET', 'novel-center', 'novel-center-11'),
    postgresNode('postgres-list-novel-projects-11', '数据库 - 查询工作台项目概况', [-500, -300], listProjectsQuery),
    codeNode('code-render-novel-center-11', '代码 - 生成小说工作台页面', [-280, -300], code('n8n/code/novel_render_center_html.js')),
    respondNode('respond-novel-center-11', '响应Webhook - 返回小说工作台', [-60, -300], '={{ $json.response_html }}', 200, 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-project-list-11', 'Webhook - 小说项目列表', [-720, -120], 'GET', 'novel-project-list', 'novel-project-list-11'),
    postgresNode('postgres-list-novel-project-list-11', '数据库 - 查询小说项目列表', [-500, -120], listProjectsQuery),
    codeNode('code-render-novel-project-list-11', '代码 - 生成小说项目列表页面', [-280, -120], code('n8n/code/novel_render_project_list_html.js')),
    respondNode('respond-novel-project-list-11', '响应Webhook - 返回小说项目列表', [-60, -120], '={{ $json.response_html }}', 200, 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-archived-projects-cleanup-11', 'Webhook - 小说已归档项目清理', [-720, -20], 'POST', 'novel-archived-projects-cleanup', 'novel-archived-projects-cleanup-11'),
    codeNode('code-validate-archived-projects-cleanup-11', '代码 - 校验已归档项目清理', [-500, -20], code('n8n/code/novel_validate_archived_projects_cleanup.js')),
    postgresNode(
      'postgres-clear-archived-projects-11',
      '数据库 - 清理已归档项目',
      [-280, -20],
      clearArchivedProjectsQuery,
      '={{ [ $json.comment, $json.reviewer ] }}'
    ),
    codeNode('code-render-archived-projects-cleanup-result-11', '代码 - 生成已归档项目清理结果页', [-60, -20], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-archived-projects-cleanup-11', '响应Webhook - 返回已归档项目清理结果', [160, -20], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-project-new-11', 'Webhook - 小说创建页面', [-720, 80], 'GET', 'novel-project-new', 'novel-project-new-11'),
    codeNode('code-render-novel-project-new-11', '代码 - 生成小说创建页面', [-500, 80], code('n8n/code/novel_render_project_create_html.js')),
    respondNode('respond-novel-project-new-11', '响应Webhook - 返回小说创建页面', [-280, 80], '={{ $json.response_html }}', 200, 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-project-ai-assist-11', 'Webhook - 小说创建页GLM助手', [-720, 170], 'POST', 'novel-project-ai-assist', 'novel-project-ai-assist-11'),
    codeNode('code-validate-project-ai-assist-11', '代码 - 校验创建页GLM助手', [-500, 170], code('n8n/code/novel_validate_project_ai_assist.js')),
    codeNode('code-build-project-ai-assist-11', '代码 - 构建创建页 GLM助手请求', [-280, 170], code('n8n/code/novel_build_project_ai_assist_glm_request.js')),
    httpGlmNode('http-glm-project-ai-assist-11', 'HTTP请求 - 调用GLM生成创建页灵感', [-60, 170], {continueErrorOutput: true}),
    codeNode('code-merge-project-ai-assist-11', '代码 - 合并创建页GLM助手响应上下文', [160, 130], mergeCreateAssistCode),
    codeNode('code-parse-project-ai-assist-11', '代码 - 解析创建页GLM助手响应', [380, 130], code('n8n/code/novel_parse_project_ai_assist_glm_response.js'), {continueErrorOutput: true}),
    codeNode('code-render-project-ai-assist-error-11', '代码 - 生成创建页GLM助手错误响应', [380, 220], code('n8n/code/novel_render_project_ai_assist_error_json.js')),
    respondNode('respond-project-ai-assist-11', '响应Webhook - 返回创建页GLM助手结果', [600, 170], '={{ $json.response_json }}', '={{ $json.response_status_code || 200 }}', 'application/json; charset=utf-8'),

    webhookNode('webhook-novel-project-expansion-ai-assist-11', 'Webhook - 项目扩写剧情AI创意', [-720, 380], 'POST', 'novel-project-expansion-ai-assist', 'novel-project-expansion-ai-assist-11'),
    codeNode('code-validate-project-expansion-ai-assist-11', '代码 - 校验扩写剧情AI创意', [-500, 380], code('n8n/code/novel_validate_project_expansion_ai_assist.js')),
    postgresNode(
      'postgres-read-project-expansion-ai-assist-11',
      '数据库 - 读取扩写剧情AI创意上下文',
      [-280, 380],
      projectExpansionAssistContextQuery,
      '={{ [ $json.project_id, $json.expansion_request, $json.expansion_scope, $json.expansion_constraints, $json.target_total_chapters, $json.target_words_per_chapter, $json.assist_nonce, $json.requested_at ] }}'
    ),
    codeNode('code-build-project-expansion-ai-assist-11', '代码 - 构建扩写剧情 AI创意请求', [-60, 380], code('n8n/code/novel_build_project_expansion_ai_assist_glm_request.js')),
    httpGlmNode('http-glm-project-expansion-ai-assist-11', 'HTTP请求 - 调用GLM生成扩写剧情设计', [160, 380], {continueErrorOutput: true}),
    codeNode('code-merge-project-expansion-ai-assist-11', '代码 - 合并扩写剧情AI响应上下文', [380, 340], mergeExpansionAssistCode),
    codeNode('code-parse-project-expansion-ai-assist-11', '代码 - 解析扩写剧情AI响应', [600, 340], code('n8n/code/novel_parse_project_expansion_ai_assist_glm_response.js'), {continueErrorOutput: true}),
    codeNode('code-render-project-expansion-ai-assist-error-11', '代码 - 生成扩写剧情AI错误响应', [600, 430], code('n8n/code/novel_render_project_expansion_ai_assist_error_json.js')),
    respondNode('respond-project-expansion-ai-assist-11', '响应Webhook - 返回扩写剧情AI结果', [820, 380], '={{ $json.response_json }}', '={{ $json.response_status_code || 200 }}', 'application/json; charset=utf-8'),

    webhookNode('webhook-novel-project-detail-11', 'Webhook - 小说项目详情', [-720, 280], 'GET', 'novel-project-detail', 'novel-project-detail-11'),
    postgresNode(
      'postgres-read-novel-project-detail-11',
      '数据库 - 查询小说项目详情',
      [-500, 280],
      projectDetailQuery,
      '={{ [ (($json.query || {}).project_id || ""), (($json.query || {}).view || "overview") ] }}'
    ),
    codeNode('code-render-novel-project-detail-11', '代码 - 生成小说项目详情页面', [-280, 280], code('n8n/code/novel_render_project_detail_html.js')),
    respondNode('respond-novel-project-detail-11', '响应Webhook - 返回小说项目详情', [-60, 280], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-queue-status-11', 'Webhook - 小说队列状态', [-720, 480], 'GET', 'novel-queue-status', 'novel-queue-status-11'),
    postgresNode(
      'postgres-read-novel-queue-status-11',
      '数据库 - 查询小说队列状态',
      [-500, 480],
      queueStatusQuery,
      '={{ [ (($json.query || {}).project_id || "") ] }}'
    ),
    codeNode('code-render-novel-queue-status-11', '代码 - 生成小说队列状态页面', [-280, 480], code('n8n/code/novel_render_queue_status_html.js')),
    respondNode('respond-novel-queue-status-11', '响应Webhook - 返回小说队列状态', [-60, 480], '={{ $json.response_html }}', 200, 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-daily-report-11', 'Webhook - 小说运行日报', [-720, 680], 'GET', 'novel-daily-report', 'novel-daily-report-11'),
    postgresNode('postgres-read-novel-daily-report-11', '数据库 - 查询小说运行日报', [-500, 680], dailyReportQuery),
    codeNode('code-render-novel-daily-report-11', '代码 - 生成小说运行日报页面', [-280, 680], code('n8n/code/novel_render_daily_report_html.js')),
    respondNode('respond-novel-daily-report-11', '响应Webhook - 返回小说运行日报', [-60, 680], '={{ $json.response_html }}', 200, 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-project-create-11', 'Webhook - 创建小说项目', [-720, 900], 'POST', 'novel-project-create', 'novel-project-create-11'),
    codeNode('code-validate-project-create-11', '代码 - 校验小说项目参数', [-500, 900], code('n8n/code/novel_validate_project_create.js')),
    postgresNode(
      'postgres-create-project-11',
      '数据库 - 创建小说项目并创建Bible任务',
      [-280, 900],
      createProjectQuery,
      '={{ [ $json.title, $json.genre, $json.audience, $json.style, $json.premise, $json.target_total_chapters, $json.target_words_per_chapter ] }}'
    ),
    codeNode('code-render-project-create-result-11', '代码 - 生成小说创建结果页', [-60, 900], code('n8n/code/novel_render_project_create_result_html.js')),
    respondNode('respond-project-create-11', '响应Webhook - 返回创建项目结果', [160, 900], '={{ $json.response_html }}', '={{ $json.response_status_code || 201 }}', 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-project-continue-11', 'Webhook - 小说继续写作', [-720, 1120], 'POST', 'novel-project-continue', 'novel-project-continue-11'),
    codeNode('code-validate-project-continue-11', '代码 - 校验小说继续写作', [-500, 1120], code('n8n/code/novel_validate_project_continue.js')),
    postgresNode(
      'postgres-continue-project-11',
      '数据库 - 继续小说项目',
      [-280, 1120],
      continueProjectQuery,
      '={{ [ $json.project_id, $json.comment, $json.reviewer ] }}'
    ),
    codeNode('code-render-project-continue-result-11', '代码 - 生成小说项目操作结果页', [-60, 1120], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-project-continue-11', '响应Webhook - 返回继续写作结果', [160, 1120], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-project-regenerate-11', 'Webhook - 小说项目重新生成', [-720, 1230], 'POST', 'novel-project-regenerate', 'novel-project-regenerate-11'),
    codeNode('code-validate-project-regenerate-11', '代码 - 校验小说项目重新生成', [-500, 1230], code('n8n/code/novel_validate_project_regenerate.js')),
    postgresNode(
      'postgres-regenerate-project-asset-11',
      '数据库 - 创建小说项目重跑任务',
      [-280, 1230],
      regenerateProjectAssetQuery,
      '={{ [ $json.project_id, $json.step, $json.comment, $json.reviewer, $json.regenerate_prompt ] }}'
    ),
    codeNode('code-render-project-regenerate-result-11', '代码 - 生成小说项目重跑结果页', [-60, 1230], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-project-regenerate-11', '响应Webhook - 返回项目重跑结果', [160, 1230], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-chapter-rewrite-request-11', 'Webhook - 小说章节重写申请', [-720, 1340], 'POST', 'novel-chapter-rewrite-request', 'novel-chapter-rewrite-request-11'),
    codeNode('code-validate-chapter-rewrite-request-11', '代码 - 校验小说章节重写申请', [-500, 1340], code('n8n/code/novel_validate_chapter_rewrite_request.js')),
    postgresNode(
      'postgres-request-approved-rewrite-11',
      '数据库 - 创建正式章节重写任务',
      [-280, 1340],
      requestApprovedRewriteQuery,
      '={{ [ $json.chapter_id, $json.review_token, $json.comment, $json.reviewer ] }}'
    ),
    codeNode('code-render-chapter-rewrite-request-result-11', '代码 - 生成小说章节重写结果页', [-60, 1340], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-chapter-rewrite-request-11', '响应Webhook - 返回章节重写申请结果', [160, 1340], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),
    codeNode('code-prepare-approved-rewrite-launch-11', '代码 - 准备异步启动正式章节重写', [-60, 1460], prepareApprovedRewriteLaunchCode),
    ifNode('if-launch-approved-rewrite-worker-11', '条件判断 - 需要启动正式章节重写', [160, 1460], '={{ $json.should_launch_rewrite_worker }}', 'launch-approved-rewrite-worker'),
    executeWorkflowNode('execute-approved-rewrite-worker-11', '执行子流程 - 异步重写正式章节', [380, 1460], 'novelRewriteNotifyV1Workflow17'),

    webhookNode('webhook-novel-rewrite-start-11', 'Webhook - 小说重写任务启动', [-720, 1560], 'POST', 'novel-rewrite-start', 'novel-rewrite-start-11'),
    codeNode('code-validate-rewrite-start-11', '代码 - 校验小说重写任务启动', [-500, 1560], code('n8n/code/novel_validate_rewrite_start.js')),
    postgresNode(
      'postgres-start-rewrite-worker-11',
      '数据库 - 校验待执行重写任务',
      [-280, 1560],
      startRewriteWorkerQuery,
      '={{ [ $json.project_id, $json.job_id ] }}'
    ),
    codeNode('code-render-rewrite-start-result-11', '代码 - 生成重写任务启动结果页', [-60, 1560], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-rewrite-start-11', '响应Webhook - 返回重写任务启动结果', [160, 1560], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),
    codeNode('code-prepare-rewrite-start-launch-11', '代码 - 准备启动待执行重写', [-60, 1680], prepareRewriteStartLaunchCode),
    ifNode('if-launch-pending-rewrite-worker-11', '条件判断 - 需要启动待执行重写', [160, 1680], '={{ $json.should_launch_rewrite_worker }}', 'launch-pending-rewrite-worker'),
    executeWorkflowNode('execute-pending-rewrite-worker-11', '执行子流程 - 异步启动待执行重写', [380, 1680], 'novelRewriteNotifyV1Workflow17'),

    webhookNode('webhook-novel-review-remind-11', 'Webhook - 小说审核提醒重发', [-720, 1560], 'POST', 'novel-review-remind', 'novel-review-remind-11'),
    codeNode('code-validate-review-remind-11', '代码 - 校验小说审核提醒重发', [-500, 1560], code('n8n/code/novel_validate_review_remind.js')),
    postgresNode(
      'postgres-resend-review-notification-11',
      '数据库 - 创建审核提醒任务',
      [-280, 1560],
      resendReviewNotificationQuery,
      '={{ [ $json.chapter_id, $json.review_token, $json.comment, $json.reviewer ] }}'
    ),
    codeNode('code-render-review-remind-result-11', '代码 - 生成小说审核提醒结果页', [-60, 1560], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-review-remind-11', '响应Webhook - 返回审核提醒结果', [160, 1560], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-bible-update-11', 'Webhook - 小说设定集编辑', [-720, 1780], 'POST', 'novel-bible-update', 'novel-bible-update-11'),
    codeNode('code-validate-bible-update-11', '代码 - 校验小说设定集编辑', [-500, 1780], code('n8n/code/novel_validate_bible_update.js')),
    postgresNode(
      'postgres-update-bible-manual-11',
      '数据库 - 保存小说设定集',
      [-280, 1780],
      updateBibleManualQuery,
      '={{ [ $json.project_id, $json.world_setting, $json.story_core, $json.main_character_json, $json.supporting_characters_json, $json.villain_setting_json, $json.power_system, $json.relationship_map_json, $json.tone_rules, $json.forbidden_rules, $json.selling_points_json, $json.comment, $json.reviewer, $json.organizations_json, $json.locations_json, $json.plot_constraints_json, $json.expansion_notes ] }}'
    ),
    codeNode('code-render-bible-update-result-11', '代码 - 生成小说设定集编辑结果页', [-60, 1780], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-bible-update-11', '响应Webhook - 返回设定集编辑结果', [160, 1780], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-outline-update-11', 'Webhook - 小说大纲编辑', [-720, 2000], 'POST', 'novel-outline-update', 'novel-outline-update-11'),
    codeNode('code-validate-outline-update-11', '代码 - 校验小说大纲编辑', [-500, 2000], code('n8n/code/novel_validate_outline_update.js')),
    postgresNode(
      'postgres-update-outline-manual-11',
      '数据库 - 保存小说大纲',
      [-280, 2000],
      updateOutlineManualQuery,
      '={{ [ $json.project_id, $json.outline_id, $json.volume_no, $json.title, $json.summary, $json.chapter_goal, $json.conflict_point, $json.emotional_point, $json.hook, $json.comment, $json.reviewer ] }}'
    ),
    codeNode('code-render-outline-update-result-11', '代码 - 生成小说大纲编辑结果页', [-60, 2000], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-outline-update-11', '响应Webhook - 返回大纲编辑结果', [160, 2000], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-project-targets-update-11', 'Webhook - 小说项目目标修改', [-720, 2220], 'POST', 'novel-project-targets-update', 'novel-project-targets-update-11'),
    codeNode('code-validate-project-targets-update-11', '代码 - 校验小说项目目标修改', [-500, 2220], code('n8n/code/novel_validate_project_targets_update.js')),
    postgresNode(
      'postgres-update-project-targets-11',
      '数据库 - 保存小说项目目标',
      [-280, 2220],
      updateProjectTargetsQuery,
      '={{ [ $json.project_id, $json.target_total_chapters, $json.target_words_per_chapter, $json.comment, $json.reviewer, $json.expansion_request, $json.expansion_scope, $json.expansion_constraints ] }}'
    ),
    codeNode('code-render-project-targets-update-result-11', '代码 - 生成小说项目目标修改结果页', [-60, 2220], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-project-targets-update-11', '响应Webhook - 返回项目目标修改结果', [160, 2220], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-bible-patch-action-11', 'Webhook - 小说设定集补丁操作', [-720, 2380], 'POST', 'novel-bible-patch-action', 'novel-bible-patch-action-11'),
    codeNode('code-validate-bible-patch-action-11', '代码 - 校验小说设定集补丁操作', [-500, 2380], code('n8n/code/novel_validate_bible_patch_action.js')),
    postgresNode(
      'postgres-manage-bible-patch-11',
      '数据库 - 处理小说设定集补丁',
      [-280, 2380],
      manageBiblePatchQuery,
      '={{ [ $json.patch_id, $json.patch_action, $json.comment, $json.reviewer ] }}'
    ),
    codeNode('code-render-bible-patch-action-result-11', '代码 - 生成小说设定集补丁操作结果页', [-60, 2380], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-bible-patch-action-11', '响应Webhook - 返回设定集补丁操作结果', [160, 2380], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-project-status-toggle-11', 'Webhook - 小说项目暂停恢复', [-720, 2440], 'POST', 'novel-project-status-toggle', 'novel-project-status-toggle-11'),
    codeNode('code-validate-project-status-toggle-11', '代码 - 校验小说项目暂停恢复', [-500, 2440], code('n8n/code/novel_validate_project_status_toggle.js')),
    postgresNode(
      'postgres-toggle-project-status-11',
      '数据库 - 暂停或恢复小说项目',
      [-280, 2440],
      toggleProjectPauseQuery,
      '={{ [ $json.project_id, $json.desired_action, $json.comment, $json.reviewer ] }}'
    ),
    codeNode('code-render-project-status-toggle-result-11', '代码 - 生成小说项目暂停恢复结果页', [-60, 2440], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-project-status-toggle-11', '响应Webhook - 返回项目暂停恢复结果', [160, 2440], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-chapter-manual-edit-11', 'Webhook - 小说正文手动编辑', [-720, 2660], 'POST', 'novel-chapter-manual-edit', 'novel-chapter-manual-edit-11'),
    codeNode('code-validate-chapter-manual-edit-11', '代码 - 校验小说正文手动编辑', [-500, 2660], code('n8n/code/novel_validate_chapter_manual_edit.js')),
    postgresNode(
      'postgres-save-manual-chapter-edit-11',
      '数据库 - 保存人工正文编辑',
      [-280, 2660],
      manualChapterEditQuery,
      '={{ [ $json.chapter_id, $json.review_token, $json.title, $json.body, $json.summary, $json.comment, $json.reviewer, $json.edit_mode ] }}'
    ),
    codeNode('code-render-chapter-manual-edit-result-11', '代码 - 生成小说正文编辑结果页', [-60, 2660], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-chapter-manual-edit-11', '响应Webhook - 返回正文编辑结果', [160, 2660], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-project-archive-toggle-11', 'Webhook - 小说项目归档恢复', [-720, 2880], 'POST', 'novel-project-archive-toggle', 'novel-project-archive-toggle-11'),
    codeNode('code-validate-project-archive-toggle-11', '代码 - 校验小说项目归档恢复', [-500, 2880], code('n8n/code/novel_validate_project_archive_toggle.js')),
    postgresNode(
      'postgres-toggle-project-archive-11',
      '数据库 - 归档或恢复小说项目',
      [-280, 2880],
      toggleProjectArchiveQuery,
      '={{ [ $json.project_id, $json.desired_action, $json.confirm_title, $json.comment, $json.reviewer ] }}'
    ),
    codeNode('code-render-project-archive-toggle-result-11', '代码 - 生成小说项目归档结果页', [-60, 2880], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-project-archive-toggle-11', '响应Webhook - 返回项目归档结果', [160, 2880], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-project-fact-action-11', 'Webhook - 小说事实库操作', [-720, 3100], 'POST', 'novel-project-fact-action', 'novel-project-fact-action-11'),
    codeNode('code-validate-project-fact-action-11', '代码 - 校验小说事实库操作', [-500, 3100], code('n8n/code/novel_validate_project_fact_action.js')),
    postgresNode(
      'postgres-manage-project-fact-11',
      '数据库 - 保存小说事实库操作',
      [-280, 3100],
      manageProjectFactQuery,
      '={{ [ $json.project_id, $json.fact_id, $json.fact_action, $json.fact_type, $json.fact_key, $json.fact_value, $json.chapter_no, $json.status, $json.comment, $json.reviewer ] }}'
    ),
    codeNode('code-render-project-fact-action-result-11', '代码 - 生成小说事实库操作结果页', [-60, 3100], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-project-fact-action-11', '响应Webhook - 返回事实库操作结果', [160, 3100], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    webhookNode('webhook-novel-stale-chapters-cleanup-11', 'Webhook - 小说过期历史章节清理', [-720, 3320], 'POST', 'novel-stale-chapters-cleanup', 'novel-stale-chapters-cleanup-11'),
    codeNode('code-validate-stale-chapter-cleanup-11', '代码 - 校验过期历史章节清理', [-500, 3320], code('n8n/code/novel_validate_stale_chapter_cleanup.js')),
    postgresNode(
      'postgres-clear-stale-chapters-11',
      '数据库 - 清理过期历史章节',
      [-280, 3320],
      clearStaleChaptersQuery,
      '={{ [ $json.project_id, $json.comment, $json.reviewer ] }}'
    ),
    codeNode('code-render-stale-chapter-cleanup-result-11', '代码 - 生成过期历史章节清理结果页', [-60, 3320], code('n8n/code/novel_render_project_action_result.js')),
    respondNode('respond-stale-chapter-cleanup-11', '响应Webhook - 返回过期历史章节清理结果', [160, 3320], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),

    sticky('note-novel-center-11', '说明 - 小说工作台', [-720, -520], 'GET `/webhook/novel-center` 展示待办总览和需要处理的项目；创建表单已拆到独立页面。'),
    sticky('note-novel-project-list-11', '说明 - 小说项目列表', [-720, -140], 'GET `/webhook/novel-project-list` 展示完整项目列表，并提供去审核、查看目录、看队列、看日报、查看概览和 POST 清理已归档项目入口。'),
    sticky('note-novel-project-new-11', '说明 - 小说创建页面', [-720, 80], 'GET `/webhook/novel-project-new` 只展示创建表单；真正创建仍提交到 POST `/webhook/novel-project-create`；标题/创意按钮会 POST `/webhook/novel-project-ai-assist` 即时调用 GLM 返回 JSON。'),
    sticky('note-novel-project-detail-11', '说明 - 小说项目详情', [-720, 280], 'GET `/webhook/novel-project-detail?project_id=...&view=overview|bible|outline|chapters|facts|ops|export`；默认总览，二级视图再展示设定、目录、正文、事实、运行和导出；项目目标里的 AI创意按钮会 POST `/webhook/novel-project-expansion-ai-assist` 生成后续剧情设计。'),
    sticky('note-novel-queue-status-11', '说明 - 小说队列状态', [-720, 480], 'GET `/webhook/novel-queue-status` 只读展示项目队列、最近任务和最近调用；带 project_id 时服务端统计和列表都按项目过滤。'),
    sticky('note-novel-daily-report-11', '说明 - 小说运行日报', [-720, 680], 'GET `/webhook/novel-daily-report` 只读展示今日任务、模型调用、失败摘要和调度策略。'),
    sticky('note-project-create-11', '说明 - 创建项目动作', [-720, 980], '创建项目只写入 `novel_projects(CREATED)` 并创建 `GENERATE_BIBLE(PENDING)`，不直接调用 GLM；创建页 AI 助手是独立即时 GLM webhook；浏览器提交后返回中文结果页和下一步入口。'),
    sticky('note-project-actions-11', '说明 - 项目控制台动作', [-720, 3540], '继续写作、设定集/大纲重新生成、正式章节重写申请、待执行重写启动、审核提醒重发、设定集编辑、大纲编辑、目标修改、暂停恢复、手动正文编辑、项目归档恢复、事实库人工维护、过期历史章节清理都只能走 POST；正式章节重写申请成功后会立即异步启动 17 号重写 worker，已有 PENDING 重写可从项目控制台恢复启动。'),
  ],
  {
    'Webhook - 小说工作台': {main: [[{node: '数据库 - 查询工作台项目概况', type: 'main', index: 0}]]},
    '数据库 - 查询工作台项目概况': {main: [[{node: '代码 - 生成小说工作台页面', type: 'main', index: 0}]]},
    '代码 - 生成小说工作台页面': {main: [[{node: '响应Webhook - 返回小说工作台', type: 'main', index: 0}]]},
    'Webhook - 小说项目列表': {main: [[{node: '数据库 - 查询小说项目列表', type: 'main', index: 0}]]},
    '数据库 - 查询小说项目列表': {main: [[{node: '代码 - 生成小说项目列表页面', type: 'main', index: 0}]]},
    '代码 - 生成小说项目列表页面': {main: [[{node: '响应Webhook - 返回小说项目列表', type: 'main', index: 0}]]},
    'Webhook - 小说已归档项目清理': {main: [[{node: '代码 - 校验已归档项目清理', type: 'main', index: 0}]]},
    '代码 - 校验已归档项目清理': {main: [[{node: '数据库 - 清理已归档项目', type: 'main', index: 0}]]},
    '数据库 - 清理已归档项目': {main: [[{node: '代码 - 生成已归档项目清理结果页', type: 'main', index: 0}]]},
    '代码 - 生成已归档项目清理结果页': {main: [[{node: '响应Webhook - 返回已归档项目清理结果', type: 'main', index: 0}]]},
    'Webhook - 小说创建页面': {main: [[{node: '代码 - 生成小说创建页面', type: 'main', index: 0}]]},
    '代码 - 生成小说创建页面': {main: [[{node: '响应Webhook - 返回小说创建页面', type: 'main', index: 0}]]},
    'Webhook - 小说创建页GLM助手': {main: [[{node: '代码 - 校验创建页GLM助手', type: 'main', index: 0}]]},
    '代码 - 校验创建页GLM助手': {main: [[{node: '代码 - 构建创建页 GLM助手请求', type: 'main', index: 0}]]},
    '代码 - 构建创建页 GLM助手请求': {main: [[{node: 'HTTP请求 - 调用GLM生成创建页灵感', type: 'main', index: 0}]]},
    'HTTP请求 - 调用GLM生成创建页灵感': {main: [
      [{node: '代码 - 合并创建页GLM助手响应上下文', type: 'main', index: 0}],
      [{node: '代码 - 生成创建页GLM助手错误响应', type: 'main', index: 0}],
    ]},
    '代码 - 合并创建页GLM助手响应上下文': {main: [[{node: '代码 - 解析创建页GLM助手响应', type: 'main', index: 0}]]},
    '代码 - 解析创建页GLM助手响应': {main: [
      [{node: '响应Webhook - 返回创建页GLM助手结果', type: 'main', index: 0}],
      [{node: '代码 - 生成创建页GLM助手错误响应', type: 'main', index: 0}],
    ]},
    '代码 - 生成创建页GLM助手错误响应': {main: [[{node: '响应Webhook - 返回创建页GLM助手结果', type: 'main', index: 0}]]},
    'Webhook - 项目扩写剧情AI创意': {main: [[{node: '代码 - 校验扩写剧情AI创意', type: 'main', index: 0}]]},
    '代码 - 校验扩写剧情AI创意': {main: [[{node: '数据库 - 读取扩写剧情AI创意上下文', type: 'main', index: 0}]]},
    '数据库 - 读取扩写剧情AI创意上下文': {main: [[{node: '代码 - 构建扩写剧情 AI创意请求', type: 'main', index: 0}]]},
    '代码 - 构建扩写剧情 AI创意请求': {main: [[{node: 'HTTP请求 - 调用GLM生成扩写剧情设计', type: 'main', index: 0}]]},
    'HTTP请求 - 调用GLM生成扩写剧情设计': {main: [
      [{node: '代码 - 合并扩写剧情AI响应上下文', type: 'main', index: 0}],
      [{node: '代码 - 生成扩写剧情AI错误响应', type: 'main', index: 0}],
    ]},
    '代码 - 合并扩写剧情AI响应上下文': {main: [[{node: '代码 - 解析扩写剧情AI响应', type: 'main', index: 0}]]},
    '代码 - 解析扩写剧情AI响应': {main: [
      [{node: '响应Webhook - 返回扩写剧情AI结果', type: 'main', index: 0}],
      [{node: '代码 - 生成扩写剧情AI错误响应', type: 'main', index: 0}],
    ]},
    '代码 - 生成扩写剧情AI错误响应': {main: [[{node: '响应Webhook - 返回扩写剧情AI结果', type: 'main', index: 0}]]},
    'Webhook - 小说项目详情': {main: [[{node: '数据库 - 查询小说项目详情', type: 'main', index: 0}]]},
    '数据库 - 查询小说项目详情': {main: [[{node: '代码 - 生成小说项目详情页面', type: 'main', index: 0}]]},
    '代码 - 生成小说项目详情页面': {main: [[{node: '响应Webhook - 返回小说项目详情', type: 'main', index: 0}]]},
    'Webhook - 小说队列状态': {main: [[{node: '数据库 - 查询小说队列状态', type: 'main', index: 0}]]},
    '数据库 - 查询小说队列状态': {main: [[{node: '代码 - 生成小说队列状态页面', type: 'main', index: 0}]]},
    '代码 - 生成小说队列状态页面': {main: [[{node: '响应Webhook - 返回小说队列状态', type: 'main', index: 0}]]},
    'Webhook - 小说运行日报': {main: [[{node: '数据库 - 查询小说运行日报', type: 'main', index: 0}]]},
    '数据库 - 查询小说运行日报': {main: [[{node: '代码 - 生成小说运行日报页面', type: 'main', index: 0}]]},
    '代码 - 生成小说运行日报页面': {main: [[{node: '响应Webhook - 返回小说运行日报', type: 'main', index: 0}]]},
    'Webhook - 创建小说项目': {main: [[{node: '代码 - 校验小说项目参数', type: 'main', index: 0}]]},
    '代码 - 校验小说项目参数': {main: [[{node: '数据库 - 创建小说项目并创建Bible任务', type: 'main', index: 0}]]},
    '数据库 - 创建小说项目并创建Bible任务': {main: [[{node: '代码 - 生成小说创建结果页', type: 'main', index: 0}]]},
    '代码 - 生成小说创建结果页': {main: [[{node: '响应Webhook - 返回创建项目结果', type: 'main', index: 0}]]},
    'Webhook - 小说继续写作': {main: [[{node: '代码 - 校验小说继续写作', type: 'main', index: 0}]]},
    '代码 - 校验小说继续写作': {main: [[{node: '数据库 - 继续小说项目', type: 'main', index: 0}]]},
    '数据库 - 继续小说项目': {main: [[{node: '代码 - 生成小说项目操作结果页', type: 'main', index: 0}]]},
    '代码 - 生成小说项目操作结果页': {main: [[{node: '响应Webhook - 返回继续写作结果', type: 'main', index: 0}]]},
    'Webhook - 小说项目重新生成': {main: [[{node: '代码 - 校验小说项目重新生成', type: 'main', index: 0}]]},
    '代码 - 校验小说项目重新生成': {main: [[{node: '数据库 - 创建小说项目重跑任务', type: 'main', index: 0}]]},
    '数据库 - 创建小说项目重跑任务': {main: [[{node: '代码 - 生成小说项目重跑结果页', type: 'main', index: 0}]]},
    '代码 - 生成小说项目重跑结果页': {main: [[{node: '响应Webhook - 返回项目重跑结果', type: 'main', index: 0}]]},
    'Webhook - 小说章节重写申请': {main: [[{node: '代码 - 校验小说章节重写申请', type: 'main', index: 0}]]},
    '代码 - 校验小说章节重写申请': {main: [[{node: '数据库 - 创建正式章节重写任务', type: 'main', index: 0}]]},
    '数据库 - 创建正式章节重写任务': {main: [[
      {node: '代码 - 生成小说章节重写结果页', type: 'main', index: 0},
      {node: '代码 - 准备异步启动正式章节重写', type: 'main', index: 0},
    ]]},
    '代码 - 生成小说章节重写结果页': {main: [[{node: '响应Webhook - 返回章节重写申请结果', type: 'main', index: 0}]]},
    '代码 - 准备异步启动正式章节重写': {main: [[{node: '条件判断 - 需要启动正式章节重写', type: 'main', index: 0}]]},
    '条件判断 - 需要启动正式章节重写': {main: [[{node: '执行子流程 - 异步重写正式章节', type: 'main', index: 0}], []]},
    'Webhook - 小说重写任务启动': {main: [[{node: '代码 - 校验小说重写任务启动', type: 'main', index: 0}]]},
    '代码 - 校验小说重写任务启动': {main: [[{node: '数据库 - 校验待执行重写任务', type: 'main', index: 0}]]},
    '数据库 - 校验待执行重写任务': {main: [[
      {node: '代码 - 生成重写任务启动结果页', type: 'main', index: 0},
      {node: '代码 - 准备启动待执行重写', type: 'main', index: 0},
    ]]},
    '代码 - 生成重写任务启动结果页': {main: [[{node: '响应Webhook - 返回重写任务启动结果', type: 'main', index: 0}]]},
    '代码 - 准备启动待执行重写': {main: [[{node: '条件判断 - 需要启动待执行重写', type: 'main', index: 0}]]},
    '条件判断 - 需要启动待执行重写': {main: [[{node: '执行子流程 - 异步启动待执行重写', type: 'main', index: 0}], []]},
    'Webhook - 小说审核提醒重发': {main: [[{node: '代码 - 校验小说审核提醒重发', type: 'main', index: 0}]]},
    '代码 - 校验小说审核提醒重发': {main: [[{node: '数据库 - 创建审核提醒任务', type: 'main', index: 0}]]},
    '数据库 - 创建审核提醒任务': {main: [[{node: '代码 - 生成小说审核提醒结果页', type: 'main', index: 0}]]},
    '代码 - 生成小说审核提醒结果页': {main: [[{node: '响应Webhook - 返回审核提醒结果', type: 'main', index: 0}]]},
    'Webhook - 小说设定集编辑': {main: [[{node: '代码 - 校验小说设定集编辑', type: 'main', index: 0}]]},
    '代码 - 校验小说设定集编辑': {main: [[{node: '数据库 - 保存小说设定集', type: 'main', index: 0}]]},
    '数据库 - 保存小说设定集': {main: [[{node: '代码 - 生成小说设定集编辑结果页', type: 'main', index: 0}]]},
    '代码 - 生成小说设定集编辑结果页': {main: [[{node: '响应Webhook - 返回设定集编辑结果', type: 'main', index: 0}]]},
    'Webhook - 小说大纲编辑': {main: [[{node: '代码 - 校验小说大纲编辑', type: 'main', index: 0}]]},
    '代码 - 校验小说大纲编辑': {main: [[{node: '数据库 - 保存小说大纲', type: 'main', index: 0}]]},
    '数据库 - 保存小说大纲': {main: [[{node: '代码 - 生成小说大纲编辑结果页', type: 'main', index: 0}]]},
    '代码 - 生成小说大纲编辑结果页': {main: [[{node: '响应Webhook - 返回大纲编辑结果', type: 'main', index: 0}]]},
    'Webhook - 小说项目目标修改': {main: [[{node: '代码 - 校验小说项目目标修改', type: 'main', index: 0}]]},
    '代码 - 校验小说项目目标修改': {main: [[{node: '数据库 - 保存小说项目目标', type: 'main', index: 0}]]},
    '数据库 - 保存小说项目目标': {main: [[{node: '代码 - 生成小说项目目标修改结果页', type: 'main', index: 0}]]},
    '代码 - 生成小说项目目标修改结果页': {main: [[{node: '响应Webhook - 返回项目目标修改结果', type: 'main', index: 0}]]},
    'Webhook - 小说设定集补丁操作': {main: [[{node: '代码 - 校验小说设定集补丁操作', type: 'main', index: 0}]]},
    '代码 - 校验小说设定集补丁操作': {main: [[{node: '数据库 - 处理小说设定集补丁', type: 'main', index: 0}]]},
    '数据库 - 处理小说设定集补丁': {main: [[{node: '代码 - 生成小说设定集补丁操作结果页', type: 'main', index: 0}]]},
    '代码 - 生成小说设定集补丁操作结果页': {main: [[{node: '响应Webhook - 返回设定集补丁操作结果', type: 'main', index: 0}]]},
    'Webhook - 小说项目暂停恢复': {main: [[{node: '代码 - 校验小说项目暂停恢复', type: 'main', index: 0}]]},
    '代码 - 校验小说项目暂停恢复': {main: [[{node: '数据库 - 暂停或恢复小说项目', type: 'main', index: 0}]]},
    '数据库 - 暂停或恢复小说项目': {main: [[{node: '代码 - 生成小说项目暂停恢复结果页', type: 'main', index: 0}]]},
    '代码 - 生成小说项目暂停恢复结果页': {main: [[{node: '响应Webhook - 返回项目暂停恢复结果', type: 'main', index: 0}]]},
    'Webhook - 小说正文手动编辑': {main: [[{node: '代码 - 校验小说正文手动编辑', type: 'main', index: 0}]]},
    '代码 - 校验小说正文手动编辑': {main: [[{node: '数据库 - 保存人工正文编辑', type: 'main', index: 0}]]},
    '数据库 - 保存人工正文编辑': {main: [[{node: '代码 - 生成小说正文编辑结果页', type: 'main', index: 0}]]},
    '代码 - 生成小说正文编辑结果页': {main: [[{node: '响应Webhook - 返回正文编辑结果', type: 'main', index: 0}]]},
    'Webhook - 小说项目归档恢复': {main: [[{node: '代码 - 校验小说项目归档恢复', type: 'main', index: 0}]]},
    '代码 - 校验小说项目归档恢复': {main: [[{node: '数据库 - 归档或恢复小说项目', type: 'main', index: 0}]]},
    '数据库 - 归档或恢复小说项目': {main: [[{node: '代码 - 生成小说项目归档结果页', type: 'main', index: 0}]]},
    '代码 - 生成小说项目归档结果页': {main: [[{node: '响应Webhook - 返回项目归档结果', type: 'main', index: 0}]]},
    'Webhook - 小说事实库操作': {main: [[{node: '代码 - 校验小说事实库操作', type: 'main', index: 0}]]},
    '代码 - 校验小说事实库操作': {main: [[{node: '数据库 - 保存小说事实库操作', type: 'main', index: 0}]]},
    '数据库 - 保存小说事实库操作': {main: [[{node: '代码 - 生成小说事实库操作结果页', type: 'main', index: 0}]]},
    '代码 - 生成小说事实库操作结果页': {main: [[{node: '响应Webhook - 返回事实库操作结果', type: 'main', index: 0}]]},
    'Webhook - 小说过期历史章节清理': {main: [[{node: '代码 - 校验过期历史章节清理', type: 'main', index: 0}]]},
    '代码 - 校验过期历史章节清理': {main: [[{node: '数据库 - 清理过期历史章节', type: 'main', index: 0}]]},
    '数据库 - 清理过期历史章节': {main: [[{node: '代码 - 生成过期历史章节清理结果页', type: 'main', index: 0}]]},
    '代码 - 生成过期历史章节清理结果页': {main: [[{node: '响应Webhook - 返回过期历史章节清理结果', type: 'main', index: 0}]]},
  }
);

const bibleWorkflow = workflowBase(
  'novelBibleV1Workflow12',
  '12_小说生成Bible',
  [
    manualNode('manual-novel-bible-12', '手动触发', [-920, 0]),
    postgresNode('postgres-claim-bible-12', '数据库 - 领取GENERATE_BIBLE任务', [-700, 0], claimBibleQuery),
    postgresNode(
      'postgres-read-project-bible-12',
      '数据库 - 读取Bible生成上下文',
      [-480, 0],
      readProjectForBibleQuery,
      '={{ [ $json.id, $json.project_id ] }}'
    ),
    codeNode('code-build-bible-request-12', '代码 - 构建Bible GLM请求', [-260, 0], code('n8n/code/novel_build_glm_request.js')),
    httpGlmNode('http-glm-bible-12', 'HTTP请求 - 调用GLM生成Bible', [-40, 0]),
    codeNode('code-merge-bible-response-12', '代码 - 合并Bible GLM响应上下文', [180, 0], mergeBibleCode),
    codeNode('code-parse-bible-response-12', '代码 - 解析Bible GLM响应', [400, 0], code('n8n/code/novel_parse_glm_json.js')),
    postgresNode(
      'postgres-record-bible-ai-run-12',
      '数据库 - 记录Bible AI调用',
      [620, 0],
      recordAiRunQuery,
      '={{ [ $json.project_id, "", $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify({ ...$json.llm_request_body, trigger_source: $json.trigger_source, requested_by: $json.requested_by }), $json.llm_response_json, $json.parsed_payload_json, true, "", $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
    ),
    postgresNode(
      'postgres-upsert-bible-12',
      '数据库 - 写入Bible并创建大纲任务',
      [840, 0],
      upsertBibleQuery,
      '={{ [ $("代码 - 解析Bible GLM响应").first().json.project_id, $("代码 - 解析Bible GLM响应").first().json.world_setting, $("代码 - 解析Bible GLM响应").first().json.story_core, $("代码 - 解析Bible GLM响应").first().json.main_character_json, $("代码 - 解析Bible GLM响应").first().json.supporting_characters_json, $("代码 - 解析Bible GLM响应").first().json.villain_setting_json, $("代码 - 解析Bible GLM响应").first().json.power_system, $("代码 - 解析Bible GLM响应").first().json.relationship_map_json, $("代码 - 解析Bible GLM响应").first().json.organizations_json, $("代码 - 解析Bible GLM响应").first().json.locations_json, $("代码 - 解析Bible GLM响应").first().json.plot_constraints_json, $("代码 - 解析Bible GLM响应").first().json.expansion_notes, $("代码 - 解析Bible GLM响应").first().json.tone_rules, $("代码 - 解析Bible GLM响应").first().json.forbidden_rules, $("代码 - 解析Bible GLM响应").first().json.selling_points_json, $("代码 - 解析Bible GLM响应").first().json.llm_request_body.model, $("代码 - 解析Bible GLM响应").first().json.parsed_payload_json ] }}'
    ),
    postgresNode(
      'postgres-mark-bible-success-12',
      '数据库 - 标记Bible任务成功',
      [1060, 0],
      markJobSucceededQuery,
      '={{ [ $("数据库 - 领取GENERATE_BIBLE任务").first().json.id ] }}'
    ),
    manualNode('manual-novel-bible-patch-12', '手动触发扩写设定补丁', [-920, 520]),
    postgresNode('postgres-claim-bible-patch-12', '数据库 - 领取GENERATE_BIBLE_PATCH任务', [-700, 520], claimBiblePatchQuery),
    postgresNode(
      'postgres-read-project-bible-patch-12',
      '数据库 - 读取Bible补丁生成上下文',
      [-480, 520],
      readProjectForBiblePatchQuery,
      '={{ [ $json.id, $json.project_id ] }}'
    ),
    codeNode('code-build-bible-patch-request-12', '代码 - 构建Bible补丁 GLM请求', [-260, 520], code('n8n/code/novel_build_glm_request.js')),
    httpGlmNode('http-glm-bible-patch-12', 'HTTP请求 - 调用GLM生成Bible补丁', [-40, 520]),
    codeNode('code-merge-bible-patch-response-12', '代码 - 合并Bible补丁 GLM响应上下文', [180, 520], mergeBiblePatchCode),
    codeNode('code-parse-bible-patch-response-12', '代码 - 解析Bible补丁 GLM响应', [400, 520], code('n8n/code/novel_parse_glm_json.js')),
    postgresNode(
      'postgres-record-bible-patch-ai-run-12',
      '数据库 - 记录Bible补丁 AI调用',
      [620, 520],
      recordAiRunQuery,
      '={{ [ $json.project_id, "", $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify({ ...$json.llm_request_body, trigger_source: $json.trigger_source, requested_by: $json.requested_by }), $json.llm_response_json, $json.parsed_payload_json, true, "", $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
    ),
    postgresNode(
      'postgres-save-bible-patch-12',
      '数据库 - 保存Bible补丁待确认',
      [840, 520],
      saveBiblePatchQuery,
      '={{ [ $("代码 - 解析Bible补丁 GLM响应").first().json.project_id, $("代码 - 解析Bible补丁 GLM响应").first().json.job_id, $("数据库 - 记录Bible补丁 AI调用").first().json.id, $("代码 - 解析Bible补丁 GLM响应").first().json.patch_payload_json, $("代码 - 解析Bible补丁 GLM响应").first().json.llm_request_body.model ] }}'
    ),
    postgresNode(
      'postgres-mark-bible-patch-success-12',
      '数据库 - 标记Bible补丁任务成功',
      [1060, 520],
      markJobSucceededQuery,
      '={{ [ $("数据库 - 领取GENERATE_BIBLE_PATCH任务").first().json.id ] }}'
    ),
    webhookNode('webhook-front-generate-bible-12', 'Webhook - 前端立即生成设定集', [-920, 260], 'POST', 'novel-generate-bible-now', 'novel-generate-bible-now-12'),
    codeNode('code-validate-front-bible-12', '代码 - 校验前端生成设定集', [-700, 260], code('n8n/code/novel_validate_project_generation_step.js')),
    postgresNode(
      'postgres-claim-front-bible-12',
      '数据库 - 前端领取GENERATE_BIBLE任务',
      [-480, 260],
      claimBibleForProjectQuery,
      '={{ [ $json.project_id ] }}'
    ),
    ifNode('if-front-bible-claimed-12', '条件判断 - 前端设定集任务已领取', [-260, 260], '={{ $json.claim_success }}', 'front-bible-claimed'),
    postgresNode(
      'postgres-read-front-project-bible-12',
      '数据库 - 读取前端Bible生成上下文',
      [-40, 180],
      readProjectForBibleQuery,
      '={{ [ $json.id, $json.project_id ] }}'
    ),
    codeNode('code-build-front-bible-request-12', '代码 - 构建前端Bible GLM请求', [180, 180], code('n8n/code/novel_build_glm_request.js')),
    httpGlmNode('http-glm-front-bible-12', 'HTTP请求 - 前端调用GLM生成Bible', [400, 180]),
    codeNode('code-merge-front-bible-response-12', '代码 - 合并前端Bible GLM响应上下文', [620, 180], mergeFrontBibleCode),
    codeNode('code-parse-front-bible-response-12', '代码 - 解析前端Bible GLM响应', [840, 180], code('n8n/code/novel_parse_glm_json.js')),
    postgresNode(
      'postgres-record-front-bible-ai-run-12',
      '数据库 - 记录前端Bible AI调用',
      [1060, 180],
      recordAiRunQuery,
      '={{ [ $json.project_id, "", $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify({ ...$json.llm_request_body, trigger_source: $json.trigger_source, requested_by: $json.requested_by }), $json.llm_response_json, $json.parsed_payload_json, true, "", $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
    ),
    postgresNode(
      'postgres-upsert-front-bible-12',
      '数据库 - 前端写入Bible并创建大纲任务',
      [1280, 180],
      upsertBibleQuery,
      '={{ [ $("代码 - 解析前端Bible GLM响应").first().json.project_id, $("代码 - 解析前端Bible GLM响应").first().json.world_setting, $("代码 - 解析前端Bible GLM响应").first().json.story_core, $("代码 - 解析前端Bible GLM响应").first().json.main_character_json, $("代码 - 解析前端Bible GLM响应").first().json.supporting_characters_json, $("代码 - 解析前端Bible GLM响应").first().json.villain_setting_json, $("代码 - 解析前端Bible GLM响应").first().json.power_system, $("代码 - 解析前端Bible GLM响应").first().json.relationship_map_json, $("代码 - 解析前端Bible GLM响应").first().json.organizations_json, $("代码 - 解析前端Bible GLM响应").first().json.locations_json, $("代码 - 解析前端Bible GLM响应").first().json.plot_constraints_json, $("代码 - 解析前端Bible GLM响应").first().json.expansion_notes, $("代码 - 解析前端Bible GLM响应").first().json.tone_rules, $("代码 - 解析前端Bible GLM响应").first().json.forbidden_rules, $("代码 - 解析前端Bible GLM响应").first().json.selling_points_json, $("代码 - 解析前端Bible GLM响应").first().json.llm_request_body.model, $("代码 - 解析前端Bible GLM响应").first().json.parsed_payload_json ] }}'
    ),
    postgresNode(
      'postgres-mark-front-bible-success-12',
      '数据库 - 标记前端Bible任务成功',
      [1500, 180],
      markJobSucceededQuery,
      '={{ [ $("数据库 - 前端领取GENERATE_BIBLE任务").first().json.id ] }}'
    ),
    codeNode('code-render-front-bible-result-12', '代码 - 生成前端设定集生成结果页', [-40, 360], code('n8n/code/novel_render_generation_step_result.js')),
    respondNode('respond-front-bible-result-12', '响应Webhook - 返回设定集生成结果', [180, 360], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),
    webhookNode('webhook-front-generate-bible-patch-12', 'Webhook - 前端立即生成设定集补丁', [-920, 780], 'POST', 'novel-generate-bible-patch-now', 'novel-generate-bible-patch-now-12'),
    codeNode('code-validate-front-bible-patch-12', '代码 - 校验前端生成设定集补丁', [-700, 780], code('n8n/code/novel_validate_project_generation_step.js')),
    postgresNode(
      'postgres-claim-front-bible-patch-12',
      '数据库 - 前端领取GENERATE_BIBLE_PATCH任务',
      [-480, 780],
      claimBiblePatchForProjectQuery,
      '={{ [ $json.project_id ] }}'
    ),
    ifNode('if-front-bible-patch-claimed-12', '条件判断 - 前端设定集补丁任务已领取', [-260, 780], '={{ $json.claim_success }}', 'front-bible-patch-claimed'),
    postgresNode(
      'postgres-read-front-project-bible-patch-12',
      '数据库 - 读取前端Bible补丁生成上下文',
      [-40, 700],
      readProjectForBiblePatchQuery,
      '={{ [ $json.id, $json.project_id ] }}'
    ),
    codeNode('code-build-front-bible-patch-request-12', '代码 - 构建前端Bible补丁 GLM请求', [180, 700], code('n8n/code/novel_build_glm_request.js')),
    httpGlmNode('http-glm-front-bible-patch-12', 'HTTP请求 - 前端调用GLM生成Bible补丁', [400, 700]),
    codeNode('code-merge-front-bible-patch-response-12', '代码 - 合并前端Bible补丁 GLM响应上下文', [620, 700], mergeFrontBiblePatchCode),
    codeNode('code-parse-front-bible-patch-response-12', '代码 - 解析前端Bible补丁 GLM响应', [840, 700], code('n8n/code/novel_parse_glm_json.js')),
    postgresNode(
      'postgres-record-front-bible-patch-ai-run-12',
      '数据库 - 记录前端Bible补丁 AI调用',
      [1060, 700],
      recordAiRunQuery,
      '={{ [ $json.project_id, "", $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify({ ...$json.llm_request_body, trigger_source: $json.trigger_source, requested_by: $json.requested_by }), $json.llm_response_json, $json.parsed_payload_json, true, "", $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
    ),
    postgresNode(
      'postgres-save-front-bible-patch-12',
      '数据库 - 前端保存Bible补丁待确认',
      [1280, 700],
      saveBiblePatchQuery,
      '={{ [ $("代码 - 解析前端Bible补丁 GLM响应").first().json.project_id, $("代码 - 解析前端Bible补丁 GLM响应").first().json.job_id, $("数据库 - 记录前端Bible补丁 AI调用").first().json.id, $("代码 - 解析前端Bible补丁 GLM响应").first().json.patch_payload_json, $("代码 - 解析前端Bible补丁 GLM响应").first().json.llm_request_body.model ] }}'
    ),
    postgresNode(
      'postgres-mark-front-bible-patch-success-12',
      '数据库 - 标记前端Bible补丁任务成功',
      [1500, 700],
      markJobSucceededQuery,
      '={{ [ $("数据库 - 前端领取GENERATE_BIBLE_PATCH任务").first().json.id ] }}'
    ),
    codeNode('code-render-front-bible-patch-result-12', '代码 - 生成前端设定集补丁结果页', [-40, 880], code('n8n/code/novel_render_generation_step_result.js')),
    respondNode('respond-front-bible-patch-result-12', '响应Webhook - 返回设定集补丁结果', [180, 880], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),
    sticky('note-bible-12', '说明 - Bible生成', [-920, -240], '领取 `GENERATE_BIBLE` 任务会写入正式设定集并创建大纲任务；领取 `GENERATE_BIBLE_PATCH` 任务只生成待确认扩写补丁，人工应用后才合并进正式设定集。前端入口包括 `/webhook/novel-generate-bible-now` 和 `/webhook/novel-generate-bible-patch-now`。'),
  ],
  {
    '手动触发': {main: [[{node: '数据库 - 领取GENERATE_BIBLE任务', type: 'main', index: 0}]]},
    '数据库 - 领取GENERATE_BIBLE任务': {main: [[{node: '数据库 - 读取Bible生成上下文', type: 'main', index: 0}]]},
    '数据库 - 读取Bible生成上下文': {main: [[{node: '代码 - 构建Bible GLM请求', type: 'main', index: 0}]]},
    '代码 - 构建Bible GLM请求': {main: [[{node: 'HTTP请求 - 调用GLM生成Bible', type: 'main', index: 0}]]},
    'HTTP请求 - 调用GLM生成Bible': {main: [[{node: '代码 - 合并Bible GLM响应上下文', type: 'main', index: 0}]]},
    '代码 - 合并Bible GLM响应上下文': {main: [[{node: '代码 - 解析Bible GLM响应', type: 'main', index: 0}]]},
    '代码 - 解析Bible GLM响应': {main: [[{node: '数据库 - 记录Bible AI调用', type: 'main', index: 0}]]},
    '数据库 - 记录Bible AI调用': {main: [[{node: '数据库 - 写入Bible并创建大纲任务', type: 'main', index: 0}]]},
    '数据库 - 写入Bible并创建大纲任务': {main: [[{node: '数据库 - 标记Bible任务成功', type: 'main', index: 0}]]},
    '手动触发扩写设定补丁': {main: [[{node: '数据库 - 领取GENERATE_BIBLE_PATCH任务', type: 'main', index: 0}]]},
    '数据库 - 领取GENERATE_BIBLE_PATCH任务': {main: [[{node: '数据库 - 读取Bible补丁生成上下文', type: 'main', index: 0}]]},
    '数据库 - 读取Bible补丁生成上下文': {main: [[{node: '代码 - 构建Bible补丁 GLM请求', type: 'main', index: 0}]]},
    '代码 - 构建Bible补丁 GLM请求': {main: [[{node: 'HTTP请求 - 调用GLM生成Bible补丁', type: 'main', index: 0}]]},
    'HTTP请求 - 调用GLM生成Bible补丁': {main: [[{node: '代码 - 合并Bible补丁 GLM响应上下文', type: 'main', index: 0}]]},
    '代码 - 合并Bible补丁 GLM响应上下文': {main: [[{node: '代码 - 解析Bible补丁 GLM响应', type: 'main', index: 0}]]},
    '代码 - 解析Bible补丁 GLM响应': {main: [[{node: '数据库 - 记录Bible补丁 AI调用', type: 'main', index: 0}]]},
    '数据库 - 记录Bible补丁 AI调用': {main: [[{node: '数据库 - 保存Bible补丁待确认', type: 'main', index: 0}]]},
    '数据库 - 保存Bible补丁待确认': {main: [[{node: '数据库 - 标记Bible补丁任务成功', type: 'main', index: 0}]]},
    'Webhook - 前端立即生成设定集': {main: [[{node: '代码 - 校验前端生成设定集', type: 'main', index: 0}]]},
    '代码 - 校验前端生成设定集': {main: [[{node: '数据库 - 前端领取GENERATE_BIBLE任务', type: 'main', index: 0}]]},
    '数据库 - 前端领取GENERATE_BIBLE任务': {main: [[{node: '条件判断 - 前端设定集任务已领取', type: 'main', index: 0}]]},
    '条件判断 - 前端设定集任务已领取': {main: [[{node: '代码 - 生成前端设定集生成结果页', type: 'main', index: 0}, {node: '数据库 - 读取前端Bible生成上下文', type: 'main', index: 0}], [{node: '代码 - 生成前端设定集生成结果页', type: 'main', index: 0}]]},
    '数据库 - 读取前端Bible生成上下文': {main: [[{node: '代码 - 构建前端Bible GLM请求', type: 'main', index: 0}]]},
    '代码 - 构建前端Bible GLM请求': {main: [[{node: 'HTTP请求 - 前端调用GLM生成Bible', type: 'main', index: 0}]]},
    'HTTP请求 - 前端调用GLM生成Bible': {main: [[{node: '代码 - 合并前端Bible GLM响应上下文', type: 'main', index: 0}]]},
    '代码 - 合并前端Bible GLM响应上下文': {main: [[{node: '代码 - 解析前端Bible GLM响应', type: 'main', index: 0}]]},
    '代码 - 解析前端Bible GLM响应': {main: [[{node: '数据库 - 记录前端Bible AI调用', type: 'main', index: 0}]]},
    '数据库 - 记录前端Bible AI调用': {main: [[{node: '数据库 - 前端写入Bible并创建大纲任务', type: 'main', index: 0}]]},
    '数据库 - 前端写入Bible并创建大纲任务': {main: [[{node: '数据库 - 标记前端Bible任务成功', type: 'main', index: 0}]]},
    '代码 - 生成前端设定集生成结果页': {main: [[{node: '响应Webhook - 返回设定集生成结果', type: 'main', index: 0}]]},
    'Webhook - 前端立即生成设定集补丁': {main: [[{node: '代码 - 校验前端生成设定集补丁', type: 'main', index: 0}]]},
    '代码 - 校验前端生成设定集补丁': {main: [[{node: '数据库 - 前端领取GENERATE_BIBLE_PATCH任务', type: 'main', index: 0}]]},
    '数据库 - 前端领取GENERATE_BIBLE_PATCH任务': {main: [[{node: '条件判断 - 前端设定集补丁任务已领取', type: 'main', index: 0}]]},
    '条件判断 - 前端设定集补丁任务已领取': {main: [[{node: '代码 - 生成前端设定集补丁结果页', type: 'main', index: 0}, {node: '数据库 - 读取前端Bible补丁生成上下文', type: 'main', index: 0}], [{node: '代码 - 生成前端设定集补丁结果页', type: 'main', index: 0}]]},
    '数据库 - 读取前端Bible补丁生成上下文': {main: [[{node: '代码 - 构建前端Bible补丁 GLM请求', type: 'main', index: 0}]]},
    '代码 - 构建前端Bible补丁 GLM请求': {main: [[{node: 'HTTP请求 - 前端调用GLM生成Bible补丁', type: 'main', index: 0}]]},
    'HTTP请求 - 前端调用GLM生成Bible补丁': {main: [[{node: '代码 - 合并前端Bible补丁 GLM响应上下文', type: 'main', index: 0}]]},
    '代码 - 合并前端Bible补丁 GLM响应上下文': {main: [[{node: '代码 - 解析前端Bible补丁 GLM响应', type: 'main', index: 0}]]},
    '代码 - 解析前端Bible补丁 GLM响应': {main: [[{node: '数据库 - 记录前端Bible补丁 AI调用', type: 'main', index: 0}]]},
    '数据库 - 记录前端Bible补丁 AI调用': {main: [[{node: '数据库 - 前端保存Bible补丁待确认', type: 'main', index: 0}]]},
    '数据库 - 前端保存Bible补丁待确认': {main: [[{node: '数据库 - 标记前端Bible补丁任务成功', type: 'main', index: 0}]]},
    '代码 - 生成前端设定集补丁结果页': {main: [[{node: '响应Webhook - 返回设定集补丁结果', type: 'main', index: 0}]]},
  }
);

const outlineWorkflow = workflowBase(
  'novelOutlineV1Workflow13',
  '13_小说生成章节大纲',
  [
    manualNode('manual-novel-outline-13', '手动触发', [-920, 0]),
    postgresNode('postgres-claim-outline-13', '数据库 - 领取GENERATE_OUTLINE任务', [-700, 0], claimOutlineQuery),
    postgresNode(
      'postgres-read-project-outline-13',
      '数据库 - 读取大纲生成上下文',
      [-480, 0],
      readProjectForOutlineQuery,
      '={{ [ $json.id, $json.project_id ] }}'
    ),
    codeNode('code-build-outline-request-13', '代码 - 构建大纲 GLM请求', [-260, 0], code('n8n/code/novel_build_glm_request.js')),
    httpGlmNode('http-glm-outline-13', 'HTTP请求 - 调用GLM生成大纲', [-40, 0]),
    codeNode('code-merge-outline-response-13', '代码 - 合并大纲 GLM响应上下文', [180, 0], mergeOutlineCode),
    codeNode('code-parse-outline-response-13', '代码 - 解析大纲 GLM响应', [400, 0], code('n8n/code/novel_parse_glm_json.js')),
    postgresNode(
      'postgres-record-outline-ai-run-13',
      '数据库 - 记录大纲 AI调用',
      [620, 0],
      recordAiRunQuery,
      '={{ [ $json.project_id, "", $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify({ ...$json.llm_request_body, trigger_source: $json.trigger_source, requested_by: $json.requested_by }), $json.llm_response_json, $json.parsed_payload_json, true, "", $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
    ),
    postgresNode(
      'postgres-upsert-outline-13',
      '数据库 - 写入大纲并创建第1章任务',
      [840, 0],
      upsertOutlineQuery,
      '={{ [ $("代码 - 解析大纲 GLM响应").first().json.project_id, $("代码 - 解析大纲 GLM响应").first().json.chapters_json ] }}'
    ),
    postgresNode(
      'postgres-mark-outline-success-13',
      '数据库 - 标记大纲任务成功',
      [1060, 0],
      markJobSucceededQuery,
      '={{ [ $("数据库 - 领取GENERATE_OUTLINE任务").first().json.id ] }}'
    ),
    webhookNode('webhook-front-generate-outline-13', 'Webhook - 前端立即生成大纲', [-920, 260], 'POST', 'novel-generate-outline-now', 'novel-generate-outline-now-13'),
    codeNode('code-validate-front-outline-13', '代码 - 校验前端生成大纲', [-700, 260], code('n8n/code/novel_validate_project_generation_step.js')),
    postgresNode(
      'postgres-claim-front-outline-13',
      '数据库 - 前端领取GENERATE_OUTLINE任务',
      [-480, 260],
      claimOutlineForProjectQuery,
      '={{ [ $json.project_id ] }}'
    ),
    ifNode('if-front-outline-claimed-13', '条件判断 - 前端大纲任务已领取', [-260, 260], '={{ $json.claim_success }}', 'front-outline-claimed'),
    postgresNode(
      'postgres-read-front-project-outline-13',
      '数据库 - 读取前端大纲生成上下文',
      [-40, 180],
      readProjectForOutlineQuery,
      '={{ [ $json.id, $json.project_id ] }}'
    ),
    codeNode('code-build-front-outline-request-13', '代码 - 构建前端大纲 GLM请求', [180, 180], code('n8n/code/novel_build_glm_request.js')),
    httpGlmNode('http-glm-front-outline-13', 'HTTP请求 - 前端调用GLM生成大纲', [400, 180]),
    codeNode('code-merge-front-outline-response-13', '代码 - 合并前端大纲 GLM响应上下文', [620, 180], mergeFrontOutlineCode),
    codeNode('code-parse-front-outline-response-13', '代码 - 解析前端大纲 GLM响应', [840, 180], code('n8n/code/novel_parse_glm_json.js')),
    postgresNode(
      'postgres-record-front-outline-ai-run-13',
      '数据库 - 记录前端大纲 AI调用',
      [1060, 180],
      recordAiRunQuery,
      '={{ [ $json.project_id, "", $json.job_id, $json.run_type, $json.llm_request_body.model, $json.prompt_version, JSON.stringify({ ...$json.llm_request_body, trigger_source: $json.trigger_source, requested_by: $json.requested_by }), $json.llm_response_json, $json.parsed_payload_json, true, "", $json.ai_run_started_at, $json.ai_run_finished_at ] }}'
    ),
    postgresNode(
      'postgres-upsert-front-outline-13',
      '数据库 - 前端写入大纲并创建第1章任务',
      [1280, 180],
      upsertOutlineQuery,
      '={{ [ $("代码 - 解析前端大纲 GLM响应").first().json.project_id, $("代码 - 解析前端大纲 GLM响应").first().json.chapters_json ] }}'
    ),
    postgresNode(
      'postgres-mark-front-outline-success-13',
      '数据库 - 标记前端大纲任务成功',
      [1500, 180],
      markJobSucceededQuery,
      '={{ [ $("数据库 - 前端领取GENERATE_OUTLINE任务").first().json.id ] }}'
    ),
    codeNode('code-render-front-outline-result-13', '代码 - 生成前端大纲生成结果页', [-40, 360], code('n8n/code/novel_render_generation_step_result.js')),
    respondNode('respond-front-outline-result-13', '响应Webhook - 返回大纲生成结果', [180, 360], '={{ $json.response_html }}', '={{ $json.response_status_code || 200 }}', 'text/html; charset=utf-8'),
    sticky('note-outline-13', '说明 - 大纲生成', [-920, -240], '领取 `GENERATE_OUTLINE` 任务，调用 GLM，按扩写范围写入 `novel_chapter_outlines(READY)`，并从本次实际写入的最小章节创建 `PLAN_CHAPTER_DIRECTOR(PENDING)`；POST `/webhook/novel-generate-outline-now` 会先返回后台执行页，模型调用继续在工作流后台完成。'),
  ],
  {
    '手动触发': {main: [[{node: '数据库 - 领取GENERATE_OUTLINE任务', type: 'main', index: 0}]]},
    '数据库 - 领取GENERATE_OUTLINE任务': {main: [[{node: '数据库 - 读取大纲生成上下文', type: 'main', index: 0}]]},
    '数据库 - 读取大纲生成上下文': {main: [[{node: '代码 - 构建大纲 GLM请求', type: 'main', index: 0}]]},
    '代码 - 构建大纲 GLM请求': {main: [[{node: 'HTTP请求 - 调用GLM生成大纲', type: 'main', index: 0}]]},
    'HTTP请求 - 调用GLM生成大纲': {main: [[{node: '代码 - 合并大纲 GLM响应上下文', type: 'main', index: 0}]]},
    '代码 - 合并大纲 GLM响应上下文': {main: [[{node: '代码 - 解析大纲 GLM响应', type: 'main', index: 0}]]},
    '代码 - 解析大纲 GLM响应': {main: [[{node: '数据库 - 记录大纲 AI调用', type: 'main', index: 0}]]},
    '数据库 - 记录大纲 AI调用': {main: [[{node: '数据库 - 写入大纲并创建第1章任务', type: 'main', index: 0}]]},
    '数据库 - 写入大纲并创建第1章任务': {main: [[{node: '数据库 - 标记大纲任务成功', type: 'main', index: 0}]]},
    'Webhook - 前端立即生成大纲': {main: [[{node: '代码 - 校验前端生成大纲', type: 'main', index: 0}]]},
    '代码 - 校验前端生成大纲': {main: [[{node: '数据库 - 前端领取GENERATE_OUTLINE任务', type: 'main', index: 0}]]},
    '数据库 - 前端领取GENERATE_OUTLINE任务': {main: [[{node: '条件判断 - 前端大纲任务已领取', type: 'main', index: 0}]]},
    '条件判断 - 前端大纲任务已领取': {main: [[{node: '代码 - 生成前端大纲生成结果页', type: 'main', index: 0}, {node: '数据库 - 读取前端大纲生成上下文', type: 'main', index: 0}], [{node: '代码 - 生成前端大纲生成结果页', type: 'main', index: 0}]]},
    '数据库 - 读取前端大纲生成上下文': {main: [[{node: '代码 - 构建前端大纲 GLM请求', type: 'main', index: 0}]]},
    '代码 - 构建前端大纲 GLM请求': {main: [[{node: 'HTTP请求 - 前端调用GLM生成大纲', type: 'main', index: 0}]]},
    'HTTP请求 - 前端调用GLM生成大纲': {main: [[{node: '代码 - 合并前端大纲 GLM响应上下文', type: 'main', index: 0}]]},
    '代码 - 合并前端大纲 GLM响应上下文': {main: [[{node: '代码 - 解析前端大纲 GLM响应', type: 'main', index: 0}]]},
    '代码 - 解析前端大纲 GLM响应': {main: [[{node: '数据库 - 记录前端大纲 AI调用', type: 'main', index: 0}]]},
    '数据库 - 记录前端大纲 AI调用': {main: [[{node: '数据库 - 前端写入大纲并创建第1章任务', type: 'main', index: 0}]]},
    '数据库 - 前端写入大纲并创建第1章任务': {main: [[{node: '数据库 - 标记前端大纲任务成功', type: 'main', index: 0}]]},
    '代码 - 生成前端大纲生成结果页': {main: [[{node: '响应Webhook - 返回大纲生成结果', type: 'main', index: 0}]]},
  }
);

const outputs = [
  ['n8n/workflow/11_novel_center_workflow.json', centerWorkflow],
  ['n8n/workflow/available/11_novel_center_workflow.json', centerWorkflow],
  ['n8n/workflow/12_novel_bible_workflow.json', bibleWorkflow],
  ['n8n/workflow/available/12_novel_bible_workflow.json', bibleWorkflow],
  ['n8n/workflow/13_novel_outline_workflow.json', outlineWorkflow],
  ['n8n/workflow/available/13_novel_outline_workflow.json', outlineWorkflow],
];

for (const [relativePath, workflow] of outputs) {
  const fullPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), {recursive: true});
  fs.writeFileSync(fullPath, `${JSON.stringify(workflow, null, 2)}\n`);
}

console.log(`Generated ${outputs.length} novel Phase 3 workflow files.`);
