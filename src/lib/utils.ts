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
