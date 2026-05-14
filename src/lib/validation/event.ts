// 야장 입력 이상치 감지. block 이 아니라 안내 — 사용자가 의도적으로
// 비정상적인 값을 넣을 수 있으니(예: 거목 표본). 통상 범위는 한국 자연
// 수림 기준의 보수적 추정.

export type Severity = "info" | "warn" | "error";

export interface FieldWarning {
  field: string;
  severity: Severity;
  message: string;
}

const HEIGHT_RANGE = { min: 0.5, max: 50 };       // m, 한국 자연 수림 상한 ~40m
const DBH_RANGE = { min: 5, max: 250 };           // cm, 노거수도 통상 250 이하
const ELEVATION_RANGE = { min: -20, max: 2000 };  // m, 한라산 1947
const ASPECT_RANGE = { min: 0, max: 359 };

// 위/경도가 한반도 범위에 있는지(육해상 포함 대략)
const LAT_RANGE = { min: 33, max: 39 };
const LON_RANGE = { min: 124, max: 132 };

export function validateMeasurements(input: {
  height_m: number | null;
  dbh_cm: number | null;
  elevation_m: number | null;
  aspect_deg: number | null;
  lat: number | null;
  lon: number | null;
}): FieldWarning[] {
  const out: FieldWarning[] = [];

  if (input.height_m != null) {
    if (input.height_m < HEIGHT_RANGE.min || input.height_m > HEIGHT_RANGE.max) {
      out.push({
        field: "height_m",
        severity: "warn",
        message: `수고 ${input.height_m} m 가 통상 범위(${HEIGHT_RANGE.min}–${HEIGHT_RANGE.max} m)를 벗어납니다. 단위(m)나 입력값을 확인하세요.`,
      });
    }
  }

  if (input.dbh_cm != null) {
    if (input.dbh_cm < DBH_RANGE.min || input.dbh_cm > DBH_RANGE.max) {
      out.push({
        field: "dbh_cm",
        severity: "warn",
        message: `DBH ${input.dbh_cm} cm 가 통상 범위(${DBH_RANGE.min}–${DBH_RANGE.max} cm)를 벗어납니다. 단위(cm)나 입력값을 확인하세요.`,
      });
    }
  }

  if (input.elevation_m != null) {
    if (input.elevation_m < ELEVATION_RANGE.min || input.elevation_m > ELEVATION_RANGE.max) {
      out.push({
        field: "elevation_m",
        severity: "warn",
        message: `해발고 ${input.elevation_m} m 가 통상 범위(${ELEVATION_RANGE.min}–${ELEVATION_RANGE.max} m)를 벗어납니다.`,
      });
    }
  }

  if (input.aspect_deg != null) {
    if (input.aspect_deg < ASPECT_RANGE.min || input.aspect_deg > ASPECT_RANGE.max) {
      out.push({
        field: "aspect_deg",
        severity: "error",
        message: `방위 ${input.aspect_deg}° 는 0–359° 범위를 벗어났습니다.`,
      });
    }
  }

  if (input.lat != null && (input.lat < LAT_RANGE.min || input.lat > LAT_RANGE.max)) {
    out.push({
      field: "lat",
      severity: "warn",
      message: `위도 ${input.lat} 가 한반도 범위(${LAT_RANGE.min}–${LAT_RANGE.max})를 벗어났습니다.`,
    });
  }
  if (input.lon != null && (input.lon < LON_RANGE.min || input.lon > LON_RANGE.max)) {
    out.push({
      field: "lon",
      severity: "warn",
      message: `경도 ${input.lon} 가 한반도 범위(${LON_RANGE.min}–${LON_RANGE.max})를 벗어났습니다.`,
    });
  }

  return out;
}

// 두 좌표 사이의 거리(미터, Haversine). 동일 개체목 중복 등록 감지에 사용.
export function distanceMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
