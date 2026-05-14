import Link from "next/link";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  admin: "관리자",
  lead: "조사책임자",
  surveyor: "조사원",
  collaborator: "외부 협력자",
  guest: "Guest (역할 미배정)",
};

function label(role: string) {
  return ROLE_LABEL[role] ?? role;
}

export default async function ForbiddenPage(
  props: {
    searchParams: Promise<{ need?: string; have?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const need = (searchParams.need ?? "").split(",").filter(Boolean);
  const have = searchParams.have ?? "guest";

  return (
    <div className="max-w-xl mx-auto mt-10 space-y-4">
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 space-y-3">
        <h1 className="text-lg font-bold text-rose-900">⛔ 접근 권한이 없습니다</h1>
        <p className="text-sm text-rose-800">
          이 페이지는 다음 역할이 필요합니다:{" "}
          <strong>{need.length > 0 ? need.map(label).join(", ") : "제한된 역할"}</strong>
        </p>
        <p className="text-sm text-rose-800">
          현재 역할: <code className="bg-white/60 px-1.5 py-0.5 rounded">{label(have)}</code>
        </p>
        {have === "guest" && (
          <p className="text-xs text-rose-700">
            가입은 완료됐지만 관리자의 역할 부여를 기다리고 있는 상태입니다. 운영 책임자에게 역할·담당 지역 부여를 요청해주세요.
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Link href="/sites" className="btn-primary flex-1 text-center">조사지점 목록으로</Link>
        <Link href="/profile" className="btn-secondary flex-1 text-center">내 프로필</Link>
      </div>
    </div>
  );
}
