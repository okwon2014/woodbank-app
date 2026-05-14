import { describe, it, expect } from "vitest";
import { isAbandoned, isWaiting, isConflict, isConflictError, MAX_RETRIES } from "./queue";

describe("isAbandoned", () => {
  it(`retries 가 ${MAX_RETRIES} 이상이면 abandoned`, () => {
    expect(isAbandoned({ retries: MAX_RETRIES })).toBe(true);
    expect(isAbandoned({ retries: MAX_RETRIES + 3 })).toBe(true);
  });
  it("retries 가 그 이하면 abandoned 아님", () => {
    expect(isAbandoned({ retries: 0 })).toBe(false);
    expect(isAbandoned({ retries: MAX_RETRIES - 1 })).toBe(false);
  });
});

describe("isWaiting", () => {
  it("미래 시각이면 대기 중", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isWaiting({ next_retry_at: future })).toBe(true);
  });
  it("과거 시각이면 대기 중 아님", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isWaiting({ next_retry_at: past })).toBe(false);
  });
  it("null 이면 대기 중 아님", () => {
    expect(isWaiting({ next_retry_at: null })).toBe(false);
    expect(isWaiting({ next_retry_at: undefined })).toBe(false);
  });
});

describe("isConflict", () => {
  it("last_error 가 CONFLICT: 로 시작하면 충돌", () => {
    expect(isConflict({ last_error: "CONFLICT: unique violation" })).toBe(true);
  });
  it("그 외에는 충돌 아님", () => {
    expect(isConflict({ last_error: "network timeout" })).toBe(false);
    expect(isConflict({ last_error: null })).toBe(false);
  });
});

describe("isConflictError", () => {
  it("Postgres 23505 / 23514 SQLSTATE 는 충돌", () => {
    expect(isConflictError({ code: "23505", message: "duplicate key" })).toBe(true);
    expect(isConflictError({ code: "23514", message: "check violation" })).toBe(true);
  });
  it("그 외 코드/객체는 충돌 아님", () => {
    expect(isConflictError({ code: "23503", message: "fk violation" })).toBe(false);
    expect(isConflictError(new Error("network"))).toBe(false);
    expect(isConflictError({})).toBe(false);
    expect(isConflictError(null)).toBe(false);
  });
});
