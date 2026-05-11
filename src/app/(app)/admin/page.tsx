import { redirect } from "next/navigation";
import { getCurrentUserAndRole } from "@/lib/auth/role";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { role } = await getCurrentUserAndRole();
  if (role !== "admin") redirect("/sites");

  const sb = getSupabaseServer();
  const [{ count: siteCount }, { count: treeCount }, { count: eventCount }, { count: photoCount }] = await Promise.all([
    sb.from("sites").select("*", { count: "exact", head: true }),
    sb.from("trees").select("*", { count: "exact", head: true }),
    sb.from("sampling_events").select("*", { count: "exact", head: true }),
    sb.from("photos").select("*", { count: "exact", head: true }),
  ]);

  const { data: users } = await sb
    .from("users_meta")
    .select("id, display_name, role, organization, active, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">관리자 대시보드</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Sites" value={siteCount ?? 0} />
        <StatCard label="Trees" value={treeCount ?? 0} />
        <StatCard label="Events" value={eventCount ?? 0} />
        <StatCard label="Photos" value={photoCount ?? 0} />
      </div>
      <section>
        <h2 className="font-semibold mb-2">사용자</h2>
        <div className="rounded-xl border border-stone-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-stone-500 text-xs">
              <tr>
                <th className="text-left p-2">이름</th>
                <th className="text-left p-2">역할</th>
                <th className="text-left p-2">소속</th>
                <th className="text-left p-2">활성</th>
                <th className="text-left p-2">최근</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {(users ?? []).map((u) => (
                <tr key={u.id}>
                  <td className="p-2">{u.display_name ?? "-"}</td>
                  <td className="p-2 uppercase">{u.role}</td>
                  <td className="p-2">{u.organization ?? "-"}</td>
                  <td className="p-2">{u.active ? "✓" : "✗"}</td>
                  <td className="p-2 text-xs text-stone-500">{new Date(u.updated_at).toLocaleString("ko-KR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-stone-500 mt-2">
          ※ 사용자 추가·역할 변경은 Supabase 대시보드 또는 별도 화면에서 처리 (본 페이지는 read-only).
        </p>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card text-center">
      <div className="text-xs text-stone-500 uppercase">{label}</div>
      <div className="text-2xl font-bold mt-1 text-brand-700">{value}</div>
    </div>
  );
}
