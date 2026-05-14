"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

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

// 한국 중앙(대전 부근). bounds 가 있으면 무시되고 fit 으로 맞춰진다.
const DEFAULT_CENTER: [number, number] = [127.7669, 35.9078];
const DEFAULT_ZOOM = 6.5;

const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
  glyphs: undefined,
};

export function SitesMapView({ markers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) return; // 1회만 초기화

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    mapRef.current = map;

    // 컨테이너 크기가 늦게 잡히는 경우(레이아웃 시프트·폰트 로드 등) 캔버스가
    // 0×0 으로 굳지 않도록 resize 안전망. 첫 load 후 한 번 + 윈도우 resize 마다.
    const onResize = () => map.resize();
    const t = setTimeout(onResize, 100);
    window.addEventListener("resize", onResize);
    map.once("load", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const layoutMarkers = () => {
      // 기존 popup·marker 제거 (간단히 DOM 클래스로 식별)
      document.querySelectorAll(".wb-tree-marker").forEach((el) => el.remove());

      if (markers.length === 0) return;

      const bounds = new maplibregl.LngLatBounds();
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

        new maplibregl.Marker({ element: el })
          .setLngLat([m.lon, m.lat])
          .setPopup(
            new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(
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
      // 마커가 1개면 zoom 14, 여러 개면 fitBounds
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
      {/* Tailwind arbitrary value 의 calc() 공백 제약을 피하기 위해 inline style 로 지정.
          헤더(약 110px) + 페이지 패딩·툴바를 뺀 viewport 높이. 모바일 대응 min-height. */}
      <div
        ref={containerRef}
        style={{ height: "calc(100vh - 200px)", minHeight: 400 }}
        className="w-full rounded-xl border border-stone-200 overflow-hidden bg-stone-100"
      />
      {markers.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/90 rounded-lg px-4 py-2 text-sm text-stone-700 shadow">
            지도에 표시할 좌표가 있는 개체목이 없습니다.
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
