"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { db } from "@/lib/db/dexie";
import { syncOnce } from "@/lib/sync/worker";
import type { SamplingEvent } from "@/types/db";

export function PendingEvents() {
  const [pending, setPending] = useState<SamplingEvent[]>([]);
  const [syncing, setSyncing] = useState(false);

  async function refresh() {
    if (typeof window === "undefined") return;
    try {
      // queued/conflict만 표시. draft(사용자가 큐에서 명시적으로 뺀 항목)·synced는 제외.
      const list = await db().sampling_events
        .where("sync_status").anyOf("queued", "conflict").toArray();
      setPending(list);
    } catch {
      // Dexie 미초기화·SSR 등의 경우 무시
    }
  }

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, []);

  async function runSync() {
    setSyncing(true);
    try {
      await syncOnce();
      await refresh();
    } finally {
      setSyncing(false);
    }
  }

  if (pending.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-amber-900">
          🕓 동기화 대기 중인 야장 ({pending.length}건)
        </div>
        <button onClick={runSync} disabled={syncing}
          className="text-xs px-3 py-1 rounded bg-amber-700 text-white disabled:opacity-50">
          {syncing ? "동기화 중…" : "지금 동기화"}
        </button>
      </div>
      <ul className="divide-y divide-amber-200 bg-white/60 rounded-lg overflow-hidden">
        {pending.map((e) => (
          <li key={e.id} className="px-3 py-2 text-sm flex items-center justify-between">
            <div>
              <div className="font-semibold">{e.sample_no}</div>
              <div className="text-xs text-stone-500">
                {new Date(e.sampled_at).toLocaleDateString("ko-KR")} · {e.sync_status}
              </div>
            </div>
            <Link href={`/queue`} className="text-xs text-amber-800 underline">
              큐 보기 →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
