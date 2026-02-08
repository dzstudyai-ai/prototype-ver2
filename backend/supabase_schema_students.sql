-- Create table for allowed students
create table if not exists students_list (
  id bigint primary key generated always as identity,
  matricule text unique not null,
  nom_fr text,
  nom_ar text,
  prenom_fr text,
  prenom_ar text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table students_list enable row level security;

-- Create policy to allow read access for backend (service role) or authenticated users if needed
create policy "Allow public read access"
  on students_list for select
  using (true);
