"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { SPECIMEN_TYPES, type SpecimenTypeCode } from "@/types/db";
import type { LabelItem } from "./SpecimenPrintClient";

interface Props {
  existingIds: Set<string>;
  onAdd: (item: LabelItem) => void;
}

interface SpeciesOpt {
  code: string;
  ko_name: string;
  sci_name: string | null;
}
interface RegionOpt {
  code: string;
  name: string;
}

// 시편 검색 + 필터 + 체크박스 선택. 결과에서 체크한 것만 「선택 추가」 로
// 부모에게 콜백, 또는 「모두 추가」 로 일괄. human_code 는 항상 sample_no
// prefix 라 채취번호로 검색하면 그 야장의 모든 시편이 한꺼번에 잡힌다.
export function SpecimenPicker({ existingIds, onAdd }: Props) {
  // 검색 조건
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<SpecimenTypeCode | "">("");
  const [speciesFilter, setSpeciesFilter] = useState<string>("");
  const [sigunguFilter, setSigunguFilter] = useState<string>("");
  const [activeOnly, setActiveOnly] = useState(true);

  // 상태
  const [results, setResults] = useState<LabelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // 체크박스 선택 (id Set)
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // 필터 옵션 (1회 로드)
  const [speciesOpts, setSpeciesOpts] = useState<SpeciesOpt[]>([]);
  const [regionOpts, setRegionOpts] = useState<RegionOpt[]>([]);
  const [optsLoaded, setOptsLoaded] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 필터 옵션은 picker 가 처음 열렸을 때 한 번만 로드.
  useEffect(() => {
    if (!open || optsLoaded) return;
    (async () => {
      const sb = getSupabaseBrowser();
      const [{ data: sp }, { data: rg }] = await Promise.all([
        sb.from("species").select("code, ko_name, sci_name").eq("active", true).order("ko_name"),
        sb.from("sites").select("region_sigungu, region_sigungu_code").not("region_sigungu_code", "is", null),
      ]);
      setSpeciesOpts((sp as SpeciesOpt[] | null) ?? []);
      const map = new Map<string, string>();
      ((rg as Array<{ region_sigungu: string | null; region_sigungu_code: string | null }> | null) ?? []).forEach((r) => {
        if (r.region_sigungu_code && r.region_sigungu) map.set(r.region_sigungu_code, r.region_sigungu);
      });
      setRegionOpts(
        Array.from(map.entries())
          .map(([code, name]) => ({ code, name }))
          .sort((a, b) => a.name.localeCompare(b.name, "ko")),
      );
      setOptsLoaded(true);
    })();
  }, [open, optsLoaded]);

  async function runSearch() {
    setLoading(true);
    setErr(null);
    try {
      const sb = getSupabaseBrowser();
      let req = sb
        .from("specimens")
        .select(`
          id, human_code, type_code, specimen_type, status,
          root_event:sampling_events!inner(
            sample_no,
            tree:trees!inner(
              species_code,
              species:species(ko_name, sci_name),
              site:sites!inner(region_sigungu, region_sigungu_code)
            )
          )
        `)
        .order("human_code", { ascending: true })
        .limit(100);
      if (query.trim()) req = req.ilike("human_code", `%${query.trim()}%`);
      if (typeFilter) req = req.eq("type_code", typeFilter);
      if (activeOnly) req = req.eq("status", "active");
      // 수종/시군구 필터 — PostgREST 가 nested join 경로로 필터링.
      if (speciesFilter) req = req.eq("root_event.tree.species_code", speciesFilter);
      if (sigunguFilter) req = req.eq("root_event.tree.site.region_sigungu_code", sigunguFilter);

      const { data, error } = await req;
      if (error) throw error;
      setResults(
        ((data as any[]) ?? []).map((s) => {
          const t = SPECIMEN_TYPES.find((x) => x.code === (s.type_code as SpecimenTypeCode));
          const ev = s.root_event ?? null;
          const tree = ev?.tree ?? null;
          const sp = tree?.species ?? null;
          return {
            id: s.id as string,
            human_code: s.human_code as string,
            type_code: s.type_code as SpecimenTypeCode,
            type_label: `${t?.ko ?? s.specimen_type} (${s.type_code})`,
            status: s.status as string,
            species_ko: sp?.ko_name ?? null,
            species_sci: sp?.sci_name ?? null,
            species_code: tree?.species_code ?? null,
            sample_no: ev?.sample_no ?? null,
          } satisfies LabelItem;
        }),
      );
    } catch (e: any) {
      setErr(e?.message ?? "검색 실패");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  // 디바운스 — 입력·필터 변경 후 350ms 정지하면 검색
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(runSearch, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, typeFilter, speciesFilter, sigunguFilter, activeOnly]);

  // 체크박스 헬퍼 — 이미 부모에 추가된 항목은 체크 대상에서 제외.
  const eligibleResults = useMemo(
    () => results.filter((r) => !existingIds.has(r.id)),
    [results, existingIds],
  );
  const allEligibleChecked = useMemo(
    () => eligibleResults.length > 0 && eligibleResults.every((r) => checked.has(r.id)),
    [eligibleResults, checked],
  );

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allEligibleChecked) setChecked(new Set());
    else setChecked(new Set(eligibleResults.map((r) => r.id)));
  }
  function addChecked() {
    results.forEach((r) => {
      if (checked.has(r.id) && !existingIds.has(r.id)) onAdd(r);
    });
    setChecked(new Set());
  }
  function addAllVisible() {
    eligibleResults.forEach((r) => onAdd(r));
    setChecked(new Set());
  }
  function resetFilters() {
    setQuery("");
    setTypeFilter("");
    setSpeciesFilter("");
    setSigunguFilter("");
    setActiveOnly(true);
    setChecked(new Set());
  }

  const filterActiveCount =
    (query ? 1 : 0) + (typeFilter ? 1 : 0) + (speciesFilter ? 1 : 0) + (sigunguFilter ? 1 : 0) + (activeOnly ? 0 : 1);

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3 space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-bold">+ 시편 추가</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn-secondary text-xs"
        >
          {open ? "▲ 검색 닫기" : "▼ 검색 열기"}
        </button>
      </div>

      {open && (
        <>
          {/* 검색 + 필터 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-3">
              <label className="block">
                <span className="text-stone-500">검색 (사람용 코드·채취번호 일부)</span>
                <input
                  className="field-value text-sm mt-0.5"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="예: 2025_담양_01 / .D01 / .B03"
                  autoFocus
                />
              </label>
            </div>
            <label className="block">
              <span className="text-stone-500">수종</span>
              <select
                className="field-value text-sm mt-0.5"
                value={speciesFilter}
                onChange={(e) => setSpeciesFilter(e.target.value)}
              >
                <option value="">전체</option>
                {speciesOpts.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.sci_name ? `${s.ko_name} (${s.sci_name}) · ${s.code}` : `${s.ko_name} · ${s.code}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-stone-500">시군구</span>
              <select
                className="field-value text-sm mt-0.5"
                value={sigunguFilter}
                onChange={(e) => setSigunguFilter(e.target.value)}
              >
                <option value="">전체</option>
                {regionOpts.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-stone-500">시편 종류</span>
              <select
                className="field-value text-sm mt-0.5"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as SpecimenTypeCode | "")}
              >
                <option value="">전체</option>
                {SPECIMEN_TYPES.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.code} · {t.ko}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />
              보관 중인 시편만 (소진·분실·폐기 제외)
            </label>
            {filterActiveCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-stone-600 hover:underline"
              >
                필터 초기화 ({filterActiveCount})
              </button>
            )}
          </div>

          {err && <p className="text-rose-700 bg-rose-50 p-2 rounded">{err}</p>}

          {/* 결과 헤더 + 일괄 액션 */}
          <div className="flex items-center justify-between text-stone-600 gap-2 flex-wrap">
            <span>
              {loading
                ? "검색 중…"
                : `결과 ${results.length}건${results.length === 100 ? " (상한, 필터 좁히세요)" : ""} · 추가 가능 ${eligibleResults.length}건 · 체크 ${checked.size}건`}
            </span>
            {eligibleResults.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-stone-700 hover:underline"
                >
                  {allEligibleChecked ? "전체 해제" : "전체 체크"}
                </button>
                <button
                  type="button"
                  onClick={addChecked}
                  disabled={checked.size === 0}
                  className={`text-xs px-2 py-1 rounded border ${
                    checked.size === 0
                      ? "bg-stone-100 border-stone-200 text-stone-400"
                      : "bg-brand-700 border-brand-700 text-white hover:bg-brand-500"
                  }`}
                >
                  선택 추가 ({checked.size})
                </button>
                <button
                  type="button"
                  onClick={addAllVisible}
                  className="text-brand-700 hover:underline"
                >
                  모두 추가 ({eligibleResults.length})
                </button>
              </div>
            )}
          </div>

          {/* 결과 리스트 — 체크박스 */}
          <ul className="max-h-72 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded">
            {results.length === 0 && !loading && (
              <li className="p-3 text-stone-400 text-center">
                {filterActiveCount > 0 ? "결과 없음" : "검색어 또는 필터를 지정하면 결과가 표시됩니다."}
              </li>
            )}
            {results.map((r) => {
              const already = existingIds.has(r.id);
              const isChecked = checked.has(r.id);
              return (
                <li
                  key={r.id}
                  className={`flex items-center gap-2 p-2 ${
                    already ? "bg-stone-50 text-stone-400" : "hover:bg-stone-50 cursor-pointer"
                  }`}
                  onClick={() => !already && toggleCheck(r.id)}
                >
                  <input
                    type="checkbox"
                    checked={isChecked && !already}
                    disabled={already}
                    onChange={() => !already && toggleCheck(r.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`font-mono text-xs truncate ${already ? "" : "text-stone-800"}`}>
                      {r.human_code}
                      {r.status !== "active" && (
                        <span className="ml-2 text-rose-700">· {r.status}</span>
                      )}
                      {already && <span className="ml-2 text-[10px]">(이미 선택됨)</span>}
                    </div>
                    <div className="text-[11px] text-stone-500 truncate">
                      {r.species_ko ?? r.species_code ?? "(수종 미정)"} · {r.type_label}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
