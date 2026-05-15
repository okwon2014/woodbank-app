-- ============================================================
-- 007_specimens.sql
-- 시편(specimen) 추적성 — sampling_event 를 뿌리로 한 다단계 계층
-- 적용 순서: 001 → 002 → 003 → 004 → 005 → 006 → 007
-- ============================================================
--
-- 모델
--   야장 sampling_event 가 root. 거기서 만들어지는 모든 물리적 시편을
--   specimens 한 테이블로 모은다. parent_id 로 임의 깊이 계층(디스크 →
--   블록 → 슬라이드 → 해리 섬유 …)을 지원한다.
--
-- 식별자
--   human_code: 사람이 읽기 좋은 코드. 부모 코드에 점·종류·순번을
--               덧붙인다(예: "2025_담양_04.D01.B03.L02").
--   id        : 내부 UUID. URL·DB 외래키용.
--
-- 권한 (RLS)
--   read  : 같은 야장이 보이는 사용자(surveyor/lead/admin/collaborator)
--   write : admin 또는 해당 사이트 지역의 lead 만 (사용자 정책)
--
-- 동시성
--   같은 부모 안에서 동일 type_code 의 seq_no 가 겹치지 않도록
--   unique 인덱스(specimens_sibling_uq) 로 보장. 동시 insert 시 한쪽이
--   23505 로 실패하면 클라이언트가 재시도하면 된다.

-- ----- 테이블 -----
create table if not exists specimens (
  id uuid primary key default gen_random_uuid(),
  human_code text not null,
  parent_id uuid references specimens(id) on delete cascade,
  root_event_id uuid not null references sampling_events(id) on delete cascade,
  specimen_type text not null,                 -- 'disc' | 'core' | 'block' | 'slide' | 'tree_ring' | 'fiber' | 'extract' | 'residue' | 'other'
  type_code text not null,                     -- 'D' | 'C' | 'B' | 'L' | 'T' | 'F' | 'X' | 'R'
  seq_no int not null check (seq_no > 0),
  description text,
  storage_location text,                       -- 보관 위치 (자유 텍스트, 예: "냉장고-2, 박스 A, 칸 03")
  status text not null default 'active'        -- 'active' | 'consumed' | 'lost' | 'destroyed'
    check (status in ('active', 'consumed', 'lost', 'destroyed')),
  -- 향후 IGSN/ARK/DOI 등 외부 표준 식별자 매핑용. 베타에선 사용 안 함.
  external_id text,
  external_namespace text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint specimens_human_code_uq unique (human_code)
);
create index if not exists specimens_root_idx on specimens(root_event_id);
create index if not exists specimens_parent_idx on specimens(parent_id);
create index if not exists specimens_type_idx on specimens(type_code);

-- 형제 unique — coalesce 로 parent_id null(=root 직계)을 root_event_id 로 대체
create unique index if not exists specimens_sibling_uq
  on specimens (
    coalesce(parent_id::text, root_event_id::text),
    type_code,
    seq_no
  );

drop trigger if exists specimens_updated on specimens;
create trigger specimens_updated before update on specimens
  for each row execute function set_updated_at();

-- 감사 로그 (003 의 audit_trigger 재활용)
drop trigger if exists audit_specimens on specimens;
create trigger audit_specimens after insert or update or delete on specimens
  for each row execute function audit_trigger();

-- ----- RLS -----
alter table specimens enable row level security;

-- read: sampling_events 가시성 규칙과 동일
drop policy if exists specimens_read on specimens;
create policy specimens_read on specimens
  for select using (
    is_admin()
    or exists (
      select 1 from sampling_events e
      join trees t on t.id = e.tree_id
      join sites s on s.id = t.site_id
      where e.id = specimens.root_event_id
      and (
        e.surveyor_id = auth.uid()
        or is_surveyor_for(s.region_sigungu_code)
        or has_collab_access(s.id)
      )
    )
  );

-- write: admin 또는 root_event 의 site 지역 lead
drop policy if exists specimens_admin_lead_write on specimens;
create policy specimens_admin_lead_write on specimens
  for all using (
    is_admin()
    or exists (
      select 1 from sampling_events e
      join trees t on t.id = e.tree_id
      join sites s on s.id = t.site_id
      where e.id = specimens.root_event_id
      and is_lead_for(s.region_sigungu_code)
    )
  ) with check (
    is_admin()
    or exists (
      select 1 from sampling_events e
      join trees t on t.id = e.tree_id
      join sites s on s.id = t.site_id
      where e.id = root_event_id
      and is_lead_for(s.region_sigungu_code)
    )
  );

-- ============================================================
-- RPC: create_specimen
-- 부모(또는 root) 안에서 type_code 의 다음 seq_no 를 계산하고 human_code
-- 를 자동 생성한 뒤 specimens 에 insert. 트랜잭션 안에서 한 번에 끝나
-- 동시성 문제(중간 race)는 specimens_sibling_uq 가 잡는다.
-- ============================================================
create or replace function create_specimen(
  p_root_event_id uuid,
  p_parent_id uuid,
  p_type_code text,
  p_specimen_type text,
  p_description text default null,
  p_storage_location text default null
) returns specimens
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent specimens;
  v_root_event sampling_events;
  v_parent_code text;
  v_next_seq int;
  v_human_code text;
  v_result specimens;
begin
  -- 1) 쓰기 권한 확인
  if not exists (
    select 1 from sampling_events e
    join trees t on t.id = e.tree_id
    join sites s on s.id = t.site_id
    where e.id = p_root_event_id
    and (is_admin() or is_lead_for(s.region_sigungu_code))
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- 2) 야장 존재 확인
  select * into v_root_event from sampling_events where id = p_root_event_id;
  if not found then raise exception 'sampling_event not found'; end if;

  -- 3) 부모 코드 결정
  if p_parent_id is not null then
    select * into v_parent from specimens where id = p_parent_id;
    if not found then raise exception 'parent specimen not found'; end if;
    if v_parent.root_event_id <> p_root_event_id then
      raise exception 'parent belongs to a different root_event';
    end if;
    v_parent_code := v_parent.human_code;
  else
    v_parent_code := v_root_event.sample_no;
  end if;

  -- 4) 같은 형제(같은 parent + 같은 type_code) 내 다음 seq 계산
  select coalesce(max(seq_no), 0) + 1 into v_next_seq
  from specimens
  where ((p_parent_id is null and parent_id is null)
      or (parent_id = p_parent_id))
    and root_event_id = p_root_event_id
    and type_code = p_type_code;

  -- 5) human_code 조합 (2자리 zero-padded, 100건 넘으면 자연수)
  v_human_code := v_parent_code || '.' || p_type_code ||
    case when v_next_seq < 100 then lpad(v_next_seq::text, 2, '0')
         else v_next_seq::text end;

  -- 6) insert
  insert into specimens (
    human_code, parent_id, root_event_id, specimen_type, type_code, seq_no,
    description, storage_location, status, created_by
  ) values (
    v_human_code, p_parent_id, p_root_event_id, p_specimen_type, p_type_code, v_next_seq,
    p_description, p_storage_location, 'active', auth.uid()
  )
  returning * into v_result;

  return v_result;
end $$;

revoke all on function create_specimen(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function create_specimen(uuid, uuid, text, text, text, text) to authenticated;
