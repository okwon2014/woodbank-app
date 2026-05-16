"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export interface SigunguOption {
  sido_code: string;
  sigungu_code: string;
  sido_name: string;
  sigungu_name: string;
}

interface Props {
  // 현재 선택된 값을 표시(있으면 라벨 옆에 출력). 입력값과 분리되어 있어 부모는
  // region_sido / region_sigungu / region_sigungu_code 세 상태를 그대로 둔다.
  value?: { sigungu_code: string; sido_name: string; sigungu_name: string } | null;
  onSelect: (opt: SigunguOption) => void;
  placeholder?: string;
}

// 마스터 데이터를 모듈 단위 캐시(약 250건, ~10KB). 한 번 fetch 후 재사용.
// 페이지가 다시 열려도 같은 process 안이면 재요청 안 함.
let _cache: SigunguOption[] | null = null;
let _inflight: Promise<SigunguOption[]> | null = null;

async function loadRegions(): Promise<SigunguOption[]> {
  if (_cache) return _cache;
  if (_inflight) return _inflight;
  _inflight = (async () => {
    const sb = getSupabaseBrowser();
    const { data, error } = await sb
      .from("regions")
      .select("sido_code, sigungu_code, sido_name, sigungu_name")
      .order("sido_code")
      .order("sigungu_code");
    if (error) throw error;
    _cache = (data as SigunguOption[]) ?? [];
    return _cache;
  })();
  try {
    return await _inflight;
  } finally {
    _inflight = null;
  }
}

// 검색 — 시군구 이름·코드·시도 이름 모두에 매칭. 우선순위는 시군구 prefix 매칭.
function rank(option: SigunguOption, q: string): number {
  const name = option.sigungu_name.toLowerCase();
  const sido = option.sido_name.toLowerCase();
  const code = option.sigungu_code;
  if (name.startsWith(q)) return 0;
  if (code.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (sido.startsWith(q)) return 3;
  if (sido.includes(q)) return 4;
  if (code.includes(q)) return 5;
  return 99;
}

export function SigunguPicker({ value, onSelect, placeholder }: Props) {
  const [regions, setRegions] = useState<SigunguOption[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await loadRegions();
        if (!cancelled) setRegions(r);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "시군구 마스터 로드 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const filtered = useMemo<SigunguOption[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // 빈 입력 시: 상위 30개 (시도 정렬 순으로 일부 노출 — 마스터 둘러보기용)
      return regions.slice(0, 30);
    }
    return regions
      .map((r) => ({ r, score: rank(r, q) }))
      .filter((x) => x.score < 99)
      .sort((a, b) => a.score - b.score || a.r.sigungu_code.localeCompare(b.r.sigungu_code))
      .slice(0, 50)
      .map((x) => x.r);
  }, [regions, query]);

  // highlighted 가 filtered 범위를 벗어나지 않도록
  useEffect(() => {
    if (highlighted >= filtered.length) setHighlighted(0);
  }, [filtered.length, highlighted]);

  // 키보드 네비게이션으로 highlighted 가 바뀔 때 리스트 스크롤 따라가기
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlighted] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  function select(opt: SigunguOption) {
    onSelect(opt);
    setQuery("");
    setOpen(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlighted((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      if (open && filtered[highlighted]) {
        e.preventDefault();
        select(filtered[highlighted]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <span className="field-label">🔎 시군구 검색</span>
      <input
        type="text"
        className="field-value"
        value={query}
        placeholder={placeholder ?? "예: 담양 / 강남 / 46710"}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {value && value.sigungu_code && !open && (
        <p className="text-[11px] text-stone-500 mt-0.5">
          선택됨: <code className="font-mono">{value.sigungu_code}</code> {value.sido_name} {value.sigungu_name}
        </p>
      )}
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-auto bg-white border border-stone-300 rounded-lg shadow-lg">
          {loading ? (
            <div className="p-3 text-xs text-stone-500">시군구 마스터 로딩 중…</div>
          ) : err ? (
            <div className="p-3 text-xs text-rose-700 bg-rose-50">{err}</div>
          ) : filtered.length === 0 ? (
            <div className="p-3 text-xs text-stone-500">
              일치하는 결과가 없습니다.
              <br />
              운영자가 regions 마스터에 추가하지 않은 지역일 수 있어요.
              아래의 「시도」 「시군구」 「시군구 코드」 필드에 직접 입력해도 됩니다.
            </div>
          ) : (
            <ul ref={listRef} className="py-1">
              {filtered.map((r, i) => (
                <li
                  key={r.sigungu_code}
                  className={`px-3 py-2 text-sm cursor-pointer ${
                    i === highlighted ? "bg-brand-100" : "hover:bg-stone-50"
                  }`}
                  onMouseEnter={() => setHighlighted(i)}
                  onMouseDown={(e) => {
                    // input blur 가 먼저 일어나지 않도록 mousedown 에서 처리
                    e.preventDefault();
                    select(r);
                  }}
                >
                  <span className="font-mono text-brand-700">{r.sigungu_code}</span>
                  <span className="ml-2 text-stone-800">
                    {r.sido_name} {r.sigungu_name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
