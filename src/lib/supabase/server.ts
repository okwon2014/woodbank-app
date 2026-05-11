// 서버 컴포넌트·route handler에서 사용하는 Supabase 클라이언트
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieItem = { name: string; value: string; options: CookieOptions };

export function getSupabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(items: CookieItem[]) {
          try {
            items.forEach(({ name, value, options }: CookieItem) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component 에서는 cookie set 불가 — 무시
          }
        },
      },
    },
  );
}
