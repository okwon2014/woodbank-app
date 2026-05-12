// DOCX 생성 — 한 시료 = 한 페이지, 첨부 PDF와 동일 양식
// docx-js 클라이언트 사이드 동적 import
import type { TextRun as TextRunCls } from "docx";
import type { EventExport, PhotoExport } from "./types";
import { PHOTO_LABELS } from "./types";

async function fetchImage(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function downloadDocx(
  events: EventExport[],
  opts: { filename?: string; includePhotos?: boolean; onProgress?: (i: number, total: number) => void } = {},
) {
  const filename = opts.filename ?? "woodbank_events.docx";
  const includePhotos = opts.includePhotos ?? true;
  const onProgress = opts.onProgress ?? (() => {});

  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    AlignmentType, BorderStyle, HeadingLevel, ImageRun, PageBreak,
    ShadingType, VerticalAlign, WidthType,
  } = await import("docx");

  const FONT = "맑은 고딕";
  const T = (text: string, opts: any = {}): TextRunCls => new TextRun({ text, font: FONT, ...opts });
  const P = (text: string | TextRunCls[], opts: any = {}) =>
    new Paragraph({
      children: typeof text === "string" ? [T(text)] : text,
      spacing: { after: 60 },
      ...opts,
    });

  const border = { style: BorderStyle.SINGLE, size: 4, color: "808080" };
  const borders = { top: border, bottom: border, left: border, right: border };

  function cell(text: string | TextRunCls[], opts: { bg?: string; widthDxa: number; bold?: boolean; align?: any } = { widthDxa: 0 }) {
    const runs = typeof text === "string"
      ? [T(text, { bold: opts.bold })]
      : text;
    return new TableCell({
      borders,
      width: { size: opts.widthDxa, type: WidthType.DXA },
      shading: opts.bg ? { type: ShadingType.CLEAR, fill: opts.bg } : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ children: runs, alignment: opts.align })],
    });
  }

  // 한 시료를 표현하는 표 + 사진 행 조립
  async function buildSampleBlocks(e: EventExport, index: number) {
    onProgress(index, events.length);

    // 사진 ImageRun 들 (선택)
    const photoCells: any[] = [];
    const photoCategoryOrder: PhotoExport["category"][] = ["tree_form", "bark", "branch", "leaf_litter"];

    for (const cat of photoCategoryOrder) {
      const ph = e.photos.find((p) => p.category === cat);
      let inner: any[] = [];
      if (includePhotos && ph?.signedUrl) {
        const buf = await fetchImage(ph.signedUrl);
        if (buf) {
          inner = [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: buf,
                  transformation: { width: 110, height: 110 },
                  altText: { title: cat, description: e.sample_no, name: cat },
                }),
              ],
            }),
          ];
        }
      }
      if (inner.length === 0) inner = [new Paragraph({ children: [T("")] })];
      photoCells.push(new TableCell({
        borders,
        width: { size: 2340, type: WidthType.DXA },
        margins: { top: 60, bottom: 60, left: 60, right: 60 },
        verticalAlign: VerticalAlign.CENTER,
        children: inner,
      }));
    }

    // 표 전체 너비 (A4 본문 너비 = 9360 dxa)
    const total = 9360;

    const table = new Table({
      width: { size: total, type: WidthType.DXA },
      columnWidths: [2340, 2340, 2340, 2340],
      rows: [
        // 채취 번호 / 채취일
        new TableRow({ children: [
          cell("채취 번호", { widthDxa: 2340, bg: "F2F2F2", bold: true }),
          cell(e.sample_no, { widthDxa: 2340 }),
          cell("채취일", { widthDxa: 2340, bg: "F2F2F2", bold: true }),
          cell(e.sampled_at, { widthDxa: 2340 }),
        ]}),
        // 국명 (4컬럼 병합 효과: 마지막 셀에 길게)
        new TableRow({ children: [
          cell("국명", { widthDxa: 2340, bg: "F2F2F2", bold: true }),
          new TableCell({
            borders,
            width: { size: 7020, type: WidthType.DXA },
            columnSpan: 3,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ children: [T(e.species_ko ?? e.species_code ?? "-")] })],
          }),
        ]}),
        // 수고 / DBH
        new TableRow({ children: [
          cell("수고", { widthDxa: 2340, bg: "F2F2F2", bold: true }),
          cell(e.height_m != null ? `${e.height_m} m` : "-", { widthDxa: 2340 }),
          cell("흉고직경(DBH)", { widthDxa: 2340, bg: "F2F2F2", bold: true }),
          cell(e.dbh_cm != null ? `${e.dbh_cm} cm` : "-", { widthDxa: 2340 }),
        ]}),
        // 장소
        new TableRow({ children: [
          cell("장소", { widthDxa: 2340, bg: "F2F2F2", bold: true }),
          new TableCell({
            borders,
            width: { size: 7020, type: WidthType.DXA },
            columnSpan: 3,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ children: [T(`${e.region_sido ?? ""} ${e.region_sigungu ?? ""} ${e.address_detail ?? ""}`.trim())] })],
          }),
        ]}),
        // 지형 / 해발고 / 방위
        new TableRow({ children: [
          cell("지형", { widthDxa: 2340, bg: "F2F2F2", bold: true }),
          cell(e.habitat_terrain ?? "-", { widthDxa: 2340 }),
          cell("해발고 / 방위", { widthDxa: 2340, bg: "F2F2F2", bold: true }),
          cell(`${e.elevation_m ?? "-"} m / ${e.aspect_deg ?? "-"}°`, { widthDxa: 2340 }),
        ]}),
        // 위도 / 경도
        new TableRow({ children: [
          cell("위도", { widthDxa: 2340, bg: "F2F2F2", bold: true }),
          cell(e.lat_dms ?? (e.lat != null ? e.lat.toFixed(6) : "-"), { widthDxa: 2340 }),
          cell("경도", { widthDxa: 2340, bg: "F2F2F2", bold: true }),
          cell(e.lon_dms ?? (e.lon != null ? e.lon.toFixed(6) : "-"), { widthDxa: 2340 }),
        ]}),
        // 특기사항
        new TableRow({ children: [
          cell("특기사항", { widthDxa: 2340, bg: "F2F2F2", bold: true }),
          new TableCell({
            borders,
            width: { size: 7020, type: WidthType.DXA },
            columnSpan: 3,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ children: [T(e.notes ?? "")] })],
          }),
        ]}),
        // DNA
        new TableRow({ children: [
          cell("DNA 시료 채취", { widthDxa: 2340, bg: "F2F2F2", bold: true }),
          new TableCell({
            borders,
            width: { size: 7020, type: WidthType.DXA },
            columnSpan: 3,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ children: [T(e.dna_collected ? `✓ ${e.dna_sample_code ?? ""}` : "")] })],
          }),
        ]}),
        // 사진 자료 헤더 (행 전체 병합)
        new TableRow({ children: [
          new TableCell({
            borders,
            width: { size: total, type: WidthType.DXA },
            columnSpan: 4,
            shading: { type: ShadingType.CLEAR, fill: "F2F2F2" },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [T("사진자료", { bold: true })] })],
          }),
        ]}),
        // 카테고리 라벨
        new TableRow({ children: photoCategoryOrder.map((c) =>
          cell(`(${PHOTO_LABELS[c]})`, { widthDxa: 2340, bg: "FAFAFA", align: AlignmentType.CENTER })
        )}),
        // 사진 (이미지 셀 4개)
        new TableRow({ children: photoCells }),
        // 푸터
        new TableRow({ children: [
          new TableCell({
            borders,
            width: { size: total, type: WidthType.DXA },
            columnSpan: 4,
            margins: { top: 40, bottom: 40, left: 100, right: 100 },
            children: [new Paragraph({ children: [new TextRun({ text: "※ 사진은 원본사진 별첨", font: FONT, size: 18, color: "808080" })] })],
          }),
        ]}),
      ],
    });

    return [
      new Paragraph({
        children: [new TextRun({ text: "재감 시료 채취 야장", font: FONT, bold: true, size: 32 })],
        spacing: { before: 0, after: 300 },
      }),
      table,
    ];
  }

  // 페이지마다 한 시료. 마지막 시료 제외하고 페이지 브레이크 삽입.
  const children: any[] = [];
  for (let i = 0; i < events.length; i++) {
    const blocks = await buildSampleBlocks(events[i], i);
    children.push(...blocks);
    if (i < events.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }
  onProgress(events.length, events.length);

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children,
    }],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
