create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  repo_url text not null,
  detected_stack jsonb not null,
  generated_yaml text not null,
  created_at timestamptz not null default now()
);

create index if not exists analyses_repo_url_idx on analyses (repo_url);
create index if not exists analyses_created_at_idx on analyses (created_at desc);
