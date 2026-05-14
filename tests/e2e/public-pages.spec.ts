import { test, expect } from "@playwright/test";

// 로그인 없이 접근 가능한 페이지의 기본 렌더링·미들웨어 동작을 검증한다.
// Supabase 환경변수 없이도 통과해야 한다(middleware 는 환경변수 없으면 즉시
// 에러를 던지지 않고 cookies 없는 익명 세션으로 동작).

test.describe("공개 페이지 스모크", () => {
  test("/login 이 폼과 함께 렌더된다", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/.+/);
    await expect(page.locator("input[type=email]")).toBeVisible();
  });

  test("/auth/reset-password 가 렌더된다", async ({ page }) => {
    await page.goto("/auth/reset-password");
    await expect(page.locator("input[type=email]")).toBeVisible();
  });

  test("보호 경로 / 는 /login 으로 리다이렉트된다", async ({ page }) => {
    await page.goto("/");
    // /sites 또는 /login 으로 이동(미로그인이므로 결국 /login)
    await page.waitForURL(/\/login(\?|$)/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("/manifest.webmanifest 는 PWA manifest 로 응답", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/application\/manifest\+json/);
    const body = await res.json();
    expect(body).toHaveProperty("name");
    expect(body).toHaveProperty("icons");
  });

  test("/sw.js 는 Service-Worker-Allowed 헤더 + no-store 캐시", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.status()).toBe(200);
    expect(res.headers()["service-worker-allowed"]).toBe("/");
    expect(res.headers()["cache-control"]).toMatch(/no-store/);
  });
});
