/**
 * Uji integrasi footing: PDF sintetis sungguhan dibaca dengan pdf.js (teks + garis), lalu footing
 * dihitung seperti di aplikasi. PDF dibuat oleh scripts/make_sample_pdf.py (data fiktif).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { loadSamplePdf, type LoadedSample } from "../../test/loadSamplePdf";
import { computeVerticalFooting, type FootingResult } from "./verticalFooting";
import { detectScale, effectiveScales, pageText, summarizeScales } from "./scale";

function footingOf(sample: LoadedSample): FootingResult {
  const perPage = sample.textItems.map((items) => detectScale(pageText(items)));
  const scales = effectiveScales(perPage, summarizeScales(perPage).documentDefault);
  return computeVerticalFooting({ ...sample, scales });
}

describe("contoh-footing.pdf (bertingkat, mutasi, selisih 1 disengaja, tabel terpotong)", () => {
  let s: LoadedSample;
  let r: FootingResult;
  beforeAll(async () => {
    s = await loadSamplePdf("contoh-footing.pdf");
    r = footingOf(s);
  });

  /** Footing untuk total dengan label & teks tertentu. */
  const total = (page: number, label: string, text: string) => {
    const t = s.tokens.find((x) => x.page === page && x.label === label && x.text === text);
    if (!t) throw new Error(`tidak ada ${label} ${text} di hal. ${page}`);
    const f = r.footings.find((x) => x.totalId === t.id);
    return { token: t, footing: f, status: r.byToken.get(t.id) };
  };

  it("skala 'ribuan Rupiah' terdeteksi di setiap halaman", () => {
    expect(s.textItems.map((items) => detectScale(pageText(items)))).toEqual(Array(5).fill("ribuan"));
  });

  it("garis total terbaca dari PDF", () => {
    expect(s.rules.every((rules) => rules.length > 0)).toBe(true);
  });

  it("kelima selisih yang disengaja menjadi ✗ dengan besar selisih yang benar", () => {
    const fails = r.footings
      .filter((f) => f.status === "fail")
      .map((f) => {
        const t = s.tokens.find((x) => x.id === f.totalId)!;
        return [f.page, t.label, t.text, f.difference];
      });
    expect(fails).toEqual([
      [1, "Jumlah aset lancar", "283.760.931", 1],
      [1, "JUMLAH LIABILITAS", "383.995.703", -1],
      [2, "LABA SEBELUM PAJAK PENGHASILAN", "144.533.821", 1],
      [3, "Saldo 31 Desember 2025", "552.739.782", 1],
      [4, "Jumlah biaya perolehan", "104.315.399", -1],
    ]);
  });

  it("total bertingkat: JUMLAH ASET = jumlah aset lancar + jumlah aset tidak lancar", () => {
    const grand = total(1, "JUMLAH ASET", "1.334.001.231");
    expect(grand.status?.mark).toBe("foot");
    const comps = grand.footing!.componentIds.map((id) => s.tokens.find((t) => t.id === id)!.label);
    expect(comps).toEqual(["Jumlah aset lancar", "Jumlah aset tidak lancar"]);
  });

  it("subtotal berjalan laba rugi dan total berlabel tanpa garis → F", () => {
    expect(total(2, "LABA SEBELUM PAJAK PENGHASILAN", "200.141.110").status?.mark).toBe("foot");
    expect(total(2, "LABA TAHUN BERJALAN", "112.133.671").status?.mark).toBe("foot");
    const ap = total(5, "Jumlah", "123.715.710");
    expect(ap.status?.mark).toBe("foot");
    expect(ap.footing?.basis).toEqual(["label"]);
  });

  it("mutasi ekuitas & mutasi aset tetap: setiap kolom di-footing vertikal", () => {
    const equity = r.footings.filter((f) => f.page === 3);
    expect(equity).toHaveLength(10); // 5 kolom × 2 saldo akhir
    const fa = r.footings.filter((f) => f.page === 4);
    expect(fa).toHaveLength(15); // 5 kolom × (jumlah biaya, jumlah akumulasi, nilai tercatat)
    expect(fa.filter((f) => f.status === "foot")).toHaveLength(14);
  });

  it("tabel terpotong ke halaman berikutnya → ○ (bukan F, bukan ✗)", () => {
    for (const text of ["40.355.300", "38.002.110"]) {
      const inv = total(5, "Jumlah", text);
      expect(inv.status?.mark).toBe("open");
      expect(inv.status?.reason).toContain("lanjutan");
    }
    // Baris di halaman sebelumnya belum tercakup footing
    const tail = s.tokens.find((t) => t.page === 4 && t.label === "Pelumas")!;
    expect(r.byToken.get(tail.id)?.mark).toBe("open");
  });

  it("ringkasan: tidak ada F palsu", () => {
    expect(r.summary.fail).toBe(5);
    expect(r.summary.openTotals).toBe(2);
    expect(r.summary.foot).toBe(r.footings.length - 7);
  });

  it("nomor catatan, tahun, dan nomor halaman tidak diberi tanda footing", () => {
    const unmarked = s.tokens.filter((t) => t.hint !== "amount");
    expect(unmarked.length).toBeGreaterThan(0);
    for (const t of unmarked) expect(r.byToken.get(t.id)).toBeUndefined();
  });
});

describe("contoh-laporan-keuangan.pdf (Fase 0, semua total benar)", () => {
  let s: LoadedSample;
  let r: FootingResult;
  beforeAll(async () => {
    s = await loadSamplePdf("contoh-laporan-keuangan.pdf");
    r = footingOf(s);
  });

  it("semua total cocok (F), tidak ada ✗", () => {
    expect(r.summary.fail).toBe(0);
    expect(r.summary.openTotals).toBe(0);
    expect(r.summary.foot).toBe(32);
  });

  it("angka di dalam kalimat tetap ○ (cek manual), bukan ikut footing", () => {
    const prose = s.tokens.filter((t) => t.prose && t.hint === "amount");
    expect(prose.length).toBeGreaterThan(0);
    for (const t of prose) expect(r.byToken.get(t.id)?.mark).toBe("open");
  });
});
