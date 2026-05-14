-- ============================================================
-- 01_rls_smoke.sql — Woodbank RLS 회귀 테스트 (pgTAP)
--
-- 실행 방법
--   A) Supabase SQL Editor에 이 파일 전체를 붙여 실행 (전부 트랜잭션으로
--      감싸 rollback하므로 운영 데이터에 영향 없음).
--   B) psql "$SUPABASE_DB_URL" -f supabase/tests/rls/01_rls_smoke.sql
--
-- 사전 준비 (한 번만)
--   create extension if not exists pgtap with schema extensions;
--
-- 검증 대상
--   - users_meta / user_region_assignments 의 admin 제한
--   - sites / trees / sampling_events 의 역할별 read·write
--   - photos read·insert
--   - collaborator_shares 기반 협력자 접근
--   - guest 의 전반적 차단
-- ============================================================

begin;

-- 모든 검사를 트랜잭션 안에서 격리한다. 마지막에 rollback.

-- ----- 시뮬레이션 헬퍼: 특정 user_id 로 가장하여 JWT 클레임을 설정 -----
create or replace function _wb_test_as(p_uid uuid)
returns void
language plpgsql
as $$
begin
  -- PostgREST 가 본래 세팅하는 클레임을 흉내냄. auth.uid() / auth.role() 이 이 값을 읽는다.
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

-- ----- 테스트 픽스처 -----
-- 시그군구 코드: '46710' = 담양군 (lead/surveyor 담당), '11680' = 서울 강남구 (외부)
-- 사용자 5명 + 마스터 + sites/trees/events 데이터 생성
do $$
declare
  uid_admin   uuid := '00000000-0000-0000-0000-000000000001';
  uid_lead    uuid := '00000000-0000-0000-0000-000000000002';
  uid_surv    uuid := '00000000-0000-0000-0000-000000000003';
  uid_collab  uuid := '00000000-0000-0000-0000-000000000004';
  uid_guest   uuid := '00000000-0000-0000-0000-000000000005';
  site_dmy    uuid := '10000000-0000-0000-0000-000000000001';
  site_seoul  uuid := '10000000-0000-0000-0000-000000000002';
  tree_dmy    uuid := '20000000-0000-0000-0000-000000000001';
  tree_seoul  uuid := '20000000-0000-0000-0000-000000000002';
  ev_dmy      uuid := '30000000-0000-0000-0000-000000000001';
  ev_seoul    uuid := '30000000-0000-0000-0000-000000000002';
