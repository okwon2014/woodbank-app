"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { uuidv7, dmsToDecimal } from "@/lib/utils";

// ----- 컬럼 정의 -----
const COLUMNS = [
  "sample_no",
  "sampled_at",
  "site_code",
  "region_sido",
  "region_sigungu",
  "region_sigungu_code",
  "address_detail",
  "habitat_terrain",
  "tree_local_no",
  "species",
  "lat_dms",
  "lon_dms",
  "elevation_m",
  "aspect_deg",
  "height_m",
  "dbh_cm",
  "dna_collected",
  "dna_sample_code",
  "notes",
] as const;
type Col = (typeof COLUMNS)[number];

const REQUIRED: Col[] = [
  "sample_no", "sampled_at", "site_code", "region_sigungu_code",
  "tree_local_no", "species", "lat_dms", "lon_dms", "height_m", "dbh_cm",
];

interface Row {
  rowIndex: number;
  values: Partial<Record<Col, string>>;
  errors: string[];
  warnings: string[];
}

// ----- 담양 13건 샘플 데이터 (PDF 기반) -----
const SAMPLE_TSV = [
  ["sample_no","sampled_at","site_code","region_sido","region_sigungu","region_sigungu_code","address_detail","habitat_terrain","tree_local_no","species","lat_dms","lon_dms","elevation_m","aspect_deg","height_m","dbh_cm","dna_collected","dna_sample_code","notes"],
  ["2025_담양_01","2025-05-28","2025_담양","전라남도","담양군","46710","대덕면 비차리 산209-1번지 일대","","01","팽나무","N 35° 15' 48.0\"","E 127° 00' 33.7\"","126","","20","45.0","false","",""],
  ["2025_담양_02","2025-05-28","2025_담양","전라남도","담양군","46710","대덕면 비차리 산209-1번지 일대","","02","상수리나무","N 35° 15' 48.1\"","E 127° 00' 33.7\"","129","","22","41.0","false","",""],
  ["2025_담양_03","2025-05-28","2025_담양","전라남도","담양군","46710","대덕면 비차리 산209-1번지 일대","","03","편백","N 35° 15' 48.1\"","E 127° 00' 33.5\"","128","","18","28.0","false","",""],
  ["2025_담양_04","2025-05-28","2025_담양","전라남도","담양군","46710","대덕면 비차리 산209-1번지 일대","","04","갈참나무","N 35° 15' 49.3\"","E 127° 00' 35.9\"","129","","25","37.0","false","",""],
  ["2025_담양_05","2025-05-28","2025_담양","전라남도","담양군","46710","대덕면 비차리 산209-1번지 일대","","05","졸참나무","N 35° 15' 48.4\"","E 127° 00' 34.0\"","128","","20","28.0","false","",""],
  ["2025_담양_06","2025-05-28","2025_담양","전라남도","담양군","46710","대덕면 비차리 산209-1번지 일대","","06","삼나무","N 35° 15' 48.6\"","E 127° 00' 34.2\"","125","","20","30.0","false","",""],
  ["2025_담양_07","2025-05-28","2025_담양","전라남도","담양군","46710","대덕면 비차리 산209-1번지 일대","","07","굴참나무","N 35° 15' 48.6\"","E 127° 00' 34.2\"","125","","20","30.0","false","",""],
  ["2025_담양_08","2025-05-28","2025_담양","전라남도","담양군","46710","대덕면 비차리 산209-1번지 일대","","08","소나무","N 35° 15' 48.5\"","E 127° 00' 34.6\"","126","","23","41.0","false","",""],
  ["2025_담양_09","2025-05-28","2025_담양","전라남도","담양군","46710","대덕면 비차리 산209-1번지 일대","","09","서어나무","N 35° 15' 48.4\"","E 127° 00' 34.8\"","122","","28","31.0","false","",""],
  ["2025_담양_10","2025-05-28","2025_담양","전라남도","담양군","46710","대덕면 비차리 산209-1번지 일대","","10","아까시나무","N 35° 15' 49.1\"","E 127° 00' 34.6\"","118","","18","29.0","false","",""],
  ["2025_담양_11","2025-05-28","2025_담양","전라남도","담양군","46710","대덕면 비차리 산209-1번지 일대","","11","은사시(현사시)나무","N 35° 15' 49.5\"","E 127° 00' 35.8\"","111","","30","55.0","false","",""],
  ["2025_담양_12","2025-05-28","2025_담양","전라남도","담양군","46710","대덕면 비차리 산209-1번지 일대","","12","리기테다소나무","N 35° 15' 46.4\"","E 127° 00' 37.8\"","121","","30","45.0","false","",""],
  ["2025_담양_04-1","2025-05-28","2025_담양","전라남도","담양군","46710","대덕면 비차리 산209-1번지 일대","","04-1","갈참나무","N 35° 15' 47.9\"","E 127° 00' 33.4\"","129","","18","25.0","false","",""],
].map((r) => r.join("\t")).join("\n");

