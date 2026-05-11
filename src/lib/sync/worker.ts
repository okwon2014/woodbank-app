// 백그라운드 동기화 — online 이벤트 + 주기 타이머에서 실행.
"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { db } from "@/lib/db/dexie";
import { markFailed, markSynced } from "@/lib/db/queue";
import type { QueueItem } from "@/types/db";

let _running = false;

export async function syncOnce(opts: { onProgress?: (msg: string) => void } = {}) {
  if (_running) return { ran: false, reason: "already-running" };
  _running = true;
  const log = opts.onProgress ?? (() => {});

  try {
    const sb = getSupabaseBrowser();
    const rows = await db().sync_queue.orderBy("seq").toArray();
    if (rows.length === 0) {
      log("동기화할 항목이 없습니다.");
      return { ran: true, processed: 0 };
    }

    let ok = 0;
    let fail = 0;
    for (const row of rows) {
      const payload = row.payload as QueueItem;
      try {
        if (payload.kind === "sampling_event") {
          // 1) site / tree 가 같이 있으면 먼저 upsert
          if (payload.site) {
            const { error: se } = await sb.from("sites").upsert(payload.site);
            if (se) throw se;
          }
          if (payload.tree) {
            const { error: te } = await sb.from("trees").upsert(payload.tree);
            if (te) throw te;
          }
          const { error } = await sb.from("sampling_events").upsert(payload.event);
          if (error) throw error;
          await markSynced(row.seq!, { kind: "sampling_event", payload_id: payload.event.id });
          ok++;
          log(`이벤트 ${payload.event.sample_no} 동기화 완료`);
        } else if (payload.kind === "photo") {
          const pending = await db().photos_pending.get(payload.meta.id);
          if (!pending) {
            await markSynced(row.seq!, { kind: "photo", payload_id: payload.meta.id });
            continue;
          }
          const path = `events/${pending.event_id}/${pending.id}.jpg`;
          const { error: upErr } = await sb.storage
            .from("photos")
            .upload(path, pending.blob, {
              contentType: "image/jpeg",
              upsert: false,
            });
          if (upErr && !/already exists/i.test(upErr.message)) throw upErr;

          const meta = {
            ...payload.meta,
            storage_path: path,
          };
          const { error: mErr } = await sb.from("photos").upsert(meta);
          if (mErr) throw mErr;

          await markSynced(row.seq!, { kind: "photo", payload_id: pending.id });
          ok++;
          log(`사진 ${pending.filename} 업로드 완료`);
        }
      } catch (e: any) {
        fail++;
        const msg = e?.message || String(e);
        await markFailed(row.seq!, msg);
        log(`실패: ${msg}`);
      }
    }
    return { ran: true, processed: ok + fail, ok, fail };
  } finally {
    _running = false;
  }
}

// 페이지 로드 시 자동 등록 (React 컴포넌트의 useEffect 에서 호출)
export function installAutoSync() {
  if (typeof window === "undefined") return;
  const fire = () => syncOnce().catch(() => {});
  window.addEventListener("online", fire);
  // 5분 주기
  const t = window.setInterval(fire, 5 * 60 * 1000);
  // 초기 시도
  if (navigator.onLine) setTimeout(fire, 1500);
  return () => {
    window.removeEventListener("online", fire);
    window.clearInterval(t);
  };
}
