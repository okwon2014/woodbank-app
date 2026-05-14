"use client";

import { useEffect, useState } from "react";
import { ddToDms } from "@/lib/utils";

interface Props {
  value: { lat: number | null; lon: number | null; accuracy: number | null };
  onChange: (v: { lat: number | null; lon: number | null; accuracy: number | null }) => void;
}

export function GpsPicker({ value, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function locate() {
    if (!navigator.geolocation) {
      setErr("이 단말은 위치 서비스를 지원하지 않습니다.");
      return;
    }
    setBusy(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setBusy(false);
      },
      (e) => {
        setErr(e.message);
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  useEffect(() => {
    // 컴포넌트 mount 직후 자동 시도 (사용자 권한 부여돼 있을 때만 즉시 응답)
    if (value.lat == null) locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="field-label">위도</span>
          <input
            inputMode="decimal"
            value={value.lat?.toFixed(6) ?? ""}
            onChange={(e) => onChange({ ...value, lat: e.target.value ? parseFloat(e.target.value) : null })}
            className="field-value font-mono text-sm"
            placeholder="35.263333"
          />
        </div>
        <div>
          <span className="field-label">경도</span>
          <input
            inputMode="decimal"
            value={value.lon?.toFixed(6) ?? ""}
            onChange={(e) => onChange({ ...value, lon: e.target.value ? parseFloat(e.target.value) : null })}
            className="field-value font-mono text-sm"
            placeholder="127.009361"
          />
        </div>
      </div>
      {value.lat != null && value.lon != null && (
        <p className="text-xs text-stone-500 font-mono">
          {ddToDms(value.lat, true)} / {ddToDms(value.lon, false)}
          {value.accuracy != null && <> · ±{Math.round(value.accuracy)} m</>}
        </p>
      )}
      {value.accuracy != null && value.accuracy > 30 && (
        <div
          className={`text-xs rounded p-2 ${
            value.accuracy > 100
              ? "bg-rose-50 border border-rose-200 text-rose-800"
              : "bg-amber-50 border border-amber-200 text-amber-900"
          }`}
        >
          {value.accuracy > 100 ? (
            <>
              ⚠️ GPS 정확도가 매우 낮습니다 (±{Math.round(value.accuracy)} m). 야외 개활지로 이동해
              다시 측정하거나, 위/경도를 손으로 입력하세요.
            </>
          ) : (
            <>
              GPS 정확도가 다소 낮습니다 (±{Math.round(value.accuracy)} m). 가능하면 야외 개활지에서
              다시 측정하세요.
            </>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={locate} disabled={busy} className="btn-secondary text-xs">
          {busy ? "측정 중…" : "📍 현재 위치 가져오기"}
        </button>
      </div>
      {err && <p className="text-xs text-rose-600">{err}</p>}
    </div>
  );
}
