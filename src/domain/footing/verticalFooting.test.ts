import { describe, expect, it } from "vitest";
import { extractNumberTokens, type NumberToken, type RawTextItem } from "../pdf/numberTokens";
import type { HRule } from "../pdf/rules";
import { buildColumns, computeVerticalFooting, exactDifference, formatDiff, type Overrides } from "./verticalFooting";
import type { Scale } from "./scale";

/**
 * Bantu membuat satu halaman tabel sintetis: label di x=50, angka rata kanan di kolom XS,
 * font 9pt, jarak baris 14pt. `rule` = garis di atas angka (penanda total).
 */
const XS = [400, 480];
const CW = 5; // lebar karakter

interface Row {
  label: string;
  values?: string[];
  rule?: boolean;
  double?: boolean;
  /** Teks melintang di atas kolom (mis. judul kolom / tahun). */
  header?: boolean;
  note?: string;
}

function item(str: string, x: number, y: number): RawTextItem {
  return { str, transform: [9, 0, 0, 9, x, y], width: str.length * CW, height: 9 };
}

function page(rows: Row[], startY = 700) {
  const items: RawTextItem[] = [];
  const rules: HRule[] = [];
  let y = startY;
  for (const r of rows) {
    if (r.label) items.push(item(r.label, 50, y));
    if (r.note) items.push(item(r.note, 300, y));
    (r.values ?? []).forEach((v, i) => {
      const x = XS[i];
      if (r.header) {
        items.push(item(v, x - v.length * CW, y));
        return;
      }
      if (v === "") return;
      items.push(item(v, x - v.length * CW, y));
      if (r.rule) rules.push({ x0: x - 60, x1: x, y: y + 10, thickness: 0.5 });
      if (r.double) {
        rules.push({ x0: x - 60, x1: x, y: y - 3, thickness: 0.5 });
        rules.push({ x0: x - 60, x1: x, y: y - 5, thickness: 0.5 });
      }
    });
    y -= 14;
  }
  return { items, rules };
}

function run(
  pages: { items: RawTextItem[]; rules: HRule[] }[],
  opts: { overrides?: Overrides; scale?: Scale | null } = {},
) {
  const tokens: NumberToken[] = pages.flatMap((p, i) => extractNumberTokens(p.items, i + 1, "id"));
  const result = computeVerticalFooting({
    tokens,
    textItems: pages.map((p) => p.items),
    rules: pages.map((p) => p.rules),
    scales: pages.map(() => (opts.scale === undefined ? "ribuan" : opts.scale)),
    overrides: opts.overrides,
  });
  /** Status angka berdasarkan teksnya (kolom ke-col, halaman ke-pg). */
  const at = (text: string, col = 0, pg = 1) => {
    const t = tokens.find((x) => x.page === pg && x.text === text && Math.abs(x.box.x1 - XS[col]) < 1);
    if (!t) throw new Error(`token ${text} tidak ada`);
    return { token: t, status: result.byToken.get(t.id), footing: result.footings.find((f) => f.totalId === t.id) };
  };
  return { tokens, result, at };
}

describe("exactDifference (toleransi 0, tanpa galat pecahan)", () => {
  it("0,1 + 0,2 = 0,3 tepat", () => {
    expect(exactDifference(0.3, [0.1, 0.2]).difference).toBe(0);
  });
  it("selisih 1 tetap terlihat pada angka besar", () => {
    expect(exactDifference(1_334_001_232, [1_000_000_000, 334_001_231]).difference).toBe(1);
  });
  it("formatDiff menjaga tanda", () => {
    expect(formatDiff(-1)).toBe("-1");
    expect(formatDiff(1250)).toBe("1.250");
  });
});

