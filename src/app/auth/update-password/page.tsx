"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Supabase는 비밀번호 복구 링크를 클릭하면 PASSWORD_RECOVERY 이벤트로 세션을 만든다.
  useEffect(() => {
    const sb = getSupabaseBrowser();
    const { data: { subscription } } = sb.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // 이미 세션 있는 경우도 대응 (페이지 직접 방문)
    sb.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) return setErr("비밀번호는 8자 이상이어야 합니다.");
    if (pw !== pw2) return setErr("두 비밀번호가 일치하지 않습니다.");
    setBusy(true);
    try {
      const sb = getSupabaseBrowser();
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) throw error;
      setMsg("비밀번호가 변경되었습니다. 잠시 후 로그인 화면으로 이동합니다.");
      setTimeout(() => router.replace("/sites"), 1200);
    } catch (e: any) {
      setErr(e?.message ?? "변경 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-brand-700">새 비밀번호 설정</h1>
      </div>
      <form onSubmit={submit} className="card space-y-4">
        {!ready && (
          <p className="text-xs text-amber-900 bg-amber-50 p-2 rounded">
            세션을 확인하는 중입니다… 메일의 링크에서 직접 이동했는지 확인해주세요.
          </p>
        )}
        <div>
          <label className="field-label">새 비밀번호 (8자 이상)</label>
          <input type="password" required minLength={8} value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="field-value" autoComplete="new-password" />
        </div>
        <div>
          <label className="field-label">새 비밀번호 확인</label>
          <input type="password" required minLength={8} value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            className="field-value" autoComplete="new-password" />
        </div>
        <button type="submit" disabled={busy || !ready} className="btn-primary w-full">
          {busy ? "처리 중…" : "비밀번호 변경"}
        </button>
        {msg && <p className="text-sm bg-emerald-50 text-emerald-900 p-2 rounded">{msg}</p>}
        {err && <p className="text-sm bg-rose-50 text-rose-900 p-2 rounded">{err}</p>}
        <Link href="/login" className="block text-center text-xs text-stone-500 underline">로그인으로</Link>
      </form>
    </div>
  );
}
