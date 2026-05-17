"use client";

import { useMemo, useState } from "react";
import { SpecimenQrCode } from "./SpecimenQrCode";
import { SpecimenPicker } from "./SpecimenPicker";
import type { SpecimenTypeCode } from "@/types/db";

// 라벨 표시·검색에 필요한 시편 정보 묶음.
// 서버 페이지와 SpecimenPicker 양쪽에서 공유.
export interface LabelItem {
  id: string;
  human_code: string;
  type_code: SpecimenTypeCode;
  type_label: string;
  status: string;
  species_ko: string | null;
  species_sci: string | null;
  species_code: string | null;
  sample_no: string | null;
}

type Mode = "a4" | "single";

interface Props {
  initialItems: LabelItem[];
  defaultMode: Mode;
  defaultSize: { w: number; h: number }; // mm
}

// 선택된 시편: 기본 정보 + 인쇄 매수.
interface SelectedRow {
  item: LabelItem;
  quantity: number;
}

// 라벨 인쇄 — 두 모드.
//
// A4 격자: 일반 A4 라벨지(또는 일반 A4 잘라쓰기)에 행·열로 라벨 정렬.
//   기본 3 컬럼 × 7 행 = 한 페이지 21장. 라벨 크기·간격·여백을 조정.
//
// 단일 라벨 프린터: 한 페이지 = 한 라벨. @page size 를 라벨 크기로 지정.
//   Brother QL/DYMO/Zebra 같은 라벨 프린터에서 그대로 출력.
//
// 선택된 시편은 quantity 만큼 펼쳐서 라벨로 렌더. 즉 "팽나무 D01 × 3장"
// 식으로 한 시편을 여러 장 인쇄 가능.
export function SpecimenPrintClient({ initialItems, defaultMode, defaultSize }: Props) {
  // 선택 상태 — id → SelectedRow. 순서 보존을 위해 배열로 관리.
  const [selected, setSelected] = useState<SelectedRow[]>(
    initialItems.map((item) => ({ item, quantity: 1 })),
  );
  const selectedIdSet = useMemo(() => new Set(selected.map((s) => s.item.id)), [selected]);

  // 레이아웃 옵션
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [labelW, setLabelW] = useState<number>(defaultSize.w);
  const [labelH, setLabelH] = useState<number>(defaultSize.h);
  const [cols, setCols] = useState<number>(3);
  const [rows, setRows] = useState<number>(7);
  const [gap, setGap] = useState<number>(2); // mm
  const [pageMargin, setPageMargin] = useState<number>(10); // mm, A4 전체 여백
  const [qrAsUrl, setQrAsUrl] = useState<boolean>(false);
  const [showSpecies, setShowSpecies] = useState<boolean>(true);

  // 선택 조작 헬퍼
  function addItem(item: LabelItem) {
    setSelected((cur) => (cur.some((s) => s.item.id === item.id) ? cur : [...cur, { item, quantity: 1 }]));
  }
  function removeItem(id: string) {
    setSelected((cur) => cur.filter((s) => s.item.id !== id));
  }
  function setQuantity(id: string, q: number) {
    const clamped = Math.max(1, Math.min(200, Math.floor(q) || 1));
    setSelected((cur) => cur.map((s) => (s.item.id === id ? { ...s, quantity: clamped } : s)));
  }
  function setAllQuantity(q: number) {
    const clamped = Math.max(1, Math.min(200, Math.floor(q) || 1));
    setSelected((cur) => cur.map((s) => ({ ...s, quantity: clamped })));
  }
  function clearAll() {
    if (selected.length > 0 && !confirm("선택한 시편을 모두 제거할까요?")) return;
    setSelected([]);
  }

  // quantity 만큼 펼친 인쇄 항목들. 같은 시편은 _copy 인덱스로 React key 충돌 회피.
  // _copyIndex/_copyTotal 은 동일 시편의 N장 인쇄 시 1/3, 2/3 식 일련번호 표기에 사용.
  const renderItems = useMemo(
    () =>
      selected.flatMap((s) =>
        Array.from({ length: s.quantity }, (_, i) => ({
          ...s.item,
          _key: `${s.item.id}#${i + 1}`,
          _copyIndex: i + 1,
          _copyTotal: s.quantity,
        })),
      ),
    [selected],
  );

  const totalLabels = renderItems.length;

  const qrText = (item: LabelItem) =>
    qrAsUrl
      ? typeof window !== "undefined"
        ? `${window.location.origin}/specimens/${item.id}`
        : `/specimens/${item.id}`
      : item.human_code;

  return (
    <div className="space-y-3">
      {/* toolbar — 인쇄 시 숨김 */}
      <div className="no-print space-y-3">
        <div className="rounded-xl border border-stone-200 bg-white p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h1 className="text-base font-bold">
              라벨 인쇄 — 선택 {selected.length}종 · 총 <span className="text-brand-700">{totalLabels}장</span>
            </h1>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={totalLabels === 0}
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
                    type="number" min={1} max={10}
                    value={cols}
                    onChange={(e) => setCols(Math.max(1, Math.min(10, parseInt(e.target.value || "0", 10) || 3)))}
                    className="w-14 border border-stone-300 rounded px-1 py-0.5 text-right"
                  />
                </label>
                <label className="inline-flex items-center gap-1">
                  행 수
                  <input
                    type="number" min={1} max={30}
                    value={rows}
                    onChange={(e) => setRows(Math.max(1, Math.min(30, parseInt(e.target.value || "0", 10) || 7)))}
                    className="w-14 border border-stone-300 rounded px-1 py-0.5 text-right"
                  />
                </label>
                <label className="inline-flex items-center gap-1">
                  라벨 간격
                  <input
                    type="number" min={0} max={20} step="0.5"
                    value={gap}
                    onChange={(e) => setGap(Math.max(0, Math.min(20, parseFloat(e.target.value || "0") || 0)))}
                    className="w-14 border border-stone-300 rounded px-1 py-0.5 text-right"
                  /> mm
                </label>
                <label className="inline-flex items-center gap-1">
                  페이지 여백
                  <input
                    type="number" min={0} max={50} step="0.5"
                    value={pageMargin}
                    onChange={(e) => setPageMargin(Math.max(0, Math.min(50, parseFloat(e.target.value || "0") || 0)))}
                    className="w-14 border border-stone-300 rounded px-1 py-0.5 text-right"
                  /> mm
                </label>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={showSpecies} onChange={(e) => setShowSpecies(e.target.checked)} />
              수종명을 라벨에 표시
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="checkbox" checked={qrAsUrl} onChange={(e) => setQrAsUrl(e.target.checked)} />
              QR 을 URL 로 (스캔 시 시편 상세 페이지로 이동)
            </label>
          </div>

          <p className="text-stone-500">
            ※ 라벨 프린터(예: Brother QL)는 「단일」 모드 + 라벨 실제 크기로. A4 라벨지(예: Formtec)는 「A4 격자」 모드 + 라벨지 사양에 맞춰 가로·세로·열·행·간격을 조정. 인쇄 직전 브라우저 미리보기에서 정확히 들어맞는지 확인하세요.
          </p>
        </div>

        {/* 시편 추가 (검색) */}
        <SpecimenPicker existingIds={selectedIdSet} onAdd={addItem} />

        {/* 선택된 시편 목록 */}
        <div className="rounded-xl border border-stone-200 bg-white p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-bold">
              선택된 시편 ({selected.length}종 · 총 {totalLabels}장)
            </h2>
            {selected.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1">
                  모두 N장씩:
                  <input
                    type="number" min={1} max={200}
                    defaultValue={1}
                    onChange={(e) => {
                      const n = parseInt(e.target.value || "1", 10);
                      if (n >= 1 && n <= 200) setAllQuantity(n);
                    }}
                    className="w-14 border border-stone-300 rounded px-1 py-0.5 text-right"
                  />
                </label>
                <button type="button" onClick={clearAll} className="text-rose-700 hover:underline">
                  전체 제거
                </button>
              </div>
            )}
          </div>

          {selected.length === 0 ? (
            <p className="text-stone-500 p-3 text-center bg-stone-50 rounded">
              선택된 시편이 없습니다. 위 검색에서 추가하세요.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100 border border-stone-200 rounded max-h-96 overflow-y-auto">
              {selected.map((s) => (
                <li key={s.item.id} className="flex items-center gap-2 p-2 hover:bg-stone-50">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs truncate">{s.item.human_code}</div>
                    <div className="text-[11px] text-stone-500 truncate">
                      {s.item.species_ko ?? s.item.species_code ?? "(수종 미정)"} · {s.item.type_label}
                      {s.item.status !== "active" && (
                        <span className="ml-1 text-rose-700">· {s.item.status}</span>
                      )}
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-1 text-[11px]">
                    수량
                    <input
                      type="number" min={1} max={200}
                      value={s.quantity}
                      onChange={(e) => setQuantity(s.item.id, parseInt(e.target.value || "1", 10))}
                      className="w-14 border border-stone-300 rounded px-1 py-0.5 text-right"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeItem(s.item.id)}
                    className="text-[11px] text-rose-700 hover:underline px-1"
                    title="목록에서 제거"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 인쇄 영역 */}
      <style>{`
        @media print {
          /* === 인쇄 격리 — PR #26 에서 도입한 패턴 그대로 ===
             앱 레이아웃의 navbar/footer·main padding 이 첫 페이지를 점유하던 문제 차단. */
          body * { visibility: hidden !important; }
          .print-area, .print-area * { visibility: visible !important; }
          .no-print, .no-print * { display: none !important; }
          .print-area {
            position: absolute !important;
            left: 0 !important; top: 0 !important; right: 0 !important;
            margin: 0 !important; padding: 0 !important;
          }
          .print-area > * + * { margin-top: 0 !important; }
          body, html { background: white !important; margin: 0 !important; padding: 0 !important; }
        }
        ${
          mode === "single"
            ? `@page { size: ${labelW}mm ${labelH}mm; margin: 0; }
               .label-page {
                 width: ${labelW}mm; height: ${labelH}mm;
                 page-break-after: always; break-after: page;
                 page-break-inside: avoid; break-inside: avoid;
                 margin: 0; padding: 0;
                 box-sizing: border-box;
                 overflow: hidden;
                 display: block;
               }
               .label-page:last-child { page-break-after: auto; break-after: auto; }`
            : `@page { size: A4; margin: ${pageMargin}mm; }
               .a4-grid { display: grid;
                          grid-template-columns: repeat(${cols}, ${labelW}mm);
                          grid-auto-rows: ${labelH}mm;
                          gap: ${gap}mm;
                          margin: 0; padding: 0; }
               .a4-grid > .label-cell {
                 width: ${labelW}mm; height: ${labelH}mm;
                 page-break-inside: avoid; break-inside: avoid;
                 box-sizing: border-box; overflow: hidden;
               }`
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
        .label-inner .text { flex: 1; min-width: 0; line-height: 1.15; }
        /* 공통 요소 — 수종 한글명 (가장 큼) */
        .label-inner .species {
          font-weight: 700;
          font-size: 10pt;
          /* 한 줄 truncate — 라벨이 좁아 두 줄이면 가독성 나빠짐 */
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        /* 공통 요소 — 채취번호 (sample_no), 보조 */
        .label-inner .sample {
          font-family: ui-monospace, Menlo, Consolas, monospace;
          font-size: 7.5pt;
          color: #444;
          margin-top: 0.3mm;
        }
        /* 차별 요소 — sample_no 이후의 시편 경로 (가장 식별성 높음) */
        .label-inner .diff {
          font-family: ui-monospace, Menlo, Consolas, monospace;
          font-weight: 700;
          font-size: 10pt;
          color: #235a3f; /* brand-700 */
          margin-top: 0.8mm;
          word-break: break-all;
        }
        /* 종류 라벨 + 일련번호 */
        .label-inner .meta { font-size: 7pt; color: #555; margin-top: 0.6mm; }
        .label-inner .serial { color: #888; font-variant-numeric: tabular-nums; }
        .label-inner .status-bad { color: #b91c1c; }
        .preview-border { outline: 1px dashed #ccc; outline-offset: -1px; }
        @media print { .preview-border { outline: none !important; } }
      `}</style>

      {totalLabels === 0 ? (
        <p className="no-print text-sm text-stone-400 text-center p-8 border border-dashed border-stone-200 rounded-xl">
          위에서 시편을 선택하면 여기에 라벨 미리보기가 나타납니다.
        </p>
      ) : mode === "a4" ? (
        <div className="a4-grid print-area">
          {renderItems.map((it) => (
            <div key={it._key} className="label-cell preview-border">
              <LabelInner
                item={it}
                qrText={qrText(it)}
                qrSizePx={Math.min(labelH, labelW) * 3.2}
                showSpecies={showSpecies}
                copyIndex={it._copyIndex}
                copyTotal={it._copyTotal}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="print-area space-y-2">
          {renderItems.map((it) => (
            <div key={it._key} className="label-page preview-border">
              <LabelInner
                item={it}
                qrText={qrText(it)}
                qrSizePx={Math.min(labelH, labelW) * 3.2}
                showSpecies={showSpecies}
                copyIndex={it._copyIndex}
                copyTotal={it._copyTotal}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 라벨 컨텐츠는 세 부분으로 구성된다 (운영자 요구):
//   1) 공통 요소  — 같은 나무에서 나온 시편들이 공유: 수종 한글명 + sample_no
//   2) 차별 요소  — 그 시편을 형제와 구분: human_code 의 sample_no 이후 꼬리
//                   (예: "D01.B03.L02") + 시편 종류 라벨
//   3) 일련 번호  — 같은 시편을 N장 인쇄할 때 1/N, 2/N … 형식으로 물리 라벨 구분
function LabelInner({
  item,
  qrText,
  qrSizePx,
  showSpecies,
  copyIndex,
  copyTotal,
}: {
  item: LabelItem;
  qrText: string;
  qrSizePx: number;
  showSpecies: boolean;
  copyIndex: number;
  copyTotal: number;
}) {
  const inactive = item.status !== "active";
  // human_code 가 항상 sample_no 로 시작 → 그 prefix 를 제거한 꼬리가 「차별 요소」.
  // 시작 점(.) 도 잘라내고 빈 문자열이면 root-level 야장(시편 자체가 야장 단위) 표시.
  const sampleNo = item.sample_no ?? null;
  const diff =
    sampleNo && item.human_code.startsWith(sampleNo)
      ? item.human_code.slice(sampleNo.length).replace(/^\./, "")
      : item.human_code;
  return (
    <div className="label-inner">
      <div className="qr">
        <SpecimenQrCode text={qrText} sizePx={Math.max(48, Math.floor(qrSizePx))} ecc="M" />
      </div>
      <div className="text">
        {/* ─ 공통 ─ */}
        {showSpecies && item.species_ko && (
          <div className="species" title={item.species_sci ?? undefined}>
            {item.species_ko}
          </div>
        )}
        {sampleNo && <div className="sample">{sampleNo}</div>}
        {/* ─ 차별 ─ */}
        {diff && <div className="diff">{diff}</div>}
        <div className={`meta ${inactive ? "status-bad" : ""}`}>
          {item.type_label}
          {inactive && <> · {item.status}</>}
          {copyTotal > 1 && (
            <span className="serial">
              {" "}· {copyIndex}/{copyTotal}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
