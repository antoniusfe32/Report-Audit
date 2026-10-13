import { describe, expect, it } from "vitest";
import { detectScale, effectiveScales, summarizeScales } from "./scale";

describe("detectScale", () => {
  it.each([
    ["(Dinyatakan dalam ribuan Rupiah)", "ribuan"],
    ["(Disajikan dalam jutaan Rupiah, kecuali dinyatakan lain)", "jutaan"],
    ["(Expressed in thousands of Rupiah)", "ribuan"],
    ["(Dinyatakan dalam Rupiah penuh)", "penuh"],
    ["(Dinyatakan dalam Dolar AS)", "penuh"],
    ["Rp'000", "ribuan"],
  ])("%s → %s", (text, expected) => {
    expect(detectScale(text)).toBe(expected);
  });

  it("tanpa pernyataan skala → null", () => {
    expect(detectScale("Kas dan setara kas 125.750.420")).toBeNull();
    expect(detectScale("pendapatan lain rupiah")).toBeNull();
  });
});

describe("summarizeScales / effectiveScales", () => {
  it("skala dokumen = yang paling sering dinyatakan", () => {
    const s = summarizeScales(["ribuan", null, "ribuan", "penuh"]);
    expect(s.documentDefault).toBe("ribuan");
    expect(s.mixed).toBe(true);
  });

  it("seri → tidak ditetapkan otomatis", () => {
    expect(summarizeScales(["ribuan", "jutaan"]).documentDefault).toBeNull();
    expect(summarizeScales([null, null]).documentDefault).toBeNull();
  });

  it("pernyataan di halaman menang atas skala dokumen", () => {
    expect(effectiveScales(["penuh", null], "ribuan")).toEqual(["penuh", "ribuan"]);
    expect(effectiveScales([null], null)).toEqual([null]);
  });
});
