import { describe, expect, it } from "vitest";
import { parseAmount, formatAmount } from "./parseAmount";

describe("parseAmount — format Indonesia (setting dokumen 'id')", () => {
  const cases: Array<[string, number]> = [
    ["125.750", 125750],
    ["125 750", 125750],
    ["125.750,00", 125750],
    ["125.750,5", 125750.5],
    ["125.750.000", 125750000],
    ["125.750.000.000", 125750000000],
    ["125.750.000.000.000", 125750000000000],
    ["0", 0],
    ["750", 750],
    ["Rp125.750", 125750],
    ["Rp 125.750", 125750],
    ["Rp. 125.750", 125750],
  ];
  it.each(cases)("%s → %d", (input, expected) => {
    const r = parseAmount(input, "id");
    expect(r.kind).toBe("number");
    expect(r.value).toBe(expected);
    expect(r.ambiguous).toBe(false);
  });

  it("menyimpan teks asli", () => {
    expect(parseAmount(" (125.750) ", "id").display).toBe(" (125.750) ");
  });

  it("mengenali mata uang", () => {
    expect(parseAmount("Rp 125.750", "id").currency).toBe("IDR");
    expect(parseAmount("USD 125.750", "id").currency).toBe("USD");
    expect(parseAmount("$125.750", "id").currency).toBe("USD");
  });
});

describe("parseAmount — tanda negatif", () => {
  it.each([
    ["(125.750)", -125750],
    ["-125.750", -125750],
    ["125.750-", -125750],
    ["−125.750", -125750],
    ["(Rp 125.750)", -125750],
    ["Rp (125.750)", -125750],
  ])("%s → %d", (input, expected) => {
    const r = parseAmount(input, "id");
    expect(r.value).toBe(expected);
    expect(r.negative).toBe(true);
  });

  it("memberi peringatan bila kurung tidak lengkap", () => {
    const open = parseAmount("(125.750", "id");
    expect(open.value).toBe(-125750);
    expect(open.warnings.length).toBe(1);
    const close = parseAmount("125.750)", "id");
    expect(close.value).toBe(-125750);
    expect(close.warnings.length).toBe(1);
  });

  it("memberi peringatan untuk negatif ganda", () => {
    const r = parseAmount("(-125.750)", "id");
    expect(r.negative).toBe(true);
    expect(r.warnings.some((w) => w.includes("ganda"))).toBe(true);
  });
});

describe("parseAmount — catatan kaki", () => {
  it.each([
    ["125.750*", "*"],
    ["125.750**", "**"],
    ["125.750(a)", "(a)"],
    ["125.750 (b)", "(b)"],
    ["(125.750)*", "*"],
  ])("%s → footnote %s, angka tetap benar", (input, fn) => {
    const r = parseAmount(input, "id");
    expect(r.footnote).toBe(fn);
    expect(Math.abs(r.value ?? 0)).toBe(125750);
  });
});

describe("parseAmount — dash, kosong, bukan angka", () => {
  it.each(["-", "–", "—", "--"])("dash %s dibaca 0", (input) => {
    const r = parseAmount(input, "id");
    expect(r.kind).toBe("dash");
    expect(r.value).toBe(0);
  });

  it.each(["", "   "])("kosong '%s'", (input) => {
    expect(parseAmount(input, "id").kind).toBe("blank");
  });

  it.each(["Kas", "abc", "12a", "1.2.3,4,5", "1.23.456"])("bukan angka: %s", (input) => {
    const r = parseAmount(input, "id");
    expect(r.kind).toBe("invalid");
    expect(r.value).toBeNull();
  });
});

describe("parseAmount — ambiguitas antar konvensi", () => {
  it("format US di dokumen Indonesia → dibaca, tetapi ditandai ambigu", () => {
    const r = parseAmount("125,750.00", "id");
    expect(r.value).toBe(125750);
    expect(r.interpretedAs).toBe("en");
    expect(r.ambiguous).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("'1.5' di dokumen Indonesia tidak diam-diam dianggap 15", () => {
    const r = parseAmount("1.5", "id");
    expect(r.value).toBe(1.5);
    expect(r.ambiguous).toBe(true);
  });

  it("dokumen format US membaca 125,750.00 tanpa peringatan", () => {
    const r = parseAmount("125,750.00", "en");
    expect(r.value).toBe(125750);
    expect(r.ambiguous).toBe(false);
  });

  it("dokumen format US: '125.750' dibaca 125,75 (desimal) tanpa peringatan", () => {
    const r = parseAmount("125.750", "en");
    expect(r.value).toBe(125.75);
    expect(r.ambiguous).toBe(false);
  });

  it("pemisah ribuan campur tidak diterima", () => {
    expect(parseAmount("1.234 567", "id").kind).toBe("invalid");
  });
});

describe("formatAmount", () => {
  it("negatif ditampilkan dalam kurung", () => {
    expect(formatAmount(-125750, "id")).toBe("(125.750)");
    expect(formatAmount(125750, "id")).toBe("125.750");
    expect(formatAmount(null)).toBe("—");
  });
});
