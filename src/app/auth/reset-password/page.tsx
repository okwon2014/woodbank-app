"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export default function ResetRequestPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null); setErr(null);
    try {
      const sb = getSupabaseBrowser();
      // PKCE — /auth/callback 이 code 를 세션으로 교환한 뒤 update-password 로 redirect.
      // update-password 페이지는 PASSWORD_RECOVERY 또는 기존 세션을 보고 폼을 활성화한다.
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent("/auth/update-password")}`,
      });
      if (error) throw error;
      setMsg("재설정 링크를 메일로 보냈습니다. 메일함을 확인해 주세요.");
    } catch (e: any) {
      setErr(e?.message ?? "요청 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-brand-700">비밀번호 재설정</h1>
        <p className="mt-2 text-sm text-stone-500">가입한 이메일을 입력하시면 재설정 링크를 보내드립니다.</p>
      </div>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="field-label">이메일</label>
          <input type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field-value" autoComplete="email" />
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "전송 중…" : "재설정 링크 받기"}
        </button>
        {msg && <p className="text-sm bg-emerald-50 text-emerald-900 p-2 rounded">{msg}</p>}
        {err && <p className="text-sm bg-rose-50 text-rose-900 p-2 rounded">{err}</p>}
        <Link href="/login" className="block text-center text-xs text-stone-500 underline">
          로그인으로 돌아가기
        </Link>
      </form>
    </div>
  );
}
