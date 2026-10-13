import { beforeAll, describe, expect, it } from "vitest";
import { loadSamplePdf, type LoadedSample } from "../../test/loadSamplePdf";
import { computeVerticalFooting } from "./verticalFooting";
import { pageDiagnostics } from "./diagnostics";

let s: LoadedSample;
let text: string;
beforeAll(async () => {
  s = await loadSamplePdf("contoh-laba-rugi-tebal.pdf");
  const footing = computeVerticalFooting({ ...s, scales: s.textItems.map(() => "ribuan") });
  text = pageDiagnostics({ page: 1, tokens: s.tokens, rules: s.rules[0], boldFonts: s.boldFonts, footing });
});

describe("pageDiagnostics", () => {
  it("kolom angka dan label tidak memuat digit asli (hanya 9); koordinat posisi boleh", () => {
    const rows = text.split("\n").slice(3);
    expect(rows.length).toBeGreaterThan(20);
    for (const row of rows) {
      const cols = row.split(" | ");
      expect(cols[2]).not.toMatch(/[0-8]/);
      expect(cols[6]).not.toMatch(/[0-8]/);
    }
  });

  it("memuat struktur yang dibutuhkan untuk mencari penyebab salah baca", () => {
    expect(text).toContain("LABA BRUTO");
    expect(text).toContain("tebal");
    expect(text).toMatch(/total\(garis\+tebal, 2 komp\)/);
    expect(text).toMatch(/^Garis horizontal: \d+/m);
  });
});
