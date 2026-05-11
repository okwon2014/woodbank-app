"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (busy) return;
    if (!confirm("로그아웃하시겠습니까?")) return;
    setBusy(true);
    try {
      await getSupabaseBrowser().auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="text-xs px-2 py-1 rounded border border-white/30 hover:bg-white/10 disabled:opacity-50"
      title="로그아웃"
    >
      {busy ? "처리 중…" : "로그아웃"}
    </button>
  );
}
