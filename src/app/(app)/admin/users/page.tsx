import Link from "next/link";
import { requireRole } from "@/lib/auth/guard";
import { UserManager } from "@/components/UserManager";
import { InviteUserForm } from "@/components/InviteUserForm";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireRole(["admin"]);

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-stone-500 hover:underline">← 관리자 대시보드</Link>
      <h1 className="text-xl font-bold">사용자 관리</h1>
      <InviteUserForm />
      <UserManager />
    </div>
  );
}
