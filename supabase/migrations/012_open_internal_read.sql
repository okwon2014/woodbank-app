-- ============================================================
-- 012_open_internal_read.sql
-- 내부 사용자(admin/lead/surveyor) 간 read 전면 개방
--
-- 배경: 기존 RLS 는 lead/surveyor 가 본인이 배정된 sigungu_code 의 데이터
-- 만 보도록 분할되어 있었다. 책임 소재·희귀종 좌표 보호 의도였지만, 같은
-- 연구 그룹 내부 사용자가 서로의 야장·시편·통계·라벨인쇄 작업을 못 보는
-- 부작용이 너무 컸다. 운영자 결정으로 「내부 사용자 = 데이터 모두 read 허용」
-- 으로 정책 변경.
--
-- 변경 원칙
--   read   : admin/lead/surveyor 는 전부 가능. collaborator/guest 는 기존 그대로.
--   insert : 변경 없음. 담당 시군구 surveyor 또는 admin 만.
--   update : 변경 없음. 본인 24h 내 또는 담당 시군구 lead 또는 admin.
--   delete : 변경 없음. admin 만.
--   admin  : users_meta / user_region_assignments / collaborator_shares /
--            audit_log 정책 모두 변경 없음 — 사용자 관리·감사는 admin 전용 유지.
--   외부   : collaborator 는 has_collab_access(site_id) 로 명시 공유받은
--            site 만 read (좌표 1km 마스킹 뷰 그대로). guest = 0건.
--
-- 적용 순서: 001 → ... → 011 → 012
-- ============================================================

-- ----- 헬퍼: 내부 사용자 판별 -----
create or replace function is_internal_user()
returns boolean
language sql
stable
set search_path = public
as $$
  select current_user_role() in ('admin', 'lead', 'surveyor');
$$;

-- ============================================================
-- sites — read 전면 개방
-- ============================================================
drop policy if exists sites_read on sites;
create policy sites_read on sites
  for select using (
    is_internal_user()
    or has_collab_access(id)
  );

-- ============================================================
-- trees — read 전면 개방
-- ============================================================
drop policy if exists trees_read on trees;
create policy trees_read on trees
  for select using (
    is_internal_user()
    or exists (
      select 1 from sites s
      where s.id = trees.site_id
      and has_collab_access(s.id)
    )
  );

-- ============================================================
-- sampling_events — read 전면 개방
-- ============================================================
drop policy if exists se_read on sampling_events;
create policy se_read on sampling_events
  for select using (
    is_internal_user()
    or exists (
      select 1 from trees t
      join sites s on s.id = t.site_id
      where t.id = sampling_events.tree_id
      and has_collab_access(s.id)
    )
  );

-- ============================================================
-- photos — read 전면 개방
-- ============================================================
drop policy if exists photos_read on photos;
create policy photos_read on photos
  for select using (
    is_internal_user()
    or exists (
      select 1 from sampling_events e
      join trees t on t.id = e.tree_id
      join sites s on s.id = t.site_id
      where e.id = photos.event_id
      and has_collab_access(s.id)
    )
  );

-- ============================================================
-- specimens — read 전면 개방 (007 의 정책 갱신)
-- ============================================================
drop policy if exists specimens_read on specimens;
create policy specimens_read on specimens
  for select using (
    is_internal_user()
    or exists (
      select 1 from sampling_events e
      join trees t on t.id = e.tree_id
      join sites s on s.id = t.site_id
      where e.id = specimens.root_event_id
      and has_collab_access(s.id)
    )
  );

-- ============================================================
-- dna_results — read 전면 개방 (006/008 의 정책 갱신)
-- ============================================================
drop policy if exists dna_results_read on dna_results;
create policy dna_results_read on dna_results
  for select using (
    is_internal_user()
    or (
      specimen_id is not null and exists (
        select 1 from specimens sp
        join sampling_events e on e.id = sp.root_event_id
        join trees t on t.id = e.tree_id
        join sites s on s.id = t.site_id
        where sp.id = dna_results.specimen_id
        and has_collab_access(s.id)
      )
    )
    or (
      specimen_id is null and event_id is not null and exists (
        select 1 from sampling_events e
        join trees t on t.id = e.tree_id
        join sites s on s.id = t.site_id
        where e.id = dna_results.event_id
        and has_collab_access(s.id)
      )
    )
  );

-- ============================================================
-- (변경 없음 — 명시 확인용 주석)
--   sites_insert / sites_update / sites_delete                  ← 그대로
--   trees_insert / trees_update / trees_delete                  ← 그대로
--   se_insert / se_update / se_delete                           ← 그대로
--   photos_insert / photos_delete                               ← 그대로
--   specimens 의 write 정책 (007 의 specimens_admin_lead_write)  ← 그대로
--   dna_results 의 write 정책                                    ← 그대로
--   users_meta · user_region_assignments · collaborator_shares  ← 그대로 (admin 전용)
--   audit_log_admin_read                                        ← 그대로 (admin 전용)
-- ============================================================

-- 적용 결과 확인용 NOTICE
do $$ begin
  raise notice '[012] is_internal_user() 도입 완료. admin/lead/surveyor 의 read 가 전면 개방되었습니다. write/admin 정책은 변경 없음.';
end $$;
