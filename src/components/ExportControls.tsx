"use client";

import { useState } from "react";
import { downloadExcel } from "@/lib/export/excel";
import { downloadDocx } from "@/lib/export/docx";
import { downloadCsv } from "@/lib/export/csv";
import { buildExportZipFromEvents, downloadBlob } from "@/lib/export/zip";
import { downloadComprehensiveExcel } from "@/lib/export/comprehensive-excel";
import type { EventExport } from "@/lib/export/types";
import type { ComprehensiveBundle } from "@/lib/export/comprehensive";

interface Props {
  events: EventExport[];
  printHref: string;
  /** 종합 Excel 용 사전 fetch 번들. 없으면 종합 버튼 비활성. */
  comprehensive?: ComprehensiveBundle;
}

export function ExportControls({ events, printHref, comprehensive }: Props) {
  const [busy, setBusy] = useState<"" | "excel" | "csv" | "docx" | "pdf" | "zip" | "comp">("");
  const [progress, setProgress] = useState<string>("");

  const ts = new Date().toISOString().slice(0, 10);

  async function onExcel() {
    if (events.length === 0) return alert("내보낼 항목이 없습니다.");
    setBusy("excel");
    setProgress("Excel 생성 중…");
    try {
      await downloadExcel(events, `woodbank_${ts}.xlsx`);
    } catch (e: any) {
      alert(e?.message ?? "Excel 생성 실패");
    } finally {
      setBusy(""); setProgress("");
    }
  }

  function onCsv() {
    if (events.length === 0) return alert("내보낼 항목이 없습니다.");
    setBusy("csv");
    try {
      downloadCsv(events, `woodbank_${ts}.csv`);
    } catch (e: any) {
      alert(e?.message ?? "CSV 생성 실패");
    } finally {
      setBusy("");
    }
  }

  async function onDocx(includePhotos: boolean) {
    if (events.length === 0) return alert("내보낼 항목이 없습니다.");
    setBusy("docx");
    setProgress("Word 문서 생성 시작…");
    try {
      await downloadDocx(events, {
        filename: `woodbank_${ts}.docx`,
        includePhotos,
        onProgress: (i, t) => setProgress(`Word 페이지 ${i}/${t}${includePhotos ? " (사진 처리)" : ""}`),
      });
    } catch (e: any) {
      alert(e?.message ?? "Word 생성 실패");
    } finally {
      setBusy(""); setProgress("");
    }
  }

  function onPdf() {
    if (events.length === 0) return alert("내보낼 항목이 없습니다.");
    // 새 탭으로 인쇄 뷰 열기 — 브라우저의 「PDF로 저장」 사용
    window.open(printHref, "_blank");
  }

  async function onComprehensive() {
    if (!comprehensive) return;
    setBusy("comp");
    setProgress("종합 Excel 생성 중…");
    try {
      await downloadComprehensiveExcel(comprehensive, `woodbank_종합_${ts}.xlsx`);
    } catch (e: any) {
      alert(e?.message ?? "종합 Excel 생성 실패");
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  async function onZip() {
    if (events.length === 0) return alert("내보낼 항목이 없습니다.");
    setBusy("zip");
    setProgress("ZIP 생성 시작…");
    try {
      const blob = await buildExportZipFromEvents(events, {
        onProgress: (p) => {
          if (p.stage === "fetching-photos") {
            setProgress(`사진 다운로드 ${p.done}/${p.total}`);
          } else {
            setProgress("ZIP 패키징…");
          }
        },
      });
      downloadBlob(blob, `woodbank_${ts}.zip`);
    } catch (e: any) {
      alert(e?.message ?? "ZIP 생성 실패");
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  const disabled = busy !== "" || events.length === 0;

  return (
    <div className="card space-y-3">
      <div className="text-sm">
        <b>{events.length}</b>건이 선택되어 있습니다.
      </div>

      {/* 종합 Excel — 가장 prominent. 다중 시트 (야장/시편/사진/DNA/지점/개체목 + 통계 4종 + 메타). */}
      {comprehensive && (
        <div className="rounded-lg border-2 border-brand-700 bg-brand-50/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-sm font-bold text-brand-700">📊 종합 Excel (다중 시트)</div>
              <div className="text-xs text-stone-600 mt-0.5">
                야장·시편·사진·DNA 결과·지점·개체목 + 수종/시군구/시편 종류/월별 통계 + 메타. 모든 작업자·시각(KST) 포함.
              </div>
            </div>
            <button
              onClick={onComprehensive}
              disabled={busy !== "" || comprehensive.events.length === 0}
              className="btn-primary shrink-0"
            >
              {busy === "comp" ? "생성 중…" : "⬇ 종합 Excel 다운로드"}
            </button>
          </div>
          <div className="text-[11px] text-stone-500">
            행 수: 야장 {comprehensive.events.length} / 시편 {comprehensive.specimens.length} /
            사진 {comprehensive.photos.length} / DNA {comprehensive.dnaResults.length} /
            지점 {comprehensive.sites.length} / 개체목 {comprehensive.trees.length}
            {Object.entries(comprehensive.meta.truncated).some(([, v]) => v) && (
              <span className="ml-2 text-amber-700">⚠ 일부 시트 상한 초과 — 필터로 좁히세요</span>
            )}
          </div>
        </div>
      )}

      <div className="text-xs text-stone-500">아래는 야장 단일 시트 형식 (기존 호환).</div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button onClick={onExcel} disabled={disabled} className="btn-secondary">
          {busy === "excel" ? "생성 중…" : "📊 Excel 야장만 (1시트)"}
        </button>
        <button onClick={() => onDocx(true)} disabled={disabled} className="btn-secondary">
          {busy === "docx" ? "생성 중…" : "📄 Word (사진 포함)"}
        </button>
        <button onClick={onPdf} disabled={disabled} className="btn-secondary">
          🖨 PDF (인쇄)
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <button onClick={onCsv} disabled={disabled} className="btn-secondary text-xs">
          {busy === "csv" ? "생성 중…" : "📋 CSV (UTF-8 BOM)"}
        </button>
        <button onClick={() => onDocx(false)} disabled={disabled} className="btn-secondary text-xs">
          Word (사진 없이 빠르게)
        </button>
        <a href={printHref} target="_blank" rel="noreferrer" className="btn-secondary text-xs text-center">
          PDF 뷰 새 탭에서 열기
        </a>
      </div>

      <div className="grid grid-cols-1 gap-2">
        <button onClick={onZip} disabled={disabled} className="btn-primary text-sm">
          {busy === "zip" ? "ZIP 생성 중…" : "📦 ZIP (사진 + JSON, 백업·복원 호환)"}
        </button>
      </div>

      {progress && (
        <div className="text-xs text-stone-600 bg-stone-50 rounded p-2">{progress}</div>
      )}

      <details className="text-xs text-stone-600">
        <summary className="cursor-pointer">각 포맷 안내</summary>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li><b>Excel</b>: 한 행 = 한 시료. 모든 필드 + 사진 수. 데이터 분석·필터링에 적합.</li>
          <li><b>CSV</b>: 동일 컬럼을 UTF-8(BOM 포함) CSV 로. R·Python·DB import 에 적합. 한글이 깨지면 Excel 에서 「데이터 → 외부 데이터 가져오기」로 UTF-8 지정.</li>
          <li><b>Word (사진 포함)</b>: 첨부 PDF와 동일한 1샘플 1페이지 양식. 사진 크기는 110×110px로 자동 축소. N건이 많으면 시간이 걸립니다.</li>
          <li><b>Word (사진 없이)</b>: 텍스트 필드만. 즉시 완료.</li>
          <li><b>PDF</b>: 새 탭으로 인쇄 뷰가 열립니다. 브라우저 메뉴에서 「인쇄 → PDF로 저장」 선택. macOS에서 가장 깔끔. 사진은 Storage signed URL로 직접 렌더.</li>
          <li><b>ZIP</b>: 야장(queue.json) + 사진 원본(.jpg) + README 를 한 파일로. 단말 큐 백업과 같은 형식이라 <code>/admin/import</code> 에서 그대로 복원 가능. 외부 분석·재해 복구 모두 호환.</li>
        </ul>
      </details>
    </div>
  );
}
