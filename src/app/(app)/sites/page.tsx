import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { SitesMapView, type MapTreeMarker } from "@/components/SitesMapView";

export const dynamic = "force-dynamic";

interface SP {
  view?: "list" | "map";
}

export default async function SitesPage(props: { searchParams: Promise<SP> }) {
  const searchParams = await props.searchParams;
  const sb = await getSupabaseServer();
  const view = searchParams.view === "map" ? "map" : "list";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold">조사지점</h1>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-stone-300 overflow-hidden text-sm">
            <Link
              href="/sites"
              className={`px-3 py-1.5 ${view === "list" ? "bg-brand-700 text-white" : "bg-white text-stone-700 hover:bg-stone-50"}`}
            >
              목록
            </Link>
            <Link
              href="/sites?view=map"
              className={`px-3 py-1.5 ${view === "map" ? "bg-brand-700 text-white" : "bg-white text-stone-700 hover:bg-stone-50"}`}
            >
              지도
            </Link>
          </div>
          <Link href="/events/new" className="btn-primary">+ 새 야장</Link>
        </div>
      </div>

      {view === "map" ? <MapView sb={sb} /> : <ListView sb={sb} />}
    </div>
  );
}

async function ListView({ sb }: { sb: Awaited<ReturnType<typeof getSupabaseServer>> }) {
  const { data: sites, error } = await sb
    .from("sites")
    .select("id, code, region_sigungu, address_detail, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);

  return (
    <>
      {error && <p className="text-rose-600 text-sm">{error.message}</p>}
      {(!sites || sites.length === 0) && (
        <p className="text-stone-500 text-sm">접근 가능한 조사지점이 없습니다. 「+ 새 야장」으로 첫 데이터를 등록해보세요.</p>
      )}
      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white overflow-hidden">
        {(sites ?? []).map((s) => (
          <li key={s.id}>
            <Link href={`/sites/${s.id}`} className="flex items-center justify-between p-4 hover:bg-stone-50">
              <div>
                <div className="font-semibold">{s.code}</div>
                <div className="text-xs text-stone-500">
                  {s.region_sigungu} · {s.address_detail}
                </div>
              </div>
              <div className="text-xs text-stone-400">
                {new Date(s.updated_at).toLocaleDateString("ko-KR")}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

async function MapView({ sb }: { sb: Awaited<ReturnType<typeof getSupabaseServer>> }) {
  // 권한 내(RLS 통과) trees — 인라인 join 추론 실패 케이스를 피하기 위해
  // sites·species 는 별도 호출 후 클라이언트에서 merge.
  const { data: trees, error } = await sb
    .from("trees")
    .select("id, site_id, tree_local_no, lat, lon, species_code")
    .not("lat", "is", null)
    .not("lon", "is", null)
    .limit(2000);

  const treeRows = (trees as Array<{
    id: string;
    site_id: string;
    tree_local_no: string;
    lat: number;
    lon: number;
    species_code: string | null;
  }> | null) ?? [];

  const siteIds = Array.from(new Set(treeRows.map((t) => t.site_id).filter(Boolean)));
  const speciesCodes = Array.from(
    new Set(treeRows.map((t) => t.species_code).filter((c): c is string => !!c)),
  );

  const [sitesRes, speciesRes] = await Promise.all([
    siteIds.length
      ? sb.from("sites").select("id, code, region_sigungu").in("id", siteIds)
      : Promise.resolve({ data: [] as Array<{ id: string; code: string; region_sigungu: string | null }>, error: null }),
    speciesCodes.length
      ? sb.from("species").select("code, ko_name").in("code", speciesCodes)
      : Promise.resolve({ data: [] as Array<{ code: string; ko_name: string | null }>, error: null }),
  ]);

  const sitesMap = new Map((sitesRes.data ?? []).map((s) => [s.id, s]));
  const speciesMap = new Map((speciesRes.data ?? []).map((sp) => [sp.code, sp]));

  const markers: MapTreeMarker[] = treeRows.map((t) => ({
    id: t.id,
    site_id: t.site_id,
    tree_local_no: t.tree_local_no,
    site_code: sitesMap.get(t.site_id)?.code ?? "",
    region_sigungu: sitesMap.get(t.site_id)?.region_sigungu ?? null,
    species_ko: t.species_code ? speciesMap.get(t.species_code)?.ko_name ?? null : null,
    lat: t.lat,
    lon: t.lon,
  }));

  // 진단용: GPS 없는 개체목 / RLS 로 가려진 site 가 있을 때 어디서 막혔는지 노출.
  const totalTreesWithGps = treeRows.length;
  const visibleSites = sitesMap.size;
  // 좌표 범위 — 마커를 어디서 찾아야 할지 사용자가 즉시 알도록.
  const lats = markers.map((m) => m.lat);
  const lons = markers.map((m) => m.lon);
  const bbox =
    markers.length > 0
      ? {
          minLat: Math.min(...lats),
          maxLat: Math.max(...lats),
          minLon: Math.min(...lons),
          maxLon: Math.max(...lons),
        }
      : null;
  // 한반도 범위(33–39, 124–132) 벗어난 마커 — 잘못된 좌표 입력 의심
  const outOfKorea = markers.filter(
    (m) => m.lat < 33 || m.lat > 39 || m.lon < 124 || m.lon > 132,
  );

  return (
    <>
      {error && <p className="text-rose-600 text-sm">{error.message}</p>}
      <SitesMapView markers={markers} />
      <div className="text-xs text-stone-500 space-y-1">
        <p>
          ※ 좌표가 입력된 개체목 <b>{markers.length}건</b>을 표시합니다. 배경 지도는 OpenStreetMap.
          {totalTreesWithGps > 0 && visibleSites === 0 && (
            <>
              {" "}<span className="text-amber-700">⚠️ trees 는 {totalTreesWithGps}건 가져왔지만 연결된 sites 가 보이지 않습니다. RLS 권한 또는 데이터 불일치 가능성.</span>
            </>
          )}
        </p>
        {bbox && (
          <p className="font-mono text-stone-400">
            좌표 범위: 위도 {bbox.minLat.toFixed(4)}–{bbox.maxLat.toFixed(4)} · 경도 {bbox.minLon.toFixed(4)}–{bbox.maxLon.toFixed(4)}
          </p>
        )}
        {outOfKorea.length > 0 && (
          <p className="text-rose-700">
            ⚠️ 한반도 범위(33–39°N, 124–132°E)를 벗어난 좌표 {outOfKorea.length}건이 있습니다. 첫 건: {outOfKorea[0].site_code} #{outOfKorea[0].tree_local_no} ({outOfKorea[0].lat.toFixed(5)}, {outOfKorea[0].lon.toFixed(5)}) — 잘못 입력됐을 가능성을 확인하세요.
          </p>
        )}
      </div>
    </>
  );
}
