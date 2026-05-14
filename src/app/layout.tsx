import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Woodbank 현장 야장",
  description: "목재 재감 구축 연구그룹 현장 채취 시스템",
  manifest: "/manifest.webmanifest",
  applicationName: "Woodbank",
};

export const viewport: Viewport = {
  themeColor: "#235a3f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="font-sans">
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', async () => {
                  try {
                    const reg = await navigator.serviceWorker.register('/sw.js');
                    // Background Sync (Chromium 계열). 지원 안 되면 silently skip.
                    if (reg && 'sync' in reg && typeof reg.sync.register === 'function') {
                      try { await reg.sync.register('woodbank-sync'); } catch (_) {}
                    }
                  } catch (_) {}
                });
                // SW 가 sync 이벤트에서 보낸 메시지 수신 → 큐 동기화 트리거
                navigator.serviceWorker.addEventListener('message', (e) => {
                  if (e.data && e.data.type === 'woodbank-sync-now') {
                    window.dispatchEvent(new CustomEvent('woodbank:sync-now'));
                  }
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
