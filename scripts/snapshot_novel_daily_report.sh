#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-n8n-video-postgres}"
POSTGRES_USER="${POSTGRES_USER:-n8n}"
POSTGRES_DB="${POSTGRES_DB:-video_agent}"
REPORT_DATE="$(date +%F)"
NOTE="手动保存日报快照"
DRY_RUN="false"

usage() {
  cat <<'USAGE'
用法：scripts/snapshot_novel_daily_report.sh [--dry-run] [--date 日期] [--note 备注]

保存当天或指定日期的小说运行日报快照。

选项：
  --dry-run      只打印将要执行的语句，不写入数据库
  --date 日期    指定快照日期，例如 2026-05-03
  --note 备注    写入快照备注
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    --date)
      REPORT_DATE="${2:?缺少日期}"
      shift 2
      ;;
    --note)
      NOTE="${2:?缺少备注}"
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

SQL_NOTE="${NOTE//\'/\'\'}"
SQL="SELECT report_date, captured_at, today_job_total_count, today_job_failed_count, today_ai_run_count, waiting_job_count, failed_job_count, need_review_count FROM upsert_novel_daily_report_snapshot('${REPORT_DATE}'::date, '${SQL_NOTE}');"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "将保存小说运行日报快照"
  echo "日期：${REPORT_DATE}"
  echo "备注：${NOTE}"
  echo "$SQL"
  exit 0
fi

docker exec -i "$POSTGRES_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$SQL"
