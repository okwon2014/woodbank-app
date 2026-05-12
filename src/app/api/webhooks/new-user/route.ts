// POST /api/webhooks/new-user
// Supabase Database Webhook 이 auth.users INSERT 시 호출.
// 헤더 X-Webhook-Secret 로 검증 후 admin 들에게 Resend 로 이메일 발송.
//
// 셋업 (README 참조):
// 1) Resend(https://resend.com) 가입 → API Key 발급 → RESEND_API_KEY 환경변수 등록
// 2) ADMIN_NOTIFY_EMAILS, WEBHOOK_SECRET 환경변수 등록 (Vercel)
// 3) Supabase Dashboard → Database → Webhooks → Create new hook
//    - Table: auth.users
//    - Events: Insert
//    - HTTP method: POST
//    - URL: https://<운영도메인>/api/webhooks/new-user
//    - HTTP Headers: X-Webhook-Secret: <WEBHOOK_SECRET 과 동일 값>

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // 1) 비밀 검증
  const secret = req.headers.get("x-webhook-secret");
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 2) Resend 미설정이면 그냥 200 — 인앱 뱃지로만 알림
  const resendKey = process.env.RESEND_API_KEY;
  const recipients = (process.env.ADMIN_NOTIFY_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!resendKey || recipients.length === 0) {
    return NextResponse.json({ ok: true, sent: false, reason: "email-not-configured" });
  }

  // 3) 페이로드 파싱
  const body = await req.json().catch(() => ({}));
  const record = body?.record ?? {};
  const email = record.email ?? "(이메일 없음)";
  const id = record.id ?? "";
  const createdAt = record.created_at ?? new Date().toISOString();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const subject = `[Woodbank] 새 사용자 가입: ${email}`;
  const html = `
    <h2>Woodbank — 새 사용자 가입 알림</h2>
    <p>아래 사용자가 가입했습니다. 역할(role)과 담당 지역을 부여해 주세요.</p>
    <table style="border-collapse:collapse">
      <tr><td style="padding:4px 8px;color:#666">이메일</td><td style="padding:4px 8px"><b>${escapeHtml(email)}</b></td></tr>
      <tr><td style="padding:4px 8px;color:#666">UID</td><td style="padding:4px 8px"><code>${escapeHtml(id)}</code></td></tr>
      <tr><td style="padding:4px 8px;color:#666">가입 시각</td><td style="padding:4px 8px">${escapeHtml(createdAt)}</td></tr>
    </table>
    <p style="margin-top:16px">
      <a href="${siteUrl}/admin/users" style="background:#235a3f;color:white;padding:8px 14px;border-radius:6px;text-decoration:none">사용자 관리 화면 열기</a>
    </p>
    <p style="color:#888;font-size:12px">이 메일은 Supabase Database Webhook을 통해 자동 발송된 알림입니다.</p>
  `;

  // 4) Resend API 호출
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: recipients, subject, html }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ ok: false, error: `Resend ${res.status}: ${errText}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sent: true, recipients });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "send-failed" }, { status: 502 });
  }
}

function escapeHtml(s: string) {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&#39;" }[c]!));
}
