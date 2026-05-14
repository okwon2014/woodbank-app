"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "maplibre-gl/dist/maplibre-gl.css";
// 값(런타임)이 아니라 타입만 import — maplibre-gl 모듈 평가를 SSR 단계에서 회피한다.
// 실제 라이브러리는 useEffect 안에서 dynamic import.
import type * as MaplibreGL from "maplibre-gl";

export interface MapTreeMarker {
  id: string;
  site_id: string;
  tree_local_no: string;
  site_code: string;
  region_sigungu: string | null;
  species_ko: string | null;
  lat: number;
  lon: number;
}

interface Props {
  markers: MapTreeMarker[];
}

const DEFAULT_CENTER: [number, number] = [127.7669, 35.9078];
const DEFAULT_ZOOM = 6.5;

const STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

export function SitesMapView({ markers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreGL.Map | null>(null);
  const libRef = useRef<typeof import("maplibre-gl") | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [exporting, setExporting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return;
    let cancelled = false;
    let onResize: (() => void) | null = null;

    (async () => {
      try {
        const lib = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;
        libRef.current = lib;

        const map = new lib.Map({
          container: containerRef.current,
          style: STYLE as unknown as MaplibreGL.StyleSpecification,
          center: DEFAULT_CENTER,
          zoom: DEFAULT_ZOOM,
          // WebGL 캔버스를 export 가능하게 — 그렇지 않으면 toBlob/toDataURL 결과가 빈 이미지.
          // 약간의 성능 비용은 있지만 N=수천 마커 수준에서는 무시할 만함.
          preserveDrawingBuffer: true,
        });
        map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new lib.ScaleControl({ unit: "metric" }), "bottom-left");
        mapRef.current = map;

        // 컨테이너 크기가 늦게 잡히는 경우 캔버스가 0×0 으로 굳지 않도록 resize 안전망
        onResize = () => map.resize();
        setTimeout(onResize, 100);
        window.addEventListener("resize", onResize);
        map.once("load", () => {
          if (onResize) onResize();
          setReady(true);
        });
      } catch (e: any) {
        setError(e?.message ?? "지도 라이브러리 로드 실패");
      }
    })();

    return () => {
      cancelled = true;
      if (onResize) window.removeEventListener("resize", onResize);
      const map = mapRef.current;
      if (map) {
        map.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!map || !lib) return;

    const layoutMarkers = () => {
      document.querySelectorAll(".wb-tree-marker").forEach((el) => el.remove());
      if (markers.length === 0) return;

      const bounds = new lib.LngLatBounds();
      for (const m of markers) {
        const el = document.createElement("button");
        el.className =
          "wb-tree-marker w-3 h-3 rounded-full border-2 border-white shadow ring-1 ring-stone-900/30 cursor-pointer";
        el.style.background = "#235a3f";
        el.title = `${m.site_code} #${m.tree_local_no} · ${m.species_ko ?? ""}`;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          router.push(`/trees/${m.id}`);
        });

        new lib.Marker({ element: el })
          .setLngLat([m.lon, m.lat])
          .setPopup(
            new lib.Popup({ offset: 12, closeButton: false }).setHTML(
              `<div style="font-size:12px;line-height:1.4">
                <div><b>${escapeHtml(m.site_code)}</b> #${escapeHtml(m.tree_local_no)}</div>
                <div style="color:#666">${escapeHtml(m.region_sigungu ?? "")}</div>
                ${m.species_ko ? `<div>${escapeHtml(m.species_ko)}</div>` : ""}
                <div style="margin-top:4px;color:#235a3f">클릭하여 상세 보기 →</div>
              </div>`,
            ),
          )
          .addTo(map);

        bounds.extend([m.lon, m.lat]);
      }
      if (markers.length === 1) {
        map.flyTo({ center: [markers[0].lon, markers[0].lat], zoom: 14, duration: 600 });
      } else {
        map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 600 });
      }
    };

    if (map.loaded()) {
      layoutMarkers();
    } else {
      map.once("load", layoutMarkers);
    }
  }, [markers, router]);

  async function exportImage() {
    const map = mapRef.current;
    if (!map) return;
    setExporting(true);
    try {
      // 1) 지도 캔버스 한 번 더 render 후 export (preserveDrawingBuffer 가 있어도
      //    가장 최신 프레임을 확보).
      await new Promise<void>((resolve) => {
        map.once("render", () => resolve());
        map.triggerRepaint();
      });
      const source = map.getCanvas();
      const container = map.getContainer();
      const dpr = source.width / container.clientWidth;

      const off = document.createElement("canvas");
      off.width = source.width;
      off.height = source.height;
      const ctx = off.getContext("2d");
      if (!ctx) throw new Error("canvas 2d context 가져오기 실패");

      // 2) 지도 픽셀 그대로 복사
      ctx.drawImage(source, 0, 0);

      // 3) 마커 합성 — DOM Marker 는 캔버스 밖이라 별도로 그린다.
      for (const m of markers) {
        const p = map.project([m.lon, m.lat]);
        const x = p.x * dpr;
        const y = p.y * dpr;
        const r = 7 * dpr;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = "#235a3f";
        ctx.fill();
        ctx.lineWidth = 2 * dpr;
        ctx.strokeStyle = "#fff";
        ctx.stroke();

        if (showLabels) {
          const label = `${m.site_code} #${m.tree_local_no}`;
          ctx.font = `${11 * dpr}px -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
          ctx.textBaseline = "middle";
          // 흰 외곽선 → 작은 검은 글자 (가독성)
          const tx = x + r + 4 * dpr;
          const ty = y;
          ctx.lineWidth = 3 * dpr;
          ctx.strokeStyle = "rgba(255,255,255,0.95)";
          ctx.strokeText(label, tx, ty);
          ctx.fillStyle = "#1c1917";
          ctx.fillText(label, tx, ty);
        }
      }

      // 4) Attribution 배지 — OSM 데이터 라이선스 표기 (보고서 사용 시 필수)
      const attribution = "© OpenStreetMap contributors";
      ctx.font = `${11 * dpr}px sans-serif`;
      const padX = 8 * dpr;
      const padY = 4 * dpr;
      const w = ctx.measureText(attribution).width + padX * 2;
      const h = 18 * dpr;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(off.width - w - 4 * dpr, off.height - h - 4 * dpr, w, h);
      ctx.fillStyle = "#1c1917";
      ctx.textBaseline = "middle";
      ctx.fillText(attribution, off.width - w - 4 * dpr + padX, off.height - h - 4 * dpr + h / 2);

      // 5) PNG 다운로드
      await new Promise<void>((resolve, reject) => {
        off.toBlob((blob) => {
          if (!blob) return reject(new Error("이미지 생성 실패 (캔버스가 tainted 일 수 있습니다)"));
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
          a.download = `woodbank-map-${ts}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          resolve();
        }, "image/png");
      });
    } catch (e: any) {
      alert(`지도 이미지 저장 실패: ${e?.message ?? e}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        style={{ height: "calc(100vh - 200px)", minHeight: 400 }}
        className="w-full rounded-xl border border-stone-200 overflow-hidden bg-stone-100"
      />

      {/* 상단 toolbar — 이미지 저장 / 라벨 토글 */}
      {!error && (
        <div className="absolute top-3 left-3 flex items-center gap-2 bg-white/95 rounded-lg shadow border border-stone-200 px-2 py-1.5 text-xs">
          <button
            type="button"
            onClick={exportImage}
            disabled={!ready || exporting}
            className="px-2 py-1 rounded bg-brand-700 text-white hover:bg-brand-500 disabled:opacity-50"
            title="현재 지도 화면을 마커·라이선스와 함께 PNG 로 저장"
          >
            {exporting ? "저장 중…" : "🖼 이미지 저장"}
          </button>
          <label className="inline-flex items-center gap-1 text-stone-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
            />
            마커 라벨
          </label>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-4 py-2 text-sm shadow">
            지도를 불러오지 못했습니다: {error}
          </div>
        </div>
      )}
      {!error && markers.length === 0 && (
        <div className="absolute left-1/2 -translate-x-1/2 top-16 pointer-events-none">
          <div className="bg-white/90 rounded-lg px-4 py-2 text-sm text-stone-700 shadow">
            지도에 표시할 좌표가 있는 개체목이 없습니다. (지도는 정상 표시)
          </div>
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
