// 매직링크·비밀번호 재설정·신규 가입 확인 등 Supabase Auth 의 모든 PKCE flow 가
// 도착하는 콜백. ?code 를 받아 세션과 교환하고 ?next 로 redirect 한다.
//
// 운영 셋업: Supabase Dashboard → Authentication → URL Configuration
//   - Site URL: https://woodbank-app.vercel.app
//   - Redirect URLs(허용 목록): https://woodbank-app.vercel.app/auth/callback
//     로컬 테스트가 필요하면 http://localhost:3000/auth/callback 도 추가.
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SAFE_PATH = /^\/[a-zA-Z0-9_\-./?=&%~+:,]*$/;

function safeNext(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  // 절대 URL / 프로토콜 우회 / // 시작 등 외부 redirect 차단
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (!SAFE_PATH.test(raw)) return fallback;
  return raw;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), "/sites");

  // PKCE 가 아닌 implicit flow (구버전 또는 일부 매직링크 설정) 대비.
  // error 파라미터가 있으면 즉시 에러 페이지로.
  const errorDescription = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (errorDescription) {
    return NextResponse.redirect(
      new URL(`/auth/auth-error?msg=${encodeURIComponent(errorDescription)}`, url.origin),
    );
  }

  if (!code) {
    // ?code 없이 callback 으로 직접 들어온 경우 — 안내 후 로그인으로 보냄.
    return NextResponse.redirect(
      new URL(`/auth/auth-error?msg=${encodeURIComponent("코드가 없습니다. 메일의 링크가 만료됐거나 잘못된 경로로 접근했습니다.")}`, url.origin),
    );
  }

  const sb = await getSupabaseServer();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/auth/auth-error?msg=${encodeURIComponent(error.message)}`, url.origin),
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