// ----- TSV 파서 -----
function parseTsv(text: string): { header: string[]; rows: Row[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split("\t").map((s) => s.trim());

  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const values: Partial<Record<Col, string>> = {};
    header.forEach((h, j) => {
      if (COLUMNS.includes(h as Col)) {
        const v = (cells[j] ?? "").trim();
        if (v) values[h as Col] = v;
      }
    });
    rows.push({ rowIndex: i, values, errors: [], warnings: [] });
  }
  return { header, rows };
}

// ----- 검증 -----
function validate(row: Row, speciesByName: Map<string, string>) {
  const v = row.values;
  row.errors = [];
  row.warnings = [];

  for (const c of REQUIRED) if (!v[c]) row.errors.push(`필수 누락: ${c}`);

  if (v.sampled_at && !/^\d{4}-\d{2}-\d{2}$/.test(v.sampled_at))
    row.errors.push("sampled_at은 YYYY-MM-DD 형식");

  const numFields: Array<[Col, number, number]> = [
    ["elevation_m", 0, 9000],
    ["aspect_deg", 0, 359],
    ["height_m", 0, 150],
    ["dbh_cm", 0, 500],
  ];
  for (const [c, min, max] of numFields) {
    if (v[c] != null && v[c] !== "") {
      const n = Number(v[c]);
      if (isNaN(n)) row.errors.push(`${c}: 숫자가 아님`);
      else if (n < min || n > max) row.errors.push(`${c}: ${min}~${max} 범위 초과`);
    }
  }

  if (v.lat_dms && dmsToDecimal(v.lat_dms) == null) row.errors.push("lat_dms 파싱 실패");
  if (v.lon_dms && dmsToDecimal(v.lon_dms) == null) row.errors.push("lon_dms 파싱 실패");

  if (v.species && !speciesByName.has(v.species)) {
    row.warnings.push(`수종 '${v.species}'은(는) species 마스터에 없음 → species_code 비움`);
  }

  if (v.dna_collected && !/^(true|false|0|1)$/i.test(v.dna_collected))
    row.errors.push("dna_collected는 true/false");
}

