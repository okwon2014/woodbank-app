import { describe, it, expect } from "vitest";
import { distanceMeters, validateMeasurements } from "./event";

const NULL_ALL = { height_m: null, dbh_cm: null, elevation_m: null, aspect_deg: null, lat: null, lon: null };

describe("validateMeasurements", () => {
  it("모든 값이 null 이면 경고 없음", () => {
    expect(validateMeasurements(NULL_ALL)).toEqual([]);
  });
  it("통상 범위 값은 경고 없음", () => {
    const ws = validateMeasurements({
      height_m: 20, dbh_cm: 45, elevation_m: 126, aspect_deg: 180, lat: 35.26, lon: 127.01,
    });
    expect(ws).toEqual([]);
  });
  it("height_m 이 범위 밖이면 warn", () => {
    const w = validateMeasurements({ ...NULL_ALL, height_m: 200 });
    expect(w[0].field).toBe("height_m");
    expect(w[0].severity).toBe("warn");
  });
  it("dbh_cm 0 cm 는 warn (단위 의심)", () => {
    const w = validateMeasurements({ ...NULL_ALL, dbh_cm: 0 });
    expect(w[0].field).toBe("dbh_cm");
  });
  it("aspect_deg 가 360 이면 error", () => {
    const w = validateMeasurements({ ...NULL_ALL, aspect_deg: 360 });
    expect(w[0].field).toBe("aspect_deg");
    expect(w[0].severity).toBe("error");
  });
  it("위/경도가 한반도 밖이면 warn", () => {
    const w = validateMeasurements({ ...NULL_ALL, lat: 0, lon: 0 });
    expect(w.find((x) => x.field === "lat")).toBeTruthy();
    expect(w.find((x) => x.field === "lon")).toBeTruthy();
  });
});

describe("distanceMeters (Haversine)", () => {
  it("동일 좌표는 0 m", () => {
    expect(distanceMeters({ lat: 35, lon: 127 }, { lat: 35, lon: 127 })).toBe(0);
  });
  it("1 도 차이는 약 111 km(위도)", () => {
    const d = distanceMeters({ lat: 35, lon: 127 }, { lat: 36, lon: 127 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });
  it("같은 site 의 이웃 개체목(약 0.0001° ≈ 11 m) 감지", () => {
    const d = distanceMeters({ lat: 35.2630, lon: 127.0093 }, { lat: 35.2631, lon: 127.0093 });
    expect(d).toBeGreaterThan(10);
    expect(d).toBeLessThan(14);
  });
});
