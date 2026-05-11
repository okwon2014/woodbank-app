-- ============================================================
-- 001_schema.sql
-- 목재 재감 구축 연구그룹 — 핵심 스키마
-- 적용 순서: 001 → 002 → 003 → 004 → 005
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ----- ENUMs -----
do $$ begin
  create type user_role as enum ('admin', 'lead', 'surveyor', 'collaborator', 'guest');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sync_status as enum ('draft', 'queued', 'synced', 'conflict');
exception when duplicate_object then null; end $$;

do $$ begin
  create type photo_category as enum ('tree_form', 'bark', 'branch', 'leaf_litter');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tree_status as enum ('active', 'lost', 'deceased');
exception when duplicate_object then null; end $$;

-- ----- 공통 함수: updated_at 자동 갱신 -----
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================
-- 마스터 테이블
-- ============================================================

create table if not exists species (
  code text primary key,             -- 예: 'ZSE' (Zelkova serrata)
  ko_name text not null,             -- 팽나무
  sci_name text,                     -- Celtis sinensis Pers.
  family text,                       -- Cannabaceae
  active boolean not null default true
);

create table if not exists regions (
  sido_code text not null,
  sigungu_code text not null,
  sido_name text not null,
  sigungu_name text not null,
  primary key (sido_code, sigungu_code)
);

-- 사용자 메타: auth.users 와 1:1
create table if not exists users_meta (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role user_role not null default 'guest',
  organization text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger users_meta_updated before update on users_meta for each row execute function set_updated_at();

-- 담당 지역 할당 (lead·surveyor 권한 범위)
create table if not exists user_region_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  sigungu_code text not null,         -- regions.sigungu_code 와 매칭
  role user_role not null,            -- 보통 'lead' 또는 'surveyor'
  assigned_at timestamptz not null default now(),
  primary key (user_id, sigungu_code, role)
);

-- ============================================================
-- 데이터 본체: Site → Tree → SamplingEvent → Photo
-- ============================================================

create table if not exists sites (
  id uuid primary key default gen_random_uuid(),
  code text not null,                            -- 2025_담양
  region_sido text,
  region_sigungu text,                           -- 담양군 (행정구역 한글명)
  region_sigungu_code text,                      -- 코드(외부 협력자 공유 단위)
  address_detail text,                           -- '대덕면 비차리 산209-1번지 일대'
  habitat_terrain text,                          -- 능선/계곡/평지 코드
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code)
);
create index if not exists sites_sigungu_idx on sites(region_sigungu_code);
create trigger sites_updated before update on sites for each row execute function set_updated_at();

create table if not exists trees (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  tree_local_no text not null,                   -- '01', '04-1'
  species_code text references species(code),
  lat double precision,
  lon double precision,
  lat_dms text,
  lon_dms text,
  elevation_m smallint,
  aspect_deg smallint check (aspect_deg between 0 and 359),
  tag_id text,
  status tree_status not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, tree_local_no)
);
create index if not exists trees_site_idx on trees(site_id);
create index if not exists trees_species_idx on trees(species_code);
create trigger trees_updated before update on trees for each row execute function set_updated_at();

create table if not exists sampling_events (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references trees(id) on delete cascade,
  sample_no text not null unique,                -- '2025_담양_01'
  sampled_at date not null,
  height_m numeric(5,1),
  dbh_cm numeric(5,1),
  dna_collected boolean not null default false,
  dna_sample_code text,
  notes text,
  surveyor_id uuid references auth.users(id) on delete set null,
  co_surveyors uuid[] not null default array[]::uuid[],
  device_recorded_at timestamptz,                -- 단말의 입력 시각
  sync_status sync_status not null default 'synced',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists se_tree_idx on sampling_events(tree_id);
create index if not exists se_surveyor_idx on sampling_events(surveyor_id);
create index if not exists se_sampled_at_idx on sampling_events(sampled_at);
create trigger se_updated before update on sampling_events for each row execute function set_updated_at();

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references sampling_events(id) on delete cascade,
  category photo_category not null,
  storage_path text not null,                    -- Storage 객체 키 (photos/<event>/<uuid>.jpg)
  original_filename text,
  width int,
  height int,
  bytes int,
  exif_taken_at timestamptz,
  exif_lat double precision,
  exif_lon double precision,
  sha256 text,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now()
);
create index if not exists photos_event_idx on photos(event_id);
create index if not exists photos_cat_idx on photos(category);
create unique index if not exists photos_sha_event on photos(event_id, sha256) where sha256 is not null;

-- 외부 협력자 공유 — 특정 Site 단위로 열람 허용
create table if not exists collaborator_shares (
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references sites(id) on delete cascade,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,                        -- null = 무기한 (권장하지 않음)
  primary key (user_id, site_id)
);

-- ============================================================
-- 감사 로그
-- ============================================================
create table if not exists audit_log (
  id bigserial primary key,
  table_name text not null,
  row_id text not null,                          -- uuid 또는 복합키 직렬화
  action text not null,                          -- INSERT / UPDATE / DELETE
  actor_id uuid,
  before jsonb,
  after jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists audit_table_idx on audit_log(table_name, occurred_at desc);
create index if not exists audit_actor_idx on audit_log(actor_id);
