// n8n Code node: Validate front-end GLM job recover action.
// Only accepts POST body fields from /webhook/novel-job-recover.

const source = $json || {};
if (source.query && !source.body) {
  throw new Error('检查并恢复任务必须通过 POST body 提交，拒绝 GET/query 参数。');
}

if (!source.body || typeof source.body !== 'object') {
  throw new Error('检查并恢复任务必须通过 POST body 提交。');
}

const body = source.body;

function text(value) {
  return String(value ?? '').trim();
}

const projectId = text(body.project_id || body.id);
const jobId = text(body.job_id || body.recover_job_id);
const reviewer = text(body.reviewer || 'local_user') || 'local_user';
const jobType = text(body.job_type || '');

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
  throw new Error(`无效 project_id：${projectId || '(empty)'}`);
}

if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
  throw new Error(`无效 job_id：${jobId || '(empty)'}`);
}

return [{
  json: {
    project_id: projectId,
    job_id: jobId,
    reviewer,
    job_type: jobType,
    action: 'RECOVER_GLM_JOB',
  },
}];
