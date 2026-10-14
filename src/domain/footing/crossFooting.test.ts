import { beforeAll, describe, expect, it } from "vitest";
import { extractNumberTokens, type RawTextItem } from "../pdf/numberTokens";
import { loadSamplePdf, type LoadedSample } from "../../test/loadSamplePdf";
import { computeCrossFooting } from "./crossFooting";
import { computeVerticalFooting } from "./verticalFooting";

/** Teks rata kanan di x (lebar 5 per karakter, font 9). */
const right = (str: string, x: number, y: number): RawTextItem => ({
  str,
  transform: [9, 0, 0, 9, x - str.length * 5, y],
  width: str.length * 5,
  height: 9,
});
const left = (str: string, x: number, y: number): RawTextItem => ({
  str,
  transform: [9, 0, 0, 9, x, y],
  width: str.length * 5,
  height: 9,
});
const XS = [250, 320, 390, 460];

function table(headers: string[], rows: [string, string[]][]) {
  const items: RawTextItem[] = headers.map((h, i) => right(h, XS[i], 720));
  rows.forEach(([label, vals], r) => {
    const y = 700 - r * 14;
    items.push(left(label, 50, y));
    vals.forEach((v, i) => items.push(right(v, XS[i], y)));
  });
  const tokens = extractNumberTokens(items, 1, "id");
  return computeCrossFooting({ tokens, textItems: [items], scales: ["ribuan"] }).map((c) => ({
    label: tokens.find((t) => t.id === c.totalId)!.label,
    status: c.status,
    diff: c.difference,
    reason: c.reason,
  }));
}

describe("cross footing horizontal", () => {
  it("baris mutasi: saldo awal + penambahan + pengurangan (kurung) = saldo akhir", () => {
    const r = table(["Saldo awal", "Penambahan", "Pengurangan", "Saldo akhir"], [
      ["Kapal", ["1.000", "250", "(100)", "1.150"]],
      ["Peralatan", ["400", "50", "(30)", "421"]],
    ]);
    expect(r).toEqual([
      { label: "Kapal", status: "foot", diff: 0, reason: "" },
      { label: "Peralatan", status: "fail", diff: 1, reason: "" },
    ]);
  });

  it("kolom Pengurangan tanpa kurung: cocok bila dikurangkan, DENGAN keterangan", () => {
    const [r] = table(["Saldo awal", "Penambahan", "Pengurangan", "Saldo akhir"], [["Kapal", ["1.000", "250", "100", "1.150"]]]);
    expect(r.status).toBe("foot");
    expect(r.reason).toContain("dikurangkan");
  });

  it("judul kolom kanan bukan total → tidak dicek", () => {
    expect(table(["Marine", "Offshore", "Lainnya", "Kantor"], [["Pendapatan", ["100", "200", "300", "600"]]])).toEqual([]);
  });

  it("tabel komparatif beberapa tanggal tidak dicek walau judulnya '31 Desember'", () => {
    const r = table(["31 Desember", "31 Desember", "31 Desember"], [["Kas", ["100", "200", "300"]]]);
    expect(r).toEqual([]);
  });

  it("dua kolom angka (laporan komparatif) tidak dicek", () => {
    const r = table(["Jumlah", "Jumlah"], [["Kas", ["100", "100"]]]);
    expect(r).toEqual([]);
  });
});

describe("cross footing pada PDF sintetis", () => {
  let fs: LoadedSample;
  let old: LoadedSample;
  beforeAll(async () => {
    fs = await loadSamplePdf("contoh-footing.pdf");
    old = await loadSamplePdf("contoh-laporan-keuangan.pdf");
  });
  const run = (s: LoadedSample) => computeVerticalFooting({ ...s, scales: s.textItems.map(() => "ribuan") });
  const fails = (s: LoadedSample) =>
    run(s)
      .cross.filter((c) => c.status !== "foot")
      .map((c) => [c.page, s.tokens.find((t) => t.id === c.totalId)!.label, c.status, c.difference]);

  it("mutasi ekuitas & aset tetap dicek dua arah: selisih vertikal yang disengaja juga tertangkap per baris", () => {
    expect(fails(fs)).toEqual([
      [3, "Saldo 31 Desember 2025", "fail", -1],
      [4, "Jumlah biaya perolehan", "fail", 1],
      [4, "Nilai tercatat", "fail", 1],
    ]);
    const r = run(fs);
    expect(r.cross.filter((c) => c.page === 3)).toHaveLength(9);
    expect(r.cross.filter((c) => c.page === 4)).toHaveLength(11);
    expect(r.summary.crossFoot).toBe(17);
  });

  it("tabel segmen (judul kolom 'Jumlah') cocok semua; laporan 2 kolom tidak dicek horizontal", () => {
    const r = run(old);
    expect(r.cross.map((c) => [c.page, c.status])).toEqual([
      [5, "foot"],
      [5, "foot"],
      [5, "foot"],
      [5, "foot"],
    ]);
  });

  it("sum snip horizontal menggantikan cross footing baris itu, tanpa mengubah footing vertikal", () => {
    const row = old.tokens.filter((t) => t.page === 5 && t.label === "Sewa kapal").sort((a, b) => a.box.x0 - b.box.x0);
    const total = row[row.length - 1];
    const snip = {
      id: "h1",
      page: 5,
      box: { x0: 0, y0: 0, x1: 1, y1: 1 },
      tokenIds: [row[0].id, total.id], // pengguna sengaja hanya memilih kolom pertama + total
      totalId: total.id,
    };
    const base = run(old);
    const r = computeVerticalFooting({ ...old, scales: old.textItems.map(() => "ribuan"), snips: [snip] });
    const c = r.cross.find((x) => x.totalId === total.id)!;
    expect([c.snipId, c.status, c.componentIds]).toEqual(["h1", "fail", [row[0].id]]);
    expect(r.footings).toEqual(base.footings);
  });
});
