"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { UserRole } from "@/types/db";

interface Props {
  email: string;
  role: UserRole;
  initialDisplayName: string;
  initialOrganization: string;
  regions: { sigungu_name: string; role: UserRole }[];
}

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "관리자",
  lead: "조사책임자",
  surveyor: "조사원",
  collaborator: "외부 협력자",
  guest: "게스트",
};

export function ProfileForm({ email, role, initialDisplayName, initialOrganization, regions }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [organization, setOrganization] = useState(initialOrganization);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true); setProfileMsg(null);
    try {
      const sb = getSupabaseBrowser();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("로그인 필요");
      const { error } = await sb.from("users_meta").update({
        display_name: displayName.trim() || null,
        organization: organization.trim() || null,
      }).eq("id", user.id);
      if (error) throw error;
      setProfileMsg("저장되었습니다.");
      router.refresh();
    } catch (e: any) {
      setProfileMsg(`실패: ${e?.message ?? "에러"}`);
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (pw.length < 8) return setPwMsg("비밀번호는 8자 이상이어야 합니다.");
    if (pw !== pw2) return setPwMsg("두 입력이 일치하지 않습니다.");
    setSavingPw(true);
    try {
      const sb = getSupabaseBrowser();
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) throw error;
      setPw(""); setPw2("");
      setPwMsg("비밀번호가 변경되었습니다.");
    } catch (e: any) {
      setPwMsg(`실패: ${e?.message ?? "에러"}`);
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 읽기 전용 정보 */}
      <section className="card space-y-2">
        <h2 className="text-base font-bold text-brand-700">계정 정보</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="field-label">이메일</div>
            <div className="font-mono">{email}</div>
          </div>
          <div>
            <div className="field-label">역할</div>
            <div>{ROLE_LABEL[role]}</div>
          </div>
        </div>
        <div>
          <div className="field-label">담당 지역</div>
          {regions.length === 0 ? (
            <p className="text-stone-500 text-sm">할당된 지역이 없습니다. 데이터 등록·조회가 제한될 수 있습니다. 관리자에게 문의하세요.</p>
          ) : (
            <ul className="flex flex-wrap gap-2 mt-1">
              {regions.map((r, i) => (
                <li key={i} className="inline-flex items-center rounded-full bg-brand-100 text-brand-700 px-2 py-0.5 text-xs">
                  {r.sigungu_name} · {ROLE_LABEL[r.role]}
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-stone-500">※ 역할·지역 변경은 관리자에게 요청하세요.</p>
      </section>

      {/* 프로필 수정 */}
      <form onSubmit={saveProfile} className="card space-y-3">
        <h2 className="text-base font-bold text-brand-700">표시 정보</h2>
        <div>
          <label className="field-label">이름 (표시 이름)</label>
          <input className="field-value" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label className="field-label">소속</label>
          <input className="field-value" value={organization} onChange={(e) => setOrganization(e.target.value)} />
        </div>
        <button type="submit" disabled={savingProfile} className="btn-primary">
          {savingProfile ? "저장 중…" : "저장"}
        </button>
        {profileMsg && <p className="text-sm bg-stone-50 p-2 rounded">{profileMsg}</p>}
      </form>

      {/* 비밀번호 변경 */}
      <form onSubmit={changePassword} className="card space-y-3">
        <h2 className="text-base font-bold text-brand-700">비밀번호 변경</h2>
        <div>
          <label className="field-label">새 비밀번호 (8자 이상)</label>
          <input type="password" minLength={8} className="field-value" value={pw}
            onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
        </div>
        <div>
          <label className="field-label">새 비밀번호 확인</label>
          <input type="password" minLength={8} className="field-value" value={pw2}
            onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
        </div>
        <button type="submit" disabled={savingPw || !pw} className="btn-primary">
          {savingPw ? "변경 중…" : "비밀번호 변경"}
        </button>
        {pwMsg && <p className="text-sm bg-stone-50 p-2 rounded">{pwMsg}</p>}
      </form>
    </div>
  );
}
