import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserAndRole } from "@/lib/auth/role";
import { UserManager } from "@/components/UserManager";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const { role } = await getCurrentUserAndRole();
  if (role !== "admin") redirect("/sites");

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-stone-500 hover:underline">← 관리자 대시보드</Link>
      <h1 className="text-xl font-bold">사용자 관리</h1>
      <UserManager />
    </div>
  );
}
