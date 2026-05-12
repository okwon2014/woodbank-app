import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUserAndRole } from "@/lib/auth/role";
import { BulkImporter } from "@/components/BulkImporter";

export const dynamic = "force-dynamic";

export default async function AdminImportPage() {
  const { role } = await getCurrentUserAndRole();
  if (role !== "admin" && role !== "lead") redirect("/sites");

  return (
    <div className="space-y-4">
      <Link href="/admin" className="text-sm text-stone-500 hover:underline">← 관리자 대시보드</Link>
      <h1 className="text-xl font-bold">야장 일괄 등록</h1>
      <p className="text-sm text-stone-500">
        Excel·Google Sheets에서 복사한 표를 붙여넣어 한 번에 등록합니다.
        같은 <code>sample_no</code>가 이미 있으면 덮어쓰기됩니다.
      </p>
      <BulkImporter />
    </div>
  );
}
