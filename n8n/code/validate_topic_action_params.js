// n8n Code node: Validate Topic Action Params
// Expected query: ?action=promote|reject|duplicate&candidate_id=<uuid>&note=<optional>

const source = $json || {};
const query = source.query || source.params || source.body || source;

const action = String(query.action || '').trim().toLowerCase();
const rawCandidateId = String(query.candidate_id || query.id || '').trim();
const note = String(query.note || '').trim();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const candidateId = uuidPattern.test(rawCandidateId)
  ? rawCandidateId
  : '00000000-0000-4000-8000-000000000000';

const normalizedAction = ['promote', 'reject', 'duplicate'].includes(action) ? action : 'invalid';

return [{
  json: {
    action: normalizedAction,
    candidate_id: candidateId,
    note,
    received_at: new Date().toISOString(),
  },
}];
