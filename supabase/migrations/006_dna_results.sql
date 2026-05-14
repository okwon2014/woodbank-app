-- ============================================================
-- 006_dna_results.sql
-- DNA 분석 결과 테이블 + Storage 버킷 + RLS
-- 적용 순서: 001 → 002 → 003 → 004 → 005 → 006
-- ============================================================

-- ----- 테이블 -----
create table if not exists dna_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references sampling_events(id) on delete cascade,
  analysis_type text,                       -- 'ITS', 'rbcL', 'trnL', 'matK' 등
  identification_result text,               -- 'Quercus variabilis 99.5%' 등
  similarity_score numeric(5,2),            -- 0.00 ~ 100.00
  analyst text,                             -- 분석 책임자 이름/기관
  analyzed_at date,
  file_storage_path text,                   -- dna 버킷 내 객체 경로
  file_original_name text,
  file_bytes int,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists dna_results_event_idx on dna_results(event_id);
create index if not exists dna_results_analyzed_at_idx on dna_results(analyzed_at);

drop trigger if exists dna_results_updated on dna_results;
create trigger dna_results_updated before update on dna_results for each row execute function set_updated_at();

-- 감사 로그 트리거 (003 의 audit_trigger 재활용)
drop trigger if exists audit_dna_results on dna_results;
create trigger audit_dna_results after insert or update or delete on dna_results
  for each row execute function audit_trigger();

-- ----- RLS -----
alter table dna_results enable row level security;

-- read: sampling_events 와 동일한 가시성 규칙
drop policy if exists dna_results_read on dna_results;
create policy dna_results_read on dna_results
  for select using (
    is_admin()
    or exists (
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
  );

-- write: admin / 담당 지역의 lead 만 (분석 결과는 데이터 신뢰성을 위해 좁힘)
drop policy if exists dna_results_admin_lead_write on dna_results;
create policy dna_results_admin_lead_write on dna_results
  for all using (
    is_admin()
    or exists (
      select 1 from sampling_events e
      join trees t on t.id = e.tree_id
      join sites s on s.id = t.site_id
      where e.id = dna_results.event_id
      and is_lead_for(s.region_sigungu_code)
    )
  ) with check (
    is_admin()
    or exists (
      select 1 from sampling_events e
      join trees t on t.id = e.tree_id
      join sites s on s.id = t.site_id
      where e.id = event_id
      and is_lead_for(s.region_sigungu_code)
    )
  );

-- ----- Storage 버킷: dna -----
insert into storage.buckets (id, name, public)
values ('dna', 'dna', false)
on conflict (id) do nothing;

drop policy if exists "dna read for authed" on storage.objects;
create policy "dna read for authed"
  on storage.objects for select
  using (bucket_id = 'dna' and auth.role() = 'authenticated');

drop policy if exists "dna insert for authed" on storage.objects;
create policy "dna insert for authed"
  on storage.objects for insert
  with check (bucket_id = 'dna' and auth.role() = 'authenticated');

drop policy if exists "dna update for owner or admin" on storage.objects;
create policy "dna update for owner or admin"
  on storage.objects for update
  using (bucket_id = 'dna' and (owner = auth.uid() or is_admin()));

drop policy if exists "dna delete for owner or admin" on storage.objects;
create policy "dna delete for owner or admin"
  on storage.objects for delete
  using (bucket_id = 'dna' and (owner = auth.uid() or is_admin()));
