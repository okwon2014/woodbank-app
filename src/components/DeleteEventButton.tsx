"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";

export function DeleteEventButton({ id, sampleNo }: { id: string; sampleNo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    const phrase = `${sampleNo} 삭제`;
    const typed = prompt(
      `정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.\n확인을 위해 아래 문구를 그대로 입력해주세요:\n${phrase}`
    );
    if (typed !== phrase) return;
    setBusy(true);
    try {
      const sb = getSupabaseBrowser();
      const { error } = await sb.from("sampling_events").delete().eq("id", id);
      if (error) throw error;
      router.push("/events");
      router.refresh();
    } catch (e: any) {
      alert(e?.message ?? "삭제 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button onClick={del} disabled={busy}
      className="text-xs px-3 py-1.5 rounded border border-rose-300 text-rose-700 hover:bg-rose-50 disabled:opacity-50">
      {busy ? "삭제 중…" : "삭제"}
    </button>
  );
}
