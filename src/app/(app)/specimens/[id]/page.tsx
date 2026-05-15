import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getCurrentUserAndRole } from "@/lib/auth/role";
import { SPECIMEN_TYPES, type Specimen, type SpecimenTypeCode } from "@/types/db";
import { SpecimenQrCode } from "@/components/SpecimenQrCode";
import { DnaResultManager } from "@/components/DnaResultManager";

export const dynamic = "force-dynamic";

export default async function SpecimenDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const sb = await getSupabaseServer();
  const { role } = await getCurrentUserAndRole();

  // 1) 본 시편
  const { data: specimen } = await sb.from("specimens").select("*").eq("id", id).maybeSingle();
  if (!specimen) notFound();
  const me = specimen as Specimen;

  // 2) 같은 root_event 의 모든 시편을 가져와 부모 체인·자식 트리 계산 (DB 호출 1회)
  const { data: siblings } = await sb
    .from("specimens")
    .select("*")
    .eq("root_event_id", me.root_event_id)
    .order("created_at", { ascending: true });
  const all = (siblings as Specimen[]) ?? [];
  const byId = new Map(all.map((s) => [s.id, s]));

  // 부모 체인 (root_event → ... → me)
  const ancestors: Specimen[] = [];
  let cursor: string | null = me.parent_id;
  while (cursor && byId.has(cursor)) {
    ancestors.unshift(byId.get(cursor)!);
    cursor = byId.get(cursor)!.parent_id;
  }

  // 자식 트리
  const childrenById = new Map<string | null, Specimen[]>();
  for (const s of all) {
    if (!childrenById.has(s.parent_id)) childrenById.set(s.parent_id, []);
    childrenById.get(s.parent_id)!.push(s);
  }
  for (const arr of childrenById.values()) {
    arr.sort((a, b) => a.type_code.localeCompare(b.type_code) || a.seq_no - b.seq_no);
  }

  // 3) root_event 정보
  const { data: root } = await sb
    .from("sampling_events")
    .select(
      `id, sample_no, sampled_at,
       tree:trees(id, tree_local_no, species_code,
         species:species(ko_name),
         site:sites(id, code, region_sigungu)
       )`,
    )
    .eq("id", me.root_event_id)
    .maybeSingle();
  const rootEvent = root as
    | {
        id: string;
        sample_no: string;
        sampled_at: string;
        tree: { id: string; tree_local_no: string; species: { ko_name: string } | null; site: { id: string; code: string; region_sigungu: string | null } | null } | null;
      }
    | null;

  const t = SPECIMEN_TYPES.find((x) => x.code === me.type_code);
  const canWrite = role === "admin" || role === "lead";

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/events/${me.root_event_id}`} className="text-xs text-stone-500 hover:underline">
          ← 야장 {rootEvent?.sample_no ?? ""} 으로
        </Link>
        <h1 className="text-2xl font-bold mt-1 font-mono">{me.human_code}</h1>
        <div className="text-sm text-stone-500 mt-1">
          {t?.ko ?? me.specimen_type} ({me.type_code}{String(me.seq_no).padStart(2, "0")}) ·{" "}
          상태: <code>{me.status}</code>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-3">
          <section className="card">
            <h2 className="text-base font-bold text-brand-700 mb-2">기본 정보</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Kv label="시편 ID (인덱싱용)" value={me.id} mono />
              <Kv label="사람용 코드" value={me.human_code} mono />
              <Kv label="종류" value={`${t?.ko ?? me.specimen_type} (${me.type_code})`} />
              <Kv label="형제 번호" value={`${me.type_code}${String(me.seq_no).padStart(2, "0")}`} />
              <Kv label="보관 위치" value={me.storage_location ?? "-"} />
              <Kv label="상태" value={me.status} />
              <Kv label="생성" value={new Date(me.created_at).toLocaleString("ko-KR")} />
              <Kv label="갱신" value={new Date(me.updated_at).toLocaleString("ko-KR")} />
            </dl>
            {me.description && (
              <div className="mt-3">
                <div className="field-label">설명</div>
                <p className="text-sm whitespace-pre-wrap mt-1">{me.description}</p>
              </div>
            )}
          </section>

          {/* 추적 경로 (root_event → ancestors → me → children) */}
          <section className="card">
            <h2 className="text-base font-bold text-brand-700 mb-2">추적 경로</h2>
            <ol className="text-sm space-y-1">
              {rootEvent && (
                <li>
                  <span className="text-xs text-stone-500">야장</span>{" "}
                  <Link href={`/events/${rootEvent.id}`} className="font-mono text-brand-700 hover:underline">
                    {rootEvent.sample_no}
                  </Link>
                  {rootEvent.tree?.species?.ko_name && (
                    <span className="text-xs text-stone-500"> · {rootEvent.tree.species.ko_name}</span>
                  )}
                  {rootEvent.tree?.site?.region_sigungu && (
                    <span className="text-xs text-stone-500"> · {rootEvent.tree.site.region_sigungu}</span>
                  )}
                </li>
              )}
              {ancestors.map((a, i) => (
                <li key={a.id} style={{ paddingLeft: (i + 1) * 16 }}>
                  <span className="text-xs text-stone-500">↳</span>{" "}
                  <Link href={`/specimens/${a.id}`} className="font-mono text-stone-700 hover:underline">
                    {a.human_code}
                  </Link>
                </li>
              ))}
              <li style={{ paddingLeft: (ancestors.length + 1) * 16 }}>
                <span className="text-xs text-stone-500">↳</span>{" "}
                <span className="font-mono font-bold">{me.human_code}</span>{" "}
                <span className="text-xs text-stone-500">← 현재</span>
              </li>
            </ol>
          </section>

          {/* 자식 시편 */}
          <section className="card">
            <h2 className="text-base font-bold text-brand-700 mb-2">자식 시편</h2>
            <ChildList rootChildren={childrenById.get(me.id) ?? []} childrenById={childrenById} depth={0} />
            {(childrenById.get(me.id)?.length ?? 0) === 0 && (
              <p className="text-xs text-stone-500">자식 시편이 없습니다. {canWrite && "야장 상세 페이지의 시편 트리에서 「+ 자식」 으로 추가할 수 있습니다."}</p>
            )}
          </section>

          {/* DNA 분석 결과 — 모든 시편에서 표시. 일반적으로 X(Extract) 시편에 매단다. */}
          <DnaResultManager specimenId={me.id} canWrite={canWrite} />
        </div>

        {/* 오른쪽 QR 패널 */}
        <div className="space-y-3">
          <section className="card text-center">
            <h2 className="text-base font-bold text-brand-700 mb-2">QR 코드</h2>
            <SpecimenQrCode text={me.human_code} sizePx={192} />
            <p className="text-xs text-stone-500 mt-2 font-mono break-all">{me.human_code}</p>
            <p className="text-[11px] text-stone-400 mt-1">
              스캔 시 human_code 텍스트를 반환합니다. URL 로 바꾸려면 라벨 인쇄 페이지에서 옵션 선택.
            </p>
            <div className="mt-3 flex gap-2 justify-center">
              <Link href={`/specimens/print?ids=${me.id}`} target="_blank" className="btn-secondary text-xs">
                🏷 라벨 인쇄
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Kv({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="field-label">{label}</dt>
      <dd className={`mt-0.5 text-sm ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</dd>
    </div>
  );
}

function ChildList({
  rootChildren,
  childrenById,
  depth,
}: {
  rootChildren: Specimen[];
  childrenById: Map<string | null, Specimen[]>;
  depth: number;
}) {
  if (rootChildren.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {rootChildren.map((c) => {
        const t = SPECIMEN_TYPES.find((x) => x.code === (c.type_code as SpecimenTypeCode));
        const kids = childrenById.get(c.id) ?? [];
        return (
          <li key={c.id} style={{ paddingLeft: depth * 16 }}>
            <Link href={`/specimens/${c.id}`} className="font-mono text-sm text-brand-700 hover:underline">
              {c.human_code}
            </Link>
            <span className="text-xs text-stone-500 ml-2">
              {t?.ko ?? c.specimen_type}
              {c.status !== "active" && <span className="text-rose-700"> · {c.status}</span>}
            </span>
            <ChildList rootChildren={kids} childrenById={childrenById} depth={depth + 1} />
          </li>
        );
      })}
    </ul>
  );
}
