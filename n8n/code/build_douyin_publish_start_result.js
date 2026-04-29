// n8n Code node: Build Douyin Publish Start Result

const row = $json || {};
const explicitSuccess = row.success;
const success = explicitSuccess === false || explicitSuccess === 'false'
  ? false
  : Boolean(row.id);

return [
  {
    json: {
      success,
      response_status_code: success ? 200 : 409,
      response_json: {
        success,
        result_code: row.result_code || (success ? 'OK' : 'INVALID_TASK_OR_TOKEN'),
        job_id: row.id || null,
        video_topic_id: row.video_topic_id || null,
        status: row.status || null,
        video_url: row.video_url || null,
        download_page_url: row.download_page_url || null,
        video_download_url: row.video_download_url || null,
        cover_url: row.cover_url || null,
        caption_url: row.caption_url || null,
        metadata_url: row.metadata_url || null,
        reminded_at: row.reminded_at || null,
      },
    },
  },
];
