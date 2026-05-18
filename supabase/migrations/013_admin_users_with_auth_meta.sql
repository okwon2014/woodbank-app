-- ============================================================
-- 013_admin_users_with_auth_meta.sql
-- admin_users_with_email() RPC 확장 — auth.users 의 last_sign_in_at,
-- email_confirmed_at, created_at(가입 시각) 까지 함께 반환.
--
-- 배경: admin/users 페이지의 「최근」 컬럼이 실제로는 users_meta.updated_at
-- (메타 정보 수정 시각) 이라 「최근 접속」 의미로는 misleading 했음. Supabase
-- auth 가 auth.users.last_sign_in_at 을 자동 갱신하므로 그 값을 노출.
--
-- 호환성: 기존 RPC 와 동일한 이름. 반환 컬럼만 4개 추가. 호출 측이 새 필드를
-- 사용하지 않더라도 깨지지 않음. 다만 PostgreSQL 은 return type 변경이
-- create or replace 로 안 되므로 drop + create 패턴.
--
-- 적용 순서: 001 → ... → 012 → 013
-- ============================================================

-- 기존 함수 drop
drop function if exists public.admin_users_with_email();

-- 확장된 시그니처로 재생성
create or replace function public.admin_users_with_email()
returns table(
  id uuid,
  email text,
  display_name text,
  role user_role,
  organization text,
  active boolean,
  updated_at timestamptz,
  -- 신규 ▼
  last_sign_in_at timestamptz,     -- auth.users.last_sign_in_at — 마지막 로그인 시각 (히스토리는 보존 안 됨)
  email_confirmed_at timestamptz,  -- 이메일 확인 시각 (NULL 이면 미확인)
  auth_created_at timestamptz      -- auth.users.created_at — 가입 시각 (users_meta 와 다를 수 있음)
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
  select
    um.id,
    u.email::text,
    um.display_name,
    um.role,
    um.organization,
    um.active,
    um.updated_at,
    u.last_sign_in_at,
    u.email_confirmed_at,
    u.created_at as auth_created_at
  from public.users_meta um
  join auth.users u on u.id = um.id
  -- 최근 접속순으로 정렬 — NULL(한 번도 안 들어온 사용자)은 맨 뒤
  order by u.last_sign_in_at desc nulls last;
end $$;

revoke all on function public.admin_users_with_email() from public, anon;
grant execute on function public.admin_users_with_email() to authenticated;

do $$ begin
  raise notice '[013] admin_users_with_email() 가 last_sign_in_at/email_confirmed_at/auth_created_at 까지 반환합니다.';
end $$;