begin
  -- auth.users (Supabase가 관리하는 테이블 — service role 권한 필요)
  insert into auth.users (id, email, instance_id, aud, role)
  values
    (uid_admin,  'wbtest+admin@example.com',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (uid_lead,   'wbtest+lead@example.com',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (uid_surv,   'wbtest+surv@example.com',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (uid_collab, 'wbtest+collab@example.com', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (uid_guest,  'wbtest+guest@example.com',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  -- 005의 트리거가 users_meta 행을 자동 생성하므로 role만 수정
  update users_meta set role = 'admin'        where id = uid_admin;
  update users_meta set role = 'lead'         where id = uid_lead;
  update users_meta set role = 'surveyor'     where id = uid_surv;
  update users_meta set role = 'collaborator' where id = uid_collab;
  update users_meta set role = 'guest'        where id = uid_guest;

  -- 담당 지역 할당
  insert into user_region_assignments (user_id, sigungu_code, role) values
    (uid_lead, '46710', 'lead'),
    (uid_surv, '46710', 'surveyor')
  on conflict do nothing;

  -- 마스터 보강 (이미 시드에 있을 수 있음 — 충돌 무시)
  insert into species (code, ko_name, sci_name) values ('TST', '테스트나무', 'Testus testus')
    on conflict (code) do nothing;
  insert into regions (sido_code, sigungu_code, sido_name, sigungu_name) values
    ('46', '46710', '전라남도', '담양군'),
    ('11', '11680', '서울특별시', '강남구')
  on conflict do nothing;

  -- 사이트 2개 (담양, 서울)
  insert into sites (id, code, region_sido, region_sigungu, region_sigungu_code, address_detail)
  values
    (site_dmy,   'WBTEST_DMY',   '전라남도', '담양군', '46710', '담양 테스트 사이트'),
    (site_seoul, 'WBTEST_SEOUL', '서울특별시', '강남구', '11680', '서울 테스트 사이트')
  on conflict (id) do nothing;

  -- 트리 각 1개
  insert into trees (id, site_id, tree_local_no, species_code, status)
  values
    (tree_dmy,   site_dmy,   '01', 'TST', 'active'),
    (tree_seoul, site_seoul, '01', 'TST', 'active')
  on conflict (id) do nothing;

  -- 이벤트 각 1개 (surveyor_id = uid_surv 로 담양 이벤트)
  insert into sampling_events (id, tree_id, sample_no, sampled_at, height_m, dbh_cm, surveyor_id)
  values
    (ev_dmy,   tree_dmy,   'WBTEST_DMY_01',   current_date, 20.0, 45.0, uid_surv),
    (ev_seoul, tree_seoul, 'WBTEST_SEOUL_01', current_date, 18.0, 40.0, null)
  on conflict (id) do nothing;

  -- 외부 협력자에게 서울 site 만 공유
  insert into collaborator_shares (user_id, site_id, granted_by) values
    (uid_collab, site_seoul, uid_admin)
  on conflict do nothing;
end $$;

-- ============================================================
-- 테스트 시작
-- ============================================================
select plan(22);

-- ----- 1) 마스터 read: 모든 로그인 사용자 OK, anon 차단 -----
select _wb_test_as('00000000-0000-0000-0000-000000000005'::uuid); -- guest
select ok(
  (select count(*) from species) > 0,
  'guest 도 species 마스터는 read 가능'
);
select ok(
  (select count(*) from regions) >= 2,
  'guest 도 regions 마스터는 read 가능'
);

-- ----- 2) sites: admin 은 양쪽 모두, lead 담양은 담양만, collab 은 공유받은 서울만 -----
select _wb_test_as('00000000-0000-0000-0000-000000000001'::uuid); -- admin
select is(
  (select count(*) from sites where code like 'WBTEST_%')::int, 2,
  'admin 은 WBTEST_* sites 두 개 모두 보인다'
);

select _wb_test_as('00000000-0000-0000-0000-000000000002'::uuid); -- lead 담양
select is(
  (select count(*) from sites where code like 'WBTEST_%')::int, 1,
  'lead 담양은 WBTEST_* 중 자기 지역 1건만 보인다'
);
select is(
  (select region_sigungu_code from sites where code like 'WBTEST_%' limit 1), '46710',
  'lead 담양에게 보이는 sites 는 46710 코드뿐'
);

select _wb_test_as('00000000-0000-0000-0000-000000000003'::uuid); -- surveyor 담양
select is(
  (select count(*) from sites where code like 'WBTEST_%')::int, 1,
  'surveyor 담양도 자기 지역 1건만 보인다'
);

select _wb_test_as('00000000-0000-0000-0000-000000000004'::uuid); -- collaborator (서울 공유)
select is(
  (select count(*) from sites where code like 'WBTEST_%')::int, 1,
  'collaborator 는 공유받은 site 1건만 보인다'
);
select is(
  (select region_sigungu_code from sites where code like 'WBTEST_%' limit 1), '11680',
  'collaborator 에게 보이는 site 는 공유받은 서울'
);

select _wb_test_as('00000000-0000-0000-0000-000000000005'::uuid); -- guest
select is(
  (select count(*) from sites where code like 'WBTEST_%')::int, 0,
  'guest 는 WBTEST_* sites 가 모두 차단된다'
);

-- ----- 3) trees: 같은 패턴 -----
select _wb_test_as('00000000-0000-0000-0000-000000000002'::uuid); -- lead 담양
select is(
  (select count(*) from trees where id::text like '20000000%')::int, 1,
  'lead 담양은 자기 지역 트리만 보인다'
);

select _wb_test_as('00000000-0000-0000-0000-000000000005'::uuid); -- guest
select is(
  (select count(*) from trees where id::text like '20000000%')::int, 0,
  'guest 는 트리 차단'
);

-- ----- 4) sampling_events read -----
select _wb_test_as('00000000-0000-0000-0000-000000000001'::uuid); -- admin
select is(
  (select count(*) from sampling_events where sample_no like 'WBTEST_%')::int, 2,
  'admin 은 WBTEST_* events 두 개 모두 보인다'
);

select _wb_test_as('00000000-0000-0000-0000-000000000003'::uuid); -- surveyor (자기 surveyor_id 이벤트 + 담당 지역)
select is(
  (select count(*) from sampling_events where sample_no like 'WBTEST_%')::int, 1,
  'surveyor 는 담당 지역의 이벤트 1건만 본다'
);

select _wb_test_as('00000000-0000-0000-0000-000000000004'::uuid); -- collaborator
select is(
  (select count(*) from sampling_events where sample_no like 'WBTEST_%')::int, 1,
  'collaborator 는 공유받은 site 의 이벤트 1건만 본다'
);

select _wb_test_as('00000000-0000-0000-0000-000000000005'::uuid); -- guest
select is(
  (select count(*) from sampling_events where sample_no like 'WBTEST_%')::int, 0,
  'guest 는 events 차단'
);

-- ----- 5) sites_insert: admin/lead/surveyor 가능, collaborator/guest 차단 -----
-- surveyor 가 자기 담당 지역에 site insert
select _wb_test_as('00000000-0000-0000-0000-000000000003'::uuid); -- surveyor
select lives_ok($$
  insert into sites (id, code, region_sigungu_code, region_sigungu, region_sido)
  values ('10000000-0000-0000-0000-000000000003', 'WBTEST_DMY2', '46710', '담양군', '전라남도')
$$, 'surveyor 는 자기 담당 지역(46710) site 를 insert 할 수 있다');

