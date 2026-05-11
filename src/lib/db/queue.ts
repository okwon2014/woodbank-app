// 큐 조작 헬퍼
import { db, type PhotoPending, type QueueRow } from "./dexie";
import type { SamplingEvent, Tree, Site, PhotoCategory } from "@/types/db";

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
  await db().sync_queue.update(seq, {
    retries: (row.retries ?? 0) + 1,
    last_error: err,
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
