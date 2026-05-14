"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { GpsPicker } from "./GpsPicker";
import { PhotoSlot, type StagedPhoto } from "./PhotoSlot";
import { SpeciesPicker } from "./SpeciesPicker";
import { PHOTO_QUALITY_LABELS, type PhotoQuality } from "@/lib/photo/compress";
import { ddToDms, nowIsoDate, uuidv7 } from "@/lib/utils";
import { enqueueEvent, enqueuePhoto, blankPhotoPending } from "@/lib/db/queue";
import { syncOnce } from "@/lib/sync/worker";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import type { PhotoCategory, SamplingEvent, Site, Tree } from "@/types/db";

const PHOTO_QUALITY_LS_KEY = "woodbank.photoQuality";

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
  height_m: z.number().min(0).max(150).nullable(),
  dbh_cm: z.number().min(0).max(500).nullable(),
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
  height_m: number | null;
  dbh_cm: number | null;
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
    height_m: null,
    dbh_cm: null,
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
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeMsg, setGeocodeMsg] = useState<string | null>(null);
  const [photoQuality, setPhotoQuality] = useState<PhotoQuality>("normal");
  const [sampleNoStatus, setSampleNoStatus] = useState<"idle" | "checking" | "ok" | "taken">("idle");

  // 사진 품질 — localStorage 에 단말별로 기억
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(PHOTO_QUALITY_LS_KEY) : null;
    if (saved === "fast" || saved === "normal" || saved === "high") setPhotoQuality(saved);
  }, []);
  function changePhotoQuality(q: PhotoQuality) {
    setPhotoQuality(q);
    try { window.localStorage.setItem(PHOTO_QUALITY_LS_KEY, q); } catch {}
  }

  // sample_no DB 중복 체크 (디바운스). 같은 입력에 대해 1회만 fetch.
  useEffect(() => {
    const sn = state.sample_no.trim();
    if (!sn || sn.length < 3) { setSampleNoStatus("idle"); return; }
    setSampleNoStatus("checking");
    const t = setTimeout(async () => {
      try {
        const sb = getSupabaseBrowser();
        const { data, error } = await sb
          .from("sampling_events")
          .select("id")
          .eq("sample_no", sn)
          .limit(1)
          .maybeSingle();
        if (error) { setSampleNoStatus("idle"); return; }
        setSampleNoStatus(data ? "taken" : "ok");
      } catch {
        setSampleNoStatus("idle");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [state.sample_no]);

  // 입력값 변화 helper
  function update<K extends keyof State>(k: K, v: State[K]) {
    setState((s) => ({ ...s, [k]: v }));
  }

  // 현재 lat/lon 으로 주소(시도/시군구/시군구코드/장소상세) 자동 채우기.
  // 비어 있는 필드만 채워서 사용자가 손으로 적어둔 값은 보존한다.
  async function fillAddressFromCoords() {
    if (state.lat == null || state.lon == null) {
      setGeocodeMsg("먼저 위치를 가져오세요.");
      return;
    }
    setGeocoding(true);
    setGeocodeMsg(null);
    try {
      const res = await fetch(`/api/geocode/reverse?lat=${state.lat}&lon=${state.lon}`);
      if (!res.ok) throw new Error(`주소 조회 실패 (${res.status})`);
      const j = await res.json();
      const filled: string[] = [];
      setState((s) => {
        const next = { ...s };
        if (!s.region_sido && j.sido) { next.region_sido = j.sido; filled.push("시도"); }
        if (!s.region_sigungu && j.sigungu) { next.region_sigungu = j.sigungu; filled.push("시군구"); }
        if (!s.region_sigungu_code && j.sigungu_code) { next.region_sigungu_code = j.sigungu_code; filled.push("시군구코드"); }
        if (!s.address_detail && j.address_detail) { next.address_detail = j.address_detail; filled.push("장소 상세"); }
        return next;
      });
      const src = j.source === "vworld" ? "VWorld" : j.source === "nominatim" ? "OSM Nominatim" : "(소스 없음)";
      setGeocodeMsg(
        filled.length > 0
          ? `${src}에서 ${filled.join(" · ")}를 채웠습니다.`
          : `${src} 조회 완료 — 비어 있는 필드가 없어 변경하지 않았습니다.`,
      );
    } catch (e: any) {
      setGeocodeMsg(e?.message ?? "주소 조회 실패");
    } finally {
      setGeocoding(false);
    }
  }

  // sample_no 자동 추천 — 같은 site_code 안에서 마지막 번호 + 1 을 추천.
  // 서버에서 like 'site_code_%' 인 sample_no 를 가져와 끝의 정수만 추출.
  async function suggestSampleNo() {
    if (!state.site_code) return;
    let nextNum = parseInt(state.tree_local_no, 10) || 1;
    try {
      const sb = getSupabaseBrowser();
      const { data } = await sb
        .from("sampling_events")
        .select("sample_no")
        .like("sample_no", `${state.site_code}\\_%`)
        .order("sample_no", { ascending: false })
        .limit(20);
      // 마지막 _뒤의 정수 부분 (예: "2025_담양_03-2" 에서 3)
      const nums = (data ?? [])
        .map((r: { sample_no: string }) => {
          const m = r.sample_no.match(/_(\d+)(?:-\d+)?$/);
          return m ? parseInt(m[1], 10) : NaN;
        })
        .filter((n: number) => !Number.isNaN(n));
      if (nums.length > 0) nextNum = Math.max(...nums) + 1;
    } catch {
      // 오프라인이면 클라이언트 값 기준
    }
    const padded = String(nextNum).padStart(2, "0");
    update("tree_local_no", padded);
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
      if (state.height_m == null) throw new Error("수고를 입력해주세요.");
      if (state.dbh_cm == null) throw new Error("DBH(흉고직경)를 입력해주세요.");

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
            {sampleNoStatus === "taken" && (
              <p className="text-xs text-rose-700 mt-1">⚠️ 같은 채취번호가 이미 서버에 있습니다. 자동 충돌로 표시될 수 있어요.</p>
            )}
            {sampleNoStatus === "ok" && (
              <p className="text-xs text-emerald-700 mt-1">✓ 사용 가능한 채취번호입니다.</p>
            )}
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={fillAddressFromCoords}
            disabled={geocoding || state.lat == null || state.lon == null}
          >
            {geocoding ? "주소 조회 중…" : "🏷 좌표로 주소 채우기"}
          </button>
          {geocodeMsg && <span className="text-xs text-stone-600">{geocodeMsg}</span>}
        </div>
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
              inputMode="decimal"
              className="field-value"
              value={state.height_m ?? ""}
              onChange={(e) => update("height_m", e.target.value === "" ? null : parseFloat(e.target.value))}
              placeholder="20"
            />
          </div>
          <div>
            <span className="field-label">DBH (cm)</span>
            <input
              type="number"
              step="0.1"
              inputMode="decimal"
              className="field-value"
              value={state.dbh_cm ?? ""}
              onChange={(e) => update("dbh_cm", e.target.value === "" ? null : parseFloat(e.target.value))}
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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-base font-bold text-brand-700">사진 (4종)</h2>
          <label className="text-xs text-stone-600 inline-flex items-center gap-1">
            품질
            <select
              className="text-xs border border-stone-300 rounded px-1.5 py-0.5 bg-white"
              value={photoQuality}
              onChange={(e) => changePhotoQuality(e.target.value as PhotoQuality)}
            >
              {(Object.keys(PHOTO_QUALITY_LABELS) as PhotoQuality[]).map((q) => (
                <option key={q} value={q}>{PHOTO_QUALITY_LABELS[q]}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-[11px] text-stone-500">
          데이터 요금/저장공간이 부족하면 「빠름」으로, 정밀 식별이 중요한 잎/낙엽은 「고화질」로 권장.
          선택은 단말에 저장되어 다음 야장에도 적용됩니다.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(PHOTO_LABELS) as PhotoCategory[]).map((cat) => (
            <PhotoSlot
              key={cat}
              category={cat}
              label={PHOTO_LABELS[cat]}
              value={photos[cat]}
              onChange={(p) => setPhotos((prev) => ({ ...prev, [cat]: p }))}
              quality={photoQuality}
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
