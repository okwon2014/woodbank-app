-- ============================================================
-- 003_storage_and_triggers.sql
-- Storage 버킷·정책 + 감사 로그 트리거
-- ============================================================

-- ----- Storage 버킷 -----
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- Storage 정책: 객체 경로 첫 세그먼트가 'events/<event_id>/...' 형태라고 가정.
-- 보다 정밀한 제어는 photos 테이블의 RLS에 의존하고, Storage는 인증 사용자에게 열어둔다.
-- (사진 URL은 짧은 만료 서명 URL로만 발급한다)

create policy "photos read for authed"
  on storage.objects for select
  using (
    bucket_id = 'photos' and auth.role() = 'authenticated'
  );

create policy "photos insert for authed"
  on storage.objects for insert
  with check (
    bucket_id = 'photos' and auth.role() = 'authenticated'
  );

create policy "photos update for owner or admin"
  on storage.objects for update
  using (
    bucket_id = 'photos' and (
      owner = auth.uid() or is_admin()
    )
  );

create policy "photos delete for owner or admin"
  on storage.objects for delete
  using (
    bucket_id = 'photos' and (
      owner = auth.uid() or is_admin()
    )
  );

-- ============================================================
-- 감사 로그 트리거
-- ============================================================
create or replace function audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if (TG_OP = 'INSERT') then
    insert into audit_log(table_name, row_id, action, actor_id, after)
    values (TG_TABLE_NAME, (to_jsonb(NEW)->>'id'), 'INSERT', v_actor, to_jsonb(NEW));
    return NEW;
  elsif (TG_OP = 'UPDATE') then
    insert into audit_log(table_name, row_id, action, actor_id, before, after)
    values (TG_TABLE_NAME, (to_jsonb(NEW)->>'id'), 'UPDATE', v_actor, to_jsonb(OLD), to_jsonb(NEW));
    return NEW;
  elsif (TG_OP = 'DELETE') then
    insert into audit_log(table_name, row_id, action, actor_id, before)
    values (TG_TABLE_NAME, (to_jsonb(OLD)->>'id'), 'DELETE', v_actor, to_jsonb(OLD));
    return OLD;
  end if;
  return null;
end $$;

-- 대상 테이블 (마스터·users_meta 제외)
do $$
declare t text;
begin
  for t in select unnest(array['sites','trees','sampling_events','photos','collaborator_shares'])
  loop
    execute format('drop trigger if exists audit_%I on %I', t, t);
    execute format('create trigger audit_%I after insert or update or delete on %I
                    for each row execute function audit_trigger()', t, t);
  end loop;
end $$;
