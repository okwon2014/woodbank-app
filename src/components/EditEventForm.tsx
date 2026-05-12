"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export interface EditableEventFields {
  id: string;
  sample_no: string;
  sampled_at: string;
  height_m: number | null;
  dbh_cm: number | null;
  dna_collected: boolean;
  dna_sample_code: string | null;
  notes: string | null;
}

interface Props {
  initial: EditableEventFields;
}

export function EditEventForm({ initial }: Props) {
  const router = useRouter();
  const [s, setS] = useState({
    sample_no: initial.sample_no,
    sampled_at: initial.sampled_at,
    height_m: initial.height_m,
    dbh_cm: initial.dbh_cm,
    dna_collected: initial.dna_collected,
    dna_sample_code: initial.dna_sample_code ?? "",
    notes: initial.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function up<K extends keyof typeof s>(k: K, v: typeof s[K]) {
    setS((prev) => ({ ...prev, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!s.sample_no.trim()) return setErr("채취 번호를 입력해주세요.");
    if (!s.sampled_at) return setErr("채취일을 입력해주세요.");
    if (s.height_m == null) return setErr("수고를 입력해주세요.");
    if (s.dbh_cm == null) return setErr("DBH를 입력해주세요.");

    setBusy(true);
    try {
      const sb = getSupabaseBrowser();
      const { error } = await sb
        .from("sampling_events")
        .update({
          sample_no: s.sample_no.trim(),
          sampled_at: s.sampled_at,
          height_m: s.height_m,
          dbh_cm: s.dbh_cm,
          dna_collected: s.dna_collected,
          dna_sample_code: s.dna_collected ? (s.dna_sample_code || null) : null,
          notes: s.notes || null,
        })
        .eq("id", initial.id);
      if (error) throw error;
      router.push(`/events/${initial.id}`);
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
        <h2 className="text-base font-bold text-brand-700">채취 기본 정보</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="field-label">채취 번호</span>
            <input className="field-value" value={s.sample_no}
              onChange={(e) => up("sample_no", e.target.value)} />
          </div>
          <div>
            <span className="field-label">채취일</span>
            <input type="date" className="field-value" value={s.sampled_at}
              onChange={(e) => up("sampled_at", e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="field-label">수고 (m)</span>
            <input
              type="number" step="0.1" inputMode="decimal"
              className="field-value" value={s.height_m ?? ""}
              onChange={(e) => up("height_m", e.target.value === "" ? null : parseFloat(e.target.value))}
            />
          </div>
          <div>
            <span className="field-label">DBH (cm)</span>
            <input
              type="number" step="0.1" inputMode="decimal"
              className="field-value" value={s.dbh_cm ?? ""}
              onChange={(e) => up("dbh_cm", e.target.value === "" ? null : parseFloat(e.target.value))}
            />
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-bold text-brand-700">DNA</h2>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={s.dna_collected}
            onChange={(e) => up("dna_collected", e.target.checked)} />
          <span className="text-sm">DNA 시료를 채취하였음</span>
        </label>
        {s.dna_collected && (
          <input className="field-value" value={s.dna_sample_code}
            onChange={(e) => up("dna_sample_code", e.target.value)}
            placeholder="DNA 라벨 (선택)" />
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-bold text-brand-700">특기사항</h2>
        <textarea className="field-value min-h-[100px]" value={s.notes}
          onChange={(e) => up("notes", e.target.value)} />
      </section>

      <p className="text-xs text-stone-500">
        ※ 위치·수종·사진 등은 이 화면에서 수정되지 않습니다. 수정이 필요하면 관리자에게 문의하세요.
      </p>

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
