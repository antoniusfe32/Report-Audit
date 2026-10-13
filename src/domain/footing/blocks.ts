/**
 * Blok warna untuk menampilkan hasil footing di halaman PDF:
 * - komponen yang dijumlahkan → satu blok utuh per rangkaian angka berurutan (bukan kotak per baris),
 * - total → blok tersendiri (warna menurut status: cocok / selisih / cek manual).
 *
 * Fungsi murni: koordinat dalam SATUAN HALAMAN PDF; komponen React yang mengubahnya ke piksel.
 */
import type { NumberToken, PdfBox } from "../pdf/numberTokens";
import type { Footing, FootingResult } from "./verticalFooting";

export type BlockKind = "component" | "total-foot" | "total-fail" | "total-open";

export interface FootingBlock {
  footingId: string;
  kind: BlockKind;
  box: PdfBox;
  /** Untuk blok total: id angka totalnya. */
  totalId?: string;
}

/** Ruang tambahan di sekitar angka (satuan PDF) agar blok tidak menempel ke glyph. */
const PAD_X = 1.5;
const PAD_Y = 0.6;

const fontHeight = (t: NumberToken) => (t.box.y1 - t.box.y0) / 1.1;

function totalKind(f: Footing): BlockKind {
  return f.status === "foot" ? "total-foot" : f.status === "fail" ? "total-fail" : "total-open";
}

/** Blok untuk satu halaman. Angka yang sendiri menjadi total tidak ikut blok komponen (tetap blok total). */
export function footingBlocks(result: FootingResult, tokensById: Map<string, NumberToken>, page: number): FootingBlock[] {
  const totals = new Set(result.footings.map((f) => f.totalId));
  const blocks: FootingBlock[] = [];
  const pageTokens = [...tokensById.values()].filter((t) => t.page === page);
  /** Ada angka lain di kolom yang sama di antara a (atas) dan b (bawah)? */
  const somethingBetween = (a: NumberToken, b: NumberToken) =>
    pageTokens.some(
      (t) =>
        t.box.y1 < a.box.y0 &&
        t.box.y0 > b.box.y1 &&
        Math.min(t.box.x1, a.box.x1) - Math.max(t.box.x0, a.box.x0) > 0,
    );

  for (const f of result.footings) {
    if (f.page !== page) continue;
    const total = tokensById.get(f.totalId);
    if (!total) continue;

    // Komponen biasa, urut atas → bawah, digabung menjadi rangkaian yang berdekatan.
    const comps = f.componentIds
      .filter((id) => !totals.has(id))
      .map((id) => tokensById.get(id))
      .filter((t): t is NumberToken => !!t)
      .sort((a, b) => b.box.y1 - a.box.y1);

    let run: NumberToken[] = [];
    const flush = () => {
      if (!run.length) return;
      blocks.push({
        footingId: f.id,
        kind: "component",
        box: {
          x0: Math.min(...run.map((t) => t.box.x0)) - PAD_X,
          x1: Math.max(...run.map((t) => t.box.x1)) + PAD_X,
          y0: run[run.length - 1].box.y0 - PAD_Y,
          y1: run[0].box.y1 + PAD_Y,
        },
      });
      run = [];
    };
    for (const t of comps) {
      const prev = run[run.length - 1];
      // Ada angka lain di antaranya (mis. subtotal) atau jarak > 2,5 baris → blok baru.
      if (prev && (prev.box.y0 - t.box.y1 > 2.5 * fontHeight(t) || somethingBetween(prev, t))) flush();
      run.push(t);
    }
    flush();

    blocks.push({
      footingId: f.id,
      totalId: f.totalId,
      kind: totalKind(f),
      box: {
        x0: total.box.x0 - PAD_X,
        x1: total.box.x1 + PAD_X,
        y0: total.box.y0 - PAD_Y,
        y1: total.box.y1 + PAD_Y,
      },
    });
  }
  return blocks;
}
