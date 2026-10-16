import { describe, expect, it } from "vitest";
import { albumDensity } from "./album";

describe("album print density", () => {
  it("uses one column for 1–5 memories", () => {
    expect(albumDensity("auto", 1, 0)).toBe("feature");
    expect(albumDensity("auto", 5, 5)).toBe("feature");
  });
  it("uses two columns for 6–16 memories", () => {
    expect(albumDensity("auto", 6, 0)).toBe("magazine");
    expect(albumDensity("auto", 16, 16)).toBe("magazine");
  });
  it("uses three columns at 17 or more entries or photos", () => {
    expect(albumDensity("auto", 17, 0)).toBe("contact");
    expect(albumDensity("auto", 2, 30)).toBe("contact");
  });
  it("preserves every manual override regardless of counts", () => {
    expect(albumDensity("feature", 30, 30)).toBe("feature");
    expect(albumDensity("magazine", 2, 2)).toBe("magazine");
    expect(albumDensity("contact", 2, 2)).toBe("contact");
  });
});