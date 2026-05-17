"use client";

import { useState } from "react";
import type { AuditEntry } from "@/lib/audit/list";

interface Props {
  entries: AuditEntry[];
}

// 사용자에게 노출할 친화적 필드명. 매핑이 없으면 원본 컬럼명을 그대로 보여준다.
const FIELD_LABEL: Record<string, string> = {
  // sampling_events
  sample_no: "채취번호",
  sampled_at: "채취일",
  height_m: "수고(m)",
  dbh_cm: "DBH(cm)",
  dna_collected: "DNA 채취",
  dna_sample_code: "DNA 라벨",
  notes: "특기사항",
  surveyor_id: "조사자",
  co_surveyors: "공동조사자",
  // trees
  tree_local_no: "개체목 번호",
  species_code: "수종 코드",
  lat: "위도",
  lon: "경도",
  lat_dms: "위도(DMS)",
  lon_dms: "경도(DMS)",
  elevation_m: "해발고(m)",
  aspect_deg: "방위(°)",
  tag_id: "태그 ID",
  status: "상태",
  // sites
  code: "지점 코드",
  region_sido: "시도",
  region_sigungu: "시군구",
  region_sigungu_code: "시군구 코드",
  address_detail: "장소 상세",
  habitat_terrain: "지형",
  // photos
  category: "분류",
  storage_path: "저장 경로",
  original_filename: "원본 파일명",
  // specimens
  human_code: "사람용 코드",
  parent_id: "부모 시편",
  type_code: "종류 코드",
  specimen_type: "종류",
  seq_no: "순번",
  storage_location: "보관 위치",
  description: "설명",
};

const TABLE_LABEL: Record<string, string> = {
  sampling_events: "야장",
  trees: "개체목",
  sites: "지점",
  photos: "사진",
  specimens: "시편",
};

const ACTION_LABEL: Record<string, { ko: string; tone: string }> = {
  INSERT: { ko: "등록", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  UPDATE: { ko: "수정", tone: "bg-amber-50 text-amber-800 border-amber-200" },
  DELETE: { ko: "삭제", tone: "bg-rose-50 text-rose-700 border-rose-200" },
};

function fmtValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "boolean") return v ? "✓" : "✗";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") {
    // 너무 긴 텍스트는 잘라낸다(특기사항 등)
    if (v.length > 80) return v.slice(0, 78) + "…";
    return v;
  }
  // 배열·객체 등
  try {
    const s = JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 78) + "…" : s;
  } catch {
    return String(v);
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditTrail({ entries }: Props) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) {
    return (
      <section className="card">
        <h2 className="text-base font-bold text-brand-700 mb-2">변경 이력</h2>
        <p className="text-xs text-stone-500">기록된 변경 이력이 없습니다.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <h2 className="text-base font-bold text-brand-700">
          변경 이력 <span className="text-xs font-normal text-stone-500">({entries.length}건)</span>
        </h2>
        <span className="text-stone-500 text-sm">{open ? "▲ 접기" : "▼ 펼치기"}</span>
      </button>

      {open && (
        <ol className="mt-3 space-y-2 border-l-2 border-stone-200 pl-4">
          {entries.map((e) => {
            const action = ACTION_LABEL[e.action] ?? { ko: e.action, tone: "bg-stone-100" };
            const tableKo = TABLE_LABEL[e.table_name] ?? e.table_name;
            return (
              <li key={e.id} className="relative">
                <span className="absolute -left-[22px] top-2 w-2.5 h-2.5 rounded-full bg-stone-400" />
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                  <span className="text-stone-500 font-mono">{fmtTime(e.occurred_at)}</span>
                  <span className={`px-1.5 py-0.5 rounded border ${action.tone}`}>
                    {tableKo} {action.ko}
                  </span>
                  <span className="text-stone-700">
                    {e.actor_name ?? <span className="italic text-stone-400">알 수 없음</span>}
                  </span>
                </div>
                {e.action === "UPDATE" && e.changes.length > 0 && (
                  <ul className="mt-1.5 ml-1 space-y-0.5 text-xs">
                    {e.changes.map((c) => (
                      <li key={c.field} className="text-stone-700">
                        <span className="text-stone-500">
                          {FIELD_LABEL[c.field] ?? c.field}
                        </span>
                        <span className="mx-1.5 text-stone-400">·</span>
                        <span className="font-mono text-rose-700 line-through">{fmtValue(c.before)}</span>
                        <span className="mx-1.5 text-stone-400">→</span>
                        <span className="font-mono text-emerald-700">{fmtValue(c.after)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {e.action === "UPDATE" && e.changes.length === 0 && (
                  <p className="text-[11px] text-stone-400 italic mt-0.5">
                    (사용자 작업 외 자동 필드만 변경 — 잡음 필드 제외 시 변화 없음)
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
