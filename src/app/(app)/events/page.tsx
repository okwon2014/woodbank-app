import Link from "next/link";
import { Suspense } from "react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { EventFilters } from "@/components/EventFilters";
import { PendingEvents } from "@/components/PendingEvents";
import { SPECIMEN_TYPES, type PhotoCategory, type SpecimenTypeCode } from "@/types/db";

export const dynamic = "force-dynamic";

interface SearchParams {
  species?: string;
  sigungu?: string;
  from?: string;
  to?: string;
  q?: string;
  specimen_type?: string;
  storage?: string;
}

const PHOTO_LABELS: Record<PhotoCategory, string> = {
  tree_form: "수형",
  bark: "수피",
  branch: "가지",
  leaf_litter: "잎/낙엽",
};

export default async function EventsListPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const sb = await getSupabaseServer();

  // 1) 필터용 마스터 — 새 데이터가 추가되면 자동 반영되도록 매 요청마다 조회.
  //    species: 활성화된 모든 수종(ko/sci/code) → 정렬은 ko_name 기준
  //    regions: 실제 site 가 존재하는 시군구 (이벤트 필터링 의미 있는 것만)
  //    specimens: 보관 위치 distinct
  const [
    { data: species },
    { data: regions },
    { data: storageRows },
  ] = await Promise.all([
    sb
      .from("species")
      .select("code, ko_name, sci_name")
      .eq("active", true)
      .order("ko_name"),
    sb
      .from("sites")
      .select("region_sigungu, region_sigungu_code")
      .not("region_sigungu_code", "is", null),
    sb
      .from("specimens")
      .select("storage_location")
      .not("storage_location", "is", null),
  ]);

  const regionMap = new Map<string, string>();
  (regions ?? []).forEach((r: any) => {
    if (r.region_sigungu_code && r.region_sigungu) regionMap.set(r.region_sigungu_code, r.region_sigungu);
  });
  const regionOptions = Array.from(regionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));

  const speciesOptions = (species ?? []).map((s: any) => ({
    value: s.code as string,
    label: s.sci_name ? `${s.ko_name} (${s.sci_name}) · ${s.code}` : `${s.ko_name} · ${s.code}`,
  }));

  const storageSet = new Set<string>();
  (storageRows ?? []).forEach((r: any) => {
    const v = (r.storage_location ?? "").trim();
    if (v) storageSet.add(v);
  });
  const storageOptions = Array.from(storageSet)
    .sort((a, b) => a.localeCompare(b, "ko"))
    .map((v) => ({ value: v, label: v }));

  const specimenTypeOptions = SPECIMEN_TYPES.map((t) => ({
    value: t.code,
    label: `${t.code} · ${t.ko}`,
  }));

  // 2) 시편 필터가 걸려 있으면 먼저 일치하는 root_event_id 집합을 계산.
  //    type_code + storage_location 둘 다 있을 때는 두 조건을 모두 만족하는 같은 행이 있어야 함.
  let eventIdsBySpecimen: string[] | null = null;
  if (searchParams.specimen_type || searchParams.storage) {
    let sq = sb.from("specimens").select("root_event_id");
    if (searchParams.specimen_type) sq = sq.eq("type_code", searchParams.specimen_type);
    if (searchParams.storage) sq = sq.eq("storage_location", searchParams.storage);
    const { data: specIds } = await sq.limit(5000);
    eventIdsBySpecimen = Array.from(new Set((specIds ?? []).map((r: any) => r.root_event_id))).filter(Boolean);
  }

  // 3) 메인 쿼리 — 수종 마스터 / 사진 / 시편을 함께 조인
  let query = sb
    .from("sampling_events")
    .select(
      `
      id, sample_no, sampled_at, height_m, dbh_cm, dna_collected, notes, sync_status,
      tree:trees!inner(
        id, tree_local_no, species_code,
        species:species(code, ko_name, sci_name),
        site:sites!inner(id, code, region_sido, region_sigungu, region_sigungu_code)
      ),
      photos(category),
      specimens(id, human_code, type_code, specimen_type, storage_location, status)
    `,
    )
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
  if (eventIdsBySpecimen != null) {
    if (eventIdsBySpecimen.length === 0) {
      // 시편 조건에 매칭되는 게 없으면 본 쿼리도 빈 결과 — id 가 비도록 강제.
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      query = query.in("id", eventIdsBySpecimen);
    }
  }

  const { data: events, error } = await query;

  const hasFilter = !!(
    searchParams.species ||
    searchParams.sigungu ||
    searchParams.from ||
    searchParams.to ||
    searchParams.q ||
    searchParams.specimen_type ||
    searchParams.storage
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold">야장 목록</h1>
        <div className="flex gap-2">
          <Link
            href={`/admin/export${(() => {
              const p = new URLSearchParams();
              Object.entries(searchParams).forEach(([k, v]) => { if (v) p.set(k, String(v)); });
              const s = p.toString();
              return s ? `?${s}` : "";
            })()}`}
            className="btn-secondary text-sm"
          >
            📤 내보내기
          </Link>
          <Link href="/events/new" className="btn-primary">+ 새 야장</Link>
        </div>
      </div>

      <PendingEvents />

      <Suspense fallback={null}>
        <EventFilters
          species={speciesOptions}
          regions={regionOptions}
          specimenTypes={specimenTypeOptions}
          storageLocations={storageOptions}
        />
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
        {(events ?? []).map((e: any) => {
          const tree = e.tree ?? {};
          const site = tree.site ?? {};
          const sp = tree.species ?? {};
          const koName: string | null = sp?.ko_name ?? null;
          const sciName: string | null = sp?.sci_name ?? null;
          const speciesCode: string | null = tree?.species_code ?? sp?.code ?? null;

          // 사진: 카테고리 중복 제거 (한 야장에 같은 카테고리 여러 장일 수 있음)
          const photoCats: PhotoCategory[] = Array.from(
            new Set(((e.photos ?? []) as { category: PhotoCategory }[]).map((p) => p.category)),
          );

          // 시편: type_code → seq 순으로 정렬
          const specimens = ((e.specimens ?? []) as Array<{
            id: string;
            human_code: string;
            type_code: SpecimenTypeCode;
            specimen_type: string;
            storage_location: string | null;
            status: string;
          }>).slice().sort((a, b) => a.human_code.localeCompare(b.human_code));

          return (
            <li key={e.id}>
              <Link href={`/events/${e.id}`} className="block p-4 hover:bg-stone-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* 수종명 (일반명 / 학명) + 수종 코드 */}
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-base truncate">
                        {koName ?? "수종 미지정"}
                      </span>
                      {sciName && (
                        <span className="text-xs text-stone-500 italic truncate">{sciName}</span>
                      )}
                      {speciesCode && (
                        <span className="text-[11px] font-mono text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                          {speciesCode}
                        </span>
                      )}
                    </div>

                    {/* 채취번호 + 조사 지점 */}
                    <div className="text-xs text-stone-600 mt-1 truncate">
                      <span className="font-mono">{e.sample_no}</span>
                      <span className="mx-1.5 text-stone-400">·</span>
                      <span>
                        {site?.region_sido && <>{site.region_sido} </>}
                        {site?.region_sigungu ?? "지점 미지정"}
                      </span>
                      {site?.code && (
                        <>
                          <span className="mx-1.5 text-stone-400">·</span>
                          <span className="font-mono">{site.code}</span>
                        </>
                      )}
                      {tree?.tree_local_no && (
                        <>
                          <span className="mx-1.5 text-stone-400">·</span>
                          <span>개체목 #{tree.tree_local_no}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right text-xs text-stone-600 shrink-0">
                    <div>{new Date(e.sampled_at).toLocaleDateString("ko-KR")}</div>
                    <div className="mt-0.5">
                      수고 <b>{e.height_m ?? "-"}</b>m · DBH <b>{e.dbh_cm ?? "-"}</b>cm
                    </div>
                    {(e.dna_collected || e.sync_status !== "synced") && (
                      <div className="mt-0.5 flex gap-1 justify-end">
                        {e.dna_collected && <span className="text-amber-700">DNA</span>}
                        {e.sync_status !== "synced" && (
                          <span className="text-orange-600">{e.sync_status}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 사진 종류 배지 */}
                {photoCats.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
                    <span className="text-stone-500">사진:</span>
                    {(Object.keys(PHOTO_LABELS) as PhotoCategory[]).map((cat) => {
                      const has = photoCats.includes(cat);
                      return (
                        <span
                          key={cat}
                          className={
                            has
                              ? "px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "px-1.5 py-0.5 rounded bg-stone-50 text-stone-400 border border-stone-200 line-through"
                          }
                        >
                          {PHOTO_LABELS[cat]}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* 시편 목록 */}
                {specimens.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px]">
                    <span className="text-stone-500">시편 ({specimens.length}):</span>
                    {specimens.slice(0, 8).map((s) => {
                      const t = SPECIMEN_TYPES.find((x) => x.code === s.type_code);
                      const tone =
                        s.status === "active"
                          ? "bg-brand-50 text-brand-700 border-brand-200"
                          : "bg-stone-100 text-stone-500 border-stone-200";
                      return (
                        <span
                          key={s.id}
                          className={`px-1.5 py-0.5 rounded border font-mono ${tone}`}
                          title={`${t?.ko ?? s.specimen_type}${s.storage_location ? ` · 📍 ${s.storage_location}` : ""}${s.status !== "active" ? ` · ${s.status}` : ""}`}
                        >
                          {s.human_code}
                        </span>
                      );
                    })}
                    {specimens.length > 8 && (
                      <span className="text-stone-500">+{specimens.length - 8}</span>
                    )}
                  </div>
                )}

                {e.notes && (
                  <p className="mt-2 text-xs text-stone-500 line-clamp-2">{e.notes}</p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
