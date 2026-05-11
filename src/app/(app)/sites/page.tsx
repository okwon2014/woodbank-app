import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const sb = getSupabaseServer();
  const { data: sites, error } = await sb
    .from("sites")
    .select("id, code, region_sigungu, address_detail, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">조사지점</h1>
        <Link href="/events/new" className="btn-primary">+ 새 야장</Link>
      </div>
      {error && <p className="text-rose-600 text-sm">{error.message}</p>}
      {(!sites || sites.length === 0) && (
        <p className="text-stone-500 text-sm">접근 가능한 조사지점이 없습니다. 「+ 새 야장」으로 첫 데이터를 등록해보세요.</p>
      )}
      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white overflow-hidden">
        {(sites ?? []).map((s) => (
          <li key={s.id}>
            <Link href={`/sites/${s.id}`} className="flex items-center justify-between p-4 hover:bg-stone-50">
              <div>
                <div className="font-semibold">{s.code}</div>
                <div className="text-xs text-stone-500">
                  {s.region_sigungu} · {s.address_detail}
                </div>
              </div>
              <div className="text-xs text-stone-400">
                {new Date(s.updated_at).toLocaleDateString("ko-KR")}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
