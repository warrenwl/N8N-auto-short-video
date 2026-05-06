#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-n8n-video-postgres}"
POSTGRES_USER="${POSTGRES_USER:-n8n}"
POSTGRES_DB="${POSTGRES_DB:-video_agent}"
N8N_CONTAINER="${N8N_CONTAINER:-n8n-video-n8n}"
TARGET_CHAPTERS="${TARGET_CHAPTERS:-3}"
TARGET_WORDS="${TARGET_WORDS:-300}"
TITLE="${TITLE:-第十二阶段长篇压测 $(date +%Y%m%d%H%M%S)}"
DRY_RUN="false"
REAL_NOTIFY="false"

usage() {
  cat <<'USAGE'
用法：scripts/run_novel_longform_smoke.sh [--dry-run] [--real-notify] [--target-chapters 数量] [--words 字数] [--title 标题]

创建一个短篇连载项目，使用真实模型按章节跑完整链路：
生成设定集 -> 生成大纲 -> 生成章节 -> 智能审稿 -> 审核提醒 -> 自动人工通过 -> 下一章

默认目标章节数为 3，通知默认禁用。
此脚本用于 Phase 12 长篇真实连载压测，不使用本地模拟模型端口。

相关队列基准脚本：scripts/run_novel_queue_once.sh
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --real-notify)
      REAL_NOTIFY="true"
      shift
      ;;
    --target-chapters)
      TARGET_CHAPTERS="${2:?缺少章节数}"
      shift 2
      ;;
    --words)
      TARGET_WORDS="${2:?缺少字数}"
      shift 2
      ;;
    --title)
      TITLE="${2:?缺少标题}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "未知参数：$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$TARGET_CHAPTERS" -lt 1 ]]; then
  echo "目标章节数必须大于零" >&2
  exit 2
fi

if [[ -f .env ]] && grep -Eq '^[[:space:]]*GLM_API_BASE_URL=.*(host\.docker\.internal|127\.0\.0\.1|localhost).*18080' .env; then
  echo "检测到本地模拟模型端口配置，拒绝执行真实连载压测" >&2
  exit 2
fi

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

psql_cmd() {
  docker exec -i "$POSTGRES_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"
}

run_sql_scalar() {
  psql_cmd -At
}

run_cmd() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '%q ' "$@"
    printf '\n'
    return
  fi
  "$@"
}

execute_workflow() {
  local workflow_id="$1"
  shift || true
  run_cmd docker compose run --rm "$@" n8n execute --id="$workflow_id" --rawOutput
}

restart_n8n() {
  if [[ "$DRY_RUN" == "true" ]]; then
    printf '%q ' docker start "$N8N_CONTAINER"
    printf '\n'
    return
  fi
  docker start "$N8N_CONTAINER" >/dev/null || true
}

prioritize_job() {
  local project_id="$1"
  local job_type="$2"
  local chapter_no="${3:-}"
  local chapter_filter=""
  if [[ -n "$chapter_no" ]]; then
    chapter_filter="AND chapter_no = ${chapter_no}"
  fi
  run_sql_scalar <<SQL >/dev/null
UPDATE novel_generation_jobs
SET created_at = TIMESTAMPTZ '2000-01-01 00:00:00+00'
WHERE project_id = '${project_id}'::uuid
  AND job_type = '${job_type}'
  AND status = 'PENDING'
  ${chapter_filter};
SQL
}

approve_chapter() {
  local project_id="$1"
  local chapter_no="$2"
  local row
  row="$(run_sql_scalar <<SQL
SELECT c.id::text || '|' || c.review_token
FROM novel_chapters c
WHERE c.project_id = '${project_id}'::uuid
  AND c.chapter_no = ${chapter_no}
  AND c.status = 'NEED_REVIEW'
ORDER BY c.generation_version DESC
LIMIT 1;
SQL
)"
  if [[ -z "$row" ]]; then
    echo "未找到第 ${chapter_no} 章待审候选稿" >&2
    exit 1
  fi
  local chapter_id="${row%%|*}"
  local token="${row#*|}"
  run_sql_scalar <<SQL
