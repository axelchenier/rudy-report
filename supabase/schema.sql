-- The Rudy Report cloud sync. Run once: Supabase > SQL Editor > New query > paste > Run.
create table if not exists public.user_data (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  saved      jsonb,
  myboard    jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_data enable row level security;
drop policy if exists "read own" on public.user_data;
drop policy if exists "insert own" on public.user_data;
drop policy if exists "update own" on public.user_data;
create policy "read own"   on public.user_data for select to authenticated using (auth.uid() = user_id);
create policy "insert own" on public.user_data for insert to authenticated with check (auth.uid() = user_id);
create policy "update own" on public.user_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.user_data to authenticated;
notify pgrst, 'reload schema';
