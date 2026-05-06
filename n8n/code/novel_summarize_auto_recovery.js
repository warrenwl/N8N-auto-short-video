// n8n Code node: Summarize Novel Auto Recovery

const rows = $input.all().map((item) => item.json || {});
const summary = {
  recovered_count: rows.filter((row) => row.event_type === 'AUTO_RECOVERY_RETRY').length,
  failed_count: rows.filter((row) => row.event_type === 'AUTO_RECOVERY_FAILED').length,
  repaired_next_job_count: rows.filter((row) => ['NEXT_CHAPTER_JOB_REPAIRED', 'NEXT_DIRECTOR_JOB_REPAIRED'].includes(row.event_type)).length,
  rows,
};

return [{
  json: {
    novel_auto_recovery_summary: summary,
    recovered_count: summary.recovered_count,
    failed_count: summary.failed_count,
    repaired_next_job_count: summary.repaired_next_job_count,
  },
}];
