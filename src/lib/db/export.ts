// 동기화 대기열 + 첨부 사진을 ZIP 한 파일로 백업.
// 서버/네트워크 장애 시 단말 분실·교체 전에 데이터를 외부로 빼두기 위함.
"use client";

import { db } from "./dexie";

export interface QueueBackupSummary {
  sampling_events: number;
  photos: number;
  queue_items: number;
  sites: number;
  trees: number;
}

const FORMAT_VERSION = 1;

export async function buildQueueBackupZip(): Promise<{ blob: Blob; summary: QueueBackupSummary }> {
  // JSZip 은 무거우므로 동적 import
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  // 단말 IndexedDB 의 모든 큐 관련 데이터를 수집.
  // sampling_events 는 동기화 안 끝난 것만 (synced 도 단말 캐시에 남을 수 있어서 제외).
  const samplingEvents = await db()
    .sampling_events.where("sync_status")
    .notEqual("synced")
    .toArray();
  const photosPending = await db().photos_pending.toArray();
  const queueRows = await db().sync_queue.orderBy("seq").toArray();
  const sites = await db().sites.toArray();
  const trees = await db().trees.toArray();

  const exportedAt = new Date().toISOString();
  const summary: QueueBackupSummary = {
    sampling_events: samplingEvents.length,
    photos: photosPending.length,
    queue_items: queueRows.length,
    sites: sites.length,
    trees: trees.length,
  };

  // queue.json — 사람이 읽기 쉬운 들여쓰기. 사진 Blob 은 빼고 메타데이터만.
  const meta = {
    app_name: "woodbank-app",
    format_version: FORMAT_VERSION,
    exported_at: exportedAt,
    summary,
    sampling_events: samplingEvents,
    photos: photosPending.map((p) => ({
      id: p.id,
      event_id: p.event_id,
      category: p.category,
      filename: p.filename,
      bytes: p.bytes,
      sha256: p.sha256,
      width: p.width,
      height: p.height,
      exif_taken_at: p.exif_taken_at,
      exif_lat: p.exif_lat,
      exif_lon: p.exif_lon,
      queued_at: p.queued_at,
      retries: p.retries,
      last_error: p.last_error,
      file_in_zip: `photos/${p.event_id}/${p.id}.jpg`,
    })),
    queue: queueRows.map((r) => ({
      seq: r.seq,
      kind: r.kind,
      payload_id: r.payload_id,
      retries: r.retries,
      last_error: r.last_error,
      queued_at: r.queued_at,
      next_retry_at: r.next_retry_at ?? null,
    })),
    sites,
    trees,
  };
  zip.file("queue.json", JSON.stringify(meta, null, 2));

  // 사진 원본 (압축된 JPEG, 1600px·85% 또는 사용자가 선택한 품질)
  for (const p of photosPending) {
    const path = `photos/${p.event_id}/${p.id}.jpg`;
    zip.file(path, p.blob);
  }

  // 사람이 ZIP 을 열었을 때 무엇인지 즉시 알 수 있게.
  const readme = readmeText(exportedAt, summary);
  zip.file("README.txt", readme);

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { blob, summary };
}

function readmeText(exportedAt: string, s: QueueBackupSummary): string {
  return `Woodbank 동기화 큐 백업
================================

생성 시각: ${exportedAt}
형식 버전: ${FORMAT_VERSION}

이 파일은 단말의 IndexedDB 에 동기화 대기 중인 야장·사진을 그대로
ZIP 한 장에 담은 것입니다. 서버 장애·네트워크 단절 등으로 동기화가
지연되거나 단말을 교체해야 할 때 백업·이관용으로 사용합니다.

요약
  - 야장 (sampling_events) : ${s.sampling_events} 건
  - 사진 (photos)         : ${s.photos} 건
  - 큐 항목 (sync_queue)  : ${s.queue_items} 건
  - 사이트 캐시 (sites)   : ${s.sites} 건
  - 개체목 캐시 (trees)   : ${s.trees} 건

폴더 구조
  queue.json
      JSON. 텍스트 에디터·Excel·Python 등에서 그대로 읽힙니다.
      - sampling_events: 동기화 안 끝난 야장 본문
      - photos: 첨부 사진의 메타데이터 (실제 이미지는 photos/ 안)
      - queue: sync_queue 항목 (재시도 횟수·last_error)
      - sites, trees: 야장이 참조하는 사이트/개체목 캐시
  photos/<event_id>/<photo_id>.jpg
      원본 JPEG. 단말에서 압축(1600px·85% 또는 사용자 선택)된 형태.

활용
  - 분실·고장 대비 보관
  - 동기화 못한 데이터를 외부에서 분석 (Excel/Python 등)
  - 분쟁·감사 시 원본 보존
  - 다른 사람·기기로 데이터 이관

복구
  현재 버전은 자동 복구 기능을 제공하지 않습니다. 데이터가 필요하면
  운영 책임자에게 이 ZIP 파일을 보내 주세요.
`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function defaultBackupFilename(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `woodbank-queue-backup-${ts}.zip`;
}
