-- ═══════════════════════════════════════════════════
-- VERIFICATION LOGS — Audit trail for all verification attempts
-- Run this in your Supabase SQL Editor
-- ═══════════════════════════════════════════════════

create table if not exists verification_logs (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    image_hash text not null,
    ip_address text default 'unknown',
    user_agent text default 'unknown',
    validation_status text not null check (validation_status in ('VALID', 'SUSPICIOUS', 'REJECTED')),
    confidence_score integer default 0 check (confidence_score >= 0 and confidence_score <= 100),
    fraud_flags jsonb default '[]'::jsonb,
    extracted_data jsonb default '{}'::jsonb,
    verification_source text default 'UNKNOWN',
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index for fast lookups
create index if not exists idx_verification_logs_user_id on verification_logs(user_id);
create index if not exists idx_verification_logs_image_hash on verification_logs(image_hash);
create index if not exists idx_verification_logs_ip on verification_logs(ip_address);
create index if not exists idx_verification_logs_created_at on verification_logs(created_at desc);

-- RLS: allow backend (service role) full access
alter table verification_logs enable row level security;

create policy "Service role full access"
    on verification_logs for all
    using (true)
    with check (true);
