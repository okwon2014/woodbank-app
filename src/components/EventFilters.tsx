"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface Option { value: string; label: string }

interface Props {
  species: Option[];
  regions: Option[];
  specimenTypes: Option[];
  storageLocations: Option[];
}

export function EventFilters({ species, regions, specimenTypes, storageLocations }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [sp, setSp] = useState(params.get("species") ?? "");
  const [rg, setRg] = useState(params.get("sigungu") ?? "");
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [st, setSt] = useState(params.get("specimen_type") ?? "");
  const [stor, setStor] = useState(params.get("storage") ?? "");

  // URL → state 동기화 (뒤로가기 등)
  useEffect(() => {
    setQ(params.get("q") ?? "");
    setSp(params.get("species") ?? "");
    setRg(params.get("sigungu") ?? "");
    setFrom(params.get("from") ?? "");
    setTo(params.get("to") ?? "");
    setSt(params.get("specimen_type") ?? "");
    setStor(params.get("storage") ?? "");
  }, [params]);

  function apply(e?: React.FormEvent) {
    e?.preventDefault();
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (sp) p.set("species", sp);
    if (rg) p.set("sigungu", rg);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (st) p.set("specimen_type", st);
    if (stor) p.set("storage", stor);
    router.push(`/events${p.toString() ? `?${p}` : ""}`);
  }

  function reset() {
    setQ(""); setSp(""); setRg(""); setFrom(""); setTo(""); setSt(""); setStor("");
    router.push("/events");
  }

  return (
    <form onSubmit={apply} className="card space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <span className="field-label">수종 (일반명 / 학명 / 코드)</span>
          <select className="field-value" value={sp} onChange={(e) => setSp(e.target.value)}>
            <option value="">전체</option>
            {species.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">시군구</span>
          <select className="field-value" value={rg} onChange={(e) => setRg(e.target.value)}>
            <option value="">전체</option>
            {regions.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">검색어 (채취번호·메모)</span>
          <input className="field-value" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="2025_담양 / 특기사항 키워드" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <span className="field-label">시편 종류</span>
          <select className="field-value" value={st} onChange={(e) => setSt(e.target.value)}>
            <option value="">전체</option>
            {specimenTypes.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">보관 위치</span>
          <select className="field-value" value={stor} onChange={(e) => setStor(e.target.value)}>
            <option value="">전체</option>
            {storageLocations.length === 0 && (
              <option value="" disabled>(아직 보관 위치가 등록된 시편이 없습니다)</option>
            )}
            {storageLocations.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div></div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <span className="field-label">채취일 시작</span>
          <input type="date" className="field-value" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <span className="field-label">채취일 종료</span>
          <input type="date" className="field-value" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary flex-1">적용</button>
          <button type="button" className="btn-secondary" onClick={reset}>초기화</button>
        </div>
      </div>
    </form>
  );
}
