// CSV 일괄 내보내기 — 외부 라이브러리 없이 직접 작성. Excel·Google Sheets가
// Windows-1252(또는 EUC-KR) 기본 인코딩으로 CSV를 읽기 때문에 BOM(﻿)을
// 앞에 붙여 UTF-8 임을 명시한다. RFC 4180 인용 규칙을 따른다.
import type { EventExport } from "./types";

const COLUMNS: Array<[string, (e: EventExport) => unknown]> = [
  ["채취번호", (e) => e.sample_no],
  ["채취일", (e) => e.sampled_at],
  ["지점코드", (e) => e.site_code],
  ["시도", (e) => e.region_sido ?? ""],
  ["시군구", (e) => e.region_sigungu ?? ""],
  ["시군구코드", (e) => e.region_sigungu_code ?? ""],
  ["장소상세", (e) => e.address_detail ?? ""],
  ["지형", (e) => e.habitat_terrain ?? ""],
  ["개체목번호", (e) => e.tree_local_no],
  ["수종코드", (e) => e.species_code ?? ""],
  ["국명", (e) => e.species_ko ?? ""],
  ["위도(DD)", (e) => e.lat ?? ""],
  ["경도(DD)", (e) => e.lon ?? ""],
  ["위도(DMS)", (e) => e.lat_dms ?? ""],
  ["경도(DMS)", (e) => e.lon_dms ?? ""],
  ["해발고(m)", (e) => e.elevation_m ?? ""],
  ["방위(°)", (e) => e.aspect_deg ?? ""],
  ["수고(m)", (e) => e.height_m ?? ""],
  ["DBH(cm)", (e) => e.dbh_cm ?? ""],
  ["DNA채취", (e) => (e.dna_collected ? "Y" : "N")],
  ["DNA라벨", (e) => e.dna_sample_code ?? ""],
  ["특기사항", (e) => e.notes ?? ""],
  ["사진수", (e) => e.photos.length],
  ["조사자", (e) => e.surveyor_name ?? ""],
];

function escapeCsv(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  // RFC 4180: 콤마·쌍따옴표·개행 포함 시 전체를 ""로 감싸고, 내부 "는 ""로 이스케이프.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(events: EventExport[]): string {
  const header = COLUMNS.map(([k]) => escapeCsv(k)).join(",");
  const lines = events.map((e) =>
    COLUMNS.map(([, f]) => escapeCsv(f(e))).join(","),
  );
  // BOM + CRLF (Excel 호환)
  return "﻿" + [header, ...lines].join("\r\n") + "\r\n";
}

export function downloadCsv(events: EventExport[], filename = "woodbank_events.csv") {
  const csv = buildCsv(events);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
