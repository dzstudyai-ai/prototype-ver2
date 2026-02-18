-- ═══════════════════════════════════════════════════
-- GRADE VERIFICATION SCHEMA
-- Tables for verification codes & grade verification results
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════

-- 1. Verification Codes — time-limited codes shown to students
CREATE TABLE IF NOT EXISTS verification_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    code text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_user ON verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_code ON verification_codes(code);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires ON verification_codes(expires_at);

-- RLS
ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on codes" ON verification_codes FOR ALL USING (true) WITH CHECK (true);

-- 2. Grade Verifications — full verification results
CREATE TABLE IF NOT EXISTS grade_verifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    code_id uuid REFERENCES verification_codes(id) ON DELETE SET NULL,
    image_hash text NOT NULL,
    trust_score integer DEFAULT 0 CHECK (trust_score >= 0 AND trust_score <= 100),
    status text NOT NULL CHECK (status IN ('VERIFIED', 'PENDING', 'REJECTED')),
    tampering_probability integer DEFAULT 0 CHECK (tampering_probability >= 0 AND tampering_probability <= 100),
    extracted_grades jsonb DEFAULT '{}'::jsonb,
    issues_detected jsonb DEFAULT '[]'::jsonb,
    score_breakdown jsonb DEFAULT '{}'::jsonb,
    ip_address text DEFAULT 'unknown',
    user_agent text DEFAULT 'unknown',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_grade_verifications_user ON grade_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_grade_verifications_status ON grade_verifications(status);
CREATE INDEX IF NOT EXISTS idx_grade_verifications_hash ON grade_verifications(image_hash);
CREATE INDEX IF NOT EXISTS idx_grade_verifications_created ON grade_verifications(created_at DESC);

-- RLS
ALTER TABLE grade_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on verifications" ON grade_verifications FOR ALL USING (true) WITH CHECK (true);

