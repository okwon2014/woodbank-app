"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function InviteUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null); setErr(null);
    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, display_name: name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setMsg(`초대 메일을 ${email}로 발송했습니다. 사용자가 메일의 링크를 클릭하면 가입이 완료됩니다.`);
      setEmail(""); setName("");
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "초대 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
      <h2 className="text-base font-bold text-brand-700">+ 새 사용자 초대</h2>
      <p className="text-xs text-stone-500">
        이메일로 초대 링크를 발송합니다. 사용자가 링크를 클릭해 비밀번호를 설정하면 가입이 완료됩니다. 가입 직후 역할은 <code>guest</code>이며, 이 화면에서 역할·지역을 부여하세요.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="field-label">이메일 *</label>
          <input type="email" required className="field-value"
            value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </div>
        <div>
          <label className="field-label">이름 (선택)</label>
          <input className="field-value"
            value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
        </div>
      </div>
      <button type="submit" disabled={busy || !email} className="btn-primary">
        {busy ? "초대 메일 발송 중…" : "초대 메일 발송"}
      </button>
      {msg && <p className="text-sm bg-emerald-50 text-emerald-900 p-2 rounded">{msg}</p>}
      {err && <p className="text-sm bg-rose-50 text-rose-900 p-2 rounded">{err}</p>}
    </form>
  );
}