describe("footing vertikal", () => {
  it("total bergaris dengan selisih 0 → F, komponennya ✓", () => {
    const { at } = run([
      page([
        { label: "Kas", values: ["100.000", "90.000"] },
        { label: "Bank", values: ["250.500", "200.000"] },
        { label: "Jumlah", values: ["350.500", "290.000"], rule: true },
      ]),
    ]);
    expect(at("350.500").status?.mark).toBe("foot");
    expect(at("100.000").status?.mark).toBe("check");
    expect(at("290.000", 1).status?.mark).toBe("foot");
  });

  it("selisih 1 → ✗ dan besar selisih dilaporkan (toleransi 0)", () => {
    const { at } = run([
      page([
        { label: "Kas", values: ["100.000"] },
        { label: "Bank", values: ["250.500"] },
        { label: "Jumlah", values: ["350.501"], rule: true },
      ]),
    ]);
    const r = at("350.501");
    expect(r.status?.mark).toBe("fail");
    expect(r.footing?.difference).toBe(1);
    expect(r.status?.reason).toContain("Selisih 1");
    // Komponen dari total yang gagal tidak boleh ✓
    expect(at("100.000").status?.mark).toBe("open");
  });

  it("kurung = negatif", () => {
    const { at } = run([
      page([
        { label: "Piutang", values: ["500.000"] },
        { label: "Cadangan", values: ["(20.000)"] },
        { label: "Neto", values: ["480.000"], rule: true },
      ]),
    ]);
    expect(at("480.000").status?.mark).toBe("foot");
  });

  it("bertingkat: subtotal + subtotal = JUMLAH", () => {
    const { at } = run([
      page([
        { label: "Kas", values: ["100"] },
        { label: "Piutang", values: ["200"] },
        { label: "Jumlah aset lancar", values: ["300"], rule: true },
        { label: "Aset tidak lancar" },
        { label: "Aset tetap", values: ["1.100"] },
        { label: "Aset hak guna", values: ["400"] },
        { label: "Jumlah aset tidak lancar", values: ["1.500"], rule: true },
        { label: "JUMLAH ASET", values: ["1.800"], rule: true, double: true },
        { label: "LIABILITAS" },
        { label: "Utang usaha", values: ["700"] },
        { label: "Utang pajak", values: ["350"] },
        { label: "Jumlah liabilitas", values: ["1.050"], rule: true },
      ]),
    ]);
    expect(at("300").status?.mark).toBe("foot");
    expect(at("1.500").status?.mark).toBe("foot");
    const grand = at("1.800");
    expect(grand.status?.mark).toBe("foot");
    expect(grand.footing?.componentIds).toEqual([at("300").token.id, at("1.500").token.id]);
    // Garis ganda di bawah JUMLAH ASET bukan penanda total untuk "Utang usaha"
    expect(at("700").status?.mark).toBe("check");
    expect(at("1.050").status?.mark).toBe("foot");
  });

  it("subtotal berjalan (laba rugi): laba bruto + beban = laba sebelum pajak", () => {
    const { at } = run([
      page([
        { label: "Pendapatan", values: ["1.000"] },
        { label: "Beban pokok", values: ["(600)"] },
        { label: "LABA BRUTO", values: ["400"], rule: true },
        { label: "Beban usaha", values: ["(150)"] },
        { label: "Biaya keuangan", values: ["(50)"] },
        { label: "LABA SEBELUM PAJAK", values: ["200"], rule: true },
        { label: "Pajak", values: ["(44)"] },
        { label: "LABA TAHUN BERJALAN", values: ["156"], rule: true },
      ]),
    ]);
    expect(at("400").status?.mark).toBe("foot");
    expect(at("200").status?.mark).toBe("foot");
    expect(at("200").footing?.componentIds).toHaveLength(3);
    expect(at("156").status?.mark).toBe("foot");
  });

  it("total yang hanya sama dengan komponen terakhir tidak boleh F (semua angka sejak total sebelumnya wajib ikut)", () => {
    const { result } = run([
      page([
        { label: "A", values: ["400"] },
        { label: "B", values: ["250"] },
        { label: "Jumlah", values: ["250"], rule: true },
      ]),
    ]);
    expect(result.footings).toHaveLength(1);
    expect(result.footings[0].status).toBe("fail");
    expect(result.footings[0].difference).toBe(-400);
  });

  it("label Jumlah tanpa garis tetap dianggap total", () => {
    const { at } = run([
      page([
        { label: "A", values: ["100"] },
        { label: "B", values: ["200"] },
        { label: "Jumlah", values: ["301"] },
      ]),
    ]);
    expect(at("301").status?.mark).toBe("fail");
    expect(at("301").footing?.basis).toEqual(["label"]);
  });

  it("garis di bawah judul kolom tidak membuat angka pertama jadi total", () => {
    const pg = page([
      { label: "", values: ["2025", "2024"], header: true },
      { label: "Kas", values: ["100", "90"] },
      { label: "Bank", values: ["200", "100"] },
      { label: "Jumlah", values: ["300", "190"], rule: true },
    ]);
    // garis bawah judul: tepat di atas baris pertama
    pg.rules.push({ x0: 50, x1: 480, y: 696, thickness: 0.5 });
    const { at } = run([pg]);
    expect(at("100").status?.mark).toBe("check");
    expect(at("300").status?.mark).toBe("foot");
  });

  it("judul kolom/tahun memisahkan dua tabel di halaman yang sama", () => {
    const { at } = run([
      page([
        { label: "Rincian tanpa total", values: ["555"] },
        { label: "Rincian tanpa total", values: ["777"] },
        { label: "", values: ["2025"], header: true },
        { label: "Kas", values: ["100"] },
        { label: "Bank", values: ["200"] },
        { label: "Jumlah", values: ["300"], rule: true },
      ]),
    ]);
    expect(at("300").status?.mark).toBe("foot");
    expect(at("555").status?.mark).toBe("open");
  });

  it("kolom nomor catatan dan tahun tidak ikut footing", () => {
    const { at, tokens, result } = run([
      page([
        { label: "", values: ["2025"], header: true },
        { label: "Kas", values: ["100"], note: "4" },
        { label: "Piutang", values: ["200"], note: "5" },
        { label: "Jumlah", values: ["300"], rule: true },
      ]),
    ]);
    expect(at("300").status?.mark).toBe("foot");
    const note = tokens.find((t) => t.text === "4")!;
    const year = tokens.find((t) => t.text === "2025")!;
    expect(result.byToken.get(note.id)).toBeUndefined();
    expect(result.byToken.get(year.id)).toBeUndefined();
  });

  it("border tabel di setiap baris (grid) tidak dianggap penanda total", () => {
    const rows: Row[] = [
      { label: "A", values: ["100"], rule: true },
      { label: "B", values: ["200"], rule: true },
      { label: "C", values: ["300"], rule: true },
      { label: "D", values: ["400"], rule: true },
      { label: "Jumlah", values: ["1.000"], rule: true },
    ];
    const { at, result } = run([page(rows)]);
    expect(result.footings).toHaveLength(1);
    expect(at("1.000").status?.mark).toBe("foot");
    expect(at("1.000").footing?.basis).toEqual(["label"]);
  });

  it("angka ambigu → ○, tidak boleh F", () => {
    const { at } = run([
      page([
        { label: "A", values: ["1,234.5"] },
        { label: "B", values: ["100"] },
        { label: "Jumlah", values: ["1.334,5"], rule: true },
      ]),
    ]);
    const r = at("1.334,5");
    expect(r.status?.mark).toBe("open");
    expect(r.status?.reason).toContain("ambigu");
  });

  it("skala belum ditetapkan → total cocok menjadi ○, yang selisih tetap ✗", () => {
    const { at } = run(
      [
        page([
          { label: "A", values: ["100", "100"] },
          { label: "B", values: ["200", "200"] },
          { label: "Jumlah", values: ["300", "301"], rule: true },
        ]),
      ],
      { scale: null },
    );
    expect(at("300").status?.mark).toBe("open");
    expect(at("300").status?.reason).toContain("Skala");
    expect(at("301", 1).status?.mark).toBe("fail");
  });

  it("tabel terpotong ke halaman berikutnya → total pertama ○, bukan F", () => {
    const p1 = page([
      { label: "", values: ["2025"], header: true },
      { label: "A", values: ["100"] },
      { label: "B", values: ["200"] },
    ]);
    const p2 = page([
      { label: "", values: ["2025"], header: true },
      { label: "C", values: ["300"] },
      { label: "D", values: ["400"] },
      // Kebetulan sama dengan jumlah komponen di halaman ini saja → tetap tidak boleh F
      { label: "Jumlah", values: ["700"], rule: true },
      { label: "", values: ["2025"], header: true },
      { label: "E", values: ["500"] },
      { label: "F", values: ["1.500"] },
      { label: "Jumlah", values: ["2.000"], rule: true },
    ]);
    const { at } = run([p1, p2]);
    const r = at("700", 0, 2);
    expect(r.status?.mark).toBe("open");
    expect(r.status?.reason).toContain("lanjutan");
    expect(at("2.000", 0, 2).status?.mark).toBe("foot");
    expect(at("100", 0, 1).status?.mark).toBe("open");
  });

  describe("koreksi manual", () => {
    const rows: Row[] = [
      { label: "A", values: ["100"] },
      { label: "B", values: ["200"] },
      { label: "C", values: ["300"] },
      { label: "Lain", values: ["50"] },
      { label: "Jumlah", values: ["600"], rule: true },
    ];

    it("'ini total' membuat angka tanpa garis/label menjadi total", () => {
      const base = run([page(rows)]);
      const c = base.at("300");
      const { at } = run([page(rows)], { overrides: { [c.token.id]: "total" } });
      expect(at("300").status?.mark).toBe("foot");
      expect(at("300").footing?.basis).toEqual(["manual"]);
      // 300 kini total (bukan komponen): 600 ≠ 300 + 50 → ✗
      expect(at("600").status?.mark).toBe("fail");
    });

    it("'keluarkan dari tabel' mengeluarkan angka dari hitungan", () => {
      const base = run([page(rows)]);
      expect(base.at("600").status?.mark).toBe("fail"); // 100+200+300+50 = 650
      const lain = base.at("50");
      const { at } = run([page(rows)], { overrides: { [lain.token.id]: "exclude" } });
      expect(at("600").status?.mark).toBe("foot");
      expect(at("50").status?.reason).toContain("Dikeluarkan");
    });

    it("'bukan total' membatalkan garis/label", () => {
      const base = run([page(rows)]);
      const total = base.at("600");
      const { at, result } = run([page(rows)], { overrides: { [total.token.id]: "not-total" } });
      expect(result.footings).toHaveLength(0);
      expect(at("600").status?.mark).toBe("open");
    });
  });
});

describe("buildColumns", () => {
  it("angka kecil di bawah tabel (nomor halaman) tidak masuk kolom", () => {
    const pg = page([
      { label: "A", values: ["1.000"] },
      { label: "B", values: ["2.000"] },
    ]);
    pg.items.push(item("4", XS[0] - CW, 40));
    const tokens = extractNumberTokens(pg.items, 1, "id");
    const cols = buildColumns(tokens);
    expect(cols).toHaveLength(1);
    expect(cols[0].tokens.map((t) => t.text)).toEqual(["1.000", "2.000"]);
  });

  it("angka di dalam kalimat tidak membentuk kolom", () => {
    const tokens = extractNumberTokens([item("sebesar 1.000 pada tahun", 50, 500)], 1, "id");
    expect(tokens[0].prose).toBe(true);
    expect(buildColumns(tokens)).toHaveLength(0);
  });
});
