-- Run as postgres in the dedicated MeuKanbam SQL editor, AFTER schema.sql.
-- All fixtures and helper functions are rolled back. Any assertion failure aborts.
begin;
create temporary table kanbam_security_test_init (id int) on commit drop;
create function pg_temp.assert_denied(statement text) returns void
language plpgsql security invoker as $$
begin
 begin
  execute statement;
 exception when insufficient_privilege then return;
 end;
 raise exception 'SECURITY FAILURE: operation unexpectedly allowed: %', statement;
end $$;
create function pg_temp.assert_zero(statement text) returns void
language plpgsql security invoker as $$
declare n bigint;
begin
 execute statement into n;
 if n <> 0 then raise exception 'SECURITY FAILURE: expected zero, got %: %',n,statement; end if;
end $$;
do $$ begin execute format('grant usage on schema %I to anon,authenticated',(select nspname from pg_namespace where oid=pg_my_temp_schema())); end $$;
grant execute on function pg_temp.assert_denied(text),pg_temp.assert_zero(text) to anon,authenticated;
-- Minimal disposable Auth records. No passwords or credentials are generated.
insert into auth.users(id,aud,role,email) values
 ('d58796f2-feb4-4b8a-a4be-10d201a11111','authenticated','authenticated','kanbam-security-member@example.invalid'),
 ('d58796f2-feb4-4b8a-a4be-10d201a22222','authenticated','authenticated','kanbam-security-outsider@example.invalid');
insert into public.kanbam_members(user_id,display_name) values('d58796f2-feb4-4b8a-a4be-10d201a11111','Disposable member');
insert into public.kanbam_tasks(id,title) values('d58796f2-feb4-4b8a-a4be-10d201a33333','Security fixture');
insert into public.kanbam_events(id,title) values('d58796f2-feb4-4b8a-a4be-10d201a44444','Security fixture event');
set local role anon;
select pg_temp.assert_denied('select * from public.kanbam_tasks');
select pg_temp.assert_denied('select * from public.kanbam_events');
select pg_temp.assert_denied('select * from public.kanbam_activity');
select pg_temp.assert_denied('select * from public.kanbam_members');
select pg_temp.assert_denied($q$insert into public.kanbam_tasks(title) values('Anon injection')$q$);
select pg_temp.assert_denied($q$update public.kanbam_tasks set title='Anon injection'$q$);
select pg_temp.assert_denied('delete from public.kanbam_tasks');
select pg_temp.assert_denied($q$insert into public.kanbam_events(title) values('Anon injection')$q$);
select pg_temp.assert_denied($q$update public.kanbam_events set title='Anon injection'$q$);
select pg_temp.assert_denied('delete from public.kanbam_events');
reset role;
select set_config('request.jwt.claim.sub','d58796f2-feb4-4b8a-a4be-10d201a22222',true);
select set_config('request.jwt.claims','{"sub":"d58796f2-feb4-4b8a-a4be-10d201a22222","role":"authenticated","user_metadata":{"admin":true}}',true);
set local role authenticated;
select pg_temp.assert_zero('select count(*) from public.kanbam_tasks');
select pg_temp.assert_zero('select count(*) from public.kanbam_events');
select pg_temp.assert_zero('select count(*) from public.kanbam_activity');
select pg_temp.assert_zero('select count(*) from public.kanbam_members');
select pg_temp.assert_denied($q$insert into public.kanbam_members(user_id,display_name) values('d58796f2-feb4-4b8a-a4be-10d201a22222','Self enrollment')$q$);
select pg_temp.assert_denied($q$insert into public.kanbam_tasks(title) values('Outsider injection')$q$);
select pg_temp.assert_denied($q$insert into public.kanbam_events(title) values('Outsider injection')$q$);
select pg_temp.assert_zero($q$with changed as (update public.kanbam_tasks set title='Outsider injection' returning id) select count(*) from changed$q$);
select pg_temp.assert_zero('with changed as (delete from public.kanbam_tasks returning id) select count(*) from changed');
select pg_temp.assert_zero($q$with changed as (update public.kanbam_events set title='Outsider injection' returning id) select count(*) from changed$q$);
select pg_temp.assert_zero('with changed as (delete from public.kanbam_events returning id) select count(*) from changed');
reset role;
select set_config('request.jwt.claim.sub','d58796f2-feb4-4b8a-a4be-10d201a11111',true);
select set_config('request.jwt.claims','{"sub":"d58796f2-feb4-4b8a-a4be-10d201a11111","role":"authenticated"}',true);
set local role authenticated;
do $$begin
 if not exists(select 1 from public.kanbam_tasks where id='d58796f2-feb4-4b8a-a4be-10d201a33333') then raise exception 'Member cannot read task'; end if;
 if not exists(select 1 from public.kanbam_events where id='d58796f2-feb4-4b8a-a4be-10d201a44444') then raise exception 'Member cannot read event'; end if;
 if (select count(*) from public.kanbam_members)<>1 then raise exception 'Member membership visibility wrong'; end if;
