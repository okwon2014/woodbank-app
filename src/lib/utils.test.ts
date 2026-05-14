import { describe, it, expect } from "vitest";
import { dmsToDecimal, ddToDms, nowIsoDate, uuidv7, cx } from "./utils";

describe("cx", () => {
  it("falsy 값은 무시한다", () => {
    expect(cx("a", false, null, undefined, "b")).toBe("a b");
  });
});

describe("ddToDms", () => {
  it("위도 양수면 N", () => {
    expect(ddToDms(35.25, true)).toMatch(/^N 35° 15' 0\.0"$/);
  });
  it("경도 음수면 W", () => {
    expect(ddToDms(-127.5, false)).toMatch(/^W 127° 30' 0\.0"$/);
  });
});

describe("dmsToDecimal", () => {
  it("기본 DMS 문자열을 십진수로", () => {
    const v = dmsToDecimal('N 35° 15\' 0.0"');
    expect(v).toBeCloseTo(35.25, 5);
  });
  it("방향 W 가 있으면 음수", () => {
    const v = dmsToDecimal('W 127° 30\' 0.0"');
    expect(v).toBeCloseTo(-127.5, 5);
  });
  it("ddToDms → dmsToDecimal 왕복", () => {
    const v = dmsToDecimal(ddToDms(35.123456, true));
    expect(v).toBeCloseTo(35.123456, 4);
  });
  it("빈 문자열·잘못된 입력은 null", () => {
    expect(dmsToDecimal("")).toBeNull();
    expect(dmsToDecimal("not-a-coord")).toBeNull();
  });
});

describe("nowIsoDate", () => {
  it("YYYY-MM-DD 형식", () => {
    expect(nowIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("uuidv7", () => {
  it("표준 UUID 형식이며 버전 비트가 7", () => {
    const id = uuidv7();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
  it("시간순으로 정렬 가능 (다음 호출은 사전순상 ≥)", () => {
    const a = uuidv7();
    // 1ms 보장 (Date.now 가 다음 ms 로 넘어가도록)
    const before = Date.now();
    while (Date.now() === before) {
      /* spin */
    }
    const b = uuidv7();
    // 처음 48비트(12 hex chars)가 시간이라 사전순 비교로 충분
    expect(b.slice(0, 13) >= a.slice(0, 13)).toBe(true);
  });
});
