import Link from "next/link";
import { Suspense } from "react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { EventFilters } from "@/components/EventFilters";

export const dynamic = "force-dynamic";

interface SearchParams {
  species?: string;
  sigungu?: string;
  from?: string;
  to?: string;
  q?: string;
}

export default async function EventsListPage({ searchParams }: { searchParams: SearchParams }) {
  const sb = getSupabaseServer();

  // 1) 필터용 마스터 (수종·시군구) — 캐시할 가치 있지만 일단 단순 조회
  const [{ data: species }, { data: regions }] = await Promise.all([
    sb.from("species").select("code, ko_name").eq("active", true).order("ko_name"),
    sb.from("sites").select("region_sigungu, region_sigungu_code").not("region_sigungu_code", "is", null),
  ]);

  // 시군구 중복 제거
  const regionMap = new Map<string, string>();
  (regions ?? []).forEach((r: any) => {
    if (r.region_sigungu_code && r.region_sigungu) regionMap.set(r.region_sigungu_code, r.region_sigungu);
  });
  const regionOptions = Array.from(regionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));

  const speciesOptions = (species ?? []).map((s: any) => ({ value: s.code, label: s.ko_name }));

  // 2) 메인 쿼리 — 필터 적용
  let query = sb
    .from("sampling_events")
    .select(`
      id, sample_no, sampled_at, height_m, dbh_cm, dna_collected, notes, sync_status,
      tree:trees!inner(id, tree_local_no, species_code, site:sites!inner(id, code, region_sigungu, region_sigungu_code))
    `)
    .order("sampled_at", { ascending: false })
    .limit(200);

  if (searchParams.species) {
    query = query.eq("tree.species_code", searchParams.species);
  }
  if (searchParams.sigungu) {
    query = query.eq("tree.site.region_sigungu_code", searchParams.sigungu);
  }
  if (searchParams.from) query = query.gte("sampled_at", searchParams.from);
  if (searchParams.to) query = query.lte("sampled_at", searchParams.to);
  if (searchParams.q) {
    const q = searchParams.q;
    query = query.or(`sample_no.ilike.%${q}%,notes.ilike.%${q}%`);
  }

  const { data: events, error } = await query;

  const hasFilter = !!(searchParams.species || searchParams.sigungu || searchParams.from || searchParams.to || searchParams.q);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">야장 목록</h1>
        <Link href="/events/new" className="btn-primary">+ 새 야장</Link>
      </div>

      <Suspense fallback={null}>
        <EventFilters species={speciesOptions} regions={regionOptions} />
      </Suspense>

      <div className="text-sm text-stone-500">
        {error ? (
          <span className="text-rose-600">{error.message}</span>
        ) : (
          <>총 <b>{events?.length ?? 0}</b>건 {hasFilter && "(필터 적용됨)"}</>
        )}
      </div>

      {(!events || events.length === 0) && (
        <p className="text-stone-500 text-sm">
          {hasFilter
            ? "조건에 맞는 야장이 없습니다. 필터를 조정해보세요."
            : "등록된 야장이 없습니다. 「+ 새 야장」으로 첫 데이터를 등록해보세요."}
        </p>
      )}

      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white overflow-hidden">
        {(events ?? []).map((e: any) => (
          <li key={e.id}>
            <Link href={`/events/${e.id}`} className="block p-4 hover:bg-stone-50">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{e.sample_no}</div>
                  <div className="text-xs text-stone-500 truncate">
                    {e.tree?.site?.region_sigungu ?? "-"} · {e.tree?.species_code ?? "?"} · 개체목 #{e.tree?.tree_local_no ?? "?"}
                  </div>
                </div>
                <div className="text-right text-xs text-stone-600 shrink-0">
                  <div>{new Date(e.sampled_at).toLocaleDateString("ko-KR")}</div>
                  <div className="mt-0.5">
                    수고 <b>{e.height_m ?? "-"}</b>m · DBH <b>{e.dbh_cm ?? "-"}</b>cm
                  </div>
                  <div className="mt-0.5 flex gap-1 justify-end">
                    {e.dna_collected && <span className="text-amber-700">DNA</span>}
                    {e.sync_status !== "synced" && (
                      <span className="text-orange-600">{e.sync_status}</span>
                    )}
                  </div>
                </div>
              </div>
              {e.notes && (
                <p className="mt-2 text-xs text-stone-500 line-clamp-2">{e.notes}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
