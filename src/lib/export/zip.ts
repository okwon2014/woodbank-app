// 서버 DB 에서 가져온 EventExport[] 를 Backup ZIP 과 동일한 형식
// (format_version: 1) 으로 묶어 다운로드 가능한 Blob 으로 만든다.
// 단말 IndexedDB 백업과 같은 schema 라 BulkImporter 의 ZIP 가져오기와
// 자연스럽게 호환된다.
"use client";

import type { EventExport } from "./types";

export interface ExportZipProgress {
  stage: "fetching-photos" | "zipping";
  done: number;
  total: number;
}

const FORMAT_VERSION = 1;

export async function buildExportZipFromEvents(
  events: EventExport[],
  opts: { onProgress?: (p: ExportZipProgress) => void } = {},
): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  // 1) sites / trees 를 events 에서 추출해 정규화 — Backup ZIP 의 schema 와 동일.
  type SiteRow = {
    id: string;
    code: string;
    region_sido: string | null;
    region_sigungu: string | null;
    region_sigungu_code: string | null;
    address_detail: string | null;
    habitat_terrain: string | null;
  };
  type TreeRow = {
    id: string | null;
    site_code: string;
    tree_local_no: string;
    species_code: string | null;
    species_ko: string | null;
    lat: number | null;
    lon: number | null;
    lat_dms: string | null;
    lon_dms: string | null;
    elevation_m: number | null;
    aspect_deg: number | null;
  };

  const siteByCode = new Map<string, SiteRow>();
  const treeByKey = new Map<string, TreeRow>();
  for (const e of events) {
    if (e.site_code && !siteByCode.has(e.site_code)) {
      siteByCode.set(e.site_code, {
        id: e.site_code, // server-side EventExport 에는 site.id 가 없음. code 를 키로 대용.
        code: e.site_code,
        region_sido: e.region_sido,
        region_sigungu: e.region_sigungu,
        region_sigungu_code: e.region_sigungu_code,
        address_detail: e.address_detail,
        habitat_terrain: e.habitat_terrain,
      });
    }
    const tk = `${e.site_code}|${e.tree_local_no}`;
    if (!treeByKey.has(tk)) {
      treeByKey.set(tk, {
        id: null,
        site_code: e.site_code,
        tree_local_no: e.tree_local_no,
        species_code: e.species_code,
        species_ko: e.species_ko,
        lat: e.lat,
        lon: e.lon,
        lat_dms: e.lat_dms,
        lon_dms: e.lon_dms,
        elevation_m: e.elevation_m,
        aspect_deg: e.aspect_deg,
      });
    }
  }

  // 2) 사진 fetch — Storage signed URL 로 받아 ZIP 에 원본 JPEG 로 첨부.
  const photoTargets: Array<{ event_id: string; photo_id: string; category: string; signedUrl: string }> = [];
  for (const e of events) {
    for (const p of e.photos) {
      if (p.signedUrl) {
        photoTargets.push({ event_id: e.id, photo_id: p.id, category: p.category, signedUrl: p.signedUrl });
      }
    }
  }

  let fetched = 0;
  for (const t of photoTargets) {
    opts.onProgress?.({ stage: "fetching-photos", done: fetched, total: photoTargets.length });
    try {
      const res = await fetch(t.signedUrl);
      if (res.ok) {
        const blob = await res.blob();
        zip.file(`photos/${t.event_id}/${t.photo_id}.jpg`, blob);
      }
    } catch {
      // 한 장 실패해도 전체 export 는 진행 — 누락된 사진은 queue.json 메타데이터에는 그대로.
    }
    fetched++;
  }
  opts.onProgress?.({ stage: "fetching-photos", done: fetched, total: photoTargets.length });

  // 3) queue.json — Backup ZIP 과 같은 format_version. source 필드로 출처를 구분.
  const meta = {
    app_name: "woodbank-app",
    format_version: FORMAT_VERSION,
    source: "server" as const,
    exported_at: new Date().toISOString(),
    summary: {
      sampling_events: events.length,
      photos: photoTargets.length,
      sites: siteByCode.size,
      trees: treeByKey.size,
    },
    sampling_events: events.map((e) => ({
      id: e.id,
      sample_no: e.sample_no,
      sampled_at: e.sampled_at,
      site_code: e.site_code,
      tree_local_no: e.tree_local_no,
      height_m: e.height_m,
      dbh_cm: e.dbh_cm,
      dna_collected: e.dna_collected,
      dna_sample_code: e.dna_sample_code,
      notes: e.notes,
      surveyor_name: e.surveyor_name,
    })),
    photos: events.flatMap((e) =>
      e.photos.map((p) => ({
        id: p.id,
        event_id: e.id,
        category: p.category,
        file_in_zip: p.signedUrl ? `photos/${e.id}/${p.id}.jpg` : null,
      })),
    ),
    queue: [], // server export 는 큐 개념 없음
    sites: Array.from(siteByCode.values()),
    trees: Array.from(treeByKey.values()),
  };
  zip.file("queue.json", JSON.stringify(meta, null, 2));

  // 4) README — Backup ZIP 과 같은 형식이라는 안내
  const readme = `Woodbank 서버 데이터 ZIP 백업
========================================

생성 시각: ${meta.exported_at}
형식 버전: ${FORMAT_VERSION}
출처(source): server

이 파일은 /admin/export 에서 필터된 야장과 첨부 사진을 ZIP 한 장에
정리한 것입니다. 단말 큐 백업과 동일한 형식이라 같은 도구로 처리됩니다.

요약
  - 야장 (sampling_events) : ${meta.summary.sampling_events} 건
  - 사진 (photos)         : ${meta.summary.photos} 건
  - 사이트 (sites)        : ${meta.summary.sites} 건
  - 개체목 (trees)        : ${meta.summary.trees} 건

폴더 구조
  queue.json
      JSON (들여쓰기 2). 텍스트 에디터·Excel·Python 등으로 그대로 읽힙니다.
  photos/<event_id>/<photo_id>.jpg
      Storage 에서 받아온 원본 JPEG.

활용
  - 보고서 첨부 (사진+메타데이터 함께)
  - 외부 분석 (Excel/Python 으로 queue.json 파싱)
  - /admin/import 의 'ZIP 가져오기' 로 동일 또는 다른 환경에 복원
`;
  zip.file("README.txt", readme);

  opts.onProgress?.({ stage: "zipping", done: 0, total: 1 });
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  opts.onProgress?.({ stage: "zipping", done: 1, total: 1 });
  return blob;
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
