/* Woodbank PWA service worker
 * 전략
 *  - precache: app shell(/, manifest, icons) — install 시 미리 받아둔다.
 *  - navigation(HTML): stale-while-revalidate — 즉시 캐시 응답 + 백그라운드 갱신.
 *  - 동일 origin asset(JS·CSS·이미지): cache-first.
 *  - Supabase·API·POST: 캐시 안 함, 네트워크 그대로.
 *  - 오프라인 + 캐시 없음 fallback: 마지막에 캐시된 / 문서.
 *  - Background Sync API ('woodbank-sync'): 가능한 환경에서 클라이언트에
 *    메시지를 보내 IndexedDB 큐 동기화를 트리거한다.
 *
 * 새 버전 배포 시 VERSION 을 올리면 이전 캐시를 모두 제거한다.
 */
// v3: PR #14(FK 23503 충돌 분류) · #15(큐 일괄 삭제) · #16(sync_status 정정) ·
//      #17(야장 폐기 시 매달린 사진 함께 정리) 를 사용자 단말에 강제로 새로 받게 한다.
//      bump 후 첫 방문에서 옛 캐시가 모두 제거되고 새 JS 가 로드된다.
const VERSION = "v3-2026-05-16";
const STATIC_CACHE = `wb-static-${VERSION}`;
const NAV_CACHE = `wb-nav-${VERSION}`;
const PRECACHE = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== NAV_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

function isSupabaseOrApi(url, req) {
  return (
    req.method !== "GET" ||
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase.co") ||
    url.hostname.endsWith("supabase.in") ||
    // 외부 지도 타일, signed URL 등은 따로 캐싱 안 함
    url.hostname.includes("tile.openstreetmap.org") ||
    url.hostname.includes("nominatim.openstreetmap.org") ||
    url.hostname.includes("api.vworld.kr")
  );
}

async function staleWhileRevalidate(cacheName, req) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      if (res.ok && new URL(req.url).origin === self.location.origin) {
        cache.put(req, res.clone());
      }
      return res;
    })
    .catch(() => null);
  return cached || (await fetchPromise) || cache.match("/") || Response.error();
}

async function cacheFirst(cacheName, req) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok && new URL(req.url).origin === self.location.origin) {
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return cached || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (isSupabaseOrApi(url, req)) return;

  // HTML 네비게이션은 SWR — 즉시 응답 + 백그라운드 갱신
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(staleWhileRevalidate(NAV_CACHE, req));
    return;
  }
  // 그 외 같은 origin 자산은 cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(STATIC_CACHE, req));
  }
});

// Background Sync API — 'online' 복귀 시 OS 가 트리거. 지원 환경(Chromium 계열)에서만.
// SW 안에서 Supabase·Dexie 를 직접 호출하긴 어려우므로, 활성 클라이언트에 메시지를
// 보내 페이지 측의 syncOnce() 가 동작하도록 깨운다.
self.addEventListener("sync", (event) => {
  if (event.tag !== "woodbank-sync") return;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const c of clients) c.postMessage({ type: "woodbank-sync-now" });
    })(),
  );
});
