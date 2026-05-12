import { notFound } from "next/navigation";
import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { EditEventForm } from "@/components/EditEventForm";

export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: { id: string } }) {
  const sb = getSupabaseServer();
  const { data: event } = await sb
    .from("sampling_events")
    .select("id, sample_no, sampled_at, height_m, dbh_cm, dna_collected, dna_sample_code, notes")
    .eq("id", params.id)
    .maybeSingle();

  if (!event) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/events/${event.id}`} className="text-sm text-stone-500 hover:underline">
          ← 야장 상세로 돌아가기
        </Link>
        <h1 className="text-xl font-bold mt-2">야장 수정: {event.sample_no}</h1>
      </div>
      <EditEventForm
        initial={{
          id: event.id,
          sample_no: event.sample_no,
          sampled_at: event.sampled_at,
          height_m: event.height_m,
          dbh_cm: event.dbh_cm,
          dna_collected: event.dna_collected,
          dna_sample_code: event.dna_sample_code,
          notes: event.notes,
        }}
      />
    </div>
  );
}
