import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const sb = await getSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: meta } = await sb
    .from("users_meta")
    .select("display_name, role, organization")
    .eq("id", user.id)
    .maybeSingle();

  const { data: assignments } = await sb
    .from("user_region_assignments")
    .select("sigungu_code, role")
    .eq("user_id", user.id);

  // sigungu 한글 이름 매핑
  const sigunguCodes = (assignments ?? []).map((a) => a.sigungu_code);
  let regionNames = new Map<string, string>();
  if (sigunguCodes.length > 0) {
    const { data: regs } = await sb.from("regions")
      .select("sigungu_code, sigungu_name")
      .in("sigungu_code", sigunguCodes);
    (regs ?? []).forEach((r: any) => regionNames.set(r.sigungu_code, r.sigungu_name));
  }
  const regions = (assignments ?? []).map((a: any) => ({
    sigungu_name: regionNames.get(a.sigungu_code) ?? a.sigungu_code,
    role: a.role,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">내 정보</h1>
      <ProfileForm
        email={user.email ?? ""}
        role={(meta?.role ?? "guest") as any}
        initialDisplayName={meta?.display_name ?? ""}
        initialOrganization={meta?.organization ?? ""}
        regions={regions as any}
      />
    </div>
  );
}
