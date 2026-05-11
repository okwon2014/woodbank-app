-- ============================================================
-- 002_rls.sql
-- 행 수준 보안 정책 (Admin / Lead / Surveyor / Collaborator / Guest)
-- ============================================================

-- ----- 헬퍼: 호출자의 role 가져오기 -----
create or replace function current_user_role()
returns user_role
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select role from users_meta where id = auth.uid()),
    'guest'::user_role
  );
$$;

create or replace function is_admin()
returns boolean language sql stable as $$
  select current_user_role() = 'admin';
$$;

create or replace function is_lead_for(p_sigungu_code text)
returns boolean language sql stable as $$
  select exists (
    select 1 from user_region_assignments
    where user_id = auth.uid()
      and sigungu_code = p_sigungu_code
      and role in ('lead', 'admin')
  );
$$;

create or replace function is_surveyor_for(p_sigungu_code text)
returns boolean language sql stable as $$
  select exists (
    select 1 from user_region_assignments
    where user_id = auth.uid()
      and sigungu_code = p_sigungu_code
      and role in ('lead', 'admin', 'surveyor')
  );
$$;

create or replace function has_collab_access(p_site_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from collaborator_shares cs
    where cs.user_id = auth.uid()
      and cs.site_id = p_site_id
      and (cs.expires_at is null or cs.expires_at > now())
  );
$$;

-- ============================================================
-- RLS 활성화
-- ============================================================
alter table species enable row level security;
alter table regions enable row level security;
alter table users_meta enable row level security;
alter table user_region_assignments enable row level security;
alter table sites enable row level security;
alter table trees enable row level security;
alter table sampling_events enable row level security;
alter table photos enable row level security;
alter table collaborator_shares enable row level security;
alter table audit_log enable row level security;

-- ============================================================
-- 마스터 (species, regions): 모든 로그인 사용자 read, admin만 write
-- ============================================================
create policy species_read on species for select using (auth.uid() is not null);
create policy species_admin_write on species for all using (is_admin()) with check (is_admin());

create policy regions_read on regions for select using (auth.uid() is not null);
create policy regions_admin_write on regions for all using (is_admin()) with check (is_admin());

-- ============================================================
-- users_meta
-- 본인은 read, admin은 모두 read/write
-- ============================================================
create policy users_meta_self_read on users_meta
  for select using (id = auth.uid() or is_admin());

create policy users_meta_admin_write on users_meta
  for all using (is_admin()) with check (is_admin());

create policy users_meta_self_insert on users_meta
  for insert with check (id = auth.uid());  -- 회원가입 직후 본인 메타 1행 생성용

-- ============================================================
-- user_region_assignments: admin만 관리, 본인은 자기 할당 read
-- ============================================================
create policy ura_self_read on user_region_assignments
  for select using (user_id = auth.uid() or is_admin());

create policy ura_admin_write on user_region_assignments
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- sites
-- read:  admin / 담당지역의 lead·surveyor / 공유받은 collaborator
-- write: admin / 담당지역의 lead. surveyor는 INSERT만(자기 담당)
-- ============================================================
create policy sites_read on sites
  for select using (
    is_admin()
    or is_surveyor_for(region_sigungu_code)
    or has_collab_access(id)
  );

create policy sites_insert on sites
  for insert with check (
    is_admin()
    or is_surveyor_for(region_sigungu_code)
  );

create policy sites_update on sites
  for update using (
    is_admin() or is_lead_for(region_sigungu_code)
  ) with check (
    is_admin() or is_lead_for(region_sigungu_code)
  );

create policy sites_delete on sites
  for delete using (is_admin());

-- ============================================================
-- trees
-- ============================================================
create policy trees_read on trees
  for select using (
    is_admin()
    or exists (
      select 1 from sites s where s.id = trees.site_id
      and (is_surveyor_for(s.region_sigungu_code) or has_collab_access(s.id))
    )
  );

