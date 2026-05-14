import { describe, it, expect } from "vitest";
import { buildCsv } from "./csv";
import type { EventExport } from "./types";

function makeEvent(overrides: Partial<EventExport> = {}): EventExport {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    sample_no: "2025_담양_01",
    sampled_at: "2025-04-01",
    height_m: 20.0,
    dbh_cm: 45.5,
    dna_collected: false,
    dna_sample_code: null,
    notes: null,
    surveyor_name: "홍길동",
    tree_local_no: "01",
    species_code: "ZSE",
    species_ko: "느티나무",
    lat: 35.123456,
    lon: 127.0,
    lat_dms: null,
    lon_dms: null,
    elevation_m: 126,
    aspect_deg: 180,
    site_code: "2025_담양",
    region_sido: "전라남도",
    region_sigungu: "담양군",
    region_sigungu_code: "46710",
    address_detail: "대덕면 비차리",
    habitat_terrain: "능선",
    photos: [],
    ...overrides,
  };
}

describe("buildCsv", () => {
  it("UTF-8 BOM 으로 시작", () => {
    const out = buildCsv([makeEvent()]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
  });

  it("CRLF 줄바꿈 사용", () => {
    const out = buildCsv([makeEvent()]);
    // 헤더 + 1행 + 마지막 빈 줄 = "\r\n" 최소 2회
    expect((out.match(/\r\n/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("헤더 컬럼 24개 (한국어 헤더)", () => {
    const out = buildCsv([]);
    // BOM 제거 후 첫 줄
    const firstLine = out.slice(1).split("\r\n")[0];
    expect(firstLine.split(",").length).toBe(24);
    expect(firstLine).toContain("채취번호");
    expect(firstLine).toContain("국명");
    expect(firstLine).toContain("DNA채취");
  });

  it("콤마·쌍따옴표·개행은 RFC 4180 으로 인용", () => {
    const ev = makeEvent({ notes: 'a,b "c" d\nnew' });
    const out = buildCsv([ev]);
    // 마지막 데이터 줄에 인용 + 쌍따옴표 이스케이프 포함
    expect(out).toContain('"a,b ""c"" d\nnew"');
  });

  it("DNA 채취 boolean → Y/N", () => {
    const yes = buildCsv([makeEvent({ dna_collected: true })]);
    const no = buildCsv([makeEvent({ dna_collected: false })]);
    expect(yes).toContain(",Y,");
    expect(no).toContain(",N,");
  });

  it("photos 배열 길이가 사진수 컬럼으로", () => {
    const ev = makeEvent({
      photos: [
        { id: "a", category: "tree_form", signedUrl: null },
        { id: "b", category: "bark", signedUrl: null },
      ],
    });
    const out = buildCsv([ev]);
    // 마지막 컬럼 직전이 사진수(2) - 단순 substring 검증
    expect(out).toMatch(/,2,/);
  });

  it("null/undefined 필드는 빈 문자열", () => {
    const ev = makeEvent({
      region_sido: null,
      address_detail: null,
      species_ko: null,
      notes: null,
    });
    const out = buildCsv([ev]);
    // 헤더 라인 다음의 데이터 라인을 보고 빈 셀(",,") 존재 확인
    const dataLine = out.slice(1).split("\r\n")[1];
    expect(dataLine).toMatch(/,,/);
  });
});
