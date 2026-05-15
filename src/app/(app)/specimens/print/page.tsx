import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { SPECIMEN_TYPES, type Specimen, type SpecimenTypeCode } from "@/types/db";
import { SpecimenPrintClient } from "@/components/SpecimenPrintClient";

export const dynamic = "force-dynamic";

interface SP {
  event?: string; // root_event_id 의 모든 시편
  ids?: string;   // 쉼표 구분 specimen.id
  mode?: "a4" | "single";
  size?: string;  // 단일 라벨 크기, "WxH" in mm. 예: "50x30"
}

export default async function SpecimenPrintPage(props: { searchParams: Promise<SP> }) {
  const sp = await props.searchParams;
  const sb = await getSupabaseServer();

  let specimens: Specimen[] = [];
  if (sp.event) {
    const { data } = await sb
      .from("specimens")
      .select("*")
      .eq("root_event_id", sp.event)
      .order("created_at", { ascending: true });
    specimens = (data as Specimen[]) ?? [];
  } else if (sp.ids) {
    const idList = sp.ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (idList.length > 0) {
      const { data } = await sb.from("specimens").select("*").in("id", idList);
      specimens = (data as Specimen[]) ?? [];
    }
  }

  if (specimens.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-bold">라벨 인쇄</h1>
        <p className="text-sm text-stone-500">
          인쇄할 시편이 없습니다. <Link href="/sites" className="underline">조사지점</Link> 또는
          야장 상세 페이지의 「🏷 라벨 인쇄」 에서 시작하세요.
        </p>
      </div>
    );
  }

  const mode: "a4" | "single" = sp.mode === "single" ? "single" : "a4";
  const size = parseSize(sp.size ?? "50x30");

  // 종류·코드 한글 매핑 (서버에서 미리 join 해 client 에 가볍게 전달)
  const items = specimens.map((s) => {
    const t = SPECIMEN_TYPES.find((x) => x.code === (s.type_code as SpecimenTypeCode));
    return {
      id: s.id,
      human_code: s.human_code,
      type_label: `${t?.ko ?? s.specimen_type} (${s.type_code})`,
      status: s.status,
    };
  });

  return (
    <SpecimenPrintClient
      items={items}
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
