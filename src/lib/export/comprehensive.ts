// 종합 Excel 내보내기용 데이터 페처.
// RLS 가 호출자 권한 범위로 자동 필터하므로 surveyor 도 본인이 볼 수 있는
// 데이터만 받게 된다. admin 은 전체, lead/surveyor 는 PR #32 이후 내부
// read 전면 개방으로 마찬가지로 모든 야장 보임.

import { getSupabaseServer } from "@/lib/supabase/server";
import { getCurrentUserAndRole } from "@/lib/auth/role";
import type { ExportFilter } from "./fetch";

// 행 상한 — 베타 규모 가정. 더 큰 데이터셋은 필터 적용 권장.
const LIMITS = {
  events: 5000,
  specimens: 20000,
  photos: 20000,
  dnaResults: 5000,
  sites: 5000,
  trees: 10000,
} as const;

export interface CompEvent {
  id: string;
  sample_no: string;
  sampled_at: string;
  height_m: number | null;
  dbh_cm: number | null;
  dna_collected: boolean;
  dna_sample_code: string | null;
  notes: string | null;
  device_recorded_at: string | null;
  sync_status: string;
  created_at: string;
  updated_at: string;
  surveyor_id: string | null;
  surveyor_name: string | null;
  surveyor_email: string | null;
  surveyor_role: string | null;
  // tree
  tree_id: string;
  tree_local_no: string;
  species_code: string | null;
  species_ko: string | null;
  species_sci: string | null;
  lat: number | null;
  lon: number | null;
  lat_dms: string | null;
  lon_dms: string | null;
  elevation_m: number | null;
  aspect_deg: number | null;
  // site
  site_id: string;
  site_code: string;
  region_sido: string | null;
  region_sigungu: string | null;
  region_sigungu_code: string | null;
  address_detail: string | null;
  habitat_terrain: string | null;
}

