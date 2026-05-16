"use client";

import { useEffect, useState } from "react";
import {
  abandonAllConflictsAndStopped,
  abandonQueueItem,
  clearAllQueue,
  isAbandoned,
  isConflict,
  isWaiting,
  listQueue,
  MAX_RETRIES,
  retryNow,
} from "@/lib/db/queue";
import { syncOnce } from "@/lib/sync/worker";
import type { QueueRow } from "@/lib/db/dexie";
import {
  buildQueueBackupZip,
  defaultBackupFilename,
  downloadBlob,
  type QueueBackupSummary,
} from "@/lib/db/export";

export default function QueuePage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<{ at: string; summary: QueueBackupSummary } | null>(null);
  const [exportErr, setExportErr] = useState<string | null>(null);

  async function refresh() {
    setRows(await listQueue());
  }
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 2500);
    return () => clearInterval(t);
  }, []);

  async function runSync() {
    setSyncing(true);
    await syncOnce();
    setSyncing(false);
    refresh();
  }

  async function handleRetry(seq: number) {
    await retryNow(seq);
    await refresh();
    // 즉시 한 번 시도
    runSync();
  }

  async function handleExport() {
    setExporting(true);
    setExportErr(null);
    try {
      const { blob, summary } = await buildQueueBackupZip();
      downloadBlob(blob, defaultBackupFilename());
      setLastExport({ at: new Date().toISOString(), summary });
    } catch (e: any) {
      setExportErr(e?.message ?? "백업 ZIP 생성 실패");
    } finally {
      setExporting(false);
    }
  }

  async function handleAbandon(seq: number, kind: QueueRow["kind"]) {
    const msg =
      kind === "photo"
        ? "이 사진을 큐에서 영구 삭제합니다. 단말의 사진 데이터(blob)도 함께 사라집니다. 계속할까요?"
        : "이 야장을 동기화 큐에서 빼고 'draft'로 되돌립니다. 본문은 단말에 남습니다. 계속할까요?";
    if (!confirm(msg)) return;
    await abandonQueueItem(seq);
    await refresh();
  }

  async function handleBulkAbandonStuck() {
    const targets = rows.filter((r) => isAbandoned(r) || isConflict(r));
    if (targets.length === 0) return;
    const photoCount = targets.filter((r) => r.kind === "photo").length;
    const eventCount = targets.length - photoCount;
    const msg =
      `자동 재시도가 중단됐거나 충돌 상태인 ${targets.length}건을 모두 큐에서 제거합니다.\n` +
      `- 사진 ${photoCount}건: 단말의 사진 데이터(blob) 도 함께 사라집니다.\n` +
      `- 야장 ${eventCount}건: 본문은 단말에 'draft' 로 남습니다.\n\n` +
      `필요하면 미리 「📦 백업 ZIP」 으로 받아두세요. 계속할까요?`;
    if (!confirm(msg)) return;
    await abandonAllConflictsAndStopped();
    await refresh();
  }

  async function handleClearAll() {
    if (rows.length === 0) return;
    const msg =
      `대기열의 모든 ${rows.length}건을 영구 삭제합니다(처리 중이 아닌 것까지 포함).\n` +
      `사진은 단말의 blob 까지 함께 사라지고, 야장 본문은 'draft' 로 남습니다.\n\n` +
      `이 작업은 되돌릴 수 없습니다. 미리 「📦 백업 ZIP」 으로 받아두는 것을 권장합니다.\n계속할까요?`;
    if (!confirm(msg)) return;
    // 한 번 더 확인 — 실수 방지
    if (!confirm(`정말로 대기열 ${rows.length}건을 모두 삭제할까요?`)) return;
    await clearAllQueue();
    await refresh();
  }

  const conflictCount = rows.filter((r) => isConflict(r)).length;
  const abandonedOnlyCount = rows.filter((r) => isAbandoned(r) && !isConflict(r)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold">동기화 대기열</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn-secondary text-sm"
            title="대기열의 야장·사진을 ZIP 한 파일로 저장. 서버 장애나 단말 교체 대비 백업용."
          >
            {exporting ? "생성 중…" : "📦 백업 ZIP"}
          </button>
          {rows.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-sm px-3 py-1.5 rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
              title="처리 중인 것까지 포함해 대기열 전체를 영구 삭제. 강한 확인 두 번 필요."
            >
              🗑 대기열 모두 비우기
            </button>
          )}
          <button onClick={runSync} disabled={syncing} className="btn-primary">
            {syncing ? "동기화 중…" : "지금 동기화"}
          </button>
        </div>
      </div>

      {lastExport && (
        <p className="text-xs rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 p-2">
          ✓ 백업 ZIP 생성 완료 ({new Date(lastExport.at).toLocaleTimeString("ko-KR")}) —
          야장 {lastExport.summary.sampling_events}건 · 사진 {lastExport.summary.photos}건 · 큐 {lastExport.summary.queue_items}건.
          파일은 다운로드 폴더에 저장됐습니다.
        </p>
      )}
      {exportErr && (
        <p className="text-xs rounded-lg bg-rose-50 border border-rose-200 text-rose-800 p-2 break-all">
          백업 실패: {exportErr}
        </p>
      )}
      <details className="text-xs text-stone-500">
        <summary className="cursor-pointer">📦 백업 ZIP 안내</summary>
        <div className="mt-2 space-y-1 pl-3">
          <p>현재 단말의 대기 중인 야장과 첨부 사진을 ZIP 한 파일로 묶어 다운로드합니다. 서버 장애·인터넷 단절·단말 교체에 대비한 보존용.</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li><code>queue.json</code> — 야장·사진 메타·큐 상태. JSON 들여쓰기. 텍스트 에디터·Excel·Python 등으로 그대로 읽힘.</li>
            <li><code>photos/&lt;event_id&gt;/&lt;photo_id&gt;.jpg</code> — 원본 JPEG (1600px·85% 또는 사용자가 선택한 품질).</li>
            <li><code>README.txt</code> — 파일 구조 설명.</li>
          </ul>
          <p>현재 버전은 자동 복구를 제공하지 않습니다. 데이터를 다시 올리려면 운영 책임자에게 ZIP 을 전달해주세요.</p>
        </div>
      </details>

      {conflictCount > 0 && (
        <div className="text-xs rounded-lg bg-rose-50 border border-rose-200 text-rose-800 p-2 space-y-1">
          <p>⛔ 서버 충돌로 자동 재시도가 중단된 항목 {conflictCount}건이 있습니다.</p>
          <p>흔한 원인:</p>
          <ul className="list-disc pl-5">
            <li><b>채취 번호 중복</b> — 같은 <code>sample_no</code> 가 이미 서버에 있음. 채취번호를 고쳐 새 야장으로 다시 저장 후 [큐에서 제거].</li>
            <li><b>사진의 야장이 서버에 없음</b> — 야장이 삭제됐거나 다른 단말에서 다른 ID 로 등록된 경우. 사진은 야장 상세에서 다시 첨부하시고 [큐에서 제거] (필요하면 「📦 백업 ZIP」 으로 먼저 받아두기).</li>
          </ul>
        </div>
      )}
      {abandonedOnlyCount > 0 && (
        <p className="text-xs rounded-lg bg-rose-50 border border-rose-200 text-rose-800 p-2">
          ⚠️ {MAX_RETRIES}회 연속 실패로 자동 재시도가 중단된 항목 {abandonedOnlyCount}건이 있습니다.
          원인을 확인한 뒤 [지금 재시도] 또는 [큐에서 제거]를 눌러주세요.
        </p>
      )}
      {(conflictCount > 0 || abandonedOnlyCount > 0) && (
        <div className="flex justify-end">
          <button
            onClick={handleBulkAbandonStuck}
            className="text-xs px-3 py-1.5 rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
          >
            🗑 충돌·중단 {conflictCount + abandonedOnlyCount}건 모두 제거
          </button>
        </div>
      )}

      {rows.length === 0 && (
        <p className="text-stone-500 text-sm">대기 중인 항목이 없습니다. 모든 데이터가 서버와 동기화되었습니다.</p>
      )}
      <ul className="space-y-2">
        {rows.map((r) => {
          const abandoned = isAbandoned(r);
          const conflict = isConflict(r);
          const waiting = !abandoned && isWaiting(r);
          return (
            <li key={r.seq} className="card">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <span>{r.kind === "sampling_event" ? "📝 채취 이벤트" : "🖼 사진 업로드"}</span>
                    {conflict && (
                      <span className="text-[10px] uppercase tracking-wide bg-rose-200 text-rose-800 px-1.5 py-0.5 rounded">
                        서버 충돌
                      </span>
                    )}
                    {abandoned && !conflict && (
                      <span className="text-[10px] uppercase tracking-wide bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">
                        자동 재시도 중단
                      </span>
                    )}
                    {waiting && (
                      <span className="text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                        대기 중
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-stone-500 font-mono truncate">{r.payload_id}</div>
                </div>
                <div className="text-right text-xs text-stone-500 shrink-0">
                  <div>대기: {new Date(r.queued_at).toLocaleString("ko-KR")}</div>
                  {r.retries > 0 && (
                    <div>
                      재시도 {r.retries}/{MAX_RETRIES}회
                    </div>
                  )}
                  {waiting && r.next_retry_at && (
                    <div>다음 시도: {new Date(r.next_retry_at).toLocaleTimeString("ko-KR")}</div>
                  )}
                </div>
              </div>
              {r.last_error && (
                <p className="mt-2 text-xs text-rose-700 bg-rose-50 p-2 rounded break-all">{r.last_error}</p>
              )}
              {(abandoned || waiting) && (
                <div className="mt-2 flex gap-2 justify-end">
                  <button
                    onClick={() => handleRetry(r.seq!)}
                    className="text-xs px-2 py-1 rounded bg-brand-700 text-white hover:bg-brand-500"
                  >
                    지금 재시도
                  </button>
                  {abandoned && (
                    <button
                      onClick={() => handleAbandon(r.seq!, r.kind)}
                      className="text-xs px-2 py-1 rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
                    >
                      큐에서 제거
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
