import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { fetchEventsForExport } from "@/lib/export/fetch";
import { ExportControls } from "@/components/ExportControls";

export const dynamic = "force-dynamic";

interface SP { species?: string; sigungu?: string; from?: string; to?: string; q?: string }

export default async function ExportPage(props: { searchParams: Promise<SP> }) {
  const searchParams = await props.searchParams;
  await requireRole(["admin", "lead"]);

  const events = await fetchEventsForExport(searchParams);

  const qs = new URLSearchParams();
  Object.entries(searchParams).forEach(([k, v]) => { if (v) qs.set(k, v as string); });
  const printHref = `/admin/export/print${qs.toString() ? `?${qs}` : ""}`;

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-stone-500 hover:underline">← 관리자 대시보드</Link>
      <h1 className="text-xl font-bold">야장 일괄 다운로드</h1>
      <p className="text-sm text-stone-500">
        야장 목록의 필터를 적용한 결과를 Excel / Word / PDF로 한 번에 받습니다. 다른 필터를 적용하려면 「야장 목록 → 필터」에서 조정한 뒤 「내보내기」 버튼을 다시 클릭하세요.
      </p>

      {Object.values(searchParams).some(Boolean) && (
        <div className="text-xs text-stone-600 bg-stone-50 rounded p-2">
          <b>현재 필터</b>
          {searchParams.species && <> · 수종 {searchParams.species}</>}
          {searchParams.sigungu && <> · 시군구 {searchParams.sigungu}</>}
          {searchParams.from && <> · {searchParams.from} 이후</>}
          {searchParams.to && <> · {searchParams.to} 이전</>}
          {searchParams.q && <> · 검색어 「{searchParams.q}」</>}
        </div>
      )}

      <ExportControls events={events} printHref={printHref} />

      <details className="text-xs text-stone-600">
        <summary className="cursor-pointer">미리보기 (앞 20건)</summary>
        <ul className="mt-2 divide-y divide-stone-200 bg-white rounded border border-stone-200">
          {events.slice(0, 20).map((e) => (
            <li key={e.id} className="px-3 py-1.5 flex justify-between">
              <span>{e.sample_no} · {e.species_ko ?? e.species_code ?? "?"}</span>
              <span className="text-stone-500">{e.sampled_at}</span>
            </li>
          ))}
        </ul>
        {events.length > 20 && (
          <p className="text-stone-500 mt-2">… 외 {events.length - 20}건</p>
        )}
      </details>
    </div>
  );
}
