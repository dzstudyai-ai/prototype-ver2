-- Split is_verified into separate exam and TD verification columns
ALTER TABLE grades ADD COLUMN IF NOT EXISTS is_exam_verified boolean DEFAULT NULL;
ALTER TABLE grades ADD COLUMN IF NOT EXISTS is_td_verified boolean DEFAULT NULL;

-- Migrate old data: copy is_verified to is_exam_verified (if it existed)
UPDATE grades SET is_exam_verified = is_verified WHERE is_verified IS NOT NULL;
