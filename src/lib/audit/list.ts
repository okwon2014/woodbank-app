// 감사 로그(audit_log) 조회 헬퍼 — 서버 컴포넌트에서 사용.
//
// audit_log 테이블에는 모든 INSERT/UPDATE/DELETE 가 trigger 로 캡처되어 있다
// (003_storage_and_triggers.sql 의 audit_trigger). 본 모듈은 야장(sampling_event)
// 한 건과 관련된 모든 변경 이력을 모아 시간순으로 돌려준다.
//
// 권한: RLS 가 admin 만 select 를 허용한다(002_rls.sql 의 audit_admin_read).
// 비 admin 사용자가 호출하면 빈 배열을 받는다 — 화면에서 「변경 이력 보기」가
// 노출되지 않도록 caller 에서 role 가드를 함께 둘 것.

import { getSupabaseServer } from "@/lib/supabase/server";

export type AuditAction = "INSERT" | "UPDATE" | "DELETE";

export interface AuditEntry {
  id: number;
  table_name: string;
  row_id: string;
  action: AuditAction;
  actor_id: string | null;
  actor_name: string | null; // users_meta.display_name (있으면)
  occurred_at: string;
  // UPDATE 의 경우 실제로 바뀐 필드만 추려서 표시한다. INSERT/DELETE 는 비어 있음.
  changes: Array<{ field: string; before: unknown; after: unknown }>;
}

// 사람이 잡음으로 인식하지 않을 필드만 diff 에 노출.
// id/타임스탬프/auto-sync 같은 건 매번 바뀌어 의미가 없어 숨긴다.
const NOISE_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "device_recorded_at",
  // sync_status 는 동기화 워커가 바꾸는 메타라 사용자 액션 이력에는 잡음.
  "sync_status",
]);

function diffJson(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AuditEntry["changes"] {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: AuditEntry["changes"] = [];
  for (const k of keys) {
    if (NOISE_FIELDS.has(k)) continue;
    const b = (before as any)[k];
    const a = (after as any)[k];
    // 단순 JSON 직렬화로 동등성 비교 — null/배열/객체 모두 동일하게 처리.
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      out.push({ field: k, before: b, after: a });
    }
  }
  return out;
}

/**
 * 야장 1건과 관련된 모든 감사 이력을 시간 역순으로 모아 반환.
 * 관련 범위: sampling_events 본인, 그 tree, 그 site, 그리고 그 야장에 매달린
 * photos·specimens 까지.
 */
export async function listEventAudit(params: {
  eventId: string;
  treeId: string | null;
  siteId: string | null;
}): Promise<AuditEntry[]> {
  const sb = await getSupabaseServer();
  const ids: string[] = [params.eventId];
  if (params.treeId) ids.push(params.treeId);
  if (params.siteId) ids.push(params.siteId);

  // 1) 직접 매치: sampling_events / trees / sites 의 row_id 가 위 id 들과 일치
  const { data: directRows } = await sb
    .from("audit_log")
    .select("id, table_name, row_id, action, actor_id, occurred_at, before, after")
    .in("row_id", ids)
    .in("table_name", ["sampling_events", "trees", "sites"])
    .order("occurred_at", { ascending: false })
    .limit(500);

  // 2) 매달린 자식 행: photos.event_id / specimens.root_event_id 가 eventId 인 것들.
  //    audit_log 의 before/after JSONB 안에서 찾아야 해서 ->> 필터 사용.
  //    PostgREST 의 .or 와 .filter 를 조합한다.
  const childOrFilter = [
    `and(table_name.eq.photos,or(after->>event_id.eq.${params.eventId},before->>event_id.eq.${params.eventId}))`,
    `and(table_name.eq.specimens,or(after->>root_event_id.eq.${params.eventId},before->>root_event_id.eq.${params.eventId}))`,
  ].join(",");
  const { data: childRows } = await sb
    .from("audit_log")
    .select("id, table_name, row_id, action, actor_id, occurred_at, before, after")
    .or(childOrFilter)
    .order("occurred_at", { ascending: false })
    .limit(500);

  const all = [...(directRows ?? []), ...(childRows ?? [])];
  // 중복 제거 (직접 매치와 자식 필터가 겹칠 일은 거의 없지만 안전 차원)
  const seen = new Set<number>();
  const unique = all.filter((r: any) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  unique.sort((a: any, b: any) =>
    new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
  );

  // 3) actor_id → display_name 해석 (한 번에 묶어서 조회)
  const actorIds = Array.from(new Set(unique.map((r: any) => r.actor_id).filter(Boolean)));
  const actorMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actors } = await sb
      .from("users_meta")
      .select("id, display_name")
      .in("id", actorIds);
    (actors ?? []).forEach((u: any) => {
      if (u?.id && u?.display_name) actorMap.set(u.id, u.display_name);
    });
  }

  return unique.map((r: any) => ({
    id: r.id,
    table_name: r.table_name,
    row_id: r.row_id,
    action: r.action as AuditAction,
    actor_id: r.actor_id,
    actor_name: r.actor_id ? actorMap.get(r.actor_id) ?? null : null,
    occurred_at: r.occurred_at,
    changes: r.action === "UPDATE" ? diffJson(r.before, r.after) : [],
  }));
}

/**
 * 한 행의 등록자(생성자) display_name 을 가져온다.
 * actor_id 가 users_meta 에 없으면 null.
 */
export async function getActorName(actorId: string | null): Promise<string | null> {
  if (!actorId) return null;
  const sb = await getSupabaseServer();
  const { data } = await sb
    .from("users_meta")
    .select("display_name")
    .eq("id", actorId)
    .maybeSingle();
  return (data?.display_name as string | null) ?? null;
}
