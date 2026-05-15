// 시편(specimens) CRUD 클라이언트 헬퍼.
// human_code 자동 생성·seq 결정은 서버 RPC(create_specimen)가 담당.
// 권한·동시성은 RLS + unique 인덱스로 보장.
"use client";

import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { Specimen, SpecimenStatus, SpecimenTypeCode } from "@/types/db";
import { SPECIMEN_TYPES } from "@/types/db";

export function typeOf(code: SpecimenTypeCode) {
  return SPECIMEN_TYPES.find((t) => t.code === code) ?? SPECIMEN_TYPES[SPECIMEN_TYPES.length - 1];
}

export interface CreateSpecimenInput {
  root_event_id: string;
  parent_id: string | null;
  type_code: SpecimenTypeCode;
  description?: string | null;
  storage_location?: string | null;
}

export async function createSpecimen(input: CreateSpecimenInput): Promise<Specimen> {
  const sb = getSupabaseBrowser();
  const t = typeOf(input.type_code);
  const { data, error } = await sb.rpc("create_specimen", {
    p_root_event_id: input.root_event_id,
    p_parent_id: input.parent_id,
    p_type_code: input.type_code,
    p_specimen_type: t.key,
    p_description: input.description ?? null,
    p_storage_location: input.storage_location ?? null,
  });
  if (error) throw error;
  // RPC 가 specimens row 를 그대로 반환
  return data as Specimen;
}

export async function listSpecimensForEvent(rootEventId: string): Promise<Specimen[]> {
  const sb = getSupabaseBrowser();
  const { data, error } = await sb
    .from("specimens")
    .select("*")
    .eq("root_event_id", rootEventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Specimen[]) ?? [];
}

export async function getSpecimen(id: string): Promise<Specimen | null> {
  const sb = getSupabaseBrowser();
  const { data } = await sb.from("specimens").select("*").eq("id", id).maybeSingle();
  return (data as Specimen | null) ?? null;
}

export async function updateSpecimen(
  id: string,
  patch: Partial<Pick<Specimen, "description" | "storage_location" | "status" | "external_id" | "external_namespace">>,
): Promise<void> {
  const sb = getSupabaseBrowser();
  const { error } = await sb.from("specimens").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteSpecimen(id: string): Promise<void> {
  const sb = getSupabaseBrowser();
  const { error } = await sb.from("specimens").delete().eq("id", id);
  if (error) throw error;
}

// 트리뷰 렌더용 — flat 리스트를 부모-자식 트리로
export interface SpecimenNode extends Specimen {
  children: SpecimenNode[];
}

export function buildSpecimenTree(rows: Specimen[]): SpecimenNode[] {
  const byId = new Map<string, SpecimenNode>();
  rows.forEach((r) => byId.set(r.id, { ...r, children: [] }));
  const roots: SpecimenNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // 형제는 type_code → seq_no 순
  const sort = (xs: SpecimenNode[]) => {
    xs.sort((a, b) => a.type_code.localeCompare(b.type_code) || a.seq_no - b.seq_no);
    xs.forEach((c) => sort(c.children));
  };
  sort(roots);
  return roots;
}

// 부모 체인 (현재 시편 → 부모 → ... → 야장 사이까지).
export async function loadAncestorChain(id: string): Promise<Specimen[]> {
  const sb = getSupabaseBrowser();
  const chain: Specimen[] = [];
  let cursor: string | null = id;
  // 무한루프 방지: 최대 20 단계
  for (let i = 0; i < 20 && cursor; i++) {
    const { data } = await sb.from("specimens").select("*").eq("id", cursor).maybeSingle();
    const row = data as Specimen | null;
    if (!row) break;
    chain.push(row);
    cursor = row.parent_id;
  }
  return chain.reverse(); // root → leaf
}

export function statusLabel(s: SpecimenStatus): string {
  switch (s) {
    case "active": return "보관 중";
    case "consumed": return "소진";
    case "lost": return "분실";
    case "destroyed": return "폐기";
  }
}
