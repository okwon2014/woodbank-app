import { notFound } from "next/navigation";
import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { EditTreeForm } from "@/components/EditTreeForm";

export const dynamic = "force-dynamic";

export default async function EditTreePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const sb = await getSupabaseServer();
  const { data: tree } = await sb
    .from("trees")
    .select("id, tree_local_no, species_code, lat, lon, elevation_m, aspect_deg, status, tag_id")
    .eq("id", params.id)
    .maybeSingle();

  if (!tree) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/trees/${tree.id}`} className="text-sm text-stone-500 hover:underline">
          ← 개체목 상세로 돌아가기
        </Link>
        <h1 className="text-xl font-bold mt-2">개체목 수정 #{tree.tree_local_no}</h1>
      </div>
      <EditTreeForm initial={tree as any} />
    </div>
  );
}
