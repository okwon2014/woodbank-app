"use client";

import { useEffect, useRef, useState } from "react";
import { ddToDms } from "@/lib/utils";

interface Props {
  value: { lat: number | null; lon: number | null; accuracy: number | null };
  onChange: (v: { lat: number | null; lon: number | null; accuracy: number | null }) => void;
}

// 위/경도 입력 박스는 사용자의 자유로운 키 입력을 보장하기 위해
// 내부적으로 문자열로 들고, props 와는 blur 또는 명시적 갱신 시점에만 동기화한다.
// 그렇지 않으면 toFixed(6) 가 매 렌더마다 "35.2" → "35.200000" 으로 덮어써서
// 산지에서 전문 GPS 장비의 좌표를 옮겨 적기 어렵다.
function fmt(n: number | null): string {
  return n == null ? "" : n.toFixed(6);
}

export function GpsPicker({ value, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [latStr, setLatStr] = useState<string>(fmt(value.lat));
  const [lonStr, setLonStr] = useState<string>(fmt(value.lon));
  // 사용자가 직접 입력했는지 여부 — 「수동」 배지 + 자동 위치 덮어쓰기 방지에 사용
  const [manual, setManual] = useState<boolean>(value.lat != null || value.lon != null);
  const latFocused = useRef(false);
  const lonFocused = useRef(false);

  // 외부에서 값이 바뀌면(자동 위치, 다른 form 갱신 등) 포커스 중이 아닌 박스만 동기화.
  useEffect(() => {
    if (!latFocused.current) setLatStr(fmt(value.lat));
    if (!lonFocused.current) setLonStr(fmt(value.lon));
  }, [value.lat, value.lon]);

  function locate(opts: { override?: boolean } = {}) {
    if (!navigator.geolocation) {
      setErr("이 단말은 위치 서비스를 지원하지 않습니다.");
      return;
    }
    if (manual && !opts.override) {
      // 수동 값이 있는데 자동 측정이 덮으려 하면 확인. 명시 버튼 클릭은 통과.
      if (!confirm("수동으로 입력한 좌표가 있습니다. 단말 GPS 값으로 덮어쓸까요?")) return;
    }
    setBusy(true);
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        onChange(next);
        setLatStr(fmt(next.lat));
        setLonStr(fmt(next.lon));
        setManual(false);
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
    // mount 직후 자동 시도 — 양쪽이 비어 있을 때만. 권한이 이미 부여돼 있으면 즉시 응답.
    if (value.lat == null && value.lon == null) locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit(field: "lat" | "lon", raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      onChange({ ...value, [field]: null, accuracy: null });
      setManual(true);
      return;
    }
    const n = parseFloat(trimmed);
    if (!Number.isFinite(n)) return; // 유효 숫자가 아니면 props 는 그대로
    if (field === "lat" && (n < -90 || n > 90)) return;
    if (field === "lon" && (n < -180 || n > 180)) return;
    // 수동 입력이므로 GPS 정확도 정보는 더 이상 유효하지 않음 → 표시도 제거.
    onChange({ ...value, [field]: n, accuracy: null });
    setManual(true);
  }

  function clearAll() {
    onChange({ lat: null, lon: null, accuracy: null });
    setLatStr("");
    setLonStr("");
    setManual(false);
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="field-label">위도</span>
          <input
            inputMode="decimal"
            value={latStr}
            onChange={(e) => setLatStr(e.target.value)}
            onFocus={() => { latFocused.current = true; }}
            onBlur={(e) => { latFocused.current = false; commit("lat", e.target.value); }}
            className="field-value font-mono text-sm"
            placeholder="35.263333"
          />
        </div>
        <div>
          <span className="field-label">경도</span>
          <input
            inputMode="decimal"
            value={lonStr}
            onChange={(e) => setLonStr(e.target.value)}
            onFocus={() => { lonFocused.current = true; }}
            onBlur={(e) => { lonFocused.current = false; commit("lon", e.target.value); }}
            className="field-value font-mono text-sm"
            placeholder="127.009361"
          />
        </div>
      </div>
      {value.lat != null && value.lon != null && (
        <p className="text-xs text-stone-500 font-mono">
          {ddToDms(value.lat, true)} / {ddToDms(value.lon, false)}
          {value.accuracy != null && <> · ±{Math.round(value.accuracy)} m</>}
          {manual && value.accuracy == null && (
            <span className="ml-1 text-stone-600">· 수동 입력</span>
          )}
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
              다시 측정하거나, 전문 GPS 장비의 위/경도를 위 입력칸에 직접 입력하세요.
            </>
          ) : (
            <>
              GPS 정확도가 다소 낮습니다 (±{Math.round(value.accuracy)} m). 가능하면 야외 개활지에서
              다시 측정하세요.
            </>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={() => locate({ override: true })} disabled={busy} className="btn-secondary text-xs">
          {busy ? "측정 중…" : "📍 현재 위치 가져오기"}
        </button>
        {(value.lat != null || value.lon != null) && (
          <button
            type="button"
            onClick={clearAll}
            disabled={busy}
            className="text-xs text-stone-600 underline decoration-dotted underline-offset-2"
          >
            지우기
          </button>
        )}
        <span className="text-[11px] text-stone-500 ml-auto">
          전문 GPS 장비 사용 시 위/경도 칸에 직접 입력 가능
        </span>
      </div>
      {err && <p className="text-xs text-rose-600">{err}</p>}
    </div>
  );
}
