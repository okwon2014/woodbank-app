// 오프라인 영속 저장 (IndexedDB via Dexie)
import Dexie, { type Table } from "dexie";
import type {
  Site,
  Tree,
  SamplingEvent,
  PhotoMeta,
  QueueItem,
} from "@/types/db";

export interface PhotoPending {
  id: string; // photos.id 와 동일
  event_id: string;
  category: PhotoMeta["category"];
  blob: Blob;
  bytes: number;
  sha256: string | null;
  filename: string;
  width: number | null;
  height: number | null;
  exif_taken_at: string | null;
  exif_lat: number | null;
  exif_lon: number | null;
  retries: number;
  last_error: string | null;
  queued_at: string;
}

export interface QueueRow {
  seq?: number;       // auto-increment
  kind: QueueItem["kind"];
  payload_id: string; // 대응 SamplingEvent.id or PhotoMeta.id
  payload: QueueItem;
  retries: number;
  last_error: string | null;
  queued_at: string;
}

class WoodbankDB extends Dexie {
  sites!: Table<Site, string>;
  trees!: Table<Tree, string>;
  sampling_events!: Table<SamplingEvent, string>;
  photos_pending!: Table<PhotoPending, string>;
  sync_queue!: Table<QueueRow, number>;

  constructor() {
    super("woodbank");
    this.version(1).stores({
      sites: "id, code, region_sigungu_code",
      trees: "id, site_id, species_code",
      sampling_events: "id, tree_id, sample_no, sampled_at, sync_status",
      photos_pending: "id, event_id, category",
      sync_queue: "++seq, kind, payload_id, retries, queued_at",
    });
  }
}

let _db: WoodbankDB | null = null;
export function db() {
  if (typeof window === "undefined") {
    throw new Error("Dexie DB is browser-only.");
  }
  if (!_db) _db = new WoodbankDB();
  return _db;
}
