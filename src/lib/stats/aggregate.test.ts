import { describe, it, expect } from "vitest";
import { countBy, histogram, monthlyTimeline, numStats } from "./aggregate";

describe("numStats", () => {
  it("빈 배열은 모두 null", () => {
    const s = numStats([]);
    expect(s).toEqual({ count: 0, mean: null, median: null, min: null, max: null, stddev: null });
  });
  it("null/undefined/NaN 은 제외", () => {
    const s = numStats([1, null, undefined, NaN, 3]);
    expect(s.count).toBe(2);
    expect(s.mean).toBe(2);
  });
  it("홀수 개수의 median", () => {
    expect(numStats([1, 2, 3, 4, 5]).median).toBe(3);
  });
  it("짝수 개수의 median", () => {
    expect(numStats([1, 2, 3, 4]).median).toBe(2.5);
  });
  it("min/max", () => {
    const s = numStats([10, 5, 7, 20, 3]);
    expect(s.min).toBe(3);
    expect(s.max).toBe(20);
  });
  it("stddev (모집단)", () => {
    // 2,4,4,4,5,5,7,9 의 모집단 표준편차 = 2
    expect(numStats([2, 4, 4, 4, 5, 5, 7, 9]).stddev).toBeCloseTo(2, 5);
  });
});

describe("countBy", () => {
  it("count 내림차순으로 정렬", () => {
    const rows = [{ k: "A" }, { k: "B" }, { k: "A" }, { k: "C" }, { k: "A" }, { k: "B" }];
    expect(countBy(rows, (r) => r.k)).toEqual([
      { key: "A", count: 3 },
      { key: "B", count: 2 },
      { key: "C", count: 1 },
    ]);
  });
  it("null 키는 제외", () => {
    const rows = [{ k: "A" }, { k: null }, { k: "A" }];
    expect(countBy(rows, (r) => r.k)).toEqual([{ key: "A", count: 2 }]);
  });
});

describe("histogram", () => {
  it("동등 폭 bin 으로 카운트", () => {
    const bins = histogram([1, 3, 5, 9, 12, 15], { min: 0, max: 20, width: 5 });
    // [0,5)=2  [5,10)=2  [10,15)=1  [15,20]=1
    expect(bins.map((b) => b.count)).toEqual([2, 2, 1, 1]);
  });
  it("max 값은 마지막 bin 에 포함", () => {
    const bins = histogram([20], { min: 0, max: 20, width: 5 });
    expect(bins[bins.length - 1].count).toBe(1);
  });
  it("범위 밖은 제외", () => {
    const bins = histogram([-1, 0, 100], { min: 0, max: 20, width: 5 });
    // 0 은 [0,5), 100 은 max 이상이라 마지막 bin
    expect(bins[0].count).toBe(1);
    expect(bins[bins.length - 1].count).toBe(1);
  });
  it("label 에 unit 포함", () => {
    const bins = histogram([1], { min: 0, max: 10, width: 5, unit: "m" });
    expect(bins[0].label).toBe("0–5m");
  });
});

describe("monthlyTimeline", () => {
  it("0건 월도 0 으로 채운다", () => {
    const today = new Date(2026, 4, 14); // 2026-05-14
    const tl = monthlyTimeline([], 3, today);
    expect(tl.map((p) => p.ym)).toEqual(["2026-03", "2026-04", "2026-05"]);
    expect(tl.every((p) => p.count === 0)).toBe(true);
  });
  it("월별 카운트 + 범위 밖은 무시", () => {
    const today = new Date(2026, 4, 14);
    const dates = [
      "2026-05-01", "2026-05-09", "2026-04-15", "2025-01-01" /* 범위 밖 */,
    ];
    const tl = monthlyTimeline(dates, 3, today);
    expect(tl.find((p) => p.ym === "2026-05")?.count).toBe(2);
    expect(tl.find((p) => p.ym === "2026-04")?.count).toBe(1);
    expect(tl.find((p) => p.ym === "2026-03")?.count).toBe(0);
  });
});
