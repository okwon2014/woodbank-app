"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-stone-500">로딩...</div>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get("redirect") || "/sites";

  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const sb = getSupabaseBrowser();
    try {
      if (mode === "password") {
        const { error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        router.replace(redirect);
      } else {
        // 매직링크는 PKCE flow — Supabase 가 ?code 파라미터로 보내고
        // /auth/callback 이 code 를 세션으로 교환한 뒤 next 로 redirect.
        const callbackUrl = `${location.origin}/auth/callback?next=${encodeURIComponent(redirect)}`;
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: callbackUrl },
        });
        if (error) throw error;
        setMsg("메일로 로그인 링크를 보냈습니다. 메일함(스팸함 포함)을 확인해주세요. 링크는 한 번만 사용 가능합니다.");
      }
    } catch (e: any) {
      setMsg(e?.message ?? "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-brand-700">Woodbank</h1>
        <p className="mt-2 text-sm text-stone-500">목재 재감 구축 연구그룹 현장 야장</p>
      </div>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="field-label">이메일</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field-value"
            required
            autoComplete="email"
          />
        </div>
        {mode === "password" && (
          <div>
            <label className="field-label">비밀번호</label>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="field-value"
              required
              autoComplete="current-password"
            />
          </div>
        )}
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "처리 중…" : mode === "password" ? "로그인" : "매직 링크 보내기"}
        </button>

        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => setMode(mode === "password" ? "magic" : "password")}
            className="text-brand-700 underline"
          >
            {mode === "password" ? "🔗 매직 링크로 로그인" : "🔑 비밀번호 로그인"}
          </button>
          <Link href="/auth/reset-password" className="text-stone-500 underline">
            비밀번호 잊으셨나요?
          </Link>
        </div>

        {mode === "magic" && (
          <p className="text-xs text-stone-500 bg-stone-50 p-2 rounded">
            매직 링크는 비밀번호 없이 메일로 받은 링크를 클릭해 로그인하는 방식입니다. 비밀번호를 분실했을 때 백업 경로로도 사용할 수 있어요.
          </p>
        )}

        {msg && <p className="text-sm text-stone-700 bg-amber-50 p-2 rounded">{msg}</p>}
      </form>
    </div>
  );
}
