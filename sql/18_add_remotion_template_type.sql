ALTER TABLE video_topics
ADD COLUMN IF NOT EXISTS template_type text NOT NULL DEFAULT 'knowledge';

ALTER TABLE video_topics
DROP CONSTRAINT IF EXISTS video_topics_template_type_check;

ALTER TABLE video_topics
ADD CONSTRAINT video_topics_template_type_check
CHECK (template_type IN ('knowledge', 'list', 'contrast', 'story'));
