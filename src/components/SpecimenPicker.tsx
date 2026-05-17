"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { SPECIMEN_TYPES, type SpecimenTypeCode } from "@/types/db";
import type { LabelItem } from "./SpecimenPrintClient";

interface Props {
  existingIds: Set<string>;
  onAdd: (item: LabelItem) => void;
}

// 시편 검색 → 결과에서 [+ 추가] 클릭 시 부모로 콜백.
// human_code 는 항상 sample_no 로 시작하기 때문에 "2025_담양_01" 같이
// 채취번호 prefix 로 검색하면 그 야장의 모든 시편이 한꺼번에 잡힌다.
export function SpecimenPicker({ existingIds, onAdd }: Props) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<SpecimenTypeCode | "">("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [results, setResults] = useState<LabelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function runSearch(q: string, type: SpecimenTypeCode | "", active: boolean) {
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
              species:species(ko_name, sci_name)
            )
          )
        `)
        .order("human_code", { ascending: true })
        .limit(50);
      if (q.trim()) req = req.ilike("human_code", `%${q.trim()}%`);
      if (type) req = req.eq("type_code", type);
      if (active) req = req.eq("status", "active");
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

  // 디바운스 — 입력 멈추고 350ms 후 검색
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query, typeFilter, activeOnly), 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, typeFilter, activeOnly, open]);

  function addAllVisible() {
    results.forEach((r) => {
      if (!existingIds.has(r.id)) onAdd(r);
    });
  }

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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
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
            <div>
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
          </div>

          <label className="inline-flex items-center gap-1">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
            />
            보관 중인 시편만 (소진·분실·폐기 제외)
          </label>

          {err && <p className="text-rose-700 bg-rose-50 p-2 rounded">{err}</p>}

          <div className="flex items-center justify-between text-stone-500">
            <span>
              {loading ? "검색 중…" : `결과 ${results.length}건${results.length === 50 ? " (상한)" : ""}`}
            </span>
            {results.length > 0 && (
              <button
                type="button"
                onClick={addAllVisible}
                className="text-brand-700 hover:underline"
              >
                모두 추가 →
              </button>
            )}
          </div>

          <ul className="max-h-64 overflow-y-auto divide-y divide-stone-100 border border-stone-200 rounded">
            {results.length === 0 && !loading && (
              <li className="p-3 text-stone-400 text-center">
                {query.trim() ? "결과 없음" : "검색어를 입력하거나 종류를 선택하세요."}
              </li>
            )}
            {results.map((r) => {
              const already = existingIds.has(r.id);
              return (
                <li key={r.id} className="flex items-center gap-2 p-2 hover:bg-stone-50">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs truncate">
                      {r.human_code}
                      {r.status !== "active" && (
                        <span className="ml-2 text-rose-700">· {r.status}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-stone-500 truncate">
                      {r.species_ko ?? r.species_code ?? "(수종 미정)"} · {r.type_label}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => !already && onAdd(r)}
                    disabled={already}
                    className={`text-xs px-2 py-1 rounded border ${
                      already
                        ? "bg-stone-100 border-stone-200 text-stone-400 cursor-not-allowed"
                        : "bg-brand-700 border-brand-700 text-white hover:bg-brand-500"
                    }`}
                  >
                    {already ? "추가됨" : "+ 추가"}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
