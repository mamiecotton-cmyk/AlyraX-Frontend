-- Companion long-memory support.
-- The companion_facts table is created separately; this makes the existing
-- table safe for user-scoped reads/writes and efficient archetype lookups.

create unique index if not exists companion_facts_user_archetype_unique
  on public.companion_facts (user_id, archetype_id)
  where archetype_id is not null;

alter table public.companion_facts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'companion_facts'
      and policyname = 'companion_facts_select_own'
  ) then
    create policy companion_facts_select_own
      on public.companion_facts
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'companion_facts'
      and policyname = 'companion_facts_insert_own'
  ) then
    create policy companion_facts_insert_own
      on public.companion_facts
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'companion_facts'
      and policyname = 'companion_facts_update_own'
  ) then
    create policy companion_facts_update_own
      on public.companion_facts
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
