// GET /api/cron/keepalive
//
// Supabase Free 티어는 7일간 외부 API 호출이 없으면 프로젝트가 자동 일시중지된다.
// pg_cron 같은 DB 내부 작업은 PostgREST 게이트웨이를 거치지 않아 "활동" 카운트가
// 안 잡히므로, 외부에서 정기적으로 HTTP 요청을 한 번씩 쏘는 것이 가장 확실한 방지책.
//
// 이 라우트는 vercel.json 의 `crons` 항목으로 매일 한 번 호출된다(UTC 09:00 = KST 18:00).
// 호출 시 Supabase PostgREST 에 가벼운 SELECT 한 번을 날려 활동 카운트를 만든다.
// 데이터를 변경하지 않으므로 RLS 정책상 anon 도 읽을 수 있는 `species` 마스터를 고름.
//
// Vercel Cron 은 자동으로 `Authorization: Bearer <CRON_SECRET>` 헤더를 붙여 보내준다.
// 외부에서 임의로 호출 못 하게 그 시크릿을 검증.
//
// 셋업:
//   1) Vercel Project Settings → Environment Variables → CRON_SECRET (Production·Preview 체크)
//      값은 임의의 32+ 문자열 (`openssl rand -hex 32`).
//   2) 머지 후 자동 배포 → Vercel Dashboard → 프로젝트 → Cron Jobs 탭에서 다음 실행 시각 확인.
//   3) 첫 실행을 수동으로 확인하려면 같은 탭의 [Run] 또는 Functions Logs.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 정적 캐시 방지 — 매번 실제로 실행되어야 의미가 있음.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // 1) 시크릿 검증. CRON_SECRET 미설정이면 보호되지 않은 채로 동작하면 안 되므로 즉시 401.
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 2) Supabase 에 가벼운 read 한 번 — PostgREST 게이트웨이를 실제로 거치므로
  //    Supabase 의 "활동" 카운트가 만들어진다. anon key 로 호출하므로 species_read
  //    RLS (auth.uid() is not null) 에 막혀 빈 결과(또는 count=0)가 돌아올 수 있는데
  //    그래도 게이트웨이를 거친 요청이므로 keepalive 효과에는 충분.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE env missing" },
      { status: 500 },
    );
  }
  const sb = createClient(url, anon);
  const { error, count } = await sb
    .from("species")
    .select("code", { count: "exact", head: true })
    .limit(1);

  return NextResponse.json({
    ok: !error,
    at: new Date().toISOString(),
    species_count: count ?? null,
    error: error?.message ?? null,
  });
}
