"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { DnaResult } from "@/types/db";

interface ResultRow extends DnaResult {
  signedUrl?: string | null;
}

interface Props {
  eventId: string;
  canWrite: boolean;
}

export function DnaResultManager({ eventId, canWrite }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // 폼 상태
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    analysis_type: "",
    identification_result: "",
    similarity_score: "",
    analyst: "",
    analyzed_at: "",
    notes: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const sb = getSupabaseBrowser();
      const { data, error } = await sb
        .from("dna_results")
        .select("*")
        .eq("event_id", eventId)
        .order("analyzed_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

      // 첨부 파일은 짧은 서명 URL(15분)로 발급
      const withUrls = await Promise.all(
        ((data as DnaResult[]) ?? []).map(async (r) => {
          if (!r.file_storage_path) return r as ResultRow;
          const { data: signed } = await sb.storage
            .from("dna")
            .createSignedUrl(r.file_storage_path, 900);
          return { ...r, signedUrl: signed?.signedUrl ?? null } as ResultRow;
        }),
      );
      setRows(withUrls);
    } catch (e: any) {
      setErr(e?.message ?? "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const sb = getSupabaseBrowser();

      // 1) 결과 row 삽입
      const payload: Partial<DnaResult> = {
        event_id: eventId,
        analysis_type: form.analysis_type.trim() || null,
        identification_result: form.identification_result.trim() || null,
        similarity_score: form.similarity_score ? Number(form.similarity_score) : null,
        analyst: form.analyst.trim() || null,
        analyzed_at: form.analyzed_at || null,
        notes: form.notes.trim() || null,
      };
      const { data: inserted, error: insErr } = await sb
        .from("dna_results")
        .insert(payload)
        .select("id")
        .single();
      if (insErr) throw insErr;

      // 2) 파일 첨부(선택)
      if (file && inserted?.id) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `${eventId}/${inserted.id}.${ext}`;
        const { error: upErr } = await sb.storage
          .from("dna")
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;
        const { error: updErr } = await sb
          .from("dna_results")
          .update({
            file_storage_path: path,
            file_original_name: file.name,
            file_bytes: file.size,
          })
          .eq("id", inserted.id);
        if (updErr) throw updErr;
      }

      setForm({
        analysis_type: "",
        identification_result: "",
        similarity_score: "",
        analyst: "",
        analyzed_at: "",
        notes: "",
      });
      setFile(null);
      setShowForm(false);
      await refresh();
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "등록 실패");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, storagePath: string | null) {
    if (!confirm("이 분석 결과를 삭제할까요? (첨부 파일도 함께 삭제)")) return;
    setBusy(true);
    try {
      const sb = getSupabaseBrowser();
      if (storagePath) {
        await sb.storage.from("dna").remove([storagePath]);
      }
      const { error } = await sb.from("dna_results").delete().eq("id", id);
      if (error) throw error;
      await refresh();
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-brand-700">DNA 분석 결과</h2>
        {canWrite && (
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => setShowForm((v) => !v)}
          >
            {showForm ? "취소" : "+ 결과 추가"}
          </button>
        )}
      </div>

      {err && <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded">{err}</p>}

      {loading ? (
        <p className="text-xs text-stone-500">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-stone-500">등록된 DNA 분석 결과가 없습니다.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-lg border border-stone-200 p-3 space-y-1">
              <div className="flex justify-between gap-3">
                <div className="text-sm">
                  <div className="font-semibold">
                    {r.identification_result ?? "(식별 결과 미입력)"}
                    {r.similarity_score != null && (
                      <span className="text-stone-500 text-xs ml-2">유사도 {r.similarity_score}%</span>
                    )}
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    {r.analysis_type ?? "-"} · {r.analyzed_at ?? "-"}
                    {r.analyst && <> · {r.analyst}</>}
                  </div>
                </div>
                {canWrite && (
                  <button
                    type="button"
                    className="text-xs text-rose-600 hover:underline shrink-0"
                    onClick={() => remove(r.id, r.file_storage_path)}
                    disabled={busy}
                  >
                    삭제
                  </button>
                )}
              </div>
              {r.notes && <p className="text-xs text-stone-700 whitespace-pre-wrap">{r.notes}</p>}
              {r.signedUrl && (
                <a
                  href={r.signedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-brand-700 hover:underline"
                >
                  📎 {r.file_original_name ?? "첨부 파일"}
                  {r.file_bytes != null && (
                    <span className="text-stone-400 ml-1">({(r.file_bytes / 1024).toFixed(0)} KB)</span>
                  )}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && showForm && (
        <form onSubmit={submit} className="space-y-2 border-t border-stone-200 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="field-label">분석 마커</span>
              <input
                className="field-value"
                value={form.analysis_type}
                onChange={(e) => setForm({ ...form, analysis_type: e.target.value })}
                placeholder="ITS / rbcL / trnL / matK 등"
              />
            </div>
            <div>
              <span className="field-label">분석일</span>
              <input
                type="date"
                className="field-value"
                value={form.analyzed_at}
                onChange={(e) => setForm({ ...form, analyzed_at: e.target.value })}
              />
            </div>
          </div>
          <div>
            <span className="field-label">식별 결과</span>
            <input
              className="field-value"
              value={form.identification_result}
              onChange={(e) => setForm({ ...form, identification_result: e.target.value })}
              placeholder="예: Quercus variabilis"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="field-label">유사도(%)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                inputMode="decimal"
                className="field-value"
                value={form.similarity_score}
                onChange={(e) => setForm({ ...form, similarity_score: e.target.value })}
                placeholder="99.5"
              />
            </div>
            <div>
              <span className="field-label">분석 책임자/기관</span>
              <input
                className="field-value"
                value={form.analyst}
                onChange={(e) => setForm({ ...form, analyst: e.target.value })}
              />
            </div>
          </div>
          <div>
            <span className="field-label">메모</span>
            <textarea
              className="field-value min-h-[60px]"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div>
            <span className="field-label">첨부 파일 (PDF·Excel·CSV·텍스트 등)</span>
            <input
              type="file"
              className="text-xs"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="text-xs text-stone-500 mt-1">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>
            )}
          </div>
          <button type="submit" disabled={busy} className="btn-primary text-sm">
            {busy ? "저장 중…" : "결과 등록"}
          </button>
        </form>
      )}
    </section>
  );
}
