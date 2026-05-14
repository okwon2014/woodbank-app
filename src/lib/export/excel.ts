// Excel 일괄 내보내기 — 클라이언트 사이드 (exceljs 동적 import).
// 이전엔 sheetJS(xlsx)를 썼으나 prototype pollution / ReDoS advisory 가 있어 exceljs 로 교체.
import type { EventExport } from "./types";

interface ColumnDef {
  header: string;
  key: string;
  get: (e: EventExport) => string | number | null;
}

const COLUMNS: ColumnDef[] = [
  { header: "채취번호",   key: "sample_no",          get: (e) => e.sample_no },
  { header: "채취일",     key: "sampled_at",         get: (e) => e.sampled_at },
  { header: "지점코드",   key: "site_code",          get: (e) => e.site_code },
  { header: "시도",       key: "region_sido",        get: (e) => e.region_sido ?? "" },
  { header: "시군구",     key: "region_sigungu",     get: (e) => e.region_sigungu ?? "" },
  { header: "시군구코드", key: "region_sigungu_code", get: (e) => e.region_sigungu_code ?? "" },
  { header: "장소상세",   key: "address_detail",     get: (e) => e.address_detail ?? "" },
  { header: "지형",       key: "habitat_terrain",    get: (e) => e.habitat_terrain ?? "" },
  { header: "개체목번호", key: "tree_local_no",      get: (e) => e.tree_local_no },
  { header: "수종코드",   key: "species_code",       get: (e) => e.species_code ?? "" },
  { header: "국명",       key: "species_ko",         get: (e) => e.species_ko ?? "" },
  { header: "위도(DD)",   key: "lat",                get: (e) => e.lat ?? "" },
  { header: "경도(DD)",   key: "lon",                get: (e) => e.lon ?? "" },
  { header: "위도(DMS)",  key: "lat_dms",            get: (e) => e.lat_dms ?? "" },
  { header: "경도(DMS)",  key: "lon_dms",            get: (e) => e.lon_dms ?? "" },
  { header: "해발고(m)",  key: "elevation_m",        get: (e) => e.elevation_m ?? "" },
  { header: "방위(°)",    key: "aspect_deg",         get: (e) => e.aspect_deg ?? "" },
  { header: "수고(m)",    key: "height_m",           get: (e) => e.height_m ?? "" },
  { header: "DBH(cm)",    key: "dbh_cm",             get: (e) => e.dbh_cm ?? "" },
  { header: "DNA채취",    key: "dna_collected",      get: (e) => (e.dna_collected ? "Y" : "N") },
  { header: "DNA라벨",    key: "dna_sample_code",    get: (e) => e.dna_sample_code ?? "" },
  { header: "특기사항",   key: "notes",              get: (e) => e.notes ?? "" },
  { header: "사진수",     key: "photo_count",        get: (e) => e.photos.length },
  { header: "조사자",     key: "surveyor_name",      get: (e) => e.surveyor_name ?? "" },
];

export async function downloadExcel(events: EventExport[], filename = "woodbank_events.xlsx") {
  // exceljs 는 무거우므로 동적 import
  const ExcelJS = (await import("exceljs")).default;

  const wb = new ExcelJS.Workbook();
  wb.creator = "woodbank-app";
  wb.created = new Date();

  const ws = wb.addWorksheet("야장 목록", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // 헤더 + 컬럼 폭(글자 수 기준)
  ws.columns = COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: Math.min(40, Math.max(c.header.length + 2, 12)),
  }));

  // 데이터 행 추가
  for (const e of events) {
    const row: Record<string, string | number | null> = {};
    for (const c of COLUMNS) row[c.key] = c.get(e);
    ws.addRow(row);
  }

  // 헤더 굵게
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };

  // 컬럼 폭 자동(실제 값 길이 반영, 한국어 1.6배 가중)
  ws.columns.forEach((col) => {
    let max = (col.header as string).length;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.min(40, Math.max(12, Math.ceil(max * 1.2) + 2));
  });

  // 브라우저에서 다운로드
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
