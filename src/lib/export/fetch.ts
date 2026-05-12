import { getSupabaseServer } from "@/lib/supabase/server";
import type { EventExport } from "./types";

export interface ExportFilter {
  species?: string;
  sigungu?: string;
  from?: string;
  to?: string;
  q?: string;
}

export async function fetchEventsForExport(filter: ExportFilter): Promise<EventExport[]> {
  const sb = getSupabaseServer();

  let q = sb
    .from("sampling_events")
    .select(`
      id, sample_no, sampled_at, height_m, dbh_cm, dna_collected, dna_sample_code, notes, surveyor_id,
      tree:trees!inner(
        id, tree_local_no, species_code, lat, lon, lat_dms, lon_dms, elevation_m, aspect_deg,
        species:species(code, ko_name),
        site:sites!inner(id, code, region_sido, region_sigungu, region_sigungu_code, address_detail, habitat_terrain)
      )
    `)
    .order("sampled_at", { ascending: false })
    .limit(500);

  if (filter.species) q = q.eq("tree.species_code", filter.species);
  if (filter.sigungu) q = q.eq("tree.site.region_sigungu_code", filter.sigungu);
  if (filter.from) q = q.gte("sampled_at", filter.from);
  if (filter.to) q = q.lte("sampled_at", filter.to);
  if (filter.q) q = q.or(`sample_no.ilike.%${filter.q}%,notes.ilike.%${filter.q}%`);

  const { data: events, error } = await q;
  if (error) throw error;

  // 조사자 메타 일괄 조회
  const surveyorIds = Array.from(new Set((events ?? []).map((e: any) => e.surveyor_id).filter(Boolean)));
  const surveyorMap = new Map<string, string>();
  if (surveyorIds.length > 0) {
    const { data: metas } = await sb.from("users_meta").select("id, display_name").in("id", surveyorIds);
    (metas ?? []).forEach((m: any) => surveyorMap.set(m.id, m.display_name ?? ""));
  }

  // 사진 일괄 조회 + signed URL
  const eventIds = (events ?? []).map((e: any) => e.id);
  let photoRows: any[] = [];
  if (eventIds.length > 0) {
    const { data: ps } = await sb
      .from("photos")
      .select("id, event_id, category, storage_path")
      .in("event_id", eventIds);
    photoRows = ps ?? [];
  }

  const photosByEvent = new Map<string, { id: string; category: string; storage_path: string }[]>();
  for (const p of photoRows) {
    if (!photosByEvent.has(p.event_id)) photosByEvent.set(p.event_id, []);
    photosByEvent.get(p.event_id)!.push(p);
  }

  // signed URL 일괄 발급 (15분)
  const allPaths = photoRows.map((p) => p.storage_path);
  const signedMap = new Map<string, string>();
  if (allPaths.length > 0) {
    const { data: signed } = await sb.storage.from("photos").createSignedUrls(allPaths, 900);
    (signed ?? []).forEach((s: any) => {
      if (s?.path && s?.signedUrl) signedMap.set(s.path, s.signedUrl);
    });
  }

  return (events ?? []).map((e: any): EventExport => {
    const tree = e.tree ?? {};
    const site = tree.site ?? {};
    const photos = (photosByEvent.get(e.id) ?? []).map((p) => ({
      id: p.id,
      category: p.category as EventExport["photos"][number]["category"],
      signedUrl: signedMap.get(p.storage_path) ?? null,
    }));
    return {
      id: e.id,
      sample_no: e.sample_no,
      sampled_at: e.sampled_at,
      height_m: e.height_m,
      dbh_cm: e.dbh_cm,
      dna_collected: !!e.dna_collected,
      dna_sample_code: e.dna_sample_code,
      notes: e.notes,
      surveyor_name: e.surveyor_id ? (surveyorMap.get(e.surveyor_id) ?? null) : null,
      tree_local_no: tree.tree_local_no,
      species_code: tree.species_code,
      species_ko: tree.species?.ko_name ?? null,
      lat: tree.lat,
      lon: tree.lon,
      lat_dms: tree.lat_dms,
      lon_dms: tree.lon_dms,
      elevation_m: tree.elevation_m,
      aspect_deg: tree.aspect_deg,
      site_code: site.code,
      region_sido: site.region_sido,
      region_sigungu: site.region_sigungu,
      region_sigungu_code: site.region_sigungu_code,
      address_detail: site.address_detail,
      habitat_terrain: site.habitat_terrain,
      photos,
    };
  });
}
