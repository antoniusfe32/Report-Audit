/**
 * Sum snip: pengguna menarik kotak di atas angka (vertikal atau horizontal) → jumlah, banyaknya angka,
 * kurung = negatif. Bila angka terakhir tampak total (tebal / garis / label Jumlah), angka itu dibandingkan
 * dengan jumlah angka lain di kotak, toleransi 0.
 *
 * Sum snip yang memiliki total juga menjadi KOREKSI footing: menggantikan hasil otomatis untuk total itu
 * (lihat computeVerticalFooting).
 *
 * Fungsi murni; koordinat dalam satuan halaman PDF.
 */
import type { NumberToken, PdfBox } from "../pdf/numberTokens";
import type { HRule } from "../pdf/rules";
import { exactDifference, lineAbove, TOTAL_LABEL_RE } from "../footing/verticalFooting";

export interface Snip {
  id: string;
  page: number;
  /** Kotak yang ditarik pengguna (satuan PDF). */
  box: PdfBox;
  /** Semua angka di dalam kotak, urut baca (atas → bawah, kiri → kanan). */
  tokenIds: string[];
  /** Angka yang dibandingkan sebagai total (termasuk dalam tokenIds), atau null = jumlah saja. */
  totalId: string | null;
}

export type SnipOrientation = "vertikal" | "horizontal" | "campuran";

export interface SnipEvaluation {
  snip: Snip;
  tokens: NumberToken[];
  components: NumberToken[];
  total: NumberToken | null;
  /** Jumlah komponen (tanpa total). */
  sum: number;
  /** Total − jumlah; null bila tidak ada total. */
  difference: number | null;
  status: "foot" | "fail" | "open" | "sum";
  reason: string;
  orientation: SnipOrientation;
}

const center = (b: PdfBox) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
const fontHeight = (t: NumberToken) => (t.box.y1 - t.box.y0) / 1.1;

/** Normalisasi kotak (titik awal & akhir tarikan bisa terbalik). */
export function normalizeBox(a: { x: number; y: number }, b: { x: number; y: number }): PdfBox {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

/**
 * Angka yang titik tengahnya ada di dalam kotak. Tahun selalu dikeluarkan. Angka kecil mirip nomor catatan
 * hanya ikut bila satu kolom (rata kanan) dengan nominal lain di kotak — agar kolom "Catatan" yang ikut
 * tertarik tidak masuk penjumlahan.
 */
export function selectTokens(tokens: NumberToken[], page: number, box: PdfBox): NumberToken[] {
  const inside = tokens.filter((t) => {
    if (t.page !== page || t.parsed.value === null || t.hint === "likely-year") return false;
    const c = center(t.box);
    return c.x >= box.x0 && c.x <= box.x1 && c.y >= box.y0 && c.y <= box.y1;
  });
  const amounts = inside.filter((t) => t.hint === "amount");
  return inside
    .filter(
      (t) =>
        t.hint === "amount" ||
        amounts.some((a) => Math.abs(a.box.x1 - t.box.x1) <= Math.max(3.5, 0.45 * fontHeight(t))),
    )
    .sort((a, b) => b.box.y1 - a.box.y1 || a.box.x0 - b.box.x0);
}

export function orientationOf(sel: NumberToken[]): SnipOrientation {
  if (sel.length < 2) return "vertikal";
  const h = Math.max(...sel.map(fontHeight));
  const oneColumn = sel.every((t) => Math.abs(t.box.x1 - sel[0].box.x1) <= Math.max(3.5, 0.45 * h));
  if (oneColumn) return "vertikal";
  const oneRow = sel.every((t) => Math.abs(t.box.y0 - sel[0].box.y0) <= 0.4 * h);
  return oneRow ? "horizontal" : "campuran";
}

/**
 * Usulan total: angka terakhir (paling bawah untuk vertikal, paling kanan untuk horizontal) bila tampak
 * total — tebal, ada garis di atasnya (vertikal), atau berlabel Jumlah/Total. Pengguna bisa mengubahnya.
 */
export function suggestTotal(
  sel: NumberToken[],
  ctx: { rules: HRule[]; boldFonts: Set<string> },
): NumberToken | null {
  if (sel.length < 2) return null;
  const orientation = orientationOf(sel);
  if (orientation === "campuran") return null;
  const ordered = orientation === "vertikal" ? sel : [...sel].sort((a, b) => a.box.x0 - b.box.x0);
  const last = ordered[ordered.length - 1];
  const prev = ordered[ordered.length - 2];
  const bold = last.fontNames.length > 0 && last.fontNames.every((f) => ctx.boldFonts.has(f));
  const prevBold = prev.fontNames.length > 0 && prev.fontNames.every((f) => ctx.boldFonts.has(f));
  const line = orientation === "vertikal" && lineAbove(last, prev, ctx.rules) === "above";
  const label = orientation === "vertikal" && TOTAL_LABEL_RE.test(last.label.trim());
  // Tebal hanya berarti total bila angka sebelumnya tidak tebal (baris yang seluruhnya tebal ≠ total).
  return line || label || (bold && !prevBold) ? last : null;
}

export function evaluateSnip(
  snip: Snip,
  tokensById: Map<string, NumberToken>,
  scaleSet: boolean,
): SnipEvaluation {
  const tokens = snip.tokenIds.map((id) => tokensById.get(id)).filter((t): t is NumberToken => !!t);
  const total = snip.totalId ? (tokensById.get(snip.totalId) ?? null) : null;
  const components = tokens.filter((t) => t.id !== total?.id);
  const values = components.map((t) => t.parsed.value ?? 0);
  const orientation = orientationOf(tokens);
  const lost = snip.tokenIds.length - tokens.length;

  if (!total) {
    const { computed } = exactDifference(0, values);
    return {
      snip, tokens, components, total: null, sum: computed, difference: null, status: "sum", orientation,
      reason: lost ? `${lost} angka tidak ditemukan lagi di PDF.` : "",
    };
  }
  const { computed, difference } = exactDifference(total.parsed.value ?? 0, values);
  const reasons: string[] = [];
  let status: SnipEvaluation["status"] = difference === 0 ? "foot" : "fail";
  const ambiguous = tokens.filter((t) => t.parsed.ambiguous);
  if (ambiguous.length) {
    status = "open";
    reasons.push(`Format angka ambigu (${ambiguous.map((t) => t.text).join(", ")}).`);
  }
  if (lost) {
    status = "open";
    reasons.push(`${lost} angka tidak ditemukan lagi di PDF.`);
  }
  if (status === "foot" && !scaleSet) {
    status = "open";
    reasons.push("Skala angka (mis. ribuan Rupiah) belum ditetapkan.");
  }
  return { snip, tokens, components, total, sum: computed, difference, status, orientation, reason: reasons.join(" ") };
}
