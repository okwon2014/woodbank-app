// 종합 Excel 다운로드 — 다중 시트.
// 사용자가 Excel 에서 직접 작업할 수 있도록 모든 데이터를 분해해서 시트에
// 펼쳐 놓고, 통계 시트는 pivot 없이도 바로 활용 가능하게 사전 집계.
"use client";

import { SPECIMEN_TYPES, type SpecimenTypeCode } from "@/types/db";
import type {
  ComprehensiveBundle,
  CompEvent,
  CompSpecimen,
  CompPhoto,
  CompDnaResult,
  CompSite,
  CompTree,
} from "./comprehensive";

// KST 정렬 가능 형식 — "YYYY-MM-DD HH:MM:SS" (sv-SE 로케일이 ISO 와 동일 외관)
function kstSortable(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });
}
function kstDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // sampled_at 는 date 라 시각이 00:00 KST 로 떠도 의미 없음. 날짜만.
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

interface Col<T> {
  header: string;
  get: (row: T) => string | number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 시트별 컬럼 정의
// ─────────────────────────────────────────────────────────────────────────────
const EVENT_COLS: Col<CompEvent>[] = [
  { header: "채취번호", get: (e) => e.sample_no },
  { header: "채취일", get: (e) => kstDate(e.sampled_at) },
  { header: "수종 한글", get: (e) => e.species_ko ?? "" },
  { header: "수종 학명", get: (e) => e.species_sci ?? "" },
  { header: "수종 코드", get: (e) => e.species_code ?? "" },
  { header: "지점 코드", get: (e) => e.site_code },
  { header: "시도", get: (e) => e.region_sido ?? "" },
  { header: "시군구", get: (e) => e.region_sigungu ?? "" },
  { header: "시군구 코드", get: (e) => e.region_sigungu_code ?? "" },
  { header: "장소 상세", get: (e) => e.address_detail ?? "" },
  { header: "지형", get: (e) => e.habitat_terrain ?? "" },
  { header: "개체목 번호", get: (e) => e.tree_local_no },
  { header: "위도(DD)", get: (e) => e.lat ?? "" },
  { header: "경도(DD)", get: (e) => e.lon ?? "" },
  { header: "위도(DMS)", get: (e) => e.lat_dms ?? "" },
  { header: "경도(DMS)", get: (e) => e.lon_dms ?? "" },
  { header: "해발고(m)", get: (e) => e.elevation_m ?? "" },
  { header: "방위(°)", get: (e) => e.aspect_deg ?? "" },
  { header: "수고(m)", get: (e) => e.height_m ?? "" },
  { header: "DBH(cm)", get: (e) => e.dbh_cm ?? "" },
  { header: "DNA 채취", get: (e) => (e.dna_collected ? "Y" : "N") },
  { header: "DNA 라벨", get: (e) => e.dna_sample_code ?? "" },
  { header: "특기사항", get: (e) => e.notes ?? "" },
  { header: "조사자", get: (e) => e.surveyor_name ?? "" },
  { header: "조사자 역할", get: (e) => e.surveyor_role ?? "" },
  { header: "기기 입력 시각(KST)", get: (e) => kstSortable(e.device_recorded_at) },
  { header: "동기화 상태", get: (e) => e.sync_status },
  { header: "등록 시각(KST)", get: (e) => kstSortable(e.created_at) },
  { header: "최종 수정 시각(KST)", get: (e) => kstSortable(e.updated_at) },
  { header: "야장 ID", get: (e) => e.id },
];

const SPECIMEN_COLS: Col<CompSpecimen>[] = [
  { header: "사람용 코드", get: (s) => s.human_code },
  { header: "부모 코드", get: (s) => s.parent_human_code ?? "" },
  { header: "야장 채취번호", get: (s) => s.root_event_sample_no },
  { header: "수종 한글", get: (s) => s.species_ko ?? "" },
  { header: "수종 코드", get: (s) => s.species_code ?? "" },
  { header: "종류 코드", get: (s) => s.type_code },
  { header: "종류 한글", get: (s) => SPECIMEN_TYPES.find((t) => t.code === (s.type_code as SpecimenTypeCode))?.ko ?? s.specimen_type },
  { header: "순번", get: (s) => s.seq_no },
  { header: "상태", get: (s) => s.status },
  { header: "보관 위치", get: (s) => s.storage_location ?? "" },
  { header: "설명", get: (s) => s.description ?? "" },
  { header: "외부 식별자", get: (s) => s.external_id ?? "" },
  { header: "외부 네임스페이스", get: (s) => s.external_namespace ?? "" },
  { header: "등록자", get: (s) => s.created_by_name ?? "" },
  { header: "등록 시각(KST)", get: (s) => kstSortable(s.created_at) },
  { header: "최종 수정 시각(KST)", get: (s) => kstSortable(s.updated_at) },
  { header: "시편 ID", get: (s) => s.id },
];

const PHOTO_COLS: Col<CompPhoto>[] = [
  { header: "야장 채취번호", get: (p) => p.event_sample_no },
  { header: "분류", get: (p) => p.category },
  { header: "원본 파일명", get: (p) => p.original_filename ?? "" },
  { header: "가로(px)", get: (p) => p.width ?? "" },
  { header: "세로(px)", get: (p) => p.height ?? "" },
  { header: "용량(B)", get: (p) => p.bytes ?? "" },
  { header: "EXIF 촬영 시각(KST)", get: (p) => kstSortable(p.exif_taken_at) },
  { header: "EXIF 위도", get: (p) => p.exif_lat ?? "" },
  { header: "EXIF 경도", get: (p) => p.exif_lon ?? "" },
  { header: "SHA-256", get: (p) => p.sha256 ?? "" },
  { header: "업로더", get: (p) => p.uploaded_by_name ?? "" },
  { header: "업로드 시각(KST)", get: (p) => kstSortable(p.uploaded_at) },
  { header: "저장 경로", get: (p) => p.storage_path },
  { header: "사진 ID", get: (p) => p.id },
];

const DNA_COLS: Col<CompDnaResult>[] = [
  { header: "시편 코드", get: (d) => d.specimen_human_code ?? "" },
  { header: "야장 채취번호", get: (d) => d.event_sample_no ?? "" },
  { header: "분석 종류", get: (d) => d.analysis_type ?? "" },
  { header: "동정 결과", get: (d) => d.identification_result ?? "" },
  { header: "유사도", get: (d) => d.similarity_score ?? "" },
  { header: "분석자", get: (d) => d.analyst ?? "" },
  { header: "분석일(KST)", get: (d) => kstDate(d.analyzed_at) },
  { header: "원본 파일명", get: (d) => d.file_original_name ?? "" },
  { header: "파일 용량(B)", get: (d) => d.file_bytes ?? "" },
  { header: "메모", get: (d) => d.notes ?? "" },
  { header: "등록자", get: (d) => d.created_by_name ?? "" },
  { header: "등록 시각(KST)", get: (d) => kstSortable(d.created_at) },
  { header: "결과 ID", get: (d) => d.id },
];

const SITE_COLS: Col<CompSite>[] = [
  { header: "지점 코드", get: (s) => s.code },
  { header: "시도", get: (s) => s.region_sido ?? "" },
  { header: "시군구", get: (s) => s.region_sigungu ?? "" },
  { header: "시군구 코드", get: (s) => s.region_sigungu_code ?? "" },
  { header: "장소 상세", get: (s) => s.address_detail ?? "" },
  { header: "지형", get: (s) => s.habitat_terrain ?? "" },
  { header: "등록자", get: (s) => s.created_by_name ?? "" },
  { header: "등록 시각(KST)", get: (s) => kstSortable(s.created_at) },
  { header: "최종 수정 시각(KST)", get: (s) => kstSortable(s.updated_at) },
  { header: "지점 ID", get: (s) => s.id },
];

const TREE_COLS: Col<CompTree>[] = [
  { header: "지점 코드", get: (t) => t.site_code },
  { header: "개체목 번호", get: (t) => t.tree_local_no },
  { header: "수종 한글", get: (t) => t.species_ko ?? "" },
  { header: "수종 코드", get: (t) => t.species_code ?? "" },
  { header: "위도(DD)", get: (t) => t.lat ?? "" },
  { header: "경도(DD)", get: (t) => t.lon ?? "" },
  { header: "위도(DMS)", get: (t) => t.lat_dms ?? "" },
  { header: "경도(DMS)", get: (t) => t.lon_dms ?? "" },
  { header: "해발고(m)", get: (t) => t.elevation_m ?? "" },
  { header: "방위(°)", get: (t) => t.aspect_deg ?? "" },
  { header: "태그 ID", get: (t) => t.tag_id ?? "" },
  { header: "상태", get: (t) => t.status },
  { header: "등록자", get: (t) => t.created_by_name ?? "" },
  { header: "등록 시각(KST)", get: (t) => kstSortable(t.created_at) },
  { header: "최종 수정 시각(KST)", get: (t) => kstSortable(t.updated_at) },
  { header: "개체목 ID", get: (t) => t.id },
];

// ─────────────────────────────────────────────────────────────────────────────
// 통계 계산 — 야장(events) 기준
// ─────────────────────────────────────────────────────────────────────────────
function buildStats(bundle: ComprehensiveBundle) {
  const events = bundle.events;

  // 수종별
  const speciesAgg = new Map<string, { ko: string | null; sci: string | null; n: number; sumH: number; cntH: number; sumD: number; cntD: number; minH: number | null; maxH: number | null; minD: number | null; maxD: number | null }>();
  for (const e of events) {
    const key = e.species_code ?? "(미정)";
    let bucket = speciesAgg.get(key);
    if (!bucket) {
      bucket = { ko: e.species_ko, sci: e.species_sci, n: 0, sumH: 0, cntH: 0, sumD: 0, cntD: 0, minH: null, maxH: null, minD: null, maxD: null };
      speciesAgg.set(key, bucket);
    }
    bucket.n++;
    if (e.height_m != null) {
      bucket.sumH += e.height_m;
      bucket.cntH++;
      bucket.minH = bucket.minH == null ? e.height_m : Math.min(bucket.minH, e.height_m);
      bucket.maxH = bucket.maxH == null ? e.height_m : Math.max(bucket.maxH, e.height_m);
    }
    if (e.dbh_cm != null) {
      bucket.sumD += e.dbh_cm;
      bucket.cntD++;
      bucket.minD = bucket.minD == null ? e.dbh_cm : Math.min(bucket.minD, e.dbh_cm);
      bucket.maxD = bucket.maxD == null ? e.dbh_cm : Math.max(bucket.maxD, e.dbh_cm);
    }
  }
  const bySpecies = Array.from(speciesAgg.entries())
    .map(([code, b]) => ({
      code,
      ko: b.ko,
      sci: b.sci,
      n: b.n,
      avgH: b.cntH > 0 ? Math.round((b.sumH / b.cntH) * 10) / 10 : null,
      minH: b.minH,
      maxH: b.maxH,
      avgD: b.cntD > 0 ? Math.round((b.sumD / b.cntD) * 10) / 10 : null,
      minD: b.minD,
      maxD: b.maxD,
    }))
    .sort((a, b) => b.n - a.n);

  // 시군구별
  const sigunguAgg = new Map<string, { name: string | null; n: number }>();
  for (const e of events) {
    const key = e.region_sigungu_code ?? "(미정)";
    let bucket = sigunguAgg.get(key);
    if (!bucket) {
      bucket = { name: e.region_sigungu, n: 0 };
      sigunguAgg.set(key, bucket);
    }
    bucket.n++;
  }
  const bySigungu = Array.from(sigunguAgg.entries())
    .map(([code, b]) => ({ code, name: b.name, n: b.n }))
    .sort((a, b) => b.n - a.n);

  // 시편 종류별 (시편 수 + distinct event 수)
  const typeAgg = new Map<string, { specimens: number; eventSet: Set<string> }>();
  for (const s of bundle.specimens) {
    let bucket = typeAgg.get(s.type_code);
    if (!bucket) {
      bucket = { specimens: 0, eventSet: new Set() };
      typeAgg.set(s.type_code, bucket);
    }
    bucket.specimens++;
    bucket.eventSet.add(s.root_event_id);
  }
  const bySpecimenType = SPECIMEN_TYPES.map((t) => {
    const b = typeAgg.get(t.code);
    return {
      code: t.code,
      ko: t.ko,
      en: t.en,
      specimens: b?.specimens ?? 0,
      events: b?.eventSet.size ?? 0,
    };
  })
    .filter((r) => r.specimens > 0)
    .sort((a, b) => b.specimens - a.specimens);

  // 월별 (YYYY-MM)
  const monthlyAgg = new Map<string, number>();
  for (const e of events) {
    const ym = (e.sampled_at ?? "").slice(0, 7); // "2025-05"
    if (!ym) continue;
    monthlyAgg.set(ym, (monthlyAgg.get(ym) ?? 0) + 1);
  }
  const monthly = Array.from(monthlyAgg.entries())
    .map(([ym, n]) => ({ ym, n }))
    .sort((a, b) => a.ym.localeCompare(b.ym));

  return { bySpecies, bySigungu, bySpecimenType, monthly };
}

// ─────────────────────────────────────────────────────────────────────────────
// Excel 빌드
// ─────────────────────────────────────────────────────────────────────────────
function autoFitColumns(ws: any) {
  ws.columns.forEach((col: any) => {
    let max = (col.header as string).length;
    col.eachCell?.({ includeEmpty: false }, (cell: any) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.min(50, Math.max(10, Math.ceil(max * 1.2) + 2));
  });
}

async function addSheet<T>(wb: any, name: string, cols: Col<T>[], rows: T[], truncated?: boolean) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.header, key: c.header, width: 14 }));
  for (const r of rows) {
    const obj: Record<string, string | number | null> = {};
    for (const c of cols) obj[c.header] = c.get(r);
    ws.addRow(obj);
  }
  if (truncated) {
    ws.addRow({ [cols[0].header]: `※ 상한에 도달해 일부 잘렸을 수 있습니다 (${rows.length} 건)` });
  }
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  // AutoFilter 추가 — 사용자가 Excel 에서 즉시 필터링 가능
  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: cols.length },
    };
  }
  autoFitColumns(ws);
  return ws;
}

