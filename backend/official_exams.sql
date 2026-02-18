-- Table for official exam results (uploaded by admin)
create table if not exists exam_results (
  id bigint primary key generated always as identity,
  matricule text not null,
  module text not null,
  semestre text not null,
  note numeric(4,2), -- Supports 10.00, 20.00
  absent boolean default false,
  observation text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  
  -- Prevent duplicate entries for same student/module/semestre
  unique (matricule, module, semestre)
);

-- Enable RLS
alter table exam_results enable row level security;

-- Policy: Public read access (for students checking their grades)
-- In a real app, this should be restricted to the authenticated user's matricule
create policy "Allow public read access"
  on exam_results for select
  using (true);

-- Policy: Service role full access (for import script)
create policy "Service role full access"
  on exam_results for all
  using (true)
  with check (true);
