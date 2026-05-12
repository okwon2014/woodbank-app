// POST /api/admin/invite
// Body: { email: string; display_name?: string }
// 호출자가 admin 인지 검증 후, service_role 로 inviteUserByEmail() 실행.
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    // 1) 호출자 인증·역할 확인
    const sb = getSupabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: meta } = await sb.from("users_meta").select("role").eq("id", user.id).maybeSingle();
    if (meta?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
    }

    // 2) 페이로드
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim();
    const displayName = body?.display_name ? String(body.display_name).trim() : null;

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "유효한 이메일이 필요합니다." }, { status: 400 });
    }

    // 3) service_role 로 초대 발송
    let admin;
    try { admin = getSupabaseAdmin(); }
    catch (e: any) {
      return NextResponse.json({ error: `서버 환경변수 누락: ${e?.message ?? "SUPABASE_SERVICE_ROLE_KEY"}` }, { status: 500 });
    }

    const origin = req.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "";
    const redirectTo = origin ? `${origin}/auth/update-password` : undefined;

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: displayName ? { display_name: displayName } : undefined,
      redirectTo,
    });
    if (error) {
      // 이미 가입된 이메일은 422 가 떨어짐 → 친절한 메시지로 변환
      const msg = /already|registered|exists/i.test(error.message)
        ? "이미 가입된 이메일입니다. /admin/users 에서 역할을 직접 부여하세요."
        : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ ok: true, user_id: data.user?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "서버 오류" }, { status: 500 });
  }
}