export interface CompSpecimen {
  id: string;
  human_code: string;
  parent_human_code: string | null;
  root_event_id: string;
  root_event_sample_no: string;
  species_ko: string | null;
  species_code: string | null;
  type_code: string;
  specimen_type: string;
  seq_no: number;
  description: string | null;
  storage_location: string | null;
  status: string;
  external_id: string | null;
  external_namespace: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompPhoto {
  id: string;
  event_sample_no: string;
  category: string;
  storage_path: string;
  original_filename: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  sha256: string | null;
  exif_taken_at: string | null;
  exif_lat: number | null;
  exif_lon: number | null;
  uploaded_by_name: string | null;
  uploaded_at: string;
}

export interface CompDnaResult {
  id: string;
  specimen_human_code: string | null;
  event_sample_no: string | null;
  analysis_type: string | null;
  identification_result: string | null;
  similarity_score: number | null;
  analyst: string | null;
  analyzed_at: string | null;
  file_original_name: string | null;
  file_bytes: number | null;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface CompSite {
  id: string;
  code: string;
  region_sido: string | null;
  region_sigungu: string | null;
  region_sigungu_code: string | null;
  address_detail: string | null;
  habitat_terrain: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompTree {
  id: string;
  site_code: string;
  tree_local_no: string;
  species_code: string | null;
  species_ko: string | null;
  lat: number | null;
  lon: number | null;
  lat_dms: string | null;
  lon_dms: string | null;
  elevation_m: number | null;
  aspect_deg: number | null;
  tag_id: string | null;
  status: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComprehensiveBundle {
  events: CompEvent[];
  specimens: CompSpecimen[];
  photos: CompPhoto[];
  dnaResults: CompDnaResult[];
  sites: CompSite[];
  trees: CompTree[];
  meta: {
    generatedAtIso: string;
    generatedByName: string | null;
    generatedByRole: string;
    filterApplied: ExportFilter;
    limits: typeof LIMITS;
    truncated: Partial<Record<keyof typeof LIMITS, boolean>>;
  };
}

export async function fetchComprehensive(filter: ExportFilter): Promise<ComprehensiveBundle> {
  const sb = await getSupabaseServer();
  const { displayName, role } = await getCurrentUserAndRole();

  // 1) 야장 조회 — 필터 적용
  let eventQ = sb
    .from("sampling_events")
    .select(
      `
      id, sample_no, sampled_at, height_m, dbh_cm, dna_collected, dna_sample_code,
      notes, surveyor_id, device_recorded_at, sync_status, created_at, updated_at,
      tree:trees!inner(
        id, tree_local_no, species_code, lat, lon, lat_dms, lon_dms, elevation_m, aspect_deg,
        species:species(code, ko_name, sci_name),
        site:sites!inner(id, code, region_sido, region_sigungu, region_sigungu_code, address_detail, habitat_terrain)
      )
    `,
    )
    .order("sampled_at", { ascending: false })
    .limit(LIMITS.events);

  if (filter.species) eventQ = eventQ.eq("tree.species_code", filter.species);
  if (filter.sigungu) eventQ = eventQ.eq("tree.site.region_sigungu_code", filter.sigungu);
  if (filter.from) eventQ = eventQ.gte("sampled_at", filter.from);
  if (filter.to) eventQ = eventQ.lte("sampled_at", filter.to);
  if (filter.q) eventQ = eventQ.or(`sample_no.ilike.%${filter.q}%,notes.ilike.%${filter.q}%`);

  const { data: eventRows, error: evErr } = await eventQ;
  if (evErr) throw evErr;
  const eventIds = (eventRows ?? []).map((e: any) => e.id);

  // 2) 자식 리소스 + 사용자 메타 병렬 조회
  //    필터링은 야장 ID 기준으로 좁힘.
  const [
    { data: specimenRows },
    { data: photoRows },
    { data: dnaRows },
    { data: siteRows },
    { data: treeRows },
  ] = await Promise.all([
    eventIds.length > 0
      ? sb
          .from("specimens")
          .select(
            `
            id, human_code, root_event_id, parent_id, specimen_type, type_code, seq_no,
            description, storage_location, status, external_id, external_namespace,
            created_by, created_at, updated_at,
            parent:specimens!parent_id(human_code),
            root_event:sampling_events!root_event_id(
              sample_no,
              tree:trees!inner(
                species_code,
                species:species(ko_name)
              )
            )
          `,
          )
          .in("root_event_id", eventIds)
          .order("human_code", { ascending: true })
          .limit(LIMITS.specimens)
      : Promise.resolve({ data: [] as any[] }),
    eventIds.length > 0
      ? sb
          .from("photos")
          .select(
            `
            id, event_id, category, storage_path, original_filename, width, height, bytes,
            sha256, exif_taken_at, exif_lat, exif_lon, uploaded_by, uploaded_at,
            event:sampling_events!event_id(sample_no)
          `,
          )
          .in("event_id", eventIds)
          .order("uploaded_at", { ascending: false })
          .limit(LIMITS.photos)
      : Promise.resolve({ data: [] as any[] }),
    eventIds.length > 0
      ? sb
          .from("dna_results")
          .select(
            `
            id, specimen_id, event_id, analysis_type, identification_result, similarity_score,
            analyst, analyzed_at, file_original_name, file_bytes, notes, created_by, created_at,
            specimen:specimens!inner(human_code, root_event_id),
            event:sampling_events(sample_no)
          `,
          )
          // 008 이후로는 specimen_id 기반이 표준. inner join 으로 specimen 이 있는 결과만
          // 가져온 뒤 specimen.root_event_id 로 필터. 매우 옛 데이터(event_id 만 있고
          // specimen_id NULL) 는 누락될 수 있으나 베타 마이그레이션 이후엔 거의 없음.
          .in("specimen.root_event_id", eventIds)
          .order("analyzed_at", { ascending: false, nullsFirst: false })
          .limit(LIMITS.dnaResults)
      : Promise.resolve({ data: [] as any[] }),
    sb
      .from("sites")
      .select(
        `
        id, code, region_sido, region_sigungu, region_sigungu_code, address_detail, habitat_terrain,
        created_by, created_at, updated_at
      `,
      )
      .order("code", { ascending: true })
      .limit(LIMITS.sites),
    sb
      .from("trees")
      .select(
        `
        id, site_id, tree_local_no, species_code, lat, lon, lat_dms, lon_dms,
        elevation_m, aspect_deg, tag_id, status, created_by, created_at, updated_at,
        species:species(ko_name),
        site:sites(code)
      `,
      )
      .order("tree_local_no", { ascending: true })
      .limit(LIMITS.trees),
  ]);

  // 3) 사용자 메타 일괄 해석 (surveyor_id, created_by, uploaded_by)
  const userIds = new Set<string>();
  (eventRows ?? []).forEach((e: any) => e.surveyor_id && userIds.add(e.surveyor_id));
  (specimenRows ?? []).forEach((s: any) => s.created_by && userIds.add(s.created_by));
  (photoRows ?? []).forEach((p: any) => p.uploaded_by && userIds.add(p.uploaded_by));
  (dnaRows ?? []).forEach((d: any) => d.created_by && userIds.add(d.created_by));
  (siteRows ?? []).forEach((s: any) => s.created_by && userIds.add(s.created_by));
  (treeRows ?? []).forEach((t: any) => t.created_by && userIds.add(t.created_by));

  const userMap = new Map<string, { name: string | null; email: string | null; role: string | null }>();
  if (userIds.size > 0) {
    const { data: metas } = await sb
      .from("users_meta")
      .select("id, display_name, role, organization")
      .in("id", Array.from(userIds));
    (metas ?? []).forEach((m: any) =>
      userMap.set(m.id, { name: m.display_name ?? null, email: null, role: m.role ?? null }),
    );
    // email 은 RLS 때문에 보통 anon 권한으로 못 가져옴. display_name 만 사용.
  }

  // 4) 가공
  const events: CompEvent[] = (eventRows ?? []).map((e: any) => {
    const tree = e.tree ?? {};
    const site = tree.site ?? {};
    const sp = tree.species ?? null;
    const meta = e.surveyor_id ? userMap.get(e.surveyor_id) ?? null : null;
    return {
      id: e.id,
      sample_no: e.sample_no,
      sampled_at: e.sampled_at,
      height_m: e.height_m,
      dbh_cm: e.dbh_cm,
      dna_collected: !!e.dna_collected,
      dna_sample_code: e.dna_sample_code,
      notes: e.notes,
      device_recorded_at: e.device_recorded_at,
      sync_status: e.sync_status,
      created_at: e.created_at,
      updated_at: e.updated_at,
      surveyor_id: e.surveyor_id ?? null,
      surveyor_name: meta?.name ?? null,
      surveyor_email: meta?.email ?? null,
      surveyor_role: meta?.role ?? null,
      tree_id: tree.id,
      tree_local_no: tree.tree_local_no,
      species_code: tree.species_code ?? null,
      species_ko: sp?.ko_name ?? null,
      species_sci: sp?.sci_name ?? null,
      lat: tree.lat,
      lon: tree.lon,
      lat_dms: tree.lat_dms,
      lon_dms: tree.lon_dms,
      elevation_m: tree.elevation_m,
      aspect_deg: tree.aspect_deg,
      site_id: site.id,
      site_code: site.code,
      region_sido: site.region_sido,
      region_sigungu: site.region_sigungu,
      region_sigungu_code: site.region_sigungu_code,
      address_detail: site.address_detail,
      habitat_terrain: site.habitat_terrain,
    };
  });

  const specimens: CompSpecimen[] = ((specimenRows as any[]) ?? []).map((s: any) => {
    const ev = s.root_event ?? null;
    const tree = ev?.tree ?? null;
    const sp = tree?.species ?? null;
    return {
      id: s.id,
      human_code: s.human_code,
      parent_human_code: s.parent?.human_code ?? null,
      root_event_id: s.root_event_id,
      root_event_sample_no: ev?.sample_no ?? "",
      species_ko: sp?.ko_name ?? null,
      species_code: tree?.species_code ?? null,
      type_code: s.type_code,
      specimen_type: s.specimen_type,
      seq_no: s.seq_no,
      description: s.description,
      storage_location: s.storage_location,
      status: s.status,
      external_id: s.external_id,
      external_namespace: s.external_namespace,
      created_by_name: s.created_by ? userMap.get(s.created_by)?.name ?? null : null,
      created_at: s.created_at,
      updated_at: s.updated_at,
    };
  });

  const photos: CompPhoto[] = ((photoRows as any[]) ?? []).map((p: any) => ({
    id: p.id,
    event_sample_no: p.event?.sample_no ?? "",
    category: p.category,
    storage_path: p.storage_path,
    original_filename: p.original_filename,
    width: p.width,
    height: p.height,
    bytes: p.bytes,
    sha256: p.sha256,
    exif_taken_at: p.exif_taken_at,
    exif_lat: p.exif_lat,
    exif_lon: p.exif_lon,
    uploaded_by_name: p.uploaded_by ? userMap.get(p.uploaded_by)?.name ?? null : null,
    uploaded_at: p.uploaded_at,
  }));

  const dnaResults: CompDnaResult[] = ((dnaRows as any[]) ?? []).map((d: any) => ({
    id: d.id,
    specimen_human_code: d.specimen?.human_code ?? null,
    event_sample_no: d.event?.sample_no ?? null,
    analysis_type: d.analysis_type,
    identification_result: d.identification_result,
    similarity_score: d.similarity_score,
    analyst: d.analyst,
    analyzed_at: d.analyzed_at,
    file_original_name: d.file_original_name,
    file_bytes: d.file_bytes,
    notes: d.notes,
    created_by_name: d.created_by ? userMap.get(d.created_by)?.name ?? null : null,
    created_at: d.created_at,
  }));

  const sites: CompSite[] = ((siteRows as any[]) ?? []).map((s: any) => ({
    id: s.id,
    code: s.code,
    region_sido: s.region_sido,
    region_sigungu: s.region_sigungu,
    region_sigungu_code: s.region_sigungu_code,
    address_detail: s.address_detail,
    habitat_terrain: s.habitat_terrain,
    created_by_name: s.created_by ? userMap.get(s.created_by)?.name ?? null : null,
    created_at: s.created_at,
    updated_at: s.updated_at,
  }));

  const trees: CompTree[] = ((treeRows as any[]) ?? []).map((t: any) => ({
    id: t.id,
    site_code: t.site?.code ?? "",
    tree_local_no: t.tree_local_no,
    species_code: t.species_code,
    species_ko: t.species?.ko_name ?? null,
    lat: t.lat,
    lon: t.lon,
    lat_dms: t.lat_dms,
    lon_dms: t.lon_dms,
    elevation_m: t.elevation_m,
    aspect_deg: t.aspect_deg,
    tag_id: t.tag_id,
    status: t.status,
    created_by_name: t.created_by ? userMap.get(t.created_by)?.name ?? null : null,
    created_at: t.created_at,
    updated_at: t.updated_at,
  }));

  const truncated: Partial<Record<keyof typeof LIMITS, boolean>> = {
    events: events.length >= LIMITS.events,
    specimens: specimens.length >= LIMITS.specimens,
    photos: photos.length >= LIMITS.photos,
    dnaResults: dnaResults.length >= LIMITS.dnaResults,
    sites: sites.length >= LIMITS.sites,
    trees: trees.length >= LIMITS.trees,
  };

  return {
    events,
    specimens,
    photos,
    dnaResults,
    sites,
    trees,
    meta: {
      generatedAtIso: new Date().toISOString(),
      generatedByName: displayName,
      generatedByRole: role,
      filterApplied: filter,
      limits: LIMITS,
      truncated,
    },
  };
}
