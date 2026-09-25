-- Life Journal cloud schema. Safe to rerun; user data is not deleted.

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  entry_date date not null default current_date,
  category text not null default 'Reflection',
  title text not null,
  body text not null,
  tags text[] not null default '{}',
  win text,
  lesson text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists journal_entries_owner_date_idx
  on public.journal_entries (user_id, entry_date desc, created_at desc);

create table if not exists public.journal_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  note text not null default '',
  progress smallint not null default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, title)
);

create index if not exists journal_goals_owner_idx
  on public.journal_goals (user_id, created_at);

create table if not exists public.journal_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  section text not null check (section in ('built', 'learned', 'gap')),
  title text not null,
  body text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, section, title)
);

create index if not exists journal_insights_owner_section_idx
  on public.journal_insights (user_id, section, position);

alter table public.journal_entries enable row level security;
alter table public.journal_goals enable row level security;
alter table public.journal_insights enable row level security;

revoke all on table public.journal_entries from public, anon;
revoke all on table public.journal_goals from public, anon;
revoke all on table public.journal_insights from public, anon;
grant select, insert, update, delete on table public.journal_entries to authenticated;
grant select, insert, update, delete on table public.journal_goals to authenticated;
grant select, insert, update, delete on table public.journal_insights to authenticated;

drop policy if exists "Users read only their own entries" on public.journal_entries;
drop policy if exists "Users create only their own entries" on public.journal_entries;
drop policy if exists "Users update only their own entries" on public.journal_entries;
drop policy if exists "Users delete only their own entries" on public.journal_entries;
create policy "Users read only their own entries"
  on public.journal_entries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create only their own entries"
  on public.journal_entries for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update only their own entries"
  on public.journal_entries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete only their own entries"
  on public.journal_entries for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read only their own goals" on public.journal_goals;
drop policy if exists "Users create only their own goals" on public.journal_goals;
drop policy if exists "Users update only their own goals" on public.journal_goals;
drop policy if exists "Users delete only their own goals" on public.journal_goals;
create policy "Users read only their own goals"
  on public.journal_goals for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create only their own goals"
  on public.journal_goals for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update only their own goals"
  on public.journal_goals for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete only their own goals"
  on public.journal_goals for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read only their own insights" on public.journal_insights;
drop policy if exists "Users create only their own insights" on public.journal_insights;
drop policy if exists "Users update only their own insights" on public.journal_insights;
drop policy if exists "Users delete only their own insights" on public.journal_insights;
create policy "Users read only their own insights"
  on public.journal_insights for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create only their own insights"
  on public.journal_insights for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update only their own insights"
  on public.journal_insights for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete only their own insights"
  on public.journal_insights for delete to authenticated
  using ((select auth.uid()) = user_id);

