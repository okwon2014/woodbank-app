import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { getSupabaseServer } from "@/lib/supabase/server";
import { fmtDateTimeKst } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireRole(["admin"]);

  const sb = await getSupabaseServer();
  const [{ count: siteCount }, { count: treeCount }, { count: eventCount }, { count: photoCount }, { count: pendingCount }] = await Promise.all([
    sb.from("sites").select("*", { count: "exact", head: true }),
    sb.from("trees").select("*", { count: "exact", head: true }),
    sb.from("sampling_events").select("*", { count: "exact", head: true }),
    sb.from("photos").select("*", { count: "exact", head: true }),
    sb.from("users_meta").select("*", { count: "exact", head: true }).eq("role", "guest"),
  ]);

  // admin_users_with_email RPC — auth.users.last_sign_in_at 까지 같이 가져옴
  // (마이그레이션 013 적용 필요). RPC 내부에서 admin 권한 재확인 + 정렬은
  // last_sign_in_at desc nulls last.
  const { data: users } = await sb.rpc("admin_users_with_email");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-bold">관리자 대시보드</h1>
        <div className="flex gap-2 flex-wrap">
          <Link href="/stats" className="btn-secondary">📊 통계 대시보드</Link>
          <Link href="/admin/export" className="btn-secondary">📤 일괄 다운로드</Link>
          <Link href="/admin/import" className="btn-secondary">📥 일괄 등록</Link>
          <Link href="/admin/users" className="btn-primary">사용자 관리</Link>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Sites" value={siteCount ?? 0} />
        <StatCard label="Trees" value={treeCount ?? 0} />
        <StatCard label="Events" value={eventCount ?? 0} />
        <StatCard label="Photos" value={photoCount ?? 0} />
      </div>

      {(pendingCount ?? 0) > 0 && (
        <Link href="/admin/users" className="block">
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 hover:bg-amber-100 transition">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-amber-900">
                  🔔 역할 미배정 사용자 {pendingCount}명
                </div>
                <p className="text-xs text-amber-800 mt-1">
                  가입은 됐지만 역할이 <code>guest</code>로 남아 있어 데이터 접근이 막혀 있습니다. 클릭하여 역할·지역을 부여하세요.
                </p>
              </div>
              <div className="text-amber-700">→</div>
            </div>
          </div>
        </Link>
      )}
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
                <th className="text-left p-2">최근 접속</th>
                <th className="text-left p-2">가입</th>
                <th className="text-left p-2">메타 수정</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {((users ?? []) as Array<{
                id: string;
                display_name: string | null;
                role: string;
                organization: string | null;
                active: boolean;
                updated_at: string;
                last_sign_in_at: string | null;
                auth_created_at: string | null;
              }>).map((u) => (
                <tr key={u.id}>
                  <td className="p-2">{u.display_name ?? "-"}</td>
                  <td className="p-2 uppercase">{u.role}</td>
                  <td className="p-2">{u.organization ?? "-"}</td>
                  <td className="p-2">{u.active ? "✓" : "✗"}</td>
                  <td className="p-2 text-xs text-stone-700">
                    {u.last_sign_in_at ? fmtDateTimeKst(u.last_sign_in_at) : <span className="text-stone-400 italic">없음</span>}
                  </td>
                  <td className="p-2 text-xs text-stone-500">{fmtDateTimeKst(u.auth_created_at)}</td>
                  <td className="p-2 text-xs text-stone-500">{fmtDateTimeKst(u.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-stone-500 mt-2">
          ※ <b>최근 접속</b> = Supabase 가 보존하는 마지막 로그인 시각(`auth.users.last_sign_in_at`).
          PWA 의 장기 세션은 갱신되지 않을 수 있어 실제 활동보다 빠를 수 있습니다. <b>접속 히스토리는 따로 기록되지 않습니다.</b>{" "}
          <b>메타 수정</b> = `users_meta` 행 마지막 변경 시각 (역할/소속 변경 등).
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
