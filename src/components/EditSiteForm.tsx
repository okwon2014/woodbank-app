"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { SigunguPicker } from "./SigunguPicker";

export interface EditableSiteFields {
  id: string;
  code: string;
  region_sido: string | null;
  region_sigungu: string | null;
  region_sigungu_code: string | null;
  address_detail: string | null;
  habitat_terrain: string | null;
}

interface Props {
  initial: EditableSiteFields;
}

export function EditSiteForm({ initial }: Props) {
  const router = useRouter();
  const [s, setS] = useState({
    code: initial.code,
    region_sido: initial.region_sido ?? "",
    region_sigungu: initial.region_sigungu ?? "",
    region_sigungu_code: initial.region_sigungu_code ?? "",
    address_detail: initial.address_detail ?? "",
    habitat_terrain: initial.habitat_terrain ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function up<K extends keyof typeof s>(k: K, v: typeof s[K]) {
    setS((p) => ({ ...p, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!s.code.trim()) return setErr("지점 코드를 입력해주세요.");
    if (!s.region_sigungu_code.trim()) return setErr("시군구 코드를 입력해주세요.");

    setBusy(true);
    try {
      const sb = getSupabaseBrowser();
      const { error } = await sb
        .from("sites")
        .update({
          code: s.code.trim(),
          region_sido: s.region_sido.trim() || null,
          region_sigungu: s.region_sigungu.trim() || null,
          region_sigungu_code: s.region_sigungu_code.trim() || null,
          address_detail: s.address_detail.trim() || null,
          habitat_terrain: s.habitat_terrain.trim() || null,
        })
        .eq("id", initial.id);
      if (error) throw error;
      router.push(`/sites/${initial.id}`);
      router.refresh();
    } catch (e: any) {
      setErr(e?.message ?? "수정 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="card space-y-3">
        <h2 className="text-base font-bold text-brand-700">조사 지점 정보</h2>
        <div>
          <span className="field-label">지점 코드</span>
          <input
            className="field-value"
            value={s.code}
            onChange={(e) => up("code", e.target.value)}
            placeholder="2025_담양"
          />
          <p className="text-xs text-stone-500 mt-1">
            ⚠️ 지점 코드를 바꾸면 채취번호의 prefix 와 일관성이 깨질 수 있습니다. 신중히.
          </p>
        </div>

        {/* 시군구 자동완성 — 한 번에 시도·시군구·코드 채움 */}
        <SigunguPicker
          value={
            s.region_sigungu_code
              ? {
                  sigungu_code: s.region_sigungu_code,
                  sido_name: s.region_sido,
                  sigungu_name: s.region_sigungu,
                }
              : null
          }
          onSelect={(opt) => {
            up("region_sido", opt.sido_name);
            up("region_sigungu", opt.sigungu_name);
            up("region_sigungu_code", opt.sigungu_code);
          }}
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="field-label">시도</span>
            <input
              className="field-value"
              value={s.region_sido}
              onChange={(e) => up("region_sido", e.target.value)}
              placeholder="전라남도"
            />
          </div>
          <div>
            <span className="field-label">시군구</span>
            <input
              className="field-value"
              value={s.region_sigungu}
              onChange={(e) => up("region_sigungu", e.target.value)}
              placeholder="담양군"
            />
          </div>
        </div>

        <div>
          <span className="field-label">시군구 코드</span>
          <input
            className="field-value"
            value={s.region_sigungu_code}
            onChange={(e) => up("region_sigungu_code", e.target.value)}
            placeholder="46710"
          />
        </div>

        <div>
          <span className="field-label">장소 상세</span>
          <input
            className="field-value"
            value={s.address_detail}
            onChange={(e) => up("address_detail", e.target.value)}
            placeholder="대덕면 비차리 산209-1번지 일대"
          />
        </div>

        <div>
          <span className="field-label">지형</span>
          <input
            className="field-value"
            value={s.habitat_terrain}
            onChange={(e) => up("habitat_terrain", e.target.value)}
            placeholder="능선 / 계곡 / 평지 / 사면 등"
          />
        </div>
      </section>

      <p className="text-xs text-stone-500">
        ※ 이 지점에 속한 모든 개체목·야장이 함께 영향을 받습니다. 좌표·수종 등 개체별 정보는{" "}
        「개체목 수정」 화면에서 변경하세요.
      </p>

      {err && <div className="rounded bg-rose-50 p-3 text-sm text-rose-800">{err}</div>}

      <div className="sticky bottom-2 z-10 flex gap-2 bg-stone-50/80 backdrop-blur p-2 rounded-lg">
        <button type="button" className="btn-secondary flex-1" onClick={() => router.back()}>
          취소
        </button>
        <button type="submit" disabled={busy} className="btn-primary flex-[2]">
          {busy ? "저장 중…" : "저장"}
        </button>
      </div>
    </form>
  );
}
