"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { db } from "@/lib/db/dexie";
import type { Species } from "@/types/db";

interface Props {
  value: string | null;
  onChange: (code: string | null) => void;
}

const CACHE_KEY = "species_cache_v1";

export function SpeciesPicker({ value, onChange }: Props) {
  const [list, setList] = useState<Species[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      // 우선 localStorage 캐시에서
      const cached = typeof window !== "undefined" ? localStorage.getItem(CACHE_KEY) : null;
      if (cached) {
        try { setList(JSON.parse(cached) as Species[]); } catch {}
      }
      if (!navigator.onLine) return;
      try {
        const sb = getSupabaseBrowser();
        const { data } = await sb.from("species").select("code, ko_name, sci_name, family, active").eq("active", true).order("ko_name");
        if (data) {
          setList(data as Species[]);
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        }
      } catch {}
    })();
  }, []);

  const filtered = useMemo(() => {
    const Q = q.trim().toLowerCase();
    if (!Q) return list.slice(0, 60);
    return list.filter(
      (s) =>
        s.ko_name.toLowerCase().includes(Q) ||
        (s.sci_name ?? "").toLowerCase().includes(Q) ||
        s.code.toLowerCase().includes(Q),
    ).slice(0, 60);
  }, [list, q]);

  const selected = list.find((s) => s.code === value);

  return (
    <div>
      <span className="field-label">국명 / 수종</span>
      {selected ? (
        <div className="flex items-center justify-between rounded-md border border-stone-300 bg-white px-3 py-2 mt-1">
          <div>
            <div className="font-semibold">{selected.ko_name}</div>
            <div className="text-xs text-stone-500 italic">{selected.sci_name}</div>
          </div>
          <button type="button" className="text-xs text-rose-600" onClick={() => onChange(null)}>
            변경
          </button>
        </div>
      ) : (
        <>
          <input
            className="field-value"
            placeholder="예: 팽나무, 상수리"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {filtered.length > 0 && (
            <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border border-stone-200 bg-white text-sm">
              {filtered.map((s) => (
                <li key={s.code}>
                  <button
                    type="button"
                    onClick={() => { onChange(s.code); setQ(""); }}
                    className="w-full text-left px-3 py-2 hover:bg-brand-50"
                  >
                    <span className="font-semibold">{s.ko_name}</span>
                    <span className="ml-2 text-xs text-stone-500 italic">{s.sci_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
