import { notFound } from "next/navigation";
import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { EditSiteForm } from "@/components/EditSiteForm";

export const dynamic = "force-dynamic";

export default async function EditSitePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const sb = await getSupabaseServer();
  const { data: site } = await sb
    .from("sites")
    .select("id, code, region_sido, region_sigungu, region_sigungu_code, address_detail, habitat_terrain")
    .eq("id", params.id)
    .maybeSingle();

  if (!site) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/sites/${site.id}`} className="text-sm text-stone-500 hover:underline">
          ← 지점 상세로 돌아가기
        </Link>
        <h1 className="text-xl font-bold mt-2">지점 수정: {site.code}</h1>
      </div>
      <EditSiteForm initial={site} />
    </div>
  );
}
