/**
 * Skala penyajian angka ("Dinyatakan dalam ribuan Rupiah").
 *
 * Aturan keras: footing tidak boleh "lulus" (F) bila skala belum ditetapkan.
 * Skala dideteksi dari teks halaman; pengguna bisa menetapkannya manual untuk seluruh dokumen.
 */
import type { RawTextItem } from "../pdf/numberTokens";

export type Scale = "penuh" | "ribuan" | "jutaan" | "miliaran";

export const SCALE_LABEL: Record<Scale, string> = {
  penuh: "Rupiah penuh (×1)",
  ribuan: "ribuan (×1.000)",
  jutaan: "jutaan (×1.000.000)",
  miliaran: "miliaran (×1.000.000.000)",
};

export const SCALE_FACTOR: Record<Scale, number> = {
  penuh: 1,
  ribuan: 1_000,
  jutaan: 1_000_000,
  miliaran: 1_000_000_000,
};

const MULTIPLIER: [RegExp, Scale][] = [
  [/\b(ribuan|thousands?)\b/, "ribuan"],
  [/\b(jutaan|millions?)\b/, "jutaan"],
  [/\b(miliaran|milyaran|billions?)\b/, "miliaran"],
];

/** Teks halaman digabung per baris (urut atas → bawah) agar frasa yang terpecah tetap terbaca. */
export function pageText(items: RawTextItem[]): string {
  return [...items]
    .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])
    .map((it) => it.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Skala yang dinyatakan di satu halaman, atau null bila tidak ada pernyataan. */
export function detectScale(text: string): Scale | null {
  const t = text.toLowerCase();
  // "Dinyatakan dalam ribuan Rupiah" / "(dalam jutaan Rupiah)" / "expressed in thousands of Rupiah"
  const stated =
    /(\bdinyatakan dalam|\bdisajikan dalam|\(dalam|\bexpressed in|\bin) ([a-z]+ ){0,2}(rupiah|dolar|dollars?|us\$|usd|idr)/.exec(t);
  if (stated) {
    const phrase = stated[0];
    for (const [re, scale] of MULTIPLIER) if (re.test(phrase)) return scale;
    if (/^(dinyatakan|disajikan|\(dalam|expressed)/.test(phrase)) return "penuh";
  }
  if (/rp\s?['’]?000\b|idr\s?['’]?000\b/.test(t)) return "ribuan";
  return null;
}

export interface ScaleSummary {
  /** Skala terdeteksi per halaman (indeks 0 = hal. 1). */
  perPage: (Scale | null)[];
  /** Skala yang paling sering dinyatakan; null bila tidak ada atau seri. */
  documentDefault: Scale | null;
  /** Lebih dari satu skala berbeda ditemukan di dokumen. */
  mixed: boolean;
}

export function summarizeScales(perPage: (Scale | null)[]): ScaleSummary {
  const counts = new Map<Scale, number>();
  for (const s of perPage) if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const documentDefault = ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : null;
  return { perPage, documentDefault, mixed: ranked.length > 1 };
}

/**
 * Skala efektif per halaman: pernyataan di halaman itu sendiri, kalau tidak ada pakai skala dokumen
 * (pilihan pengguna, atau hasil deteksi terbanyak).
 */
export function effectiveScales(perPage: (Scale | null)[], documentScale: Scale | null): (Scale | null)[] {
  return perPage.map((s) => s ?? documentScale);
}
