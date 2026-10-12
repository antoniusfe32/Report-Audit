/**
 * Uji integrasi: baca PDF sintetis sungguhan dengan pdf.js (versi Node),
 * lalu pastikan angka, label, dan pencarian bekerja seperti di aplikasi.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { extractNumberTokens, type NumberToken, type RawTextItem } from "./numberTokens";
import { findOccurrences } from "../matching/findOccurrences";

const SAMPLE = fileURLToPath(new URL("../../../samples/contoh-laporan-keuangan.pdf", import.meta.url));

let tokens: NumberToken[] = [];

beforeAll(async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(SAMPLE));
  const doc = await pdfjs.getDocument({ data }).promise;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: RawTextItem[] = content.items.flatMap((it) =>
      "str" in it && "transform" in it
        ? [{ str: it.str, transform: it.transform as number[], width: it.width, height: it.height }]
        : [],
    );
    tokens.push(...extractNumberTokens(items, p, "id"));
  }
});

const find = (page: number, text: string) => tokens.filter((t) => t.page === page && t.text === text);

describe("PDF sintetis", () => {
  it("membaca angka laporan posisi keuangan beserta labelnya", () => {
    const [kas] = find(2, "125.750.420");
    expect(kas.parsed.value).toBe(125750420);
    expect(kas.label).toBe("Kas dan setara kas");
  });

  it("angka dalam kurung di tabel dibaca negatif", () => {
    const [ckpe] = find(4, "(8.220.000)");
    expect(ckpe.parsed.value).toBe(-8220000);
    expect(ckpe.label).toBe("Cadangan kerugian kredit ekspektasian");
  });

  it("tie-out: kas di laporan posisi keuangan ditemukan di catatan 4", () => {
    const [kas] = find(2, "125.750.420");
    const occ = findOccurrences(kas, tokens);
    expect(occ.map((o) => [o.token.page, o.token.label])).toContainEqual([4, "Jumlah"]);
  });

  it("tie-out: pendapatan laba rugi ditemukan di catatan 12", () => {
    const [rev] = find(3, "912.440.300");
    const pages = findOccurrences(rev, tokens).map((o) => o.token.page);
    expect(pages).toContain(5);
  });

  it("angka di akhir kalimat tetap terbaca (titik penutup kalimat dibuang)", () => {
    const hits = find(5, "410.200.000");
    expect(hits.length).toBe(2); // tabel + kalimat
  });

  it("tahun di dalam kurung kalimat tidak dianggap negatif", () => {
    const year = tokens.find((t) => t.page === 4 && t.text.startsWith("(2024"));
    expect(year).toBeDefined();
    expect(year?.parsed.value).toBe(2024);
    expect(year?.hint).toBe("likely-year");
  });

  it("kurs 'Rp16.250' di dalam kalimat terbaca dengan mata uang", () => {
    const kurs = tokens.find((t) => t.page === 4 && t.parsed.value === 16250);
    expect(kurs?.parsed.currency).toBe("IDR");
  });

  it("nomor catatan tidak tercampur dengan nominal", () => {
    const notes = tokens.filter((t) => t.page === 2 && t.hint === "likely-reference");
    expect(notes.length).toBeGreaterThanOrEqual(9);
  });

  it("tanda '-' di tabel segmen dibaca nol", () => {
    const dash = tokens.find((t) => t.page === 5 && t.text === "-");
    expect(dash?.parsed.value).toBe(0);
    expect(dash?.label).toBe("Sewa kapal");
  });
});
