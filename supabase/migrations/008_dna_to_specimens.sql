-- ============================================================
-- 008_dna_to_specimens.sql
-- DNA 분석 결과를 야장(sampling_event) 단위 → 시편(specimen) 단위로 이동.
--
-- 배경: 야장은 현장 채취 기록이라 그 자체에 "분석 결과"가 있을 수 없다.
-- 분석은 별도 단계에서 X(Extract) 시편을 만들어 수행한다. dna_results.specimen_id
-- 컬럼을 추가해 이 관계를 직접 표현한다.
--
-- 호환성: 기존 event_id 컬럼은 점진적 마이그레이션을 위해 그대로 두되, 새
-- 데이터는 specimen_id 필수로 둔다(RLS·앱 양쪽에서 강제).
--
-- 적용 순서: 001 → 002 → 003 → 004 → 005 → 006 → 007 → 008
-- ============================================================

-- ----- 컬럼 추가 -----
alter table dna_results
  add column if not exists specimen_id uuid references specimens(id) on delete cascade;
create index if not exists dna_results_specimen_idx on dna_results(specimen_id);

comment on column dna_results.event_id is 'DEPRECATED — 008 이후 specimen_id 를 사용. 베타 단계의 호환을 위해 nullable 로 유지.';
comment on column dna_results.specimen_id is '분석에 사용된 시편(specimens.id). 일반적으로 X(Extract) 시편.';

-- ----- 무결성: 둘 중 하나는 있어야 함 -----
do $$ begin
  alter table dna_results
    add constraint dna_results_has_link
    check (specimen_id is not null or event_id is not null);
exception when duplicate_object then null; end $$;

-- ----- RLS: specimen_id 기반으로 갱신 + 기존 event_id 만 있는 행도 호환 -----
drop policy if exists dna_results_read on dna_results;
create policy dna_results_read on dna_results
  for select using (
    is_admin()
    or (
      specimen_id is not null and exists (
        select 1 from specimens sp
        join sampling_events e on e.id = sp.root_event_id
        join trees t on t.id = e.tree_id
        join sites s on s.id = t.site_id
        where sp.id = dna_results.specimen_id
        and (
          e.surveyor_id = auth.uid()
          or is_surveyor_for(s.region_sigungu_code)
          or has_collab_access(s.id)
        )
      )
    )
    or (
      specimen_id is null and event_id is not null and exists (
        select 1 from sampling_events e
        join trees t on t.id = e.tree_id
        join sites s on s.id = t.site_id
        where e.id = dna_results.event_id
        and (
          e.surveyor_id = auth.uid()
          or is_surveyor_for(s.region_sigungu_code)
          or has_collab_access(s.id)
        )
      )
    )
  );

drop policy if exists dna_results_admin_lead_write on dna_results;
create policy dna_results_admin_lead_write on dna_results
  for all using (
    is_admin()
    or (
      specimen_id is not null and exists (
        select 1 from specimens sp
        join sampling_events e on e.id = sp.root_event_id
        join trees t on t.id = e.tree_id
        join sites s on s.id = t.site_id
        where sp.id = dna_results.specimen_id
        and is_lead_for(s.region_sigungu_code)
      )
    )
    or (
      specimen_id is null and event_id is not null and exists (
        select 1 from sampling_events e
        join trees t on t.id = e.tree_id
        join sites s on s.id = t.site_id
        where e.id = dna_results.event_id
        and is_lead_for(s.region_sigungu_code)
      )
    )
  ) with check (
    is_admin()
    or (
      specimen_id is not null and exists (
        select 1 from specimens sp
        join sampling_events e on e.id = sp.root_event_id
        join trees t on t.id = e.tree_id
        join sites s on s.id = t.site_id
        where sp.id = specimen_id
        and is_lead_for(s.region_sigungu_code)
      )
    )
    or (
      specimen_id is null and event_id is not null and exists (
        select 1 from sampling_events e
        join trees t on t.id = e.tree_id
        join sites s on s.id = t.site_id
        where e.id = event_id
        and is_lead_for(s.region_sigungu_code)
      )
    )
  );

-- ----- (선택) 기존 데이터의 자동 마이그레이션 안내 -----
-- 베타 단계라 기존 dna_results 가 적을 것이므로 자동 이전은 하지 않는다.
-- 운영 책임자가 필요하면 다음 패턴으로 수동 매핑할 수 있다:
--
--   1) X(Extract) 시편을 만든다:
--      select create_specimen(<event_id>, null, 'X', 'extract', 'DNA 추출');
--   2) dna_results 의 specimen_id 를 업데이트:
--      update dna_results set specimen_id = <new_specimen_id> where id = <dna_id>;
--
-- 그 후 향후 PR 에서 event_id 컬럼을 drop 할 예정.
