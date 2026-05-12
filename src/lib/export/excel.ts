// Excel 일괄 내보내기 — 클라이언트 사이드 (xlsx 동적 import)
import type { EventExport } from "./types";

export async function downloadExcel(events: EventExport[], filename = "woodbank_events.xlsx") {
  const XLSX = await import("xlsx");

  const rows = events.map((e) => ({
    "채취번호": e.sample_no,
    "채취일": e.sampled_at,
    "지점코드": e.site_code,
    "시도": e.region_sido ?? "",
    "시군구": e.region_sigungu ?? "",
    "시군구코드": e.region_sigungu_code ?? "",
    "장소상세": e.address_detail ?? "",
    "지형": e.habitat_terrain ?? "",
    "개체목번호": e.tree_local_no,
    "수종코드": e.species_code ?? "",
    "국명": e.species_ko ?? "",
    "위도(DD)": e.lat ?? "",
    "경도(DD)": e.lon ?? "",
    "위도(DMS)": e.lat_dms ?? "",
    "경도(DMS)": e.lon_dms ?? "",
    "해발고(m)": e.elevation_m ?? "",
    "방위(°)": e.aspect_deg ?? "",
    "수고(m)": e.height_m ?? "",
    "DBH(cm)": e.dbh_cm ?? "",
    "DNA채취": e.dna_collected ? "Y" : "N",
    "DNA라벨": e.dna_sample_code ?? "",
    "특기사항": e.notes ?? "",
    "사진수": e.photos.length,
    "조사자": e.surveyor_name ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  // 컬럼 폭 자동
  const cols = Object.keys(rows[0] ?? {});
  ws["!cols"] = cols.map((k) => ({
    wch: Math.min(40, Math.max(k.length + 2, ...rows.map((r) => String((r as any)[k] ?? "").length))),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "야장 목록");
  XLSX.writeFile(wb, filename);
}