SELECT success, result_code, chapter_no, chapter_status, project_status
FROM apply_novel_review_action(
  '${chapter_id}'::uuid,
  '${token}',
  'APPROVE',
  'Phase 12 长篇压测自动通过',
  'phase12_longform_smoke'
);
SQL
}

if [[ "$DRY_RUN" == "true" ]]; then
  echo "长篇真实连载压测预演"
  echo "目标章节数：${TARGET_CHAPTERS}"
  echo "每章目标字数：${TARGET_WORDS}"
  echo "通知默认禁用：$([[ "$REAL_NOTIFY" == "true" ]] && echo "否" || echo "是")"
  echo "将创建项目：${TITLE}"
  echo "将执行工作流：12、13、14、15、17"
  echo "将自动通过每章待审候选稿"
  echo "结束后将执行：scripts/snapshot_novel_daily_report.sh"
  exit 0
fi

TITLE_SQL="$(sql_escape "$TITLE")"

PROJECT_ID="$(run_sql_scalar <<SQL
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
    '${TITLE_SQL}',
    '都市奇幻',
    '中文连载读者',
    '节奏紧凑、冲突清晰、章末留钩子',
    '主角在旧城档案馆发现一套会改写现实的目录卡，必须在七天内找回被抹掉的人生。',
    ${TARGET_CHAPTERS},
    ${TARGET_WORDS},
    'CREATED'
  )
  RETURNING *
), job AS (
  INSERT INTO novel_generation_jobs (project_id, job_type, status, created_at)
  SELECT id, 'GENERATE_BIBLE', 'PENDING', TIMESTAMPTZ '2000-01-01 00:00:00+00'
  FROM project
  RETURNING *
)
SELECT id FROM project;
SQL
)"

echo "已创建压测项目：${PROJECT_ID}"

docker stop "$N8N_CONTAINER" >/dev/null
trap restart_n8n EXIT

prioritize_job "$PROJECT_ID" "GENERATE_BIBLE"
execute_workflow novelBibleV1Workflow12

prioritize_job "$PROJECT_ID" "GENERATE_OUTLINE"
execute_workflow novelOutlineV1Workflow13

for chapter_no in $(seq 1 "$TARGET_CHAPTERS"); do
  echo "开始处理第 ${chapter_no} 章"

  prioritize_job "$PROJECT_ID" "PLAN_CHAPTER_DIRECTOR" "$chapter_no"
  execute_workflow novelDirectorV1Workflow13B

  prioritize_job "$PROJECT_ID" "GENERATE_CHAPTER" "$chapter_no"
  execute_workflow novelChapterV1Workflow14

  prioritize_job "$PROJECT_ID" "REVIEW_CHAPTER" "$chapter_no"
  execute_workflow novelAiReviewV1Workflow15

  prioritize_job "$PROJECT_ID" "NOTIFY_REVIEW" "$chapter_no"
  if [[ "$REAL_NOTIFY" == "true" ]]; then
    execute_workflow novelRewriteNotifyV1Workflow17
  else
    execute_workflow novelRewriteNotifyV1Workflow17 -e NOVEL_DISABLE_SERVERCHAN=true
  fi

  approve_chapter "$PROJECT_ID" "$chapter_no"
done

restart_n8n
trap - EXIT

scripts/snapshot_novel_daily_report.sh --note "Phase 12 长篇压测后保存"

run_sql_scalar <<SQL
SELECT
  p.id,
  p.title,
  p.status,
  p.current_chapter_no,
  p.target_total_chapters,
  COUNT(c.id) FILTER (WHERE c.status = 'APPROVED' AND c.is_current = TRUE) AS approved_current_chapters,
  COUNT(j.id) FILTER (WHERE j.status = 'FAILED') AS failed_jobs
FROM novel_projects p
LEFT JOIN novel_chapters c ON c.project_id = p.id
LEFT JOIN novel_generation_jobs j ON j.project_id = p.id
WHERE p.id = '${PROJECT_ID}'::uuid
GROUP BY p.id;
SQL
