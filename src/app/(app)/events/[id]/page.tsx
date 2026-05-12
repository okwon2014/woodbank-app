import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getCurrentUserAndRole } from "@/lib/auth/role";
import { DeleteEventButton } from "@/components/DeleteEventButton";
import { ClickableThumbnail } from "@/components/PhotoLightbox";
import type { PhotoCategory } from "@/types/db";

export const dynamic = "force-dynamic";

const PHOTO_LABELS: Record<PhotoCategory, string> = {
  tree_form: "수형",
  bark: "수피",
  branch: "가지",
  leaf_litter: "잎/낙엽",
};

export default async function EventDetailPage({ params }: { params: { id: string } }) {
  const sb = getSupabaseServer();
  const { role } = await getCurrentUserAndRole();

  const { data: event } = await sb
    .from("sampling_events")
    .select(`
      *,
      tree:trees(
        id, tree_local_no, species_code, lat, lon, lat_dms, lon_dms,
        elevation_m, aspect_deg, status,
        site:sites(id, code, region_sido, region_sigungu, address_detail, habitat_terrain)
      )
    `)
    .eq("id", params.id)
    .maybeSingle();

  if (!event) notFound();

  // 조사자 메타는 users_meta 가 auth.users 를 통해 간접 참조라 별도 조회
  let surveyor: { display_name: string | null; organization: string | null } | null = null;
  if (event.surveyor_id) {
    const { data } = await sb
      .from("users_meta")
      .select("display_name, organization")
      .eq("id", event.surveyor_id)
      .maybeSingle();
    surveyor = data ?? null;
  }

  const { data: photos } = await sb
    .from("photos")
    .select("id, category, storage_path, original_filename, width, height, bytes, exif_taken_at, uploaded_at")
    .eq("event_id", params.id)
    .order("uploaded_at");

  // Storage 서명 URL 발급 (15분)
  const photosWithUrl = await Promise.all(
    (photos ?? []).map(async (p) => {
      const { data } = await sb.storage.from("photos").createSignedUrl(p.storage_path, 900);
      return { ...p, signedUrl: data?.signedUrl ?? null };
    })
  );

  const tree = (event as any).tree;
  const site = tree?.site;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-stone-500">채취 야장</div>
          <h1 className="text-2xl font-bold">{event.sample_no}</h1>
          <div className="text-sm text-stone-500 mt-1">
            {new Date(event.sampled_at).toLocaleDateString("ko-KR", { dateStyle: "long" })}
            {surveyor?.display_name && <> · 조사자 {surveyor.display_name}</>}
          </div>
        </div>
        {event.sync_status !== "synced" && (
          <span className="text-xs rounded bg-amber-100 text-amber-900 px-2 py-1">
            {event.sync_status}
          </span>
        )}
      </div>

      {/* 액션 + 빠른 링크 */}
      <div className="flex gap-2 flex-wrap items-center">
        <Link href={`/events/${event.id}/edit`} className="btn-secondary text-xs">
          ✎ 수정
        </Link>
        {role === "admin" && (
          <DeleteEventButton id={event.id} sampleNo={event.sample_no} />
        )}
        <div className="grow" />
        {site && (
          <Link href={`/sites/${site.id}`} className="btn-secondary text-xs">
            ← 지점: {site.code}
          </Link>
        )}
        {tree && (
          <Link href={`/trees/${tree.id}`} className="btn-secondary text-xs">
            ← 개체목 #{tree.tree_local_no} 이력 보기
          </Link>
        )}
      </div>

      {/* 채취 기본 정보 */}
      <section className="card">
        <h2 className="text-base font-bold text-brand-700 mb-3">채취 기본 정보</h2>
        <Grid>
          <KV label="채취 번호" value={event.sample_no} />
          <KV label="채취일" value={new Date(event.sampled_at).toLocaleDateString("ko-KR")} />
          <KV label="수고" value={event.height_m != null ? `${event.height_m} m` : "-"} />
          <KV label="DBH" value={event.dbh_cm != null ? `${event.dbh_cm} cm` : "-"} />
          <KV label="DNA 채취" value={event.dna_collected ? `✓ ${event.dna_sample_code ?? ""}` : "—"} />
          <KV label="기기 입력 시각" value={event.device_recorded_at ? new Date(event.device_recorded_at).toLocaleString("ko-KR") : "-"} />
        </Grid>
        {event.notes && (
          <div className="mt-3">
            <div className="field-label">특기사항</div>
            <p className="text-sm whitespace-pre-wrap mt-1">{event.notes}</p>
          </div>
        )}
      </section>

      {/* 개체목 */}
      {tree && (
        <section className="card">
          <h2 className="text-base font-bold text-brand-700 mb-3">개체목</h2>
          <Grid>
            <KV label="개체목 번호" value={`#${tree.tree_local_no}`} />
            <KV label="수종 코드" value={tree.species_code ?? "-"} />
            <KV label="위도" value={tree.lat != null ? `${tree.lat.toFixed(6)} (${tree.lat_dms ?? ""})` : "-"} mono />
            <KV label="경도" value={tree.lon != null ? `${tree.lon.toFixed(6)} (${tree.lon_dms ?? ""})` : "-"} mono />
            <KV label="해발고" value={tree.elevation_m != null ? `${tree.elevation_m} m` : "-"} />
            <KV label="방위" value={tree.aspect_deg != null ? `${tree.aspect_deg}°` : "-"} />
            <KV label="상태" value={tree.status} />
          </Grid>
        </section>
      )}

      {/* 지점 */}
      {site && (
        <section className="card">
          <h2 className="text-base font-bold text-brand-700 mb-3">조사 지점</h2>
          <Grid>
            <KV label="지점 코드" value={site.code} />
            <KV label="시도" value={site.region_sido ?? "-"} />
            <KV label="시군구" value={site.region_sigungu ?? "-"} />
            <KV label="지형" value={site.habitat_terrain ?? "-"} />
          </Grid>
          {site.address_detail && (
            <div className="mt-3">
              <div className="field-label">장소 상세</div>
              <p className="text-sm mt-1">{site.address_detail}</p>
            </div>
          )}
        </section>
      )}

      {/* 사진 — 클릭 시 라이트박스로 원본+EXIF 보기 */}
      <section>
        <h2 className="text-base font-bold text-brand-700 mb-3">사진</h2>
        <p className="text-xs text-stone-500 mb-3">썸네일을 탭하면 원본 크기로 보고 좌/우 화살표로 넘길 수 있습니다.</p>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(PHOTO_LABELS) as PhotoCategory[]).map((cat) => {
            const indexed = photosWithUrl
              .map((p, i) => ({ p, i }))
              .filter(({ p }) => p.category === cat);
            return (
              <div key={cat} className="card">
                <div className="text-sm font-semibold mb-2">{PHOTO_LABELS[cat]}</div>
                {indexed.length === 0 ? (
                  <div className="aspect-square rounded-md bg-stone-100 flex items-center justify-center text-stone-400 text-xs">
                    없음
                  </div>
                ) : (
                  <div className="space-y-2">
                    {indexed.map(({ p, i }) =>
                      p.signedUrl ? (
                        <ClickableThumbnail
                          key={p.id}
                          photos={photosWithUrl}
                          index={i}
                        />
                      ) : (
                        <div key={p.id} className="text-xs text-rose-600">이미지 로드 실패</div>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 text-sm">{children}</div>;
}

function KV({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <div className={`mt-0.5 ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}
