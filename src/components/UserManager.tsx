"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { UserRole } from "@/types/db";

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  role: UserRole;
  organization: string | null;
  active: boolean;
  updated_at: string;
}

interface Assignment {
  user_id: string;
  sigungu_code: string;
  role: UserRole;
}

interface RegionOption {
  sigungu_code: string;
  sigungu_name: string;
}

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "관리자",
  lead: "조사책임자",
  surveyor: "조사원",
  collaborator: "외부 협력자",
  guest: "게스트",
};

export function UserManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    const sb = getSupabaseBrowser();
    try {
      const [uRes, aRes, rRes] = await Promise.all([
        sb.rpc("admin_users_with_email"),
        sb.from("user_region_assignments").select("*"),
        sb.from("regions").select("sigungu_code, sigungu_name").order("sigungu_name"),
      ]);
      if (uRes.error) throw uRes.error;
      if (aRes.error) throw aRes.error;
      if (rRes.error) throw rRes.error;
      setUsers(uRes.data as UserRow[]);
      setAssignments(aRes.data as Assignment[]);
      setRegions(rRes.data as RegionOption[]);
    } catch (e: any) {
      setErr(e?.message ?? "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function changeRole(id: string, role: UserRole) {
    setBusy(id);
    try {
      const sb = getSupabaseBrowser();
      const { error } = await sb.rpc("admin_set_user_role", { p_user: id, p_role: role });
      if (error) throw error;
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
    } catch (e: any) {
      alert(e?.message ?? "역할 변경 실패");
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(id: string, active: boolean) {
    setBusy(id);
    try {
      const sb = getSupabaseBrowser();
      const { error } = await sb.rpc("admin_set_user_active", { p_user: id, p_active: active });
      if (error) throw error;
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, active } : u)));
    } catch (e: any) {
      alert(e?.message ?? "상태 변경 실패");
    } finally {
      setBusy(null);
    }
  }

  async function toggleRegion(userId: string, sigungu: string, role: UserRole, attach: boolean) {
    setBusy(userId);
    try {
      const sb = getSupabaseBrowser();
      const { error } = await sb.rpc("admin_set_user_region", {
        p_user: userId, p_sigungu_code: sigungu, p_role: role, p_attach: attach,
      });
      if (error) throw error;
      if (attach) {
        setAssignments((prev) => [...prev, { user_id: userId, sigungu_code: sigungu, role }]);
      } else {
        setAssignments((prev) => prev.filter(
          (a) => !(a.user_id === userId && a.sigungu_code === sigungu && a.role === role)
        ));
      }
    } catch (e: any) {
      alert(e?.message ?? "지역 할당 변경 실패");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-stone-500 text-sm">불러오는 중…</p>;
  if (err) return <p className="text-rose-600 text-sm">{err}</p>;

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500">
        새 계정은 Supabase 콘솔 (Authentication → Users → Add user)에서 만드세요. 가입되면 이 화면에 자동으로 나타납니다(기본 역할: <code>guest</code>).
      </p>

      <div className="rounded-xl border border-stone-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-stone-500 text-xs">
            <tr>
              <th className="text-left p-2">이메일</th>
              <th className="text-left p-2">이름</th>
              <th className="text-left p-2">역할</th>
              <th className="text-left p-2">소속</th>
              <th className="text-left p-2">활성</th>
              <th className="text-left p-2">지역</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {users.map((u) => {
              const userAssignments = assignments.filter((a) => a.user_id === u.id);
              const isOpen = expanded === u.id;
              return (
                <>
                  <tr key={u.id} className={busy === u.id ? "opacity-50" : ""}>
                    <td className="p-2 font-mono text-xs">{u.email}</td>
                    <td className="p-2">{u.display_name ?? "-"}</td>
                    <td className="p-2">
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u.id, e.target.value as UserRole)}
                        className="border border-stone-300 rounded px-2 py-1 text-xs"
                      >
                        {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
                          <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 text-xs">{u.organization ?? "-"}</td>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={u.active}
                        onChange={(e) => toggleActive(u.id, e.target.checked)}
                      />
                    </td>
                    <td className="p-2">
                      <button
                        className="text-xs underline"
                        onClick={() => setExpanded(isOpen ? null : u.id)}
                      >
                        {userAssignments.length}개 {isOpen ? "접기" : "관리"}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={u.id + "-exp"} className="bg-stone-50">
                      <td colSpan={6} className="p-3">
                        <RegionAssignmentEditor
                          user={u}
                          assignments={userAssignments}
                          regions={regions}
                          onToggle={(sig, role, attach) => toggleRegion(u.id, sig, role, attach)}
                        />
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RegionAssignmentEditor({
  user, assignments, regions, onToggle,
}: {
  user: UserRow;
  assignments: Assignment[];
  regions: RegionOption[];
  onToggle: (sigungu: string, role: UserRole, attach: boolean) => void;
}) {
  const [sig, setSig] = useState("");
  const [role, setRole] = useState<UserRole>("surveyor");

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold">담당 지역 할당 ({user.display_name ?? user.email})</div>

      {assignments.length === 0 ? (
        <p className="text-xs text-stone-500">할당된 지역이 없습니다.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {assignments.map((a) => {
            const name = regions.find((r) => r.sigungu_code === a.sigungu_code)?.sigungu_name ?? a.sigungu_code;
            return (
              <li key={`${a.sigungu_code}-${a.role}`}
                className="inline-flex items-center gap-1 rounded-full bg-brand-100 text-brand-700 px-2 py-0.5 text-xs">
                {name} · {ROLE_LABEL[a.role]}
                <button className="ml-1 text-rose-600" onClick={() => onToggle(a.sigungu_code, a.role, false)}>
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex gap-2 items-end">
        <div>
          <span className="field-label">시군구</span>
          <select className="field-value py-1" value={sig} onChange={(e) => setSig(e.target.value)}>
            <option value="">선택</option>
            {regions.map((r) => (
              <option key={r.sigungu_code} value={r.sigungu_code}>
                {r.sigungu_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="field-label">역할</span>
          <select className="field-value py-1" value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            <option value="surveyor">조사원</option>
            <option value="lead">조사책임자</option>
          </select>
        </div>
        <button
          type="button"
          disabled={!sig}
          className="btn-primary text-xs"
          onClick={() => { onToggle(sig, role, true); setSig(""); }}
        >
          + 추가
        </button>
      </div>
    </div>
  );
}
