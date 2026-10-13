import { describe, expect, it } from "vitest";
import { extractNumberTokens, splitWords, looksScanned, type RawTextItem } from "./numberTokens";
import { findOccurrences } from "../matching/findOccurrences";

/** Bantu membuat text item sintetis: teks di posisi (x, y) dengan font 10pt. */
function item(str: string, x: number, y: number, charWidth = 5): RawTextItem {
  return { str, transform: [10, 0, 0, 10, x, y], width: str.length * charWidth, height: 10 };
}

describe("splitWords", () => {
  it("menggabung Rp dengan angka sesudahnya", () => {
    expect(splitWords("Rp 125.750 dan 5").map((w) => w.text)).toEqual(["Rp 125.750", "dan", "5"]);
  });
});

describe("extractNumberTokens", () => {
  const items: RawTextItem[] = [
    item("Kas dan setara kas", 50, 700),
    item("4", 250, 700),
    item("125.750", 350, 700),
    item("(110.200)", 450, 700),
    item("Piutang usaha", 50, 680),
    item("-", 350, 680),
    item("2025", 350, 720),
    item("Saldo 1.234 pada akhir tahun", 50, 600),
  ];
  const tokens = extractNumberTokens(items, 3, "id");

  it("menemukan angka beserta label barisnya", () => {
    const t = tokens.find((x) => x.text === "125.750")!;
    expect(t.parsed.value).toBe(125750);
    expect(t.label).toBe("Kas dan setara kas");
    expect(t.page).toBe(3);
  });

  it("angka dalam kurung negatif", () => {
    expect(tokens.find((x) => x.text === "(110.200)")!.parsed.value).toBe(-110200);
  });

  it("dash yang berdiri sendiri dibaca nol", () => {
    const dash = tokens.find((x) => x.text === "-")!;
    expect(dash.parsed.value).toBe(0);
    expect(dash.label).toBe("Piutang usaha");
  });

  it("menandai nomor catatan dan tahun", () => {
    expect(tokens.find((x) => x.text === "4")!.hint).toBe("likely-reference");
    expect(tokens.find((x) => x.text === "2025")!.hint).toBe("likely-year");
  });

  it("angka di tengah kalimat tetap terdeteksi dengan posisi proporsional", () => {
    const t = tokens.find((x) => x.text === "1.234")!;
    // "Saldo " = 6 karakter × 5 = 30 → x0 = 80
    expect(t.box.x0).toBeCloseTo(80);
    expect(t.box.x1).toBeCloseTo(105);
  });

  it("koordinat dalam satuan PDF dan kotak valid", () => {
    for (const t of tokens) {
      expect(t.box.x1).toBeGreaterThan(t.box.x0);
      expect(t.box.y1).toBeGreaterThan(t.box.y0);
    }
  });
});

describe("findOccurrences", () => {
  const page1 = extractNumberTokens(
    [item("Kas", 50, 700), item("125.750", 350, 700), item("4", 250, 700)],
    1,
    "id",
  );
  const page5 = extractNumberTokens(
    [
      item("Jumlah kas", 50, 500),
      item("125.750", 350, 500),
      item("Beban", 50, 480),
      item("(125.750)", 350, 480),
      item("Lain", 50, 460),
      item("125.751", 350, 460),
      item("Catatan", 50, 440),
      item("4", 350, 440),
    ],
    5,
    "id",
  );
  const all = [...page1, ...page5];
  const selected = page1.find((t) => t.text === "125.750")!;
  const result = findOccurrences(selected, all);

  it("menemukan angka sama di halaman lain dan menandai beda tanda", () => {
    expect(result.map((r) => [r.token.page, r.token.text, r.match])).toEqual([
      [5, "125.750", "same-value"],
      [5, "(125.750)", "sign-mismatch"],
    ]);
  });

  it("tidak mencocokkan nomor catatan dengan nominal", () => {
    const ref = page1.find((t) => t.text === "4")!;
    const r = findOccurrences(ref, all);
    expect(r.every((o) => o.token.hint === "likely-reference")).toBe(true);
  });
});

describe("looksScanned", () => {
  it("dokumen tanpa teks dianggap scan", () => {
    expect(looksScanned([{ page: 1, textItems: 0, numberTokens: 0 }])).toBe(true);
    expect(looksScanned([{ page: 1, textItems: 30, numberTokens: 10 }])).toBe(false);
  });
});

describe("angka terpecah", () => {
  it("menggabung potongan angka yang bersentuhan (ganti font di tengah angka)", () => {
    const tokens = extractNumberTokens([item("Sewa", 50, 700), item("9", 300, 700), item(".800.000", 305, 700)], 1, "id");
    expect(tokens.map((t) => t.parsed.value)).toEqual([9800000]);
  });

  it("menggabung spasi palsu di dalam sel angka", () => {
    const tokens = extractNumberTokens([item("1 25.750.420", 300, 700), item("9, 8", 400, 700)], 1, "id");
    expect(tokens.map((t) => t.parsed.value)).toEqual([125750420, 9.8]);
  });

  it("tidak menggabung dua angka utuh tanpa pemisah atau yang formatnya jadi tidak sah", () => {
    const tokens = extractNumberTokens([item("2025 2024", 300, 700), item("4 125.750", 300, 600)], 1, "id");
    expect(tokens.map((t) => t.text)).toEqual(["2025", "2024", "4", "125.750"]);
  });

  it("tidak menggabung angka di dalam kalimat", () => {
    const tokens = extractNumberTokens([item("pada tahun 2024, 25 kapal", 50, 700)], 1, "id");
    expect(tokens.map((t) => t.text)).toEqual(["2024", "25"]);
  });

  it("kolom yang berjauhan tidak digabung", () => {
    const tokens = extractNumberTokens([item("1.000", 300, 700), item("2.000", 380, 700)], 1, "id");
    expect(tokens.map((t) => t.parsed.value)).toEqual([1000, 2000]);
  });
});
