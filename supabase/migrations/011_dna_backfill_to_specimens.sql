-- ============================================================
-- 011_dna_backfill_to_specimens.sql
-- 야장의 dna_collected boolean → N(DNA) 시편으로 일회성 backfill
--
-- 배경: PR #20 이후 시편 종류에 N(DNA)/A(DART)/I(NIR) 가 추가됐지만,
-- 그 이전에 등록된 야장의 DNA 채취 기록은 sampling_events.dna_collected
-- boolean 에만 저장되어 있고 specimens 테이블에는 들어 있지 않았다. 그
-- 결과 야장 목록의 「시편 종류 = N · DNA 시료」 필터가 0건으로 보였다.
--
-- 이 마이그레이션은 dna_collected=true 인 모든 야장에 대해 1차 시편으로
-- N 시편을 한 건씩 생성한다. 이후 신규 야장 흐름과 데이터 모델이 일관됨.
--
-- 멱등성: 이미 같은 야장에 root-level N 시편이 달려 있으면 건너뛴다.
-- 여러 번 실행해도 중복 생성되지 않음.
--
-- 라벨 보존: 야장의 dna_sample_code 값은 외부 식별자로 specimens.external_id /
-- external_namespace='dna_sample_code' 에 옮긴다. storage_location 은 비워둠
-- (실제 물리 보관 위치는 운영자가 추후 채울 영역).
--
-- 적용 순서: 001 → ... → 010 → 011
-- ============================================================

insert into specimens (
  human_code, parent_id, root_event_id, specimen_type, type_code, seq_no,
  description, storage_location,
  external_id, external_namespace,
  status, created_by, created_at, updated_at
)
select
  e.sample_no || '.N01'                                   as human_code,
  null::uuid                                              as parent_id,
  e.id                                                    as root_event_id,
  'dna'                                                   as specimen_type,
  'N'                                                     as type_code,
  1                                                       as seq_no,
  '현장 채취 DNA 시료 (dna_collected=true 자동 backfill)' as description,
  null                                                    as storage_location,
  nullif(trim(coalesce(e.dna_sample_code, '')), '')       as external_id,
  case when nullif(trim(coalesce(e.dna_sample_code, '')), '') is not null
       then 'dna_sample_code' else null end               as external_namespace,
  'active'                                                as status,
  e.surveyor_id                                           as created_by,
  e.created_at                                            as created_at,
  now()                                                   as updated_at
from sampling_events e
where e.dna_collected = true
  and not exists (
    select 1 from specimens s
    where s.root_event_id = e.id
      and s.type_code = 'N'
      and s.parent_id is null
  );

-- 결과 요약 — SQL Editor 의 NOTICES 패널에서 확인 가능.
do $$
declare
  v_new_n     int;
  v_total_n   int;
  v_dna_evts  int;
begin
  select count(*) into v_total_n  from specimens where type_code = 'N';
  select count(*) into v_dna_evts from sampling_events where dna_collected = true;
  v_new_n := v_total_n; -- 정확한 신규 건수는 별도로 트래킹 안 함 (멱등이라 두 번째부터는 0)
  raise notice '[011] DNA 채취 야장 % 건, N(DNA) 시편 누적 % 건', v_dna_evts, v_total_n;
end $$;
