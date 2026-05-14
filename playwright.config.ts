import { defineConfig, devices } from "@playwright/test";

// Playwright 는 가벼운 스모크 테스트만 담당. 로그인 페이지·forbidden 등
// Supabase 가 필요 없는 페이지가 정상적으로 렌더링되는지 확인한다.
// CI 에서는 `npx playwright install --with-deps chromium` 이 선행돼야 한다.

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./tests/e2e/.results",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        // CI 에서는 `npm run build && npm run start` 흐름이 필요하지만,
        // 로컬에서는 dev 서버로 충분. 실제 Supabase 가 없어도 미들웨어가
        // fail-safe 하게 동작해 공개 페이지 스모크는 통과한다.
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        env: {
          // 더미 — middleware 가 fail-safe 라 실제 통신은 안 일어남
          NEXT_PUBLIC_SUPABASE_URL:
            process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.invalid",
          NEXT_PUBLIC_SUPABASE_ANON_KEY:
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "dummy-anon-key",
        },
      },
});
