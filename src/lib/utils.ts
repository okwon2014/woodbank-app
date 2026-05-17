// 잡다 유틸
export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// "N 35° 15' 48.0\"" 같은 DMS 문자열을 십진수로 변환.
// 부호: S/W → 음수, N/E → 양수. 방향이 없으면 양수로 간주.
export function dmsToDecimal(dms: string): number | null {
  if (!dms) return null;
  const m = dms
    .replace(/[°ºD]/g, " ")
    .replace(/['′']/g, " ")
    .replace(/["″"]/g, " ")
    .match(/([NSEW])?\s*([+-]?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*(?:(\d+(?:\.\d+)?))?\s*([NSEW])?/i);
  if (!m) return null;
  const dir = (m[1] || m[5] || "").toUpperCase();
  const deg = parseFloat(m[2]);
  const min = parseFloat(m[3]);
  const sec = m[4] ? parseFloat(m[4]) : 0;
  if (isNaN(deg) || isNaN(min) || isNaN(sec)) return null;
  let dd = Math.abs(deg) + min / 60 + sec / 3600;
  if (deg < 0 || dir === "S" || dir === "W") dd = -dd;
  return Number(dd.toFixed(7));
}

export function ddToDms(dd: number, isLat: boolean): string {
  const dir = isLat ? (dd >= 0 ? "N" : "S") : (dd >= 0 ? "E" : "W");
  const abs = Math.abs(dd);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = ((minFloat - min) * 60).toFixed(1);
  return `${dir} ${deg}° ${String(min).padStart(2, "0")}' ${sec}"`;
}

export function nowIsoDate() {
  const d = new Date();
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 한국 표준시(KST, Asia/Seoul) 포맷 헬퍼.
//
// 왜 필요한가: Vercel serverless 는 UTC 로 실행되므로 서버 컴포넌트에서
// `new Date(x).toLocaleString("ko-KR")` 를 그냥 호출하면 UTC 시각이 출력되어
// 한국 사용자가 보면 9시간이 빠진다. 모든 시각 표시는 이 헬퍼를 통해 KST 로
// 고정해 서버/클라이언트 어느 쪽에서 렌더되어도 동일한 결과를 보장한다.
//
// 입력은 ISO 문자열 또는 Date, null/undefined/잘못된 값은 "-" 반환.
// ─────────────────────────────────────────────────────────────────────────────

export const KST_TZ = "Asia/Seoul" as const;

function _toDate(d: Date | string | null | undefined): Date | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 「2025. 5. 17.」 형식의 한국 날짜 (KST). */
export function fmtDateKst(d: Date | string | null | undefined): string {
  const date = _toDate(d);
  if (!date) return "-";
  return date.toLocaleDateString("ko-KR", { timeZone: KST_TZ });
}

/** 「2025. 5. 17. 오후 7:30」 형식의 한국 일시 (KST). 분까지 표시. */
export function fmtDateTimeKst(d: Date | string | null | undefined): string {
  const date = _toDate(d);
  if (!date) return "-";
  return date.toLocaleString("ko-KR", {
    timeZone: KST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 「25. 5. 17. 19:30」 같이 컴팩트한 한국 일시 (KST). 감사 로그·표 셀 등 좁은 영역용. */
export function fmtDateTimeKstShort(d: Date | string | null | undefined): string {
  const date = _toDate(d);
  if (!date) return "-";
  return date.toLocaleString("ko-KR", {
    timeZone: KST_TZ,
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// 간단 UUIDv7 — 시간 정렬 가능. crypto.getRandomValues 사용.
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const ts = BigInt(Date.now());
  // 6 bytes timestamp (48 bits, milliseconds)
  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);
  // version 7
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // variant
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
