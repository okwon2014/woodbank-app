// 큐 조작 헬퍼
import { db, type PhotoPending, type QueueRow } from "./dexie";
import type { SamplingEvent, Tree, Site, PhotoCategory } from "@/types/db";

// 자동 재시도 정책: 실패 후 지수 백오프, 5회 시도 후 자동 재시도 중단.
// 그 이후엔 사용자가 /queue에서 "재시도" 또는 "삭제"로 처리.
export const MAX_RETRIES = 5;
const RETRY_BACKOFF_MS = [30_000, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

export function isAbandoned(row: Pick<QueueRow, "retries">): boolean {
  return (row.retries ?? 0) >= MAX_RETRIES;
}

export function isWaiting(row: Pick<QueueRow, "next_retry_at">): boolean {
  return !!row.next_retry_at && new Date(row.next_retry_at).getTime() > Date.now();
}

function backoffNextRetryAt(retries: number): string {
  const idx = Math.min(retries - 1, RETRY_BACKOFF_MS.length - 1);
  return new Date(Date.now() + RETRY_BACKOFF_MS[idx]).toISOString();
}

export async function enqueueEvent(args: {
  event: SamplingEvent;
  tree?: Tree;
  site?: Site;
}) {
  const { event, tree, site } = args;
  await db().transaction("rw", db().sampling_events, db().sync_queue, db().trees, db().sites, async () => {
    if (site) await db().sites.put(site);
    if (tree) await db().trees.put(tree);
    await db().sampling_events.put({ ...event, sync_status: "queued" });
    await db().sync_queue.add({
      kind: "sampling_event",
      payload_id: event.id,
      payload: { kind: "sampling_event", event, tree, site },
      retries: 0,
      last_error: null,
      queued_at: new Date().toISOString(),
    } as QueueRow);
  });
}

export async function enqueuePhoto(p: PhotoPending) {
  await db().transaction("rw", db().photos_pending, db().sync_queue, async () => {
    await db().photos_pending.put(p);
    await db().sync_queue.add({
      kind: "photo",
      payload_id: p.id,
      payload: {
        kind: "photo",
        meta: {
          id: p.id,
          event_id: p.event_id,
          category: p.category,
          original_filename: p.filename,
          width: p.width,
          height: p.height,
          bytes: p.bytes,
          exif_taken_at: p.exif_taken_at,
          exif_lat: p.exif_lat,
          exif_lon: p.exif_lon,
          sha256: p.sha256,
          uploaded_by: null,
        },
      },
      retries: 0,
      last_error: null,
      queued_at: new Date().toISOString(),
    } as QueueRow);
  });
}

export async function listQueue(): Promise<QueueRow[]> {
  return db().sync_queue.orderBy("seq").toArray();
}

export async function markSynced(seq: number, opts: { kind: "sampling_event" | "photo"; payload_id: string }) {
  await db().transaction("rw", db().sync_queue, db().photos_pending, db().sampling_events, async () => {
    await db().sync_queue.delete(seq);
    if (opts.kind === "sampling_event") {
      const e = await db().sampling_events.get(opts.payload_id);
      if (e) await db().sampling_events.put({ ...e, sync_status: "synced" });
    } else {
      await db().photos_pending.delete(opts.payload_id);
    }
  });
}

export async function markFailed(seq: number, err: string) {
  const row = await db().sync_queue.get(seq);
  if (!row) return;
  const retries = (row.retries ?? 0) + 1;
  const next_retry_at = retries >= MAX_RETRIES ? null : backoffNextRetryAt(retries);
  await db().sync_queue.update(seq, {
    retries,
    last_error: err,
    next_retry_at,
  });
}

// 사용자가 수동으로 재시도(또는 자동 재시도 중단을 해제)할 때.
// retries는 보존(원인 추적용)하고 next_retry_at만 초기화한다.
// 충돌(retries=MAX, last_error CONFLICT:) 항목은 retries도 한 단계 내려 자동 재시도를 다시 허용한다.
export async function retryNow(seq: number) {
  const row = await db().sync_queue.get(seq);
  if (!row) return;
  const patch: Partial<QueueRow> = { next_retry_at: null };
  if ((row.retries ?? 0) >= MAX_RETRIES) {
    patch.retries = MAX_RETRIES - 1;
  }
  await db().sync_queue.update(seq, patch);
  if (row.kind === "sampling_event") {
    const e = await db().sampling_events.get(row.payload_id);
    if (e && e.sync_status === "conflict") {
      await db().sampling_events.put({ ...e, sync_status: "queued" });
    }
  }
}

// 서버 측 제약(unique 등)으로 동일 페이로드를 계속 보내봐야 실패만 누적되는 경우.
// retries를 MAX로 점프해 자동 재시도를 즉시 중단하고, last_error에 CONFLICT 프리픽스를 단다.
// sampling_event는 sync_status='conflict'로 표시되어 PendingEvents 배너에서도 보인다.
export async function markConflict(seq: number, err: string) {
  const row = await db().sync_queue.get(seq);
  if (!row) return;
  await db().transaction("rw", db().sync_queue, db().sampling_events, async () => {
    await db().sync_queue.update(seq, {
      retries: MAX_RETRIES,
      last_error: err.startsWith("CONFLICT:") ? err : `CONFLICT: ${err}`,
      next_retry_at: null,
    });
    if (row.kind === "sampling_event") {
      const e = await db().sampling_events.get(row.payload_id);
      if (e) await db().sampling_events.put({ ...e, sync_status: "conflict" });
    }
  });
}

// last_error의 CONFLICT: 프리픽스로 충돌 여부 판정.
export function isConflict(row: Pick<QueueRow, "last_error">): boolean {
  return !!row.last_error && row.last_error.startsWith("CONFLICT:");
}

// Supabase/PostgREST 에러에서 "충돌"로 분류할 코드.
// 같은 페이로드를 재시도해도 결과가 같을 영구 실패 — 자동 재시도를 즉시 중단.
//   23505 = unique_violation     (예: sample_no 중복)
//   23514 = check_violation      (예: 값 범위 위반)
//   23503 = foreign_key_violation (예: 사진의 event_id 가 서버에 없음 — 야장이 삭제됐거나 동기화 안 됨)
export function isConflictError(e: any): boolean {
  const code = e?.code ?? e?.details?.code;
  return code === "23505" || code === "23514" || code === "23503";
}

// 자동 재시도가 중단된 항목(또는 사용자가 포기한 항목)을 영구 삭제.
// 사진의 경우 photos_pending의 Blob도 함께 정리한다.
export async function abandonQueueItem(seq: number) {
  const row = await db().sync_queue.get(seq);
  if (!row) return;
  await db().transaction("rw", db().sync_queue, db().photos_pending, db().sampling_events, async () => {
    await db().sync_queue.delete(seq);
    if (row.kind === "photo") {
      await db().photos_pending.delete(row.payload_id);
    }
    // sampling_event 본문은 보존(사용자 원본 데이터). sync_status만 표시 변경.
    if (row.kind === "sampling_event") {
      const e = await db().sampling_events.get(row.payload_id);
      if (e) await db().sampling_events.put({ ...e, sync_status: "draft" });
    }
  });
}

export async function countPending(): Promise<number> {
  return db().sync_queue.count();
}

export function blankPhotoPending(args: {
  id: string;
  event_id: string;
  category: PhotoCategory;
  blob: Blob;
  filename: string;
  sha256: string | null;
  width: number | null;
  height: number | null;
  exif_taken_at: string | null;
  exif_lat: number | null;
  exif_lon: number | null;
}): PhotoPending {
  return {
    ...args,
    bytes: args.blob.size,
    retries: 0,
    last_error: null,
    queued_at: new Date().toISOString(),
  };
}