end $$;
insert into public.kanbam_tasks(id,title) values('d58796f2-feb4-4b8a-a4be-10d201a55555','Member create');
update public.kanbam_tasks set title='Member update',progress=45 where id='d58796f2-feb4-4b8a-a4be-10d201a55555';
do $$begin
 if not exists(select 1 from public.kanbam_tasks where id='d58796f2-feb4-4b8a-a4be-10d201a55555' and progress=45 and title='Member update') then raise exception 'Member update failed'; end if;
end $$;
delete from public.kanbam_tasks where id='d58796f2-feb4-4b8a-a4be-10d201a55555';
insert into public.kanbam_events(id,title) values('d58796f2-feb4-4b8a-a4be-10d201a66666','Member event create');
update public.kanbam_events set title='Member event update' where id='d58796f2-feb4-4b8a-a4be-10d201a66666';
do $$begin
 if not exists(select 1 from public.kanbam_events where id='d58796f2-feb4-4b8a-a4be-10d201a66666' and title='Member event update') then raise exception 'Member event update failed'; end if;
end $$;
delete from public.kanbam_events where id='d58796f2-feb4-4b8a-a4be-10d201a66666';
select pg_temp.assert_zero($q$select count(*) from public.kanbam_tasks where id='d58796f2-feb4-4b8a-a4be-10d201a55555'$q$);
select pg_temp.assert_zero($q$select count(*) from public.kanbam_events where id='d58796f2-feb4-4b8a-a4be-10d201a66666'$q$);
do $$begin
 if (select count(*) from public.kanbam_activity where entity_id='d58796f2-feb4-4b8a-a4be-10d201a55555' and actor_id='d58796f2-feb4-4b8a-a4be-10d201a11111')<>3 then raise exception 'Audit does not record task CRUD'; end if;
 if (select count(*) from public.kanbam_activity where entity_id='d58796f2-feb4-4b8a-a4be-10d201a66666' and actor_id='d58796f2-feb4-4b8a-a4be-10d201a11111')<>3 then raise exception 'Audit does not record event CRUD'; end if;
end $$;
select pg_temp.assert_denied($q$insert into public.kanbam_members(user_id,display_name) values('d58796f2-feb4-4b8a-a4be-10d201a22222','Member escalation')$q$);
select pg_temp.assert_denied($q$update public.kanbam_members set display_name='Tamper'$q$);
select pg_temp.assert_denied('delete from public.kanbam_members');
select pg_temp.assert_denied($q$insert into public.kanbam_activity(entity_id,entity_type,action,title) values(gen_random_uuid(),'fake','fake','fake')$q$);
select pg_temp.assert_denied($q$update public.kanbam_activity set title='Tamper'$q$);
select pg_temp.assert_denied('delete from public.kanbam_activity');
select pg_temp.assert_denied('select kanbam_private.audit()');
reset role;
-- Removing membership must work immediately without waiting for a new JWT.
delete from public.kanbam_members where user_id='d58796f2-feb4-4b8a-a4be-10d201a11111';
set local role authenticated;
select pg_temp.assert_zero('select count(*) from public.kanbam_tasks');
select pg_temp.assert_zero('select count(*) from public.kanbam_events');
select pg_temp.assert_zero('select count(*) from public.kanbam_activity');
select pg_temp.assert_denied($q$insert into public.kanbam_tasks(title) values('Removed member')$q$);
select pg_temp.assert_denied($q$insert into public.kanbam_events(title) values('Removed member')$q$);
select pg_temp.assert_zero($q$with changed as (update public.kanbam_tasks set title='Removed member' returning id) select count(*) from changed$q$);
select pg_temp.assert_zero('with changed as (delete from public.kanbam_tasks returning id) select count(*) from changed');
select pg_temp.assert_zero($q$with changed as (update public.kanbam_events set title='Removed member' returning id) select count(*) from changed$q$);
select pg_temp.assert_zero('with changed as (delete from public.kanbam_events returning id) select count(*) from changed');
reset role;
rollback;
-- Success: every assertion completed and all temporary records were rolled back.
