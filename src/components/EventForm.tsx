"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { GpsPicker } from "./GpsPicker";
import { PhotoSlot, type StagedPhoto } from "./PhotoSlot";
import { SpeciesPicker } from "./SpeciesPicker";
import { ddToDms, nowIsoDate, uuidv7 } from "@/lib/utils";
import { enqueueEvent, enqueuePhoto, blankPhotoPending } from "@/lib/db/queue";
import { syncOnce } from "@/lib/sync/worker";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { PhotoCategory, SamplingEvent, Site, Tree } from "@/types/db";

const Schema = z.object({
  site_code: z.string().min(3),
  region_sigungu_code: z.string().min(1, "행정구역 코드 필요"),
  region_sigungu: z.string().min(1),
  region_sido: z.string().min(1),
  address_detail: z.string().min(1),
  habitat_terrain: z.string().optional().default(""),
  tree_local_no: z.string().min(1),
  species_code: z.string().min(1, "수종 선택 필요"),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  elevation_m: z.number().int().nullable(),
  aspect_deg: z.number().int().min(0).max(359).nullable(),
  sample_no: z.string().min(3),
  sampled_at: z.string().min(10),
  height_m: z.number().min(0).max(150),
  dbh_cm: z.number().min(0).max(500),
  dna_collected: z.boolean(),
  dna_sample_code: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});

type State = {
  site_code: string;
  region_sigungu_code: string;
  region_sigungu: string;
  region_sido: string;
  address_detail: string;
  habitat_terrain: string;
  tree_local_no: string;
  species_code: string;
  lat: number | null;
  lon: number | null;
  elevation_m: number | null;
  aspect_deg: number | null;
  sample_no: string;
  sampled_at: string;
  height_m: number;
  dbh_cm: number;
  dna_collected: boolean;
  dna_sample_code: string;
  notes: string;
};

const PHOTO_LABELS: Record<PhotoCategory, string> = {
  tree_form: "수형",
  bark: "수피",
  branch: "가지",
  leaf_litter: "잎/낙엽",
};

interface Props {
  defaultSiteCode?: string;
  defaultRegionSigunguCode?: string;
  defaultRegionSigungu?: string;
  defaultRegionSido?: string;
}

