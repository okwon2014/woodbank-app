import { redirect } from "next/navigation";
import { getCurrentUserAndRole } from "./role";
import type { UserRole } from "@/types/db";

// 서버 컴포넌트/페이지에서 호출. 권한이 부족하면 /forbidden 으로 redirect 한다.
// 미로그인은 middleware가 /login 으로 먼저 보내지만, 안전망으로 한 번 더 확인한다.
export async function requireRole(allowed: UserRole[]) {
  const ctx = await getCurrentUserAndRole();
  if (!ctx.user) {
    redirect("/login");
  }
  if (!allowed.includes(ctx.role)) {
    const params = new URLSearchParams({
      need: allowed.join(","),
      have: ctx.role,
    });
    redirect(`/forbidden?${params.toString()}`);
  }
  return ctx;
}
