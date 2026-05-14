"use client";

import { useEffect, useState } from "react";
import {
  abandonQueueItem,
  isAbandoned,
  isWaiting,
  listQueue,
  MAX_RETRIES,
  retryNow,
} from "@/lib/db/queue";
import { syncOnce } from "@/lib/sync/worker";
import type { QueueRow } from "@/lib/db/dexie";

export default function QueuePage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [syncing, setSyncing] = useState(false);

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

  async function handleAbandon(seq: number, kind: QueueRow["kind"]) {
    const msg =
      kind === "photo"
        ? "이 사진을 큐에서 영구 삭제합니다. 단말의 사진 데이터(blob)도 함께 사라집니다. 계속할까요?"
        : "이 야장을 동기화 큐에서 빼고 'draft'로 되돌립니다. 본문은 단말에 남습니다. 계속할까요?";
    if (!confirm(msg)) return;
    await abandonQueueItem(seq);
    await refresh();
  }

  const abandonedCount = rows.filter((r) => isAbandoned(r)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">동기화 대기열</h1>
        <button onClick={runSync} disabled={syncing} className="btn-primary">
          {syncing ? "동기화 중…" : "지금 동기화"}
        </button>
      </div>

      {abandonedCount > 0 && (
        <p className="text-xs rounded-lg bg-rose-50 border border-rose-200 text-rose-800 p-2">
          ⚠️ {MAX_RETRIES}회 연속 실패로 자동 재시도가 중단된 항목 {abandonedCount}건이 있습니다.
          원인을 확인한 뒤 [재시도] 또는 [큐에서 제거]를 눌러주세요.
        </p>
      )}

      {rows.length === 0 && (
        <p className="text-stone-500 text-sm">대기 중인 항목이 없습니다. 모든 데이터가 서버와 동기화되었습니다.</p>
      )}
      <ul className="space-y-2">
        {rows.map((r) => {
          const abandoned = isAbandoned(r);
          const waiting = !abandoned && isWaiting(r);
          return (
            <li key={r.seq} className="card">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold flex items-center gap-2">
                    <span>{r.kind === "sampling_event" ? "📝 채취 이벤트" : "🖼 사진 업로드"}</span>
                    {abandoned && (
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
