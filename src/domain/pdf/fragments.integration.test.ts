/**
 * Uji integrasi: angka yang terpecah menjadi beberapa potongan teks di PDF (gejala draft hasil export Word)
 * harus terbaca utuh. PDF dibuat oleh scripts/make_sample_pdf.py --terpecah (data fiktif).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { loadSamplePdf, type LoadedSample } from "../../test/loadSamplePdf";
import { computeVerticalFooting } from "../footing/verticalFooting";

let s: LoadedSample;
beforeAll(async () => {
  s = await loadSamplePdf("contoh-angka-terpecah.pdf");
});

const amounts = (label: string) =>
  s.tokens.filter((t) => t.label === label && t.hint !== "likely-year").map((t) => t.parsed.value);

describe("contoh-angka-terpecah.pdf", () => {
  it.each([
    ["Asuransi", [125_750_420, 110_200_315]], // "1 25.750.420"
    ["Sewa", [9_800_000, 8_700_000]], // "9" + ".800.000" (ganti font), "8. 700.000"
    ["Uang muka pemasok", [-2_220_000, -1_950_000]], // "( 2.220.000)"
    ["Lain-lain", [34_120, 29_875]], // "3" + "4.120"
    ["Rasio lancar", [9.8, 7.5]], // "9, 8" dan "7" + ",5"
  ])("%s terbaca utuh", (label, expected) => {
    expect(amounts(label as string)).toEqual(expected);
  });

  it("angka yang digabung diberi peringatan agar dicek reviewer", () => {
    const t = s.tokens.find((x) => x.label === "Asuransi" && x.parsed.value === 125_750_420)!;
    expect(t.text).toBe("125.750.420");
    expect(t.parsed.warnings.join(" ")).toContain("terpecah");
    const whole = s.tokens.find((x) => x.label === "Asuransi" && x.parsed.value === 110_200_315)!;
    expect(whole.parsed.warnings).toEqual([]);
  });

  it("potongan mentah tersimpan untuk diagnostik", () => {
    const t = s.tokens.find((x) => x.label === "Sewa" && x.parsed.value === 9_800_000)!;
    expect(t.source).toEqual(["9", ".800.000"]);
  });

  it("footing tabel dengan angka terpecah tetap F di kedua kolom", () => {
    const r = computeVerticalFooting({ ...s, scales: ["ribuan"] });
    const totals = r.footings.map((f) => [s.tokens.find((t) => t.id === f.totalId)!.text, f.status]);
    expect(totals).toEqual([
      ["133.364.540", "foot"],
      ["116.980.190", "foot"],
    ]);
  });
});
