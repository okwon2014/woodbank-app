import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { SitesMapView, type MapTreeMarker } from "@/components/SitesMapView";

export const dynamic = "force-dynamic";

interface SP {
  view?: "list" | "map";
}

export default async function SitesPage({ searchParams }: { searchParams: SP }) {
  const sb = getSupabaseServer();
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

async function ListView({ sb }: { sb: ReturnType<typeof getSupabaseServer> }) {
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

async function MapView({ sb }: { sb: ReturnType<typeof getSupabaseServer> }) {
  // 권한 내(RLS 통과) trees + 사이트·수종 조인. lat/lon 없는 행은 제외.
  const { data: trees, error } = await sb
    .from("trees")
    .select(
      `id, site_id, tree_local_no, lat, lon,
       sites!inner ( code, region_sigungu ),
       species ( ko_name )`,
    )
    .not("lat", "is", null)
    .not("lon", "is", null)
    .limit(2000);

  const markers: MapTreeMarker[] = ((trees as any[]) ?? []).map((t) => ({
    id: t.id,
    site_id: t.site_id,
    tree_local_no: t.tree_local_no,
    site_code: t.sites?.code ?? "",
    region_sigungu: t.sites?.region_sigungu ?? null,
    species_ko: t.species?.ko_name ?? null,
    lat: t.lat,
    lon: t.lon,
  }));

  return (
    <>
      {error && <p className="text-rose-600 text-sm">{error.message}</p>}
      <SitesMapView markers={markers} />
      <p className="text-xs text-stone-500">
        ※ 좌표가 입력된 개체목 {markers.length}건을 표시합니다. 배경 지도는 OpenStreetMap.
      </p>
    </>
  );
}
