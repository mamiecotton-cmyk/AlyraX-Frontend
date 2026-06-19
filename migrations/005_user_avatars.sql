create table if not exists public.user_avatars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  params jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists user_avatars_user_idx on public.user_avatars (user_id);
create unique index if not exists user_avatars_one_active
  on public.user_avatars (user_id) where is_active;

alter table public.user_avatars enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_avatars'
      and policyname = 'user_avatars_select_own'
  ) then
    create policy user_avatars_select_own
      on public.user_avatars
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_avatars'
      and policyname = 'user_avatars_insert_own'
  ) then
    create policy user_avatars_insert_own
      on public.user_avatars
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_avatars'
      and policyname = 'user_avatars_update_own'
  ) then
    create policy user_avatars_update_own
      on public.user_avatars
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