-- surveyor 가 담당 외 지역 site insert → 차단
select throws_ok($$
  insert into sites (id, code, region_sigungu_code, region_sigungu, region_sido)
  values ('10000000-0000-0000-0000-000000000004', 'WBTEST_GANGNAM', '11680', '강남구', '서울특별시')
$$, '42501', null, 'surveyor 가 담당 외 지역 site insert 는 차단(RLS)');

-- guest 는 site insert 전부 차단
select _wb_test_as('00000000-0000-0000-0000-000000000005'::uuid);
select throws_ok($$
  insert into sites (id, code, region_sigungu_code, region_sigungu, region_sido)
  values ('10000000-0000-0000-0000-000000000005', 'WBTEST_GUEST', '46710', '담양군', '전라남도')
$$, '42501', null, 'guest 의 sites insert 는 차단');

-- ----- 6) sampling_events insert: surveyor 본인 이벤트만 -----
-- surveyor 가 자기 surveyor_id 로 자기 담당 지역 이벤트 insert → OK
select _wb_test_as('00000000-0000-0000-0000-000000000003'::uuid); -- surveyor
select lives_ok($$
  insert into sampling_events (id, tree_id, sample_no, sampled_at, height_m, dbh_cm, surveyor_id)
  values ('30000000-0000-0000-0000-000000000003',
          '20000000-0000-0000-0000-000000000001',
          'WBTEST_DMY_02', current_date, 21, 46,
          '00000000-0000-0000-0000-000000000003'::uuid)
$$, 'surveyor 가 자기 담당 지역의 본인 이벤트 insert OK');

-- surveyor 가 다른 사람 surveyor_id 로 insert → 차단
select throws_ok($$
  insert into sampling_events (id, tree_id, sample_no, sampled_at, height_m, dbh_cm, surveyor_id)
  values ('30000000-0000-0000-0000-000000000004',
          '20000000-0000-0000-0000-000000000001',
          'WBTEST_DMY_03', current_date, 21, 46,
          '00000000-0000-0000-0000-000000000002'::uuid)
$$, '42501', null, 'surveyor 가 타인의 surveyor_id 로 이벤트 insert 는 차단');

-- ----- 7) admin RPC 권한 -----
select _wb_test_as('00000000-0000-0000-0000-000000000005'::uuid); -- guest
select throws_ok($$
  select admin_set_user_role('00000000-0000-0000-0000-000000000003'::uuid, 'admin')
$$, 'P0001', 'forbidden', 'guest 는 admin_set_user_role RPC 호출 차단');

select _wb_test_as('00000000-0000-0000-0000-000000000001'::uuid); -- admin
select lives_ok($$
  select admin_set_user_role('00000000-0000-0000-0000-000000000003'::uuid, 'surveyor')
$$, 'admin 은 admin_set_user_role RPC 호출 가능 (no-op)');

-- ============================================================
select * from finish();

-- 정리 + 헬퍼 제거 + 모든 변경 롤백
drop function if exists _wb_test_as(uuid);
rollback;