// ----- 본 컴포넌트 -----
export function BulkImporter() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [speciesByName, setSpeciesByName] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; ok: number; fail: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  // 첫 로드 시 species 마스터 가져오기
  useEffect(() => {
    (async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb.from("species").select("code, ko_name").eq("active", true);
      const m = new Map<string, string>();
      (data ?? []).forEach((s: any) => m.set(s.ko_name, s.code));
      setSpeciesByName(m);
      setLoaded(true);
    })();
  }, []);

  const parsed = useMemo(() => {
    const { header, rows } = parseTsv(text);
    rows.forEach((r) => validate(r, speciesByName));
    return { header, rows };
  }, [text, speciesByName]);

  const okRows = parsed.rows.filter((r) => r.errors.length === 0);
  const errRows = parsed.rows.filter((r) => r.errors.length > 0);

  async function runImport() {
    if (okRows.length === 0) {
      setErrors(["등록할 유효 행이 없습니다."]);
      return;
    }
    if (!confirm(`${okRows.length}건을 등록(또는 덮어쓰기)하시겠습니까?`)) return;

    setErrors([]);
    setProgress({ done: 0, total: okRows.length, ok: 0, fail: 0 });
    const sb = getSupabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    const uid = user?.id ?? null;
    const now = new Date().toISOString();

    // 1) 사이트 그룹핑 — code 기준 중복 제거
    const siteByCode = new Map<string, { id: string; row: Row }>();
    for (const r of okRows) {
      const code = r.values.site_code!;
      if (!siteByCode.has(code)) siteByCode.set(code, { id: uuidv7(), row: r });
    }

    // 2) 기존 site 가 있으면 id 재사용
    const codes = Array.from(siteByCode.keys());
    const { data: existSites } = await sb.from("sites").select("id, code").in("code", codes);
    (existSites ?? []).forEach((s: any) => {
      const entry = siteByCode.get(s.code);
      if (entry) entry.id = s.id;
    });

    // 3) sites upsert
    const siteRows = Array.from(siteByCode.values()).map(({ id, row }) => ({
      id,
      code: row.values.site_code!,
      region_sido: row.values.region_sido ?? null,
      region_sigungu: row.values.region_sigungu ?? null,
      region_sigungu_code: row.values.region_sigungu_code ?? null,
      address_detail: row.values.address_detail ?? null,
      habitat_terrain: row.values.habitat_terrain ?? null,
      created_by: uid,
    }));
    const upSites = await sb.from("sites").upsert(siteRows, { onConflict: "code" });
    if (upSites.error) {
      setErrors([`sites upsert 실패: ${upSites.error.message}`]);
      setProgress(null);
      return;
    }

    // 4) tree 그룹핑 — (site_code + tree_local_no) 키
    const treeKeyOf = (sc: string, n: string) => `${sc}|${n}`;
    const treeByKey = new Map<string, { id: string; row: Row }>();
    for (const r of okRows) {
      const k = treeKeyOf(r.values.site_code!, r.values.tree_local_no!);
      if (!treeByKey.has(k)) treeByKey.set(k, { id: uuidv7(), row: r });
    }

    // 5) 기존 tree id 재사용
    const siteIds = Array.from(siteByCode.values()).map((s) => s.id);
    const { data: existTrees } = await sb.from("trees").select("id, site_id, tree_local_no").in("site_id", siteIds);
    (existTrees ?? []).forEach((t: any) => {
      // site_id → code 역매핑
      const code = Array.from(siteByCode.entries()).find(([, v]) => v.id === t.site_id)?.[0];
      if (!code) return;
      const entry = treeByKey.get(treeKeyOf(code, t.tree_local_no));
      if (entry) entry.id = t.id;
    });

    // 6) trees upsert
    const treeRows = Array.from(treeByKey.values()).map(({ id, row }) => {
      const lat = dmsToDecimal(row.values.lat_dms!);
      const lon = dmsToDecimal(row.values.lon_dms!);
      return {
        id,
        site_id: siteByCode.get(row.values.site_code!)!.id,
        tree_local_no: row.values.tree_local_no!,
        species_code: speciesByName.get(row.values.species ?? "") ?? null,
        lat,
        lon,
        lat_dms: row.values.lat_dms ?? null,
        lon_dms: row.values.lon_dms ?? null,
        elevation_m: row.values.elevation_m ? parseInt(row.values.elevation_m, 10) : null,
        aspect_deg: row.values.aspect_deg ? parseInt(row.values.aspect_deg, 10) : null,
        created_by: uid,
      };
    });
    const upTrees = await sb.from("trees").upsert(treeRows, { onConflict: "site_id,tree_local_no" });
    if (upTrees.error) {
      setErrors([`trees upsert 실패: ${upTrees.error.message}`]);
      setProgress(null);
      return;
    }

    // 7) events upsert — 기존 sample_no는 덮어쓰기
    const eventRows = okRows.map((r) => {
      const treeId = treeByKey.get(treeKeyOf(r.values.site_code!, r.values.tree_local_no!))!.id;
      const dna = (r.values.dna_collected ?? "false").toLowerCase();
      return {
        id: uuidv7(),
        tree_id: treeId,
        sample_no: r.values.sample_no!,
        sampled_at: r.values.sampled_at!,
        height_m: r.values.height_m ? parseFloat(r.values.height_m) : null,
        dbh_cm: r.values.dbh_cm ? parseFloat(r.values.dbh_cm) : null,
        dna_collected: dna === "true" || dna === "1",
        dna_sample_code: r.values.dna_sample_code || null,
        notes: r.values.notes || null,
        surveyor_id: uid,
        device_recorded_at: now,
        sync_status: "synced" as const,
      };
    });

    // 기존 sample_no는 id 재사용
    const sampleNos = eventRows.map((e) => e.sample_no);
    const { data: existEvents } = await sb.from("sampling_events").select("id, sample_no").in("sample_no", sampleNos);
    const existMap = new Map<string, string>();
    (existEvents ?? []).forEach((e: any) => existMap.set(e.sample_no, e.id));
    for (const e of eventRows) {
      if (existMap.has(e.sample_no)) e.id = existMap.get(e.sample_no)!;
    }

    const upEvents = await sb.from("sampling_events").upsert(eventRows, { onConflict: "sample_no" });
    if (upEvents.error) {
      setErrors([`sampling_events upsert 실패: ${upEvents.error.message}`]);
      setProgress({ done: okRows.length, total: okRows.length, ok: 0, fail: okRows.length });
      return;
    }

    setProgress({ done: okRows.length, total: okRows.length, ok: okRows.length, fail: 0 });
    setTimeout(() => router.push("/events"), 1500);
  }

  if (!loaded) return <p className="text-stone-500 text-sm">수종 마스터 로딩 중…</p>;

  return (
    <div className="space-y-4">
      <div className="card text-sm space-y-2">
        <p className="font-semibold">사용 방법</p>
        <ol className="list-decimal pl-5 space-y-1 text-stone-700">
          <li>Excel/Google Sheets에서 헤더가 포함된 표를 선택 → <kbd>Cmd/Ctrl+C</kbd></li>
          <li>아래 텍스트 영역에 <kbd>Cmd/Ctrl+V</kbd> 로 붙여넣기 (탭 구분, TSV 형식 자동 인식)</li>
          <li>미리보기에서 오류가 있는 행을 확인·수정 후 「등록」 클릭</li>
          <li>같은 <code>sample_no</code>가 이미 있으면 덮어쓰기 됩니다. 새 ID가 발급되지 않습니다.</li>
          <li>사진은 이 화면에서 일괄 업로드되지 않습니다. 각 야장 상세 페이지의 「수정 → 사진」에서 개별 첨부하세요.</li>
        </ol>
        <details className="mt-2">
          <summary className="cursor-pointer text-brand-700">필수 컬럼 보기 (헤더)</summary>
          <code className="text-xs block mt-2 bg-stone-50 p-2 rounded overflow-x-auto">
            {COLUMNS.join("\t")}
          </code>
          <p className="text-xs text-stone-500 mt-1">
            필수: {REQUIRED.join(", ")}
          </p>
        </details>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button type="button" className="btn-secondary text-xs"
          onClick={() => setText(SAMPLE_TSV)}>
          📋 담양 13건 샘플 채우기
        </button>
        <button type="button" className="btn-secondary text-xs"
          onClick={() => setText("")}>
          비우기
        </button>
        <label className="btn-secondary text-xs cursor-pointer">
          파일에서 열기 (.tsv/.csv)
          <input type="file" accept=".tsv,.csv,.txt" className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const t = await f.text();
              setText(t.replace(/,/g, "\t").includes("\t") ? t : t.replace(/,/g, "\t"));
              e.currentTarget.value = "";
            }} />
        </label>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        className="field-value font-mono text-xs"
        placeholder="여기에 헤더 + 데이터 행 붙여넣기…"
      />

      {parsed.rows.length > 0 && (
        <>
          <div className="text-sm text-stone-700">
            총 <b>{parsed.rows.length}</b>건 · 유효 <b className="text-emerald-700">{okRows.length}</b> · 오류 <b className="text-rose-700">{errRows.length}</b>
          </div>
          <div className="rounded-xl border border-stone-200 bg-white overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-stone-50 text-stone-500">
                <tr>
                  <th className="p-2">상태</th>
                  <th className="p-2 text-left">sample_no</th>
                  <th className="p-2 text-left">수종</th>
                  <th className="p-2 text-left">위/경도 (변환)</th>
                  <th className="p-2 text-right">수고</th>
                  <th className="p-2 text-right">DBH</th>
                  <th className="p-2 text-left">메모/문제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {parsed.rows.map((r) => {
                  const lat = r.values.lat_dms ? dmsToDecimal(r.values.lat_dms) : null;
                  const lon = r.values.lon_dms ? dmsToDecimal(r.values.lon_dms) : null;
                  const status = r.errors.length > 0 ? "❌" : (r.warnings.length > 0 ? "⚠️" : "✅");
                  return (
                    <tr key={r.rowIndex} className={r.errors.length > 0 ? "bg-rose-50" : ""}>
                      <td className="p-2 text-center">{status}</td>
                      <td className="p-2">{r.values.sample_no}</td>
                      <td className="p-2">{r.values.species}</td>
                      <td className="p-2 font-mono">
                        {lat != null ? lat.toFixed(5) : "?"}, {lon != null ? lon.toFixed(5) : "?"}
                      </td>
                      <td className="p-2 text-right">{r.values.height_m}</td>
                      <td className="p-2 text-right">{r.values.dbh_cm}</td>
                      <td className="p-2 text-rose-700">
                        {r.errors.map((e, i) => <div key={"e" + i}>· {e}</div>)}
                        {r.warnings.map((w, i) => <div key={"w" + i} className="text-amber-700">· {w}</div>)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {errors.map((e, i) => (
        <div key={i} className="rounded bg-rose-50 p-3 text-sm text-rose-800">{e}</div>
      ))}

      {progress && (
        <div className="rounded bg-emerald-50 p-3 text-sm text-emerald-900">
          진행: {progress.done}/{progress.total} · 성공 {progress.ok} · 실패 {progress.fail}
        </div>
      )}

      <button
        type="button"
        disabled={okRows.length === 0 || progress != null}
        className="btn-primary w-full"
        onClick={runImport}
      >
        {progress ? "등록 중…" : `유효 ${okRows.length}건 등록`}
      </button>
    </div>
  );
}
