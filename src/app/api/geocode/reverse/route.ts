import { NextResponse } from "next/server";
import { reverseGeocode } from "@/lib/geocode/reverse";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // 로그인 사용자만 사용 가능 (외부에 무차별 호출 방지)
  const sb = getSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get("lat") ?? "");
  const lon = parseFloat(url.searchParams.get("lon") ?? "");
  if (!isFinite(lat) || !isFinite(lon)) {
    return NextResponse.json({ error: "lat/lon required" }, { status: 400 });
  }
  if (lat < 33 || lat > 39 || lon < 124 || lon > 132) {
    // 한반도 외부 좌표는 거부(VWorld 가 한국 전용이고, Nominatim 도 의도 없는 호출 막기 위해)
    return NextResponse.json({ error: "out of bounds (Korea only)" }, { status: 400 });
  }

  try {
    const result = await reverseGeocode(lat, lon);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "geocode failed" }, { status: 502 });
  }
}