export function EventForm(props: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({
    site_code: props.defaultSiteCode ?? `${new Date().getFullYear()}_`,
    region_sigungu_code: props.defaultRegionSigunguCode ?? "",
    region_sigungu: props.defaultRegionSigungu ?? "",
    region_sido: props.defaultRegionSido ?? "",
    address_detail: "",
    habitat_terrain: "",
    tree_local_no: "01",
    species_code: "",
    lat: null,
    lon: null,
    elevation_m: null,
    aspect_deg: null,
    sample_no: "",
    sampled_at: nowIsoDate(),
    height_m: 0,
    dbh_cm: 0,
    dna_collected: false,
    dna_sample_code: "",
    notes: "",
  });
  const [photos, setPhotos] = useState<Record<PhotoCategory, StagedPhoto | null>>({
    tree_form: null,
    bark: null,
    branch: null,
    leaf_litter: null,
  });
  const [gpsAcc, setGpsAcc] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 입력값 변화 helper
  function update<K extends keyof State>(k: K, v: State[K]) {
    setState((s) => ({ ...s, [k]: v }));
  }

  // sample_no 자동 추천
  function suggestSampleNo() {
    if (!state.site_code) return;
    const padded = state.tree_local_no.padStart(2, "0");
    update("sample_no", `${state.site_code}_${padded}`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      // 1) 유효성
      const parsed = Schema.safeParse(state);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new Error(`${first.path.join(".")}: ${first.message}`);
      }
      if (state.lat == null || state.lon == null) {
        throw new Error("위치(위도/경도)를 먼저 가져오세요.");
      }

      // 2) 현재 사용자
      const sb = getSupabaseBrowser();
      const { data: u } = await sb.auth.getUser();
      const uid = u.user?.id ?? null;

      // 3) Site / Tree / Event 객체 구성
      const siteId = uuidv7();
      const treeId = uuidv7();
      const eventId = uuidv7();
      const now = new Date().toISOString();

      const site: Site = {
        id: siteId,
        code: state.site_code,
        region_sido: state.region_sido,
        region_sigungu: state.region_sigungu,
        region_sigungu_code: state.region_sigungu_code,
        address_detail: state.address_detail,
        habitat_terrain: state.habitat_terrain || null,
        created_by: uid,
        created_at: now,
        updated_at: now,
      };
      const tree: Tree = {
        id: treeId,
        site_id: siteId,
        tree_local_no: state.tree_local_no,
        species_code: state.species_code,
        lat: state.lat,
        lon: state.lon,
        lat_dms: state.lat != null ? ddToDms(state.lat, true) : null,
        lon_dms: state.lon != null ? ddToDms(state.lon, false) : null,
        elevation_m: state.elevation_m,
        aspect_deg: state.aspect_deg,
        tag_id: null,
        status: "active",
        created_by: uid,
        created_at: now,
        updated_at: now,
      };
      const event: SamplingEvent = {
        id: eventId,
        tree_id: treeId,
        sample_no: state.sample_no,
        sampled_at: state.sampled_at,
        height_m: state.height_m,
        dbh_cm: state.dbh_cm,
        dna_collected: state.dna_collected,
        dna_sample_code: state.dna_sample_code || null,
        notes: state.notes || null,
        surveyor_id: uid,
        co_surveyors: [],
        device_recorded_at: now,
        sync_status: "queued",
        created_at: now,
        updated_at: now,
      };

      // 4) IndexedDB 큐에 등록
      await enqueueEvent({ event, tree, site });
      for (const cat of ["tree_form", "bark", "branch", "leaf_litter"] as PhotoCategory[]) {
        const p = photos[cat];
        if (!p) continue;
        await enqueuePhoto(
          blankPhotoPending({
            id: p.id,
            event_id: eventId,
            category: cat,
            blob: p.blob,
            filename: p.filename,
            sha256: p.sha256,
            width: p.width,
            height: p.height,
            exif_taken_at: p.exif_taken_at,
            exif_lat: p.exif_lat,
            exif_lon: p.exif_lon,
          }),
        );
      }

      // 5) 온라인이면 즉시 1회 동기화 시도, 실패해도 큐에 남음
      if (navigator.onLine) {
        await syncOnce();
      }

      router.push("/queue?just=1");
    } catch (e: any) {
      setErr(e?.message ?? "저장 실패");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* 채취 기본 */}
      <section className="card space-y-3">
        <h2 className="text-base font-bold text-brand-700">채취 기본 정보</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="field-label">채취 번호</span>
            <div className="flex gap-1 items-center">
              <input
                className="field-value flex-1"
                value={state.sample_no}
                onChange={(e) => update("sample_no", e.target.value)}
                placeholder="2025_담양_01"
              />
              <button type="button" className="btn-secondary text-xs whitespace-nowrap" onClick={suggestSampleNo}>
                자동
              </button>
            </div>
          </div>
          <div>
            <span className="field-label">채취일</span>
            <input
              type="date"
              className="field-value"
              value={state.sampled_at}
              onChange={(e) => update("sampled_at", e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* 지점 */}
      <section className="card space-y-3">
        <h2 className="text-base font-bold text-brand-700">조사 지점</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="field-label">지점 코드</span>
            <input
              className="field-value"
              value={state.site_code}
              onChange={(e) => update("site_code", e.target.value)}
              placeholder="2025_담양"
            />
          </div>
          <div>
            <span className="field-label">개체목 번호</span>
            <input
              className="field-value"
              value={state.tree_local_no}
              onChange={(e) => update("tree_local_no", e.target.value)}
              placeholder="01"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="field-label">시도</span>
            <input className="field-value" value={state.region_sido} onChange={(e) => update("region_sido", e.target.value)} placeholder="전라남도" />
          </div>
          <div>
            <span className="field-label">시군구</span>
            <input className="field-value" value={state.region_sigungu} onChange={(e) => update("region_sigungu", e.target.value)} placeholder="담양군" />
          </div>
        </div>
        <div>
          <span className="field-label">시군구 코드</span>
          <input
            className="field-value"
            value={state.region_sigungu_code}
            onChange={(e) => update("region_sigungu_code", e.target.value)}
            placeholder="46710"
          />
        </div>
        <div>
          <span className="field-label">장소 상세</span>
          <input
            className="field-value"
            value={state.address_detail}
            onChange={(e) => update("address_detail", e.target.value)}
            placeholder="대덕면 비차리 산209-1번지 일대"
          />
        </div>
        <div>
          <span className="field-label">지형</span>
          <input
            className="field-value"
            value={state.habitat_terrain}
            onChange={(e) => update("habitat_terrain", e.target.value)}
            placeholder="능선 / 계곡 / 평지 / 사면 등"
          />
        </div>
      </section>

      {/* 위치 */}
      <section className="card space-y-3">
        <h2 className="text-base font-bold text-brand-700">위치</h2>
        <GpsPicker
          value={{ lat: state.lat, lon: state.lon, accuracy: gpsAcc }}
          onChange={(v) => {
            update("lat", v.lat);
            update("lon", v.lon);
            setGpsAcc(v.accuracy);
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="field-label">해발고 (m)</span>
            <input
              type="number"
              className="field-value"
              value={state.elevation_m ?? ""}
              onChange={(e) => update("elevation_m", e.target.value ? parseInt(e.target.value, 10) : null)}
              placeholder="126"
            />
          </div>
          <div>
            <span className="field-label">방위 (0–359°)</span>
            <input
              type="number"
              className="field-value"
              value={state.aspect_deg ?? ""}
              onChange={(e) => update("aspect_deg", e.target.value ? parseInt(e.target.value, 10) : null)}
              placeholder="180"
            />
          </div>
        </div>
      </section>

      {/* 수종·계측 */}
      <section className="card space-y-3">
        <h2 className="text-base font-bold text-brand-700">수종·계측</h2>
        <SpeciesPicker
          value={state.species_code || null}
          onChange={(c) => update("species_code", c ?? "")}
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="field-label">수고 (m)</span>
            <input
              type="number"
              step="0.1"
              className="field-value"
              value={state.height_m}
              onChange={(e) => update("height_m", parseFloat(e.target.value) || 0)}
              placeholder="20"
            />
          </div>
          <div>
            <span className="field-label">DBH (cm)</span>
            <input
              type="number"
              step="0.1"
              className="field-value"
              value={state.dbh_cm}
              onChange={(e) => update("dbh_cm", parseFloat(e.target.value) || 0)}
              placeholder="45.0"
            />
          </div>
        </div>
      </section>

      {/* DNA */}
      <section className="card space-y-3">
        <h2 className="text-base font-bold text-brand-700">DNA 시료</h2>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={state.dna_collected}
            onChange={(e) => update("dna_collected", e.target.checked)}
          />
          <span className="text-sm">DNA 시료를 채취하였음</span>
        </label>
        {state.dna_collected && (
          <input
            className="field-value"
            value={state.dna_sample_code}
            onChange={(e) => update("dna_sample_code", e.target.value)}
            placeholder="DNA 라벨 (선택)"
          />
        )}
      </section>

      {/* 사진 */}
      <section className="space-y-2">
        <h2 className="text-base font-bold text-brand-700">사진 (4종)</h2>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(PHOTO_LABELS) as PhotoCategory[]).map((cat) => (
            <PhotoSlot
              key={cat}
              category={cat}
              label={PHOTO_LABELS[cat]}
              value={photos[cat]}
              onChange={(p) => setPhotos((prev) => ({ ...prev, [cat]: p }))}
            />
          ))}
        </div>
      </section>

      {/* 특기사항 */}
      <section className="card space-y-3">
        <h2 className="text-base font-bold text-brand-700">특기사항</h2>
        <textarea
          className="field-value min-h-[100px]"
          value={state.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="자유 기록"
        />
      </section>

      {err && <div className="rounded bg-rose-50 p-3 text-sm text-rose-800">{err}</div>}

      <div className="sticky bottom-2 z-10 flex gap-2 bg-stone-50/80 backdrop-blur p-2 rounded-lg">
        <button type="button" className="btn-secondary flex-1" onClick={() => router.back()}>
          취소
        </button>
        <button type="submit" disabled={submitting} className="btn-primary flex-[2]">
          {submitting ? "저장 중…" : "저장 + 동기화"}
        </button>
      </div>
    </form>
  );
}
