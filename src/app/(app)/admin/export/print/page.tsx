import { redirect } from "next/navigation";
import { getCurrentUserAndRole } from "@/lib/auth/role";
import { fetchEventsForExport } from "@/lib/export/fetch";
import { PHOTO_LABELS } from "@/lib/export/types";
import { PrintToolbar } from "@/components/PrintToolbar";

export const dynamic = "force-dynamic";

interface SP { species?: string; sigungu?: string; from?: string; to?: string; q?: string }

export default async function ExportPrintPage({ searchParams }: { searchParams: SP }) {
  const { role } = await getCurrentUserAndRole();
  if (role !== "admin" && role !== "lead") redirect("/sites");

  const events = await fetchEventsForExport(searchParams);

  return (
    <div className="print-root">
      <style>{`
        @page { size: A4; margin: 18mm 15mm; }
        @media print {
          .no-print { display: none !important; }
          .print-root { background: white !important; }
          .sample-page { page-break-after: always; }
          .sample-page:last-child { page-break-after: auto; }
        }
        .print-root { font-family: "맑은 고딕", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; color: #111; background: #f5f5f4; padding: 16px; }
        .sheet { background: white; max-width: 800px; margin: 0 auto 16px auto; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .sheet h1 { font-size: 18px; font-weight: bold; margin: 0 0 16px 0; }
        .tbl { width: 100%; border-collapse: collapse; border: 1px solid #999; }
        .tbl th, .tbl td { border: 1px solid #999; padding: 6px 8px; vertical-align: middle; font-size: 13px; }
        .tbl th { background: #f2f2f2; font-weight: bold; text-align: left; width: 22%; }
        .photo-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; }
        .photo-grid .label { background: #fafafa; text-align: center; padding: 4px; border: 1px solid #999; font-size: 12px; }
        .photo-grid .cell { border: 1px solid #999; padding: 4px; height: 150px; display: flex; align-items: center; justify-content: center; background: white; }
        .photo-grid .cell img { max-width: 100%; max-height: 100%; object-fit: contain; }
        .footer-note { font-size: 11px; color: #666; padding: 4px 8px; border: 1px solid #999; border-top: 0; }
        .toolbar { max-width: 800px; margin: 0 auto 16px auto; display: flex; gap: 8px; }
        .toolbar button, .toolbar a { padding: 8px 14px; border-radius: 6px; background: #235a3f; color: white; font-size: 13px; border: 0; cursor: pointer; text-decoration: none; }
        .toolbar .secondary { background: #e7e5e4; color: #292524; }
      `}</style>

      <PrintToolbar count={events.length} />

      {events.length === 0 && (
        <div className="sheet no-print"><p>조건에 맞는 야장이 없습니다.</p></div>
      )}

      {events.map((e) => (
        <section key={e.id} className="sheet sample-page">
          <h1>재감 시료 채취 야장</h1>
          <table className="tbl">
            <tbody>
              <tr>
                <th>채취 번호</th><td>{e.sample_no}</td>
                <th>채취일</th><td>{e.sampled_at}</td>
              </tr>
              <tr>
                <th>국명</th><td colSpan={3}>{e.species_ko ?? e.species_code ?? "-"}</td>
              </tr>
              <tr>
                <th>수고</th><td>{e.height_m != null ? `${e.height_m} m` : "-"}</td>
                <th>흉고직경(DBH)</th><td>{e.dbh_cm != null ? `${e.dbh_cm} cm` : "-"}</td>
              </tr>
              <tr>
                <th>장소</th>
                <td colSpan={3}>{[e.region_sido, e.region_sigungu, e.address_detail].filter(Boolean).join(" ")}</td>
              </tr>
              <tr>
                <th>지형</th><td>{e.habitat_terrain ?? "-"}</td>
                <th>해발고 / 방위</th><td>{e.elevation_m ?? "-"} m / {e.aspect_deg ?? "-"}°</td>
              </tr>
              <tr>
                <th>위도</th><td>{e.lat_dms ?? (e.lat != null ? e.lat.toFixed(6) : "-")}</td>
                <th>경도</th><td>{e.lon_dms ?? (e.lon != null ? e.lon.toFixed(6) : "-")}</td>
              </tr>
              <tr>
                <th>특기사항</th><td colSpan={3} style={{ whiteSpace: "pre-wrap" }}>{e.notes ?? ""}</td>
              </tr>
              <tr>
                <th>DNA 시료 채취</th>
                <td colSpan={3}>{e.dna_collected ? `✓ ${e.dna_sample_code ?? ""}` : ""}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: 0 }}>
            <div style={{ background: "#f2f2f2", textAlign: "center", padding: "6px", border: "1px solid #999", borderTop: 0, fontWeight: "bold", fontSize: 13 }}>
              사진자료
            </div>
            <div className="photo-grid">
              {(["tree_form","bark","branch","leaf_litter"] as const).map((cat) => (
                <div key={cat + "-label"} className="label">({PHOTO_LABELS[cat]})</div>
              ))}
              {(["tree_form","bark","branch","leaf_litter"] as const).map((cat) => {
                const ph = e.photos.find((p) => p.category === cat);
                return (
                  <div key={cat + "-cell"} className="cell">
                    {ph?.signedUrl ? <img src={ph.signedUrl} alt={cat} /> : null}
                  </div>
                );
              })}
            </div>
            <div className="footer-note">※ 사진은 원본사진 별첨</div>
          </div>
        </section>
      ))}
    </div>
  );
}
