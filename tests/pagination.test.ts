import { describe, expect, it } from "vitest";
import { parsePagination } from "../src/app/utils/pagination";

describe("parsePagination", () => {
  it("uses the defaults when page/limit are missing", () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 10, skip: 0 });
    expect(parsePagination({}, 20)).toEqual({ page: 1, limit: 20, skip: 0 });
  });

  it("caps the limit at 100", () => {
    expect(parsePagination({ limit: "1000000" }).limit).toBe(100);
  });

  it("falls back on invalid or non-positive values", () => {
    expect(parsePagination({ page: "-3", limit: "abc" })).toEqual({
      page: 1,
      limit: 10,
      skip: 0,
    });
    expect(parsePagination({ page: "2.5", limit: "0" }).page).toBe(1);
  });

  it("computes skip from page and limit", () => {
    expect(parsePagination({ page: "3", limit: "25" }).skip).toBe(50);
  });
});
