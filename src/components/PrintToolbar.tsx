"use client";

export function PrintToolbar({ count }: { count: number }) {
  return (
    <div className="toolbar no-print">
      <button onClick={() => window.print()}>🖨 인쇄 / PDF 저장</button>
      <a href="/admin/export" className="secondary">← 돌아가기</a>
      <span style={{ marginLeft: "auto", fontSize: 13, color: "#555" }}>총 {count}건</span>
    </div>
  );
}
