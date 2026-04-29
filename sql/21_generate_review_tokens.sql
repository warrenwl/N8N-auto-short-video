-- Generate review tokens for rows that do not have one yet.
-- Safe to run multiple times.
UPDATE video_topics
SET
  review_token = md5(random()::text || clock_timestamp()::text || coalesce(id::text, ''))
WHERE review_token IS NULL OR review_token = '';
