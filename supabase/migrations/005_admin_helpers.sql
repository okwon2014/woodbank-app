-- ============================================================
-- 005_admin_helpers.sql
-- 관리자 화면용 RPC + 사용자 가입 시 users_meta 자동 생성
-- ============================================================

-- 1) auth.users INSERT 시 users_meta 한 행 자동 생성 (기본 role='guest')
create or replace function on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users_meta (id, display_name, role, active)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), 'guest', true)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_trg on auth.users;
create trigger on_auth_user_created_trg
  after insert on auth.users
  for each row execute function on_auth_user_created();

-- 2) admin 전용 — users_meta + auth.users.email 조인 (anon으로는 못 조회)
create or replace function admin_users_with_email()
returns table(
  id uuid,
  email text,
  display_name text,
  role user_role,
  organization text,
  active boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if (select um.role from public.users_meta um where um.id = auth.uid()) <> 'admin' then
    raise exception 'forbidden';
  end if;

  return query
  select um.id, u.email::text, um.display_name, um.role, um.organization, um.active, um.updated_at
  from public.users_meta um
  join auth.users u on u.id = um.id
  order by um.updated_at desc;
end $$;

revoke all on function admin_users_with_email() from public, anon;
grant execute on function admin_users_with_email() to authenticated;

-- 3) admin 전용 — 역할 변경 헬퍼
create or replace function admin_set_user_role(p_user uuid, p_role user_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select um.role from users_meta um where um.id = auth.uid()) <> 'admin' then
    raise exception 'forbidden';
  end if;
  update users_meta set role = p_role where id = p_user;
end $$;

revoke all on function admin_set_user_role(uuid, user_role) from public, anon;
grant execute on function admin_set_user_role(uuid, user_role) to authenticated;

-- 4) admin 전용 — 지역 할당
create or replace function admin_set_user_region(p_user uuid, p_sigungu_code text, p_role user_role, p_attach boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select um.role from users_meta um where um.id = auth.uid()) <> 'admin' then
    raise exception 'forbidden';
  end if;
  if p_attach then
    insert into user_region_assignments(user_id, sigungu_code, role)
    values (p_user, p_sigungu_code, p_role)
    on conflict (user_id, sigungu_code, role) do nothing;
  else
    delete from user_region_assignments
    where user_id = p_user and sigungu_code = p_sigungu_code and role = p_role;
  end if;
end $$;

revoke all on function admin_set_user_region(uuid, text, user_role, boolean) from public, anon;
grant execute on function admin_set_user_region(uuid, text, user_role, boolean) to authenticated;

-- 5) admin 전용 — active toggle
create or replace function admin_set_user_active(p_user uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select um.role from users_meta um where um.id = auth.uid()) <> 'admin' then
    raise exception 'forbidden';
  end if;
  update users_meta set active = p_active where id = p_user;
end $$;

revoke all on function admin_set_user_active(uuid, boolean) from public, anon;
grant execute on function admin_set_user_active(uuid, boolean) to authenticated;
