import { notFound } from "next/navigation";
import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { EditEventForm } from "@/components/EditEventForm";
import { PhotoEditor, type PhotoWithUrl } from "@/components/PhotoEditor";

export const dynamic = "force-dynamic";

export default async function EditEventPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const sb = await getSupabaseServer();
  const { data: event } = await sb
    .from("sampling_events")
    .select("id, sample_no, sampled_at, height_m, dbh_cm, dna_collected, dna_sample_code, notes")
    .eq("id", params.id)
    .maybeSingle();

  if (!event) notFound();

  const { data: photos } = await sb
    .from("photos")
    .select("id, category, storage_path, original_filename, width, height, bytes, exif_taken_at")
    .eq("event_id", params.id)
    .order("uploaded_at");

  const photosWithUrl: PhotoWithUrl[] = await Promise.all(
    (photos ?? []).map(async (p: any) => {
      const { data } = await sb.storage.from("photos").createSignedUrl(p.storage_path, 900);
      return {
        id: p.id,
        category: p.category,
        storage_path: p.storage_path,
        signedUrl: data?.signedUrl ?? null,
        original_filename: p.original_filename,
        width: p.width,
        height: p.height,
        bytes: p.bytes,
        exif_taken_at: p.exif_taken_at,
      };
    })
  );

  return (
    <div className="space-y-6">
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
      <PhotoEditor eventId={event.id} initialPhotos={photosWithUrl} />
    </div>
  );
}
