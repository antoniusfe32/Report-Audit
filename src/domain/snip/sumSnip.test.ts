import { beforeAll, describe, expect, it } from "vitest";
import { loadSamplePdf, type LoadedSample } from "../../test/loadSamplePdf";
import type { NumberToken, PdfBox } from "../pdf/numberTokens";
import { computeVerticalFooting } from "../footing/verticalFooting";
import { footingRows, registerRows, snipRows, COL } from "../register/register";
import { evaluateSnip, normalizeBox, orientationOf, selectTokens, suggestTotal, type Snip } from "./sumSnip";

let fs: LoadedSample; // contoh-footing.pdf
let old: LoadedSample; // contoh-laporan-keuangan.pdf
beforeAll(async () => {
  fs = await loadSamplePdf("contoh-footing.pdf");
  old = await loadSamplePdf("contoh-laporan-keuangan.pdf");
});

/** Kotak yang melingkupi angka-angka tertentu (seperti ditarik pengguna), dengan sedikit kelonggaran. */
function boxAround(toks: NumberToken[], pad = 3): PdfBox {
  return normalizeBox(
    { x: Math.min(...toks.map((t) => t.box.x0)) - pad, y: Math.min(...toks.map((t) => t.box.y0)) - pad },
    { x: Math.max(...toks.map((t) => t.box.x1)) + pad, y: Math.max(...toks.map((t) => t.box.y1)) + pad },
  );
}
const tok = (s: LoadedSample, page: number, label: string, text: string) =>
  s.tokens.find((t) => t.page === page && t.label === label && t.text === text)!;
const byId = (s: LoadedSample) => new Map(s.tokens.map((t) => [t.id, t]));

function snipOf(s: LoadedSample, page: number, toks: NumberToken[], id = "1"): Snip {
  const box = boxAround(toks);
  const sel = selectTokens(s.tokens, page, box);
  const total = suggestTotal(sel, { rules: s.rules[page - 1], boldFonts: s.boldFonts });
  return { id, page, box, tokenIds: sel.map((t) => t.id), totalId: total?.id ?? null };
}

describe("sum snip — vertikal", () => {
  it("kotak di atas komponen + total bergaris: total dikenali otomatis, selisih 1 terlihat", () => {
    const kas = tok(fs, 1, "Kas dan setara kas", "84.315.220");
    const total = tok(fs, 1, "Jumlah aset lancar", "283.760.931");
    const snip = snipOf(fs, 1, [kas, total]);
    expect(snip.tokenIds).toHaveLength(6); // 5 komponen (termasuk "-") + total
    expect(snip.totalId).toBe(total.id);
    const ev = evaluateSnip(snip, byId(fs), true);
    expect(ev.orientation).toBe("vertikal");
    expect(ev.sum).toBe(283_760_930);
    expect([ev.status, ev.difference]).toEqual(["fail", 1]);
  });

  it("kolom nomor catatan yang ikut tertarik tidak masuk penjumlahan; tahun judul kolom juga tidak", () => {
    const kas = tok(fs, 1, "Kas dan setara kas", "84.315.220");
    const total = tok(fs, 1, "Jumlah aset lancar", "283.760.931");
    // kotak melebar ke kiri sampai kolom "Catatan" dan ke atas sampai judul "2025"
    const box = boxAround([kas, total]);
    const wide = { ...box, x0: box.x0 - 160, y1: box.y1 + 30 };
    const sel = selectTokens(fs.tokens, 1, wide);
    expect(sel.map((t) => t.text)).not.toContain("4");
    expect(sel.map((t) => t.text)).not.toContain("2025");
    expect(sel).toHaveLength(6);
  });

  it("tanpa tanda total → jumlah saja", () => {
    const a = tok(fs, 1, "Kas dan setara kas", "84.315.220");
    const b = tok(fs, 1, "Piutang usaha - neto", "152.880.410");
    const snip = snipOf(fs, 1, [a, b]);
    expect(snip.totalId).toBeNull();
    const ev = evaluateSnip(snip, byId(fs), true);
    expect([ev.status, ev.sum, ev.tokens.length]).toEqual(["sum", 237_195_630, 2]);
  });

  it("skala belum ditetapkan → tidak boleh cocok", () => {
    const top = tok(fs, 5, "Pemasok bahan bakar", "61.220.400");
    const total = tok(fs, 5, "Jumlah pihak ketiga", "111.215.710");
    const ev = evaluateSnip(snipOf(fs, 5, [top, total]), byId(fs), false);
    expect(ev.status).toBe("open");
    expect(ev.reason).toContain("Skala");
  });
});

