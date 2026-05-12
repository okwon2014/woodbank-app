import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EventsListPage() {
  const sb = getSupabaseServer();
  const { data: events, error } = await sb
    .from("sampling_events")
    .select(`
      id, sample_no, sampled_at, height_m, dbh_cm, dna_collected, notes, sync_status,
      tree:trees(id, tree_local_no, species_code, site:sites(id, code, region_sigungu))
    `)
    .order("sampled_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">야장 목록</h1>
        <Link href="/events/new" className="btn-primary">+ 새 야장</Link>
      </div>

      {error && <p className="text-rose-600 text-sm">{error.message}</p>}
      {(!events || events.length === 0) && (
        <p className="text-stone-500 text-sm">
          등록된 야장이 없습니다. 「+ 새 야장」으로 첫 데이터를 등록해보세요.
        </p>
      )}

      <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white overflow-hidden">
        {(events ?? []).map((e: any) => (
          <li key={e.id}>
            <Link href={`/events/${e.id}`} className="block p-4 hover:bg-stone-50">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{e.sample_no}</div>
                  <div className="text-xs text-stone-500 truncate">
                    {e.tree?.site?.region_sigungu ?? "-"} · {e.tree?.species_code ?? "?"} · 개체목 #{e.tree?.tree_local_no ?? "?"}
                  </div>
                </div>
                <div className="text-right text-xs text-stone-600 shrink-0">
                  <div>{new Date(e.sampled_at).toLocaleDateString("ko-KR")}</div>
                  <div className="mt-0.5">
                    수고 <b>{e.height_m ?? "-"}</b>m · DBH <b>{e.dbh_cm ?? "-"}</b>cm
                  </div>
                  <div className="mt-0.5 flex gap-1 justify-end">
                    {e.dna_collected && <span className="text-amber-700">DNA</span>}
                    {e.sync_status !== "synced" && (
                      <span className="text-orange-600">{e.sync_status}</span>
                    )}
                  </div>
                </div>
              </div>
              {e.notes && (
                <p className="mt-2 text-xs text-stone-500 line-clamp-2">{e.notes}</p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
