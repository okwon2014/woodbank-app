import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SiteDetail(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const sb = await getSupabaseServer();
  const { data: site } = await sb.from("sites").select("*").eq("id", params.id).maybeSingle();
  const { data: trees } = await sb
    .from("trees")
    .select("id, tree_local_no, species_code, lat, lon, updated_at")
    .eq("site_id", params.id)
    .order("tree_local_no");

  if (!site) return <p>지점을 찾을 수 없습니다.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{site.code}</h1>
        <p className="text-sm text-stone-500">{site.region_sigungu} · {site.address_detail}</p>
      </div>
      <div className="card">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="field-label">시도</span><div>{site.region_sido ?? "-"}</div></div>
          <div><span className="field-label">시군구 코드</span><div>{site.region_sigungu_code ?? "-"}</div></div>
          <div className="col-span-2"><span className="field-label">지형</span><div>{site.habitat_terrain ?? "-"}</div></div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">개체목 ({trees?.length ?? 0})</h2>
        <Link href={`/events/new?site=${site.id}`} className="btn-secondary text-xs">+ 이 지점에 새 야장</Link>
      </div>
      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white overflow-hidden">
        {(trees ?? []).map((t) => (
          <li key={t.id}>
            <Link href={`/trees/${t.id}`} className="flex items-center justify-between p-3 hover:bg-stone-50">
              <div>
                <div className="font-semibold">No. {t.tree_local_no} <span className="text-stone-400">·</span> {t.species_code ?? "?"}</div>
                <div className="text-xs font-mono text-stone-500">
                  {t.lat?.toFixed(5)}, {t.lon?.toFixed(5)}
                </div>
              </div>
              <div className="text-xs text-stone-400">
                {new Date(t.updated_at).toLocaleDateString("ko-KR")}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
