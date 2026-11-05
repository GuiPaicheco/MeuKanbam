-- Execute only in a dedicated MeuKanbam project.
begin;
create schema if not exists kanbam_private;
revoke all on schema kanbam_private from public, anon, authenticated;
create table public.kanbam_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null,
 created_at timestamptz not null default now()
);
alter table public.kanbam_members enable row level security;
revoke all on public.kanbam_members from public,anon,authenticated;
grant select on public.kanbam_members to authenticated;
create policy member_self on public.kanbam_members for select to authenticated using (user_id=(select auth.uid()));
create table public.kanbam_tasks (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 1 and 300),
 description text not null default '' check(length(description)<=20000),
 status text not null default 'todo' check(status in ('doing','todo','paused','questions','routine','done')),
 priority text not null default 'P3' check(priority in ('P1','P2','P3','P4','permanent')),
 progress int not null default 0 check(progress between 0 and 100),
 due_date date,
 assignee text not null default '',
 tags jsonb not null default '[]' check(jsonb_typeof(tags)='array'),
 subtasks jsonb not null default '[]' check(jsonb_typeof(subtasks)='array'),
 dependencies jsonb not null default '[]' check(jsonb_typeof(dependencies)='array'),
 links jsonb not null default '[]' check(jsonb_typeof(links)='array'),
 comments jsonb not null default '[]' check(jsonb_typeof(comments)='array'),
 recurrence text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.kanbam_events (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(trim(title)) between 1 and 300),
 start_date date,
 end_date date,
 kind text not null default 'event' check(kind in ('event','absence')),
 description text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(end_date>=start_date)
);
create table public.kanbam_activity (
 id uuid primary key default gen_random_uuid(),
 entity_id uuid not null,
 entity_type text not null,
 action text not null,
 actor_id uuid references auth.users(id) on delete set null,
 title text not null,
 created_at timestamptz not null default now()
);
-- Only select your own membership. No browser can add or authorize members.
do $$declare t text; begin
 foreach t in array array['kanbam_tasks','kanbam_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('create policy members_select on public.%I for select to authenticated using (exists(select 1 from public.kanbam_members where user_id=(select auth.uid())))',t);
  execute format('create policy members_insert on public.%I for insert to authenticated with check (exists(select 1 from public.kanbam_members where user_id=(select auth.uid())))',t);
  execute format('create policy members_update on public.%I for update to authenticated using (exists(select 1 from public.kanbam_members where user_id=(select auth.uid()))) with check (exists(select 1 from public.kanbam_members where user_id=(select auth.uid())))',t);
  execute format('create policy members_delete on public.%I for delete to authenticated using (exists(select 1 from public.kanbam_members where user_id=(select auth.uid())))',t);
 end loop;
end $$;
alter table public.kanbam_activity enable row level security;
revoke all on public.kanbam_activity from public,anon,authenticated;
grant select on public.kanbam_activity to authenticated;
create policy members_activity on public.kanbam_activity for select to authenticated using(exists(select 1 from public.kanbam_members where user_id=(select auth.uid())));
create function kanbam_private.touch() returns trigger language plpgsql security invoker set search_path='' as $$begin new.updated_at=clock_timestamp(); return new; end$$;
-- Definer is scoped to audit insertion only. Not callable by clients.
create function kanbam_private.audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
  insert into public.kanbam_activity(entity_id,entity_type,action,actor_id,title) values(old.id,TG_TABLE_NAME,TG_OP,auth.uid(),old.title);
  return old;
 end if;
 insert into public.kanbam_activity(entity_id,entity_type,action,actor_id,title) values(new.id,TG_TABLE_NAME,TG_OP,auth.uid(),new.title);
 return new;
end$$;
revoke all on function kanbam_private.audit() from public,anon,authenticated;
revoke all on function kanbam_private.touch() from public,anon,authenticated;
create trigger task_touch before update on public.kanbam_tasks for each row execute function kanbam_private.touch();
create trigger event_touch before update on public.kanbam_events for each row execute function kanbam_private.touch();
create trigger task_audit after insert or update or delete on public.kanbam_tasks for each row execute function kanbam_private.audit();
create trigger event_audit after insert or update or delete on public.kanbam_events for each row execute function kanbam_private.audit();
create index kanbam_tasks_due on public.kanbam_tasks(due_date);
create index kanbam_activity_created on public.kanbam_activity(created_at desc);
commit;