export async function downloadComprehensiveExcel(bundle: ComprehensiveBundle, filename: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "woodbank-app";
  wb.created = new Date();

  // 데이터 시트
  await addSheet(wb, "야장", EVENT_COLS, bundle.events, bundle.meta.truncated.events);
  await addSheet(wb, "시편", SPECIMEN_COLS, bundle.specimens, bundle.meta.truncated.specimens);
  await addSheet(wb, "사진", PHOTO_COLS, bundle.photos, bundle.meta.truncated.photos);
  await addSheet(wb, "DNA 결과", DNA_COLS, bundle.dnaResults, bundle.meta.truncated.dnaResults);
  await addSheet(wb, "조사 지점", SITE_COLS, bundle.sites, bundle.meta.truncated.sites);
  await addSheet(wb, "개체목", TREE_COLS, bundle.trees, bundle.meta.truncated.trees);

  // 통계 시트
  const stats = buildStats(bundle);

  await addSheet(
    wb,
    "통계 — 수종별",
    [
      { header: "수종 한글", get: (r: any) => r.ko ?? "" },
      { header: "수종 학명", get: (r: any) => r.sci ?? "" },
      { header: "수종 코드", get: (r: any) => r.code },
      { header: "야장 수", get: (r: any) => r.n },
      { header: "평균 수고(m)", get: (r: any) => r.avgH ?? "" },
      { header: "최소 수고", get: (r: any) => r.minH ?? "" },
      { header: "최대 수고", get: (r: any) => r.maxH ?? "" },
      { header: "평균 DBH(cm)", get: (r: any) => r.avgD ?? "" },
      { header: "최소 DBH", get: (r: any) => r.minD ?? "" },
      { header: "최대 DBH", get: (r: any) => r.maxD ?? "" },
    ],
    stats.bySpecies,
  );

  await addSheet(
    wb,
    "통계 — 시군구별",
    [
      { header: "시군구 코드", get: (r: any) => r.code },
      { header: "시군구", get: (r: any) => r.name ?? "" },
      { header: "야장 수", get: (r: any) => r.n },
    ],
    stats.bySigungu,
  );

  await addSheet(
    wb,
    "통계 — 시편 종류별",
    [
      { header: "종류 코드", get: (r: any) => r.code },
      { header: "한글", get: (r: any) => r.ko },
      { header: "영문", get: (r: any) => r.en },
      { header: "시편 수", get: (r: any) => r.specimens },
      { header: "야장 수(distinct)", get: (r: any) => r.events },
    ],
    stats.bySpecimenType,
  );

  await addSheet(
    wb,
    "통계 — 월별",
    [
      { header: "월(YYYY-MM)", get: (r: any) => r.ym },
      { header: "야장 수", get: (r: any) => r.n },
    ],
    stats.monthly,
  );

  // 메타 시트
  const metaWs = wb.addWorksheet("메타", { views: [{ state: "frozen", ySplit: 1 }] });
  metaWs.columns = [
    { header: "항목", key: "k", width: 28 },
    { header: "값", key: "v", width: 60 },
  ];
  metaWs.getRow(1).font = { bold: true };
  metaWs.addRow({ k: "생성 시각(KST)", v: kstSortable(bundle.meta.generatedAtIso) });
  metaWs.addRow({ k: "생성자", v: bundle.meta.generatedByName ?? "(미상)" });
  metaWs.addRow({ k: "생성자 역할", v: bundle.meta.generatedByRole });
  metaWs.addRow({ k: "필터: 수종", v: bundle.meta.filterApplied.species ?? "(전체)" });
  metaWs.addRow({ k: "필터: 시군구", v: bundle.meta.filterApplied.sigungu ?? "(전체)" });
  metaWs.addRow({ k: "필터: 채취일 시작", v: bundle.meta.filterApplied.from ?? "(전체)" });
  metaWs.addRow({ k: "필터: 채취일 종료", v: bundle.meta.filterApplied.to ?? "(전체)" });
  metaWs.addRow({ k: "필터: 검색어", v: bundle.meta.filterApplied.q ?? "(없음)" });
  metaWs.addRow({ k: "야장 행 수", v: bundle.events.length });
  metaWs.addRow({ k: "시편 행 수", v: bundle.specimens.length });
  metaWs.addRow({ k: "사진 행 수", v: bundle.photos.length });
  metaWs.addRow({ k: "DNA 결과 행 수", v: bundle.dnaResults.length });
  metaWs.addRow({ k: "지점 행 수", v: bundle.sites.length });
  metaWs.addRow({ k: "개체목 행 수", v: bundle.trees.length });
  const trunc = Object.entries(bundle.meta.truncated).filter(([, v]) => v).map(([k]) => k);
  if (trunc.length > 0) {
    metaWs.addRow({ k: "⚠️ 상한 초과 시트", v: trunc.join(", ") + " — 필터 적용을 권장" });
  }
  metaWs.addRow({ k: "권한 범위", v: "본 파일은 사용자 RLS 권한 범위 내 데이터만 포함" });

  // 다운로드
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
