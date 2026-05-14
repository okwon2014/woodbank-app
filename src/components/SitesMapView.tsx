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
        });
        map.addControl(new lib.NavigationControl({ showCompass: false }), "top-right");
        map.addControl(new lib.ScaleControl({ unit: "metric" }), "bottom-left");
        mapRef.current = map;

        // 컨테이너 크기가 늦게 잡히는 경우 캔버스가 0×0 으로 굳지 않도록 resize 안전망
        onResize = () => map.resize();
        setTimeout(onResize, 100);
        window.addEventListener("resize", onResize);
        map.once("load", onResize);
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

  return (
    <div className="relative">
      <div
        ref={containerRef}
        style={{ height: "calc(100vh - 200px)", minHeight: 400 }}
        className="w-full rounded-xl border border-stone-200 overflow-hidden bg-stone-100"
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg px-4 py-2 text-sm shadow">
            지도를 불러오지 못했습니다: {error}
          </div>
        </div>
      )}
      {!error && markers.length === 0 && (
        <div className="absolute left-1/2 -translate-x-1/2 top-4 pointer-events-none">
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
