/**
 * Uji integrasi: laporan laba rugi bergaya draft Word pemilik (STRUKTUR saja; angka fiktif) —
 * subtotal TEBAL, label terbungkus beberapa baris, nomor catatan "17,22h", border putih tak terlihat.
 * PDF dibuat oleh scripts/make_sample_pdf.py --laba-rugi.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { loadSamplePdf, type LoadedSample } from "../../test/loadSamplePdf";
import { computeVerticalFooting, type FootingResult } from "./verticalFooting";

let s: LoadedSample;
let r: FootingResult;
beforeAll(async () => {
  s = await loadSamplePdf("contoh-laba-rugi-tebal.pdf");
  r = computeVerticalFooting({ ...s, scales: s.textItems.map(() => "ribuan") });
});

const SUBTOTALS = [
  "LABA BRUTO",
  "LABA SEBELUM PAJAK FINAL DAN PAJAK PENGHASILAN BADAN",
  "LABA SEBELUM PAJAK PENGHASILAN BADAN",
  "LABA TAHUN BERJALAN",
  "PENGHASILAN KOMPREHENSIF LAIN TAHUN BERJALAN SETELAH PAJAK",
  "TOTAL PENGHASILAN KOMPREHENSIF TAHUN BERJALAN",
];

const summary = (page: number) =>
  r.footings
    .filter((f) => f.page === page)
    .map((f) => {
      const t = s.tokens.find((x) => x.id === f.totalId)!;
      return [t.label, Math.round(t.box.x1), f.status, f.difference];
    });

describe("contoh-laba-rugi-tebal.pdf", () => {
  it("border putih tak terlihat tidak terbaca sebagai garis", () => {
    // 6 subtotal × 2 kolom bergaris + garis judul + garis ganda TOTAL (2 × 2)
    expect(s.rules[0].length).toBeLessThan(20);
  });

  it("hal. 1 (bergaris + tebal): semua subtotal dikenali dan F; label multi-baris terbaca utuh", () => {
    expect(summary(1)).toEqual([
      ...SUBTOTALS.map((l) => [l, 450, "foot", 0]),
      ...SUBTOTALS.map((l) => [l, 535, "foot", 0]),
    ]);
  });

  it("hal. 2 (tanpa garis, hanya tebal): subtotal tetap dikenali; selisih 1 disengaja → ✗", () => {
    const rows = summary(2);
    expect(rows.map((x) => x[0])).toEqual([...SUBTOTALS, ...SUBTOTALS]);
    expect(rows.filter((x) => x[2] !== "foot")).toEqual([["LABA TAHUN BERJALAN", 535, "fail", 1]]);
  });

  it("baris tebal yang sebenarnya komponen (PENDAPATAN, BEBAN POKOK PENDAPATAN) tidak dianggap total", () => {
    for (const label of ["PENDAPATAN", "BEBAN POKOK PENDAPATAN"]) {
      const toks = s.tokens.filter((t) => t.label === label);
      expect(toks).toHaveLength(4);
      for (const t of toks) expect(r.byToken.get(t.id)?.mark).toBe("check");
    }
  });

  it("nomor catatan seperti '17,22h' dan '12c' tidak dibaca sebagai angka", () => {
    expect(s.tokens.some((t) => /h|i|c|d|e$/.test(t.text))).toBe(false);
  });

  it("label terbungkus dengan huruf kecil di baris kedua", () => {
    const amounts = (label: string) => s.tokens.filter((t) => t.label === label && t.hint === "amount");
    expect(amounts("Beban umum dan administrasi")).toHaveLength(4);
    expect(amounts("Pengukuran kembali program imbalan pasti")).toHaveLength(4);
  });
});
