// 백그라운드 동기화 — online 이벤트 + 주기 타이머에서 실행.
"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import { db } from "@/lib/db/dexie";
import {
  isAbandoned,
  isConflictError,
  isWaiting,
  markConflict,
  markFailed,
  markSynced,
} from "@/lib/db/queue";
import { remapToServerIds } from "./remap";
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
    let skipped = 0;
    for (const row of rows) {
      // 자동 재시도가 중단됐거나(retries >= MAX) 백오프 대기 중이면 건너뛴다.
      // 사용자가 /queue 에서 명시적으로 재시도해야 다시 시도된다.
      if (isAbandoned(row) || isWaiting(row)) {
        skipped++;
        continue;
      }
      const payload = row.payload as QueueItem;
      try {
        if (payload.kind === "sampling_event") {
          // 글로벌 마스터 정책: sites.code 는 unique, 같은 코드는 모두가 공유하는 한 사이트로 본다.
          // EventForm 은 매번 새 site/tree uuid 를 발급하기 때문에, 다른 단말이 같은 code 의 site 를
          // 이미 등록했다면 그 server uuid 를 차용해야 한다. 그러지 않으면 다음 단계에서
          // sites_code_key (unique on code) 위반(23505)으로 동기화가 영원히 막힌다.
          //
          // 검색→매핑→upsert 순서:
          //   (a) select id from sites where code = ?  → serverSiteId
          //   (b) select id from trees where site_id=? and tree_local_no=?  → serverTreeId
          //   (c) remapToServerIds 로 payload(site, tree, event) 전체에서 일관되게 id 매핑
          //   (d) upsert 그대로 진행
          //
          // event.id 는 절대 바꾸지 않는다(사진의 event_id FK + markSynced 일관성).
          let serverSiteId: string | null = null;
          if (payload.site) {
            const { data: foundSite, error: sLookupErr } = await sb
              .from("sites")
              .select("id")
              .eq("code", payload.site.code)
              .maybeSingle();
            if (sLookupErr) throw sLookupErr;
            if (foundSite?.id) serverSiteId = foundSite.id as string;
          }
          // tree 의 lookup 은 site_id 가 server 와 일치해야 의미가 있으므로
          // site remap 결과를 기준으로 한 번 더 계산
          const remappedSiteId = serverSiteId ?? payload.site?.id ?? payload.tree?.site_id;
          let serverTreeId: string | null = null;
          if (payload.tree && remappedSiteId) {
            const { data: foundTree, error: tLookupErr } = await sb
              .from("trees")
              .select("id")
              .eq("site_id", remappedSiteId)
              .eq("tree_local_no", payload.tree.tree_local_no)
              .maybeSingle();
            if (tLookupErr) throw tLookupErr;
            if (foundTree?.id) serverTreeId = foundTree.id as string;
          }
          const remapped = remapToServerIds({
            site: payload.site,
            tree: payload.tree,
            event: payload.event,
            serverSiteId,
            serverTreeId,
          });
          if (remapped.site) {
            const { error: se } = await sb.from("sites").upsert(remapped.site);
            if (se) throw se;
          }
          if (remapped.tree) {
            const { error: te } = await sb.from("trees").upsert(remapped.tree);
            if (te) throw te;
          }
          // sync_status 는 단말 내부 상태(queued/draft/conflict)라 서버로 보낼 때는
          // 항상 'synced' 로 강제한다. 그러지 않으면 클라이언트에서 enqueue 시 찍힌
          // 'queued' 값이 서버에 그대로 저장되어 목록에서 영원히 'queued' 로 보인다.
          const eventForServer = { ...remapped.event, sync_status: "synced" as const };
          const { error } = await sb.from("sampling_events").upsert(eventForServer);
          if (error) throw error;
          // markSynced 의 payload_id 는 항상 단말 측 event.id 그대로 (remap 으로 안 바뀜).
          await markSynced(row.seq!, { kind: "sampling_event", payload_id: payload.event.id });
          ok++;
          const remapNote = remapped.siteRemapped || remapped.treeRemapped
            ? ` (site=${remapped.siteRemapped ? "remap" : "new"}, tree=${remapped.treeRemapped ? "remap" : "new"})`
            : "";
          log(`이벤트 ${payload.event.sample_no} 동기화 완료${remapNote}`);
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
        if (isConflictError(e)) {
          // 같은 페이로드를 재시도해도 동일 실패가 반복될 케이스(예: sample_no 중복).
          // 자동 재시도를 즉시 중단하고 사용자가 /queue에서 결정하도록 한다.
          await markConflict(row.seq!, msg);
          log(`충돌: ${msg}`);
        } else {
          await markFailed(row.seq!, msg);
          log(`실패: ${msg}`);
        }
      }
    }
    return { ran: true, processed: ok + fail, ok, fail, skipped };
  } finally {
    _running = false;
  }
}

// 페이지 로드 시 자동 등록 (React 컴포넌트의 useEffect 에서 호출)
export function installAutoSync() {
  if (typeof window === "undefined") return;
  const fire = () => syncOnce().catch(() => {});
  window.addEventListener("online", fire);
  // SW 의 Background Sync 가 깨운 알림
  window.addEventListener("woodbank:sync-now", fire as EventListener);
  // 페이지가 포그라운드로 돌아올 때 한 번 시도
  const onVis = () => {
    if (document.visibilityState === "visible" && navigator.onLine) fire();
  };
  document.addEventListener("visibilitychange", onVis);
  // 5분 주기
  const t = window.setInterval(fire, 5 * 60 * 1000);
  // 초기 시도
  if (navigator.onLine) setTimeout(fire, 1500);
  return () => {
    window.removeEventListener("online", fire);
    window.removeEventListener("woodbank:sync-now", fire as EventListener);
    document.removeEventListener("visibilitychange", onVis);
    window.clearInterval(t);
  };
}
