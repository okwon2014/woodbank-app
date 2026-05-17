import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getCurrentUserAndRole } from "@/lib/auth/role";
import { DeleteEventButton } from "@/components/DeleteEventButton";
import { SpecimenManager } from "@/components/SpecimenManager";
import { ClickableThumbnail } from "@/components/PhotoLightbox";
import type { PhotoCategory } from "@/types/db";

export const dynamic = "force-dynamic";

const PHOTO_LABELS: Record<PhotoCategory, string> = {
  tree_form: "수형",
  bark: "수피",
  branch: "가지",
  leaf_litter: "잎/낙엽",
};

export default async function EventDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const sb = await getSupabaseServer();
  const { role } = await getCurrentUserAndRole();

  // 수종 마스터(species)까지 함께 조인해 상단 hero 에서 한글명·학명을 바로 표시.
  const { data: event } = await sb
    .from("sampling_events")
    .select(`
      *,
      tree:trees(
        id, tree_local_no, species_code, lat, lon, lat_dms, lon_dms,
        elevation_m, aspect_deg, status, tag_id,
        species:species(code, ko_name, sci_name, family),
        site:sites(id, code, region_sido, region_sigungu, region_sigungu_code, address_detail, habitat_terrain)
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
  const species = tree?.species ?? null;
  const koName: string | null = species?.ko_name ?? null;
  const sciName: string | null = species?.sci_name ?? null;
  const family: string | null = species?.family ?? null;

  return (
    <div className="space-y-6">
      {/* 액션 + 빠른 링크 (상단 도구바) */}
      <div className="flex gap-2 flex-wrap items-center">
        <Link href="/events" className="text-sm text-stone-500 hover:underline">
          ← 야장 목록
        </Link>
        <div className="grow" />
        {role === "admin" && (
          <DeleteEventButton id={event.id} sampleNo={event.sample_no} />
        )}
      </div>

      {/* 1) 수종 + 핵심 컨텍스트 HERO — 야장 목록의 한 줄을 펼친 요약 */}
      <section className="card bg-brand-50/40 border-brand-200">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wider text-brand-700 font-semibold">수종</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-2xl font-bold truncate">{koName ?? "수종 미지정"}</h1>
              {sciName && (
                <span className="italic text-stone-600 text-base truncate">{sciName}</span>
              )}
              {tree?.species_code && (
                <span className="text-xs font-mono bg-white border border-brand-200 text-brand-700 px-2 py-0.5 rounded">
                  {tree.species_code}
                </span>
              )}
            </div>
            {family && <p className="text-xs text-stone-500 mt-0.5">과: {family}</p>}

            {/* 채취 컨텍스트 */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Mini label="채취 번호" value={event.sample_no} mono />
              <Mini
                label="채취일"
                value={new Date(event.sampled_at).toLocaleDateString("ko-KR")}
              />
              <Mini label="수고" value={event.height_m != null ? `${event.height_m} m` : "-"} />
              <Mini label="DBH" value={event.dbh_cm != null ? `${event.dbh_cm} cm` : "-"} />
            </div>

            {/* 지점 요약 + 빠른 이동 */}
            <div className="mt-3 text-xs text-stone-600">
              {site && (
                <>
                  <span>📍 </span>
                  {site.region_sido && <span>{site.region_sido} </span>}
                  <span>{site.region_sigungu ?? "지점 미지정"}</span>
                  <span className="mx-1.5 text-stone-400">·</span>
                  <Link href={`/sites/${site.id}`} className="font-mono hover:underline">
                    {site.code}
                  </Link>
                  {tree?.tree_local_no && (
                    <>
                      <span className="mx-1.5 text-stone-400">·</span>
                      <Link href={`/trees/${tree.id}`} className="hover:underline">
                        개체목 #{tree.tree_local_no}
                      </Link>
                    </>
                  )}
                  {surveyor?.display_name && (
                    <>
                      <span className="mx-1.5 text-stone-400">·</span>
                      <span>조사자 {surveyor.display_name}</span>
                    </>
                  )}
                </>
              )}
            </div>

            {/* 배지 */}
            {(event.dna_collected || event.sync_status !== "synced") && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {event.dna_collected && (
                  <span className="text-[11px] rounded bg-amber-100 text-amber-900 px-2 py-0.5">
                    DNA 채취{event.dna_sample_code ? ` · ${event.dna_sample_code}` : ""}
                  </span>
                )}
                {event.sync_status !== "synced" && (
                  <span className="text-[11px] rounded bg-orange-100 text-orange-900 px-2 py-0.5">
                    동기화: {event.sync_status}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 수종/개체목 수정 — 수종은 tree 테이블이 owner */}
          {tree && (
            <Link href={`/trees/${tree.id}/edit`} className="btn-secondary text-xs shrink-0">
              ✎ 수종/개체목 수정
            </Link>
          )}
        </div>
      </section>

      {/* 2) 시편(specimens) — 사용자 요청에 따라 수종 hero 다음 위치 */}
      <SpecimenManager
        eventId={event.id}
        sampleNo={event.sample_no}
        canWrite={role === "admin" || role === "lead"}
      />

      {/* 3) 채취 기본 정보 (event 테이블 필드) */}
      <section className="card">
        <SectionHeader title="채취 기본 정보" editHref={`/events/${event.id}/edit`} editLabel="✎ 야장 수정" />
        <Grid>
          <KV label="채취 번호" value={event.sample_no} mono />
          <KV label="채취일" value={new Date(event.sampled_at).toLocaleDateString("ko-KR")} />
          <KV label="수고" value={event.height_m != null ? `${event.height_m} m` : "-"} />
          <KV label="DBH" value={event.dbh_cm != null ? `${event.dbh_cm} cm` : "-"} />
          <KV label="DNA 채취" value={event.dna_collected ? `✓ ${event.dna_sample_code ?? ""}` : "—"} />
          <KV
            label="기기 입력 시각"
            value={event.device_recorded_at ? new Date(event.device_recorded_at).toLocaleString("ko-KR") : "-"}
          />
        </Grid>
        {event.notes && (
          <div className="mt-3">
            <div className="field-label">특기사항</div>
            <p className="text-sm whitespace-pre-wrap mt-1">{event.notes}</p>
          </div>
        )}
      </section>

      {/* 4) 개체목·위치 (tree 테이블 필드) */}
      {tree && (
        <section className="card">
          <SectionHeader title="개체목·위치" editHref={`/trees/${tree.id}/edit`} editLabel="✎ 개체목 수정" />
          <Grid>
            <KV label="개체목 번호" value={`#${tree.tree_local_no}`} />
            <KV label="수종 코드" value={tree.species_code ?? "-"} mono />
            <KV
              label="위도"
              value={tree.lat != null ? `${tree.lat.toFixed(6)}${tree.lat_dms ? ` (${tree.lat_dms})` : ""}` : "-"}
              mono
            />
            <KV
              label="경도"
              value={tree.lon != null ? `${tree.lon.toFixed(6)}${tree.lon_dms ? ` (${tree.lon_dms})` : ""}` : "-"}
              mono
            />
            <KV label="해발고" value={tree.elevation_m != null ? `${tree.elevation_m} m` : "-"} />
            <KV label="방위" value={tree.aspect_deg != null ? `${tree.aspect_deg}°` : "-"} />
            <KV label="상태" value={tree.status} />
            {tree.tag_id && <KV label="태그 ID" value={tree.tag_id} mono />}
          </Grid>
        </section>
      )}

      {/* 5) 조사 지점 (site 테이블 필드) */}
      {site && (
        <section className="card">
          <SectionHeader title="조사 지점" editHref={`/sites/${site.id}/edit`} editLabel="✎ 지점 수정" />
          <Grid>
            <KV label="지점 코드" value={site.code} mono />
            <KV label="시도" value={site.region_sido ?? "-"} />
            <KV label="시군구" value={site.region_sigungu ?? "-"} />
            <KV label="시군구 코드" value={site.region_sigungu_code ?? "-"} mono />
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

      {/* 6) 사진 — 클릭 시 라이트박스로 원본+EXIF 보기 */}
      <section>
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="text-base font-bold text-brand-700">사진</h2>
          <Link href={`/events/${event.id}/edit`} className="btn-secondary text-xs">
            ✎ 사진 관리
          </Link>
        </div>
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

function SectionHeader({ title, editHref, editLabel }: { title: string; editHref: string; editLabel: string }) {
  return (
    <div className="flex items-center justify-between mb-3 gap-2">
      <h2 className="text-base font-bold text-brand-700">{title}</h2>
      <Link href={editHref} className="btn-secondary text-xs shrink-0">
        {editLabel}
      </Link>
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

function Mini({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className={`mt-0.5 font-semibold truncate ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}
