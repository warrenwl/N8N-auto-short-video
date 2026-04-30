// n8n Code node: Build Topic Generation Jobs Response

function formatJob(row) {
  return {
    id: row.id,
    batch_id: row.batch_id,
    source: row.source,
    status: row.status,
    platform: row.platform,
    account_key: row.account_key,
    category: row.category,
    direction: row.direction,
    audience: row.audience,
    style: row.style,
    requested_count: Number(row.requested_count || 0),
    parsed_count: Number(row.parsed_count || 0),
    created_count: Number(row.created_count || 0),
    duplicate_count: Number(row.duplicate_count || 0),
    created_candidates: Array.isArray(row.created_candidates) ? row.created_candidates : [],
    error: row.error || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    elapsed_seconds: Number(row.elapsed_seconds || 0),
  };
}

const jobs = $input.all()
  .map((item) => item.json || {})
  .filter((row) => row.id)
  .map(formatJob);

return [{
  json: {
    success: true,
    response_status_code: 200,
    jobs,
    running_count: jobs.filter((job) => job.status === 'RUNNING').length,
    generated_at: new Date().toISOString(),
  },
}];
