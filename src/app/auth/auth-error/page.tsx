import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AuthErrorPage(props: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await props.searchParams;
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-rose-800">로그인 링크 처리 실패</h1>
      </div>
      <div className="card space-y-4">
        <p className="text-sm text-stone-700">
          매직링크 또는 비밀번호 재설정 링크를 처리하는 중 문제가 발생했습니다.
        </p>
        {msg && (
          <p className="text-xs bg-rose-50 text-rose-800 rounded p-2 break-words font-mono">
            {msg}
          </p>
        )}
        <ul className="text-xs text-stone-600 list-disc pl-5 space-y-1">
          <li>링크는 한 번만 사용 가능합니다. 이미 클릭하셨다면 새로 요청해주세요.</li>
          <li>메일 발송 후 1시간 이상 지났다면 만료된 상태입니다.</li>
          <li>다른 단말에서 이미 로그인하신 적이 있다면 그쪽에 세션이 있을 수 있어요.</li>
        </ul>
        <div className="flex gap-2 pt-2">
          <Link href="/login" className="btn-primary flex-1 text-center">
            로그인 화면으로
          </Link>
          <Link href="/auth/reset-password" className="btn-secondary flex-1 text-center">
            새 링크 받기
          </Link>
        </div>
      </div>
    </div>
  );
}