describe("sum snip — horizontal", () => {
  it("baris tabel segmen: arah horizontal; total dipilih pengguna → cocok", () => {
    const first = tok(old, 5, "Sewa kapal", "410.200.000");
    const last = tok(old, 5, "Sewa kapal", "690.315.300");
    const snip = snipOf(old, 5, [first, last]);
    const sel = snip.tokenIds.map((id) => byId(old).get(id)!);
    expect(orientationOf(sel)).toBe("horizontal");
    expect(sel.map((t) => t.text)).toEqual(["410.200.000", "280.115.300", "-", "690.315.300"]);
    const ev = evaluateSnip({ ...snip, totalId: last.id }, byId(old), true);
    expect([ev.status, ev.difference]).toEqual(["foot", 0]);
  });
});

describe("sum snip sebagai koreksi footing", () => {
  it("menggantikan footing otomatis untuk total yang sama, dan tercatat sebagai Sum snip di register", () => {
    // Pengguna sengaja hanya memilih 2 komponen + total (mis. karena pembacaan otomatis salah)
    const kas = tok(fs, 1, "Kas dan setara kas", "84.315.220");
    const piut = tok(fs, 1, "Piutang usaha - neto", "152.880.410");
    const total = tok(fs, 1, "Jumlah aset lancar", "283.760.931");
    const snip: Snip = { id: "abc", page: 1, box: boxAround([kas, total]), tokenIds: [kas.id, piut.id, total.id], totalId: total.id };

    const scales = fs.textItems.map(() => "ribuan" as const);
    const auto = computeVerticalFooting({ ...fs, scales });
    const withSnip = computeVerticalFooting({ ...fs, scales, snips: [snip] });

    const forTotal = withSnip.footings.filter((f) => f.totalId === total.id);
    expect(forTotal).toHaveLength(1);
    expect(forTotal[0].basis).toEqual(["snip"]);
    expect(forTotal[0].componentIds).toEqual([kas.id, piut.id]);
    expect(forTotal[0].difference).toBe(283_760_931 - 84_315_220 - 152_880_410);
    expect(withSnip.footings).toHaveLength(auto.footings.length);

    // Komponen otomatis yang tidak dipilih kini belum tercakup (○)
    const persediaan = tok(fs, 1, "Persediaan", "40.355.300");
    expect(withSnip.byToken.get(persediaan.id)?.mark).toBe("open");

    const ev = evaluateSnip(snip, byId(fs), true);
    const rows = registerRows(withSnip, [ev], fs.tokens, "f".repeat(64));
    const row = rows.find((r) => r[COL.id] === "S-abc")!;
    expect([row[COL.type], row[COL.status], row[COL.difference]]).toEqual(["Sum snip", "✗ selisih", forTotal[0].difference]);
    expect(rows.some((r) => r[COL.id] === `F-${total.id}`)).toBe(false);
    expect(footingRows(withSnip, fs.tokens, "f".repeat(64)).some((r) => r[COL.id] === "S-abc")).toBe(false);
  });

  it("sum snip tanpa total masuk register sebagai 'Σ jumlah'", () => {
    const a = tok(fs, 1, "Kas dan setara kas", "84.315.220");
    const b = tok(fs, 1, "Piutang usaha - neto", "152.880.410");
    const ev = evaluateSnip(snipOf(fs, 1, [a, b], "z9"), byId(fs), true);
    const [row] = snipRows([ev], "f".repeat(64));
    expect([row[COL.id], row[COL.type], row[COL.computed], row[COL.status]]).toEqual([
      "S-z9",
      "Sum snip",
      237_195_630,
      "Σ jumlah",
    ]);
  });
});
