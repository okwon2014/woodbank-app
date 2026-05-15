"use client";

import { useState } from "react";
import { SpecimenQrCode } from "./SpecimenQrCode";

interface LabelItem {
  id: string;
  human_code: string;
  type_label: string;
  status: string;
}

type Mode = "a4" | "single";

interface Props {
  items: LabelItem[];
  defaultMode: Mode;
  defaultSize: { w: number; h: number }; // mm
}

// 라벨 인쇄 — 두 모드.
//
// A4 격자: 일반 A4 라벨지(또는 일반 A4 잘라쓰기)에 행·열로 라벨 정렬.
//   기본 3 컬럼 × 7 행 = 한 페이지 21장. 라벨 크기·여백을 사용자가 조정.
//
// 단일 라벨 프린터: 한 페이지 = 한 라벨. @page size 를 라벨 크기로 지정.
//   Brother QL/DYMO/Zebra 같은 라벨 프린터에서 그대로 출력.
//
// QR 텍스트는 사람용 코드 그대로(스캐너가 텍스트로 받음). URL 화 옵션은
// 「URL 로 인쇄」 토글로.
export function SpecimenPrintClient({ items, defaultMode, defaultSize }: Props) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [labelW, setLabelW] = useState<number>(defaultSize.w);
  const [labelH, setLabelH] = useState<number>(defaultSize.h);
  const [cols, setCols] = useState<number>(3);
  const [rows, setRows] = useState<number>(7);
  const [qrAsUrl, setQrAsUrl] = useState<boolean>(false);

  const qrText = (item: LabelItem) =>
    qrAsUrl
      ? (typeof window !== "undefined" ? `${window.location.origin}/specimens/${item.id}` : `/specimens/${item.id}`)
      : item.human_code;

  return (
    <div className="space-y-3">
      {/* toolbar — 인쇄 시 숨김 */}
      <div className="no-print rounded-xl border border-stone-200 bg-white p-3 space-y-2 text-xs">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-base font-bold">라벨 인쇄 — {items.length}장</h1>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-primary"
          >
            🖨 인쇄
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="inline-flex items-center gap-1">
            <input type="radio" name="mode" checked={mode === "a4"} onChange={() => setMode("a4")} />
            A4 격자
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="radio" name="mode" checked={mode === "single"} onChange={() => setMode("single")} />
            라벨 프린터 단일
          </label>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="inline-flex items-center gap-1">
            라벨 가로
            <input
              type="number" min={20} max={210}
              value={labelW}
              onChange={(e) => setLabelW(Math.max(20, Math.min(210, parseInt(e.target.value || "0", 10) || 50)))}
              className="w-16 border border-stone-300 rounded px-1 py-0.5 text-right"
            /> mm
          </label>
          <label className="inline-flex items-center gap-1">
            세로
            <input
              type="number" min={15} max={297}
              value={labelH}
              onChange={(e) => setLabelH(Math.max(15, Math.min(297, parseInt(e.target.value || "0", 10) || 30)))}
              className="w-16 border border-stone-300 rounded px-1 py-0.5 text-right"
            /> mm
          </label>
          {mode === "a4" && (
            <>
              <label className="inline-flex items-center gap-1">
                열 수
                <input
                  type="number" min={1} max={6}
                  value={cols}
                  onChange={(e) => setCols(Math.max(1, Math.min(6, parseInt(e.target.value || "0", 10) || 3)))}
                  className="w-14 border border-stone-300 rounded px-1 py-0.5 text-right"
                />
              </label>
              <label className="inline-flex items-center gap-1">
                행 수
                <input
                  type="number" min={1} max={20}
                  value={rows}
                  onChange={(e) => setRows(Math.max(1, Math.min(20, parseInt(e.target.value || "0", 10) || 7)))}
                  className="w-14 border border-stone-300 rounded px-1 py-0.5 text-right"
                />
              </label>
            </>
          )}
          <label className="inline-flex items-center gap-1">
            <input type="checkbox" checked={qrAsUrl} onChange={(e) => setQrAsUrl(e.target.checked)} />
            QR 을 URL 로 (스캔 시 시편 상세 페이지로 이동)
          </label>
        </div>

        <p className="text-stone-500">
          ※ 라벨 프린터(예: Brother QL)는 「단일」 모드 + 라벨 실제 크기로. A4 라벨지(예: Formtec)는 「A4 격자」 모드 + 라벨지 사양에 맞춰 가로·세로·열·행을 조정. 인쇄 직전 브라우저 미리보기에서 정확히 들어맞는지 확인하세요.
        </p>
      </div>

      {/* 인쇄 영역 */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
        ${
          mode === "single"
            ? `@page { size: ${labelW}mm ${labelH}mm; margin: 0; }
               .label-page { width: ${labelW}mm; height: ${labelH}mm; page-break-after: always; margin: 0; }
               .label-page:last-child { page-break-after: auto; }`
            : `@page { size: A4; margin: 10mm; }
               .a4-grid { display: grid;
                          grid-template-columns: repeat(${cols}, ${labelW}mm);
                          grid-auto-rows: ${labelH}mm;
                          gap: 2mm; }
               .a4-grid > .label-cell { width: ${labelW}mm; height: ${labelH}mm; page-break-inside: avoid; }`
        }
        .label-inner {
          width: 100%; height: 100%;
          display: flex; align-items: center; gap: 6px;
          padding: 2mm;
          font-family: -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
          color: #111;
          box-sizing: border-box;
          overflow: hidden;
        }
        .label-inner .qr { flex-shrink: 0; }
        .label-inner .text { flex: 1; min-width: 0; }
        .label-inner .code {
          font-family: ui-monospace, Menlo, Consolas, monospace;
          font-weight: 700;
          font-size: 11pt;
          line-height: 1.15;
          word-break: break-all;
        }
        .label-inner .meta { font-size: 8pt; color: #555; margin-top: 1mm; }
        .label-inner .status-bad { color: #b91c1c; }
        /* preview 영역에 시각적 경계 — 인쇄 시엔 자동으로 안 보임 */
        .preview-border { outline: 1px dashed #ccc; outline-offset: -1px; }
      `}</style>

      {mode === "a4" ? (
        <div className="a4-grid">
          {items.map((it) => (
            <div key={it.id} className="label-cell preview-border">
              <LabelInner item={it} qrText={qrText(it)} qrSizePx={Math.min(labelH, labelW) * 3.2 /* px ≈ mm × 3.2 */} />
            </div>
          ))}
        </div>
      ) : (
        items.map((it) => (
          <div key={it.id} className="label-page preview-border">
            <LabelInner item={it} qrText={qrText(it)} qrSizePx={Math.min(labelH, labelW) * 3.2} />
          </div>
        ))
      )}
    </div>
  );
}

function LabelInner({ item, qrText, qrSizePx }: { item: LabelItem; qrText: string; qrSizePx: number }) {
  const inactive = item.status !== "active";
  return (
    <div className="label-inner">
      <div className="qr">
        <SpecimenQrCode text={qrText} sizePx={Math.max(48, Math.floor(qrSizePx))} ecc="M" />
      </div>
      <div className="text">
        <div className="code">{item.human_code}</div>
        <div className={`meta ${inactive ? "status-bad" : ""}`}>
          {item.type_label}
          {inactive && <> · {item.status}</>}
        </div>
      </div>
    </div>
  );
}
