import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TreeDetail({ params }: { params: { id: string } }) {
  const sb = getSupabaseServer();
  const { data: tree } = await sb.from("trees").select("*").eq("id", params.id).maybeSingle();
  if (!tree) return <p>개체목을 찾을 수 없습니다.</p>;

  const { data: events } = await sb
    .from("sampling_events")
    .select("id, sample_no, sampled_at, height_m, dbh_cm, dna_collected, notes, sync_status")
    .eq("tree_id", params.id)
    .order("sampled_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">개체목 #{tree.tree_local_no}</h1>
          <p className="text-sm text-stone-500">{tree.species_code} · {tree.lat?.toFixed(5)}, {tree.lon?.toFixed(5)}</p>
        </div>
        <Link href={`/trees/${tree.id}/edit`} className="btn-secondary text-xs shrink-0">
          ✎ 수정
        </Link>
      </div>

      <h2 className="font-semibold">채취 이력 ({events?.length ?? 0})</h2>
      <ul className="space-y-2">
        {(events ?? []).map((e) => (
          <li key={e.id} className="card">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">{e.sample_no}</div>
                <div className="text-xs text-stone-500">{new Date(e.sampled_at).toLocaleDateString("ko-KR")}</div>
              </div>
              <div className="text-right text-xs text-stone-600">
                <div>수고 <b>{e.height_m}</b> m · DBH <b>{e.dbh_cm}</b> cm</div>
                {e.dna_collected && <span className="text-amber-700">DNA ✓</span>}
              </div>
            </div>
            {e.notes && <p className="mt-2 text-sm text-stone-600 whitespace-pre-wrap">{e.notes}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
