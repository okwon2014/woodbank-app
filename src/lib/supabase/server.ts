// 서버 컴포넌트·route handler에서 사용하는 Supabase 클라이언트.
// Next 15부터 cookies() 가 비동기라 헬퍼도 async function 으로 둔다.
// 호출자: `const sb = await getSupabaseServer();`
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieItem = { name: string; value: string; options: CookieOptions };

export async function getSupabaseServer() {
  const cookieStore = await cookies();
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
