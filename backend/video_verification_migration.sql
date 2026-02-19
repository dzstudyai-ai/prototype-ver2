-- ═══════════════════════════════════════════════════
-- VIDEO VERIFICATION SCHEMA MIGRATION
-- Adds video verification columns to grade_verifications
-- Run this in Supabase SQL Editor AFTER the original schema
-- ═══════════════════════════════════════════════════

-- 1. Make image_hash nullable (video verifications don't have one)
ALTER TABLE grade_verifications ALTER COLUMN image_hash DROP NOT NULL;
ALTER TABLE grade_verifications ALTER COLUMN image_hash SET DEFAULT NULL;

-- 2. Add video-specific and job-tracking columns
ALTER TABLE grade_verifications DROP CONSTRAINT IF EXISTS grade_verifications_status_check;
ALTER TABLE grade_verifications ADD CONSTRAINT grade_verifications_status_check 
    CHECK (status IN ('VERIFIED', 'PENDING', 'REJECTED', 'PROCESSING', 'FAILED'));

ALTER TABLE grade_verifications ADD COLUMN IF NOT EXISTS verification_type text DEFAULT 'screenshot' CHECK (verification_type IN ('screenshot', 'video'));
ALTER TABLE grade_verifications ADD COLUMN IF NOT EXISTS current_step text DEFAULT 'IDLE';
ALTER TABLE grade_verifications ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE grade_verifications ADD COLUMN IF NOT EXISTS frames_analyzed integer DEFAULT 0;
ALTER TABLE grade_verifications ADD COLUMN IF NOT EXISTS ocr_agreement_score integer DEFAULT 0 CHECK (ocr_agreement_score >= 0 AND ocr_agreement_score <= 100);
ALTER TABLE grade_verifications ADD COLUMN IF NOT EXISTS temporal_consistency_score integer DEFAULT 0 CHECK (temporal_consistency_score >= 0 AND temporal_consistency_score <= 100);
ALTER TABLE grade_verifications ADD COLUMN IF NOT EXISTS arithmetic_accuracy_score integer DEFAULT 0 CHECK (arithmetic_accuracy_score >= 0 AND arithmetic_accuracy_score <= 100);
ALTER TABLE grade_verifications ADD COLUMN IF NOT EXISTS cross_check_result jsonb DEFAULT '{}'::jsonb;
ALTER TABLE grade_verifications ADD COLUMN IF NOT EXISTS issues jsonb DEFAULT '[]'::jsonb;
ALTER TABLE grade_verifications ADD COLUMN IF NOT EXISTS processing_time numeric DEFAULT 0;


-- 3. Add unique constraint on user_id for upsert (Idempotent)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grade_verifications_user_id_unique') THEN
        ALTER TABLE grade_verifications ADD CONSTRAINT grade_verifications_user_id_unique UNIQUE (user_id);
    END IF;
END $$;

-- 4. Index for verification type
CREATE INDEX IF NOT EXISTS idx_grade_verifications_type ON grade_verifications(verification_type);
