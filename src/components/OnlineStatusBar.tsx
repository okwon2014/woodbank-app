"use client";

import { useEffect, useState } from "react";
import { installAutoSync, syncOnce } from "@/lib/sync/worker";
import { countPending } from "@/lib/db/queue";

export function OnlineStatusBar() {
  const [online, setOnline] = useState<boolean>(true);
  const [pending, setPending] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const stop = installAutoSync();
    const t = setInterval(() => {
      countPending().then(setPending).catch(() => {});
    }, 2500);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      if (stop) stop();
      clearInterval(t);
    };
  }, []);

  async function manualSync() {
    setSyncing(true);
    await syncOnce();
    setSyncing(false);
  }

  const cls = online
    ? pending > 0
      ? "bg-amber-100 text-amber-900"
      : "bg-emerald-100 text-emerald-900"
    : "bg-rose-100 text-rose-900";

  return (
    <div className={`text-xs px-3 py-1 flex items-center justify-between ${cls}`}>
      <span>
        {online ? "🟢 Online" : "🔴 Offline"}
        {pending > 0 && <> · 동기화 대기 <b>{pending}</b>건</>}
      </span>
      {pending > 0 && online && (
        <button onClick={manualSync} disabled={syncing} className="underline">
          {syncing ? "동기화 중…" : "지금 동기화"}
        </button>
      )}
    </div>
  );
}
