// 서버 사이드 reverse geocoding.
// 1) VWORLD_API_KEY 가 있으면 VWorld(국토교통부 공간정보) 사용 — 한국 행정구역 정확도 1위.
// 2) 없으면 Nominatim(OpenStreetMap) fallback — 키 불필요, 다만 Fair-use 정책(초당 1회 권장)에 유의.
// 둘 다 실패하면 source='none' 으로 부분 결과를 반환한다.
import { getSupabaseServer } from "@/lib/supabase/server";

export interface ReverseGeocodeResult {
  sido: string | null;
  sigungu: string | null;
  sigungu_code: string | null;
  address_detail: string;
  source: "vworld" | "nominatim" | "none";
  raw?: unknown;
}

export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  let result: ReverseGeocodeResult | null = null;

  if (process.env.VWORLD_API_KEY) {
    result = await fromVworld(lat, lon).catch(() => null);
  }
  if (!result) {
    result = await fromNominatim(lat, lon).catch(() => null);
  }
  if (!result) {
    return { sido: null, sigungu: null, sigungu_code: null, address_detail: "", source: "none" };
  }

  // regions 테이블에서 sigungu_code lookup. 마스터라 RLS 통과(로그인 사용자 read).
  if (result.sido && result.sigungu && !result.sigungu_code) {
    result.sigungu_code = await lookupSigunguCode(result.sido, result.sigungu);
  }
  return result;
}

async function fromVworld(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  const key = process.env.VWORLD_API_KEY!;
  const url = new URL("https://api.vworld.kr/req/address");
  url.searchParams.set("service", "address");
  url.searchParams.set("request", "getAddress");
  url.searchParams.set("version", "2.0");
  url.searchParams.set("crs", "epsg:4326");
  url.searchParams.set("point", `${lon},${lat}`);
  url.searchParams.set("format", "json");
  url.searchParams.set("type", "parcel");
  url.searchParams.set("simple", "false");
  url.searchParams.set("key", key);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`VWorld ${res.status}`);
  const json: any = await res.json();
  if (json?.response?.status !== "OK") {
    throw new Error(`VWorld ${json?.response?.status ?? "unknown"}`);
  }
  const r = json.response.result?.[0];
  if (!r) throw new Error("VWorld empty");
  const s = r.structure ?? {};
  const detail = [s.level3, s.level4L, s.level4A, s.level5, r.text]
    .filter(Boolean)
    .join(" ");
  return {
    sido: s.level1 ?? null,
    sigungu: s.level2 ?? null,
    sigungu_code: null,
    address_detail: detail || r.text || "",
    source: "vworld",
    raw: r,
  };
}

async function fromNominatim(lat: number, lon: number): Promise<ReverseGeocodeResult> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("accept-language", "ko");
  url.searchParams.set("zoom", "18");

  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "woodbank-app (https://github.com/okwon2014/woodbank-app)" },
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const json: any = await res.json();
  const a = json?.address ?? {};
  const sido: string | null = a.province ?? a.state ?? a.region ?? null;
  const sigungu: string | null = a.city ?? a.county ?? a.town ?? a.borough ?? null;
  const detailParts = [a.borough, a.suburb, a.neighbourhood, a.road, a.village, a.hamlet, json.display_name]
    .filter(Boolean);
  return {
    sido,
    sigungu,
    sigungu_code: null,
    address_detail: detailParts[0] === json.display_name ? json.display_name : detailParts.join(" "),
    source: "nominatim",
    raw: json,
  };
}

async function lookupSigunguCode(sido: string, sigungu: string): Promise<string | null> {
  try {
    const sb = getSupabaseServer();
    // 정확 매칭 우선
    const { data: exact } = await sb
      .from("regions")
      .select("sigungu_code")
      .eq("sido_name", sido)
      .eq("sigungu_name", sigungu)
      .maybeSingle();
    if (exact?.sigungu_code) return exact.sigungu_code;

    // 시도가 약식("전남" vs "전라남도")이면 startsWith 매칭
    const { data: like } = await sb
      .from("regions")
      .select("sigungu_code, sido_name")
      .ilike("sido_name", `${sido.slice(0, 2)}%`)
      .eq("sigungu_name", sigungu)
      .limit(1)
      .maybeSingle();
    return like?.sigungu_code ?? null;
  } catch {
    return null;
  }
}
