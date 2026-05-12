"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { SpeciesPicker } from "./SpeciesPicker";
import { GpsPicker } from "./GpsPicker";
import { ddToDms } from "@/lib/utils";
import type { TreeStatus } from "@/types/db";

interface EditableTree {
  id: string;
  tree_local_no: string;
  species_code: string | null;
  lat: number | null;
  lon: number | null;
  elevation_m: number | null;
  aspect_deg: number | null;
  status: TreeStatus;
  tag_id: string | null;
}

export function EditTreeForm({ initial }: { initial: EditableTree }) {
  const router = useRouter();
  const [s, setS] = useState({
    tree_local_no: initial.tree_local_no,
    species_code: initial.species_code,
    lat: initial.lat,
    lon: initial.lon,
    elevation_m: initial.elevation_m,
    aspect_deg: initial.aspect_deg,
    status: initial.status,
    tag_id: initial.tag_id ?? "",
  });
  const [gpsAcc, setGpsAcc] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function up<K extends keyof typeof s>(k: K, v: typeof s[K]) {
    setS((p) => ({ ...p, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!s.tree_local_no.trim()) return setErr("개체목 번호를 입력해주세요.");
    if (!s.species_code) return setErr("수종을 선택해주세요.");

    setBusy(true);
    try {
      const sb = getSupabaseBrowser();
      const { error } = await sb.from("trees").update({
        tree_local_no: s.tree_local_no.trim(),
        species_code: s.species_code,
        lat: s.lat,
        lon: s.lon,
        lat_dms: s.lat != null ? ddToDms(s.lat, true) : null,
        lon_dms: s.lon != null ? ddToDms(s.lon, false) : null,
        elevation_m: s.elevation_m,
        aspect_deg: s.aspect_deg,
        status: s.status,
        tag_id: s.tag_id || null,
      }).eq("id", initial.id);
      if (error) throw error;
      router.push(`/trees/${initial.id}`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "수정 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="card space-y-3">
        <h2 className="text-base font-bold text-brand-700">개체목 정보</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="field-label">개체목 번호</span>
            <input className="field-value" value={s.tree_local_no}
              onChange={(e) => up("tree_local_no", e.target.value)} />
          </div>
          <div>
            <span className="field-label">태그/표찰 ID (선택)</span>
            <input className="field-value" value={s.tag_id}
              onChange={(e) => up("tag_id", e.target.value)} />
          </div>
        </div>
        <SpeciesPicker
          value={s.species_code}
          onChange={(c) => up("species_code", c)}
        />
        <div>
          <span className="field-label">상태</span>
          <select className="field-value" value={s.status}
            onChange={(e) => up("status", e.target.value as TreeStatus)}>
            <option value="active">활성 (active)</option>
            <option value="lost">분실 (lost)</option>
            <option value="deceased">고사 (deceased)</option>
          </select>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-bold text-brand-700">위치</h2>
        <GpsPicker
          value={{ lat: s.lat, lon: s.lon, accuracy: gpsAcc }}
          onChange={(v) => { up("lat", v.lat); up("lon", v.lon); setGpsAcc(v.accuracy); }}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="field-label">해발고 (m)</span>
            <input type="number" inputMode="numeric" className="field-value"
              value={s.elevation_m ?? ""}
              onChange={(e) => up("elevation_m", e.target.value === "" ? null : parseInt(e.target.value, 10))} />
          </div>
          <div>
            <span className="field-label">방위 (0–359°)</span>
            <input type="number" inputMode="numeric" className="field-value"
              value={s.aspect_deg ?? ""}
              onChange={(e) => up("aspect_deg", e.target.value === "" ? null : parseInt(e.target.value, 10))} />
          </div>
        </div>
      </section>

      {err && <div className="rounded bg-rose-50 p-3 text-sm text-rose-800">{err}</div>}

      <div className="sticky bottom-2 z-10 flex gap-2 bg-stone-50/80 backdrop-blur p-2 rounded-lg">
        <button type="button" className="btn-secondary flex-1" onClick={() => router.back()}>
          취소
        </button>
        <button type="submit" disabled={busy} className="btn-primary flex-[2]">
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}