create policy trees_insert on trees
  for insert with check (
    is_admin()
    or exists (
      select 1 from sites s where s.id = site_id
      and is_surveyor_for(s.region_sigungu_code)
    )
  );

create policy trees_update on trees
  for update using (
    is_admin()
    or exists (
      select 1 from sites s where s.id = trees.site_id
      and is_lead_for(s.region_sigungu_code)
    )
    or (created_by = auth.uid() and updated_at > now() - interval '24 hours')
  ) with check (
    is_admin()
    or exists (
      select 1 from sites s where s.id = site_id
      and is_lead_for(s.region_sigungu_code)
    )
    or created_by = auth.uid()
  );

create policy trees_delete on trees for delete using (is_admin());

-- ============================================================
-- sampling_events
-- read:  admin / lead·surveyor of region / surveyor of own / collaborator (share)
-- write: surveyor 본인이 자기 이벤트 INSERT, UPDATE는 본인+24h 또는 lead
-- ============================================================
create policy se_read on sampling_events
  for select using (
    is_admin()
    or surveyor_id = auth.uid()
    or exists (
      select 1 from trees t join sites s on s.id = t.site_id
      where t.id = sampling_events.tree_id
      and (is_surveyor_for(s.region_sigungu_code) or has_collab_access(s.id))
    )
  );

create policy se_insert on sampling_events
  for insert with check (
    is_admin()
    or (
      surveyor_id = auth.uid()
      and exists (
        select 1 from trees t join sites s on s.id = t.site_id
        where t.id = tree_id and is_surveyor_for(s.region_sigungu_code)
      )
    )
  );

create policy se_update on sampling_events
  for update using (
    is_admin()
    or (surveyor_id = auth.uid() and updated_at > now() - interval '24 hours')
    or exists (
      select 1 from trees t join sites s on s.id = t.site_id
      where t.id = sampling_events.tree_id and is_lead_for(s.region_sigungu_code)
    )
  ) with check (
    is_admin()
    or surveyor_id = auth.uid()
    or exists (
      select 1 from trees t join sites s on s.id = t.site_id
      where t.id = tree_id and is_lead_for(s.region_sigungu_code)
    )
  );

create policy se_delete on sampling_events for delete using (is_admin());

-- ============================================================
-- photos
-- ============================================================
create policy photos_read on photos
  for select using (
    is_admin()
    or exists (
      select 1 from sampling_events e
      join trees t on t.id = e.tree_id
      join sites s on s.id = t.site_id
      where e.id = photos.event_id
      and (
        e.surveyor_id = auth.uid()
        or is_surveyor_for(s.region_sigungu_code)
        or has_collab_access(s.id)
      )
    )
  );

create policy photos_insert on photos
  for insert with check (
    is_admin()
    or exists (
      select 1 from sampling_events e
      where e.id = event_id
      and (e.surveyor_id = auth.uid() or current_user_role() in ('lead','admin'))
    )
  );

create policy photos_delete on photos
  for delete using (
    is_admin() or uploaded_by = auth.uid()
  );

-- ============================================================
-- collaborator_shares: admin만 관리, 본인은 자기 공유 read
-- ============================================================
create policy cs_self_read on collaborator_shares
  for select using (user_id = auth.uid() or is_admin());

create policy cs_admin_write on collaborator_shares
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- audit_log: admin만 read, write는 트리거(security definer)로
-- ============================================================
create policy audit_admin_read on audit_log for select using (is_admin());

-- ============================================================
-- 외부 협력자용 마스킹 뷰 (좌표 1km 단위 흐림)
-- ============================================================
create or replace view collaborator_event_summary
with (security_invoker = true) as
select
  e.id,
  e.sample_no,
  e.sampled_at,
  t.species_code,
  e.height_m,
  e.dbh_cm,
  round(t.lat::numeric, 2) as lat_approx,
  round(t.lon::numeric, 2) as lon_approx,
  s.region_sido,
  s.region_sigungu
from sampling_events e
join trees t on t.id = e.tree_id
join sites s on s.id = t.site_id;
