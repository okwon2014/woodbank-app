"use client";

import { Suspense, useState } from "react";
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
        const { error } = await sb.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${location.origin}${redirect}` },
        });
        if (error) throw error;
        setMsg("메일로 로그인 링크를 보냈습니다. 메일함을 확인해주세요.");
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
        <button
          type="button"
          onClick={() => setMode(mode === "password" ? "magic" : "password")}
          className="text-xs text-stone-500 underline w-full text-center"
        >
          {mode === "password" ? "비밀번호 대신 매직 링크로 로그인" : "비밀번호 로그인으로 전환"}
        </button>
        {msg && <p className="text-sm text-stone-700 bg-amber-50 p-2 rounded">{msg}</p>}
      </form>
    </div>
  );
}
