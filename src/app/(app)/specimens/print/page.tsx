import { getSupabaseServer } from "@/lib/supabase/server";
import { SPECIMEN_TYPES, type SpecimenTypeCode } from "@/types/db";
import { SpecimenPrintClient, type LabelItem } from "@/components/SpecimenPrintClient";

export const dynamic = "force-dynamic";

interface SP {
  event?: string; // root_event_id 의 모든 시편
  ids?: string;   // 쉼표 구분 specimen.id
  mode?: "a4" | "single";
  size?: string;  // 단일 라벨 크기, "WxH" in mm. 예: "50x30"
}

// 시편 1건 row → LabelItem (species/sample_no/type 한글명 join 포함)
function toLabelItem(s: any): LabelItem {
  const t = SPECIMEN_TYPES.find((x) => x.code === (s.type_code as SpecimenTypeCode));
  const ev = s.root_event ?? null;
  const tree = ev?.tree ?? null;
  const sp = tree?.species ?? null;
  return {
    id: s.id,
    human_code: s.human_code,
    type_code: s.type_code,
    type_label: `${t?.ko ?? s.specimen_type} (${s.type_code})`,
    status: s.status,
    species_ko: sp?.ko_name ?? null,
    species_sci: sp?.sci_name ?? null,
    species_code: tree?.species_code ?? null,
    sample_no: ev?.sample_no ?? null,
  };
}

const SELECT = `
  id, human_code, type_code, specimen_type, status,
  root_event:sampling_events!inner(
    sample_no,
    tree:trees!inner(
      species_code,
      species:species(ko_name, sci_name)
    )
  )
`;

export default async function SpecimenPrintPage(props: { searchParams: Promise<SP> }) {
  const sp = await props.searchParams;
  const sb = await getSupabaseServer();

  let initialItems: LabelItem[] = [];
  if (sp.event) {
    const { data } = await sb
      .from("specimens")
      .select(SELECT)
      .eq("root_event_id", sp.event)
      .order("created_at", { ascending: true });
    initialItems = ((data as any[]) ?? []).map(toLabelItem);
  } else if (sp.ids) {
    const idList = sp.ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (idList.length > 0) {
      const { data } = await sb.from("specimens").select(SELECT).in("id", idList);
      initialItems = ((data as any[]) ?? []).map(toLabelItem);
    }
  }

  const mode: "a4" | "single" = sp.mode === "single" ? "single" : "a4";
  const size = parseSize(sp.size ?? "50x30");

  return (
    <SpecimenPrintClient
      initialItems={initialItems}
      defaultMode={mode}
      defaultSize={size}
    />
  );
}

function parseSize(raw: string): { w: number; h: number } {
  const m = raw.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (m) return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
  return { w: 50, h: 30 };
}
