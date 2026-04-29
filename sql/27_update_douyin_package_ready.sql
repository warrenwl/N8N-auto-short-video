-- publish-helper generated downloadable package files.
-- $1 package_dir
-- $2 video_url
-- $3 cover_url
-- $4 caption_url
-- $5 metadata_url
-- $6 download_page_url
-- $7 video_download_url
-- $8 job_id

UPDATE video_publish_jobs
SET
  status = 'PACKAGE_READY',
  package_dir = $1,
  video_url = $2,
  cover_url = NULLIF($3, ''),
  caption_url = $4,
  metadata_url = $5,
  download_page_url = NULLIF($6, ''),
  video_download_url = NULLIF($7, ''),
  error_code = NULL,
  error_message = NULL,
  updated_at = NOW()
WHERE id = $8::bigint
  AND status IN ('PACKAGING', 'PACKAGE_READY', 'REMIND_SENT')
RETURNING *;
