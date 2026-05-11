"use client";

import { useEffect, useState } from "react";
import { listQueue } from "@/lib/db/queue";
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">동기화 대기열</h1>
        <button onClick={runSync} disabled={syncing} className="btn-primary">
          {syncing ? "동기화 중…" : "지금 동기화"}
        </button>
      </div>
      {rows.length === 0 && (
        <p className="text-stone-500 text-sm">대기 중인 항목이 없습니다. 모든 데이터가 서버와 동기화되었습니다.</p>
      )}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.seq} className="card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">
                  {r.kind === "sampling_event" ? "📝 채취 이벤트" : "🖼 사진 업로드"}
                </div>
                <div className="text-xs text-stone-500 font-mono">{r.payload_id}</div>
              </div>
              <div className="text-right text-xs text-stone-500">
                <div>대기: {new Date(r.queued_at).toLocaleString("ko-KR")}</div>
                {r.retries > 0 && <div>재시도 {r.retries}회</div>}
              </div>
            </div>
            {r.last_error && (
              <p className="mt-2 text-xs text-rose-700 bg-rose-50 p-2 rounded">{r.last_error}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
