/**
 * Parser angka laporan keuangan.
 *
 * Prinsip:
 * - Konvensi angka ditentukan per dokumen ("id" = 1.234.567,89 ; "en" = 1,234,567.89),
 *   bukan ditebak per angka. Ini menghilangkan sebagian besar ambiguitas.
 * - Angka yang TIDAK cocok dengan konvensi dokumen tetapi cocok dengan konvensi
 *   lain tetap dibaca, namun ditandai `ambiguous` agar reviewer memeriksa.
 * - Teks asli selalu disimpan; tanda negatif tidak pernah dibuang.
 * - Fungsi murni: tanpa efek samping, mudah dites.
 */

export type NumberLocale = "id" | "en";
export type AmountKind = "number" | "dash" | "blank" | "invalid";

export interface ParsedAmount {
  /** Teks persis seperti tampil di dokumen. */
  display: string;
  kind: AmountKind;
  /** Nilai bertanda (negatif bila dalam kurung / bertanda minus). null bila invalid/blank. */
  value: number | null;
  negative: boolean;
  currency: string | null;
  /** Penanda catatan kaki yang dilepas dari angka, mis. "*" atau "(a)". */
  footnote: string | null;
  /** Konvensi yang dipakai untuk membaca angka ini. */
  interpretedAs: NumberLocale | null;
  /** true bila angka hanya bisa dibaca dengan konvensi yang BERBEDA dari setting dokumen. */
  ambiguous: boolean;
  warnings: string[];
}

const CURRENCY_RE = /^(rp\.?|idr|usd|us\$|\$)\s*/i;
const DASH_ONLY_RE = /^[-–—]+$/;

function result(
  display: string,
  partial: Partial<ParsedAmount> & Pick<ParsedAmount, "kind">,
): ParsedAmount {
  return {
    display,
    value: null,
    negative: false,
    currency: null,
    footnote: null,
    interpretedAs: null,
    ambiguous: false,
    warnings: [],
    ...partial,
  };
}

/** Membaca string berisi digit + pemisah dengan satu konvensi. null bila tidak cocok. */
export function parseDigits(s: string, locale: NumberLocale): number | null {
  const [thousandsClass, decimalSep] = locale === "id" ? ["[. ]", ","] : ["[, ]", "."];
  const dec = decimalSep === "," ? "," : "\\.";
  const grouped = new RegExp(`^\\d{1,3}(${thousandsClass})\\d{3}(?:\\1\\d{3})*(?:${dec}\\d+)?$`);
  const plain = new RegExp(`^\\d+(?:${dec}\\d+)?$`);
  if (!grouped.test(s) && !plain.test(s)) return null;

  // Setelah lolos regex, pemisah desimal hanya mungkin muncul sekali sebagai desimal.
  const decimalIndex = s.indexOf(decimalSep);
  let intPart = decimalIndex >= 0 ? s.slice(0, decimalIndex) : s;
  const fracPart = decimalIndex >= 0 ? s.slice(decimalIndex + 1) : "";
  intPart = intPart.replace(/[^\d]/g, "");
  const n = Number(fracPart ? `${intPart}.${fracPart}` : intPart);
  return Number.isFinite(n) ? n : null;
}

export function parseAmount(raw: string, locale: NumberLocale = "id"): ParsedAmount {
  const display = raw;
  const warnings: string[] = [];
  let s = raw
    .replace(/ /g, " ")
    .replace(/−/g, "-") // tanda minus unicode
    .trim();

  if (s === "") return result(display, { kind: "blank" });
  if (DASH_ONLY_RE.test(s)) {
    return result(display, { kind: "dash", value: 0, interpretedAs: locale });
  }

  // 1. Lepas penanda catatan kaki di belakang: "*", "**", "(a)", "(b)"
  let footnote: string | null = null;
  const fnMatch = s.match(/(\*+|\s*\([a-z]\))$/i);
  if (fnMatch && fnMatch.index !== undefined && fnMatch.index > 0) {
    footnote = fnMatch[0].trim();
    s = s.slice(0, fnMatch.index).trim();
  }

  // 2. Mata uang di depan (bisa sebelum atau sesudah kurung)
  let currency: string | null = null;
  const takeCurrency = () => {
    const m = s.match(CURRENCY_RE);
    if (m) {
      currency = m[1].toUpperCase().replace(".", "");
      if (currency === "$" || currency === "US$") currency = "USD";
      if (currency === "RP") currency = "IDR";
      s = s.slice(m[0].length).trim();
    }
  };
  takeCurrency();

  // 3. Tanda negatif: kurung, minus di depan, minus di belakang
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1).trim();
  } else if (s.startsWith("(")) {
    negative = true;
    s = s.slice(1).trim();
    warnings.push("Kurung penutup tidak ditemukan; dianggap negatif.");
  } else if (s.endsWith(")") && !s.includes("(")) {
    // Kurung buka mungkin terpisah sebagai teks lain di PDF
    negative = true;
    s = s.slice(0, -1).trim();
    warnings.push("Kurung pembuka tidak ditemukan; dianggap negatif.");
  }
  takeCurrency();
  if (s.startsWith("-")) {
    if (negative) warnings.push("Tanda negatif ganda (kurung dan minus).");
    negative = true;
    s = s.slice(1).trim();
  } else if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1).trim();
  }

  if (!/^[\d., ]+$/.test(s) || !/\d/.test(s)) {
    return result(display, { kind: "invalid", currency, footnote, warnings });
  }

  const other: NumberLocale = locale === "id" ? "en" : "id";
  const primary = parseDigits(s, locale);
  let value: number | null = null;
  let interpretedAs: NumberLocale | null = null;
  let ambiguous = false;

  if (primary !== null) {
    value = primary;
    interpretedAs = locale;
  } else {
    const alt = parseDigits(s, other);
    if (alt !== null) {
      value = alt;
      interpretedAs = other;
      ambiguous = true;
      warnings.push(
        `Format angka tidak sesuai setting dokumen (${locale === "id" ? "Indonesia" : "US"}); ` +
          `dibaca dengan format ${other === "id" ? "Indonesia" : "US"}. Mohon periksa.`,
      );
    }
  }

  if (value === null) {
    return result(display, { kind: "invalid", currency, footnote, warnings });
  }

  return result(display, {
    kind: "number",
    value: negative && value !== 0 ? -value : value,
    negative,
    currency,
    footnote,
    interpretedAs,
    ambiguous,
    warnings,
  });
}

/** Format nilai untuk ditampilkan kembali di UI (format Indonesia). */
export function formatAmount(value: number | null, locale: NumberLocale = "id"): string {
  if (value === null) return "—";
  const abs = Math.abs(value);
  const s = abs.toLocaleString(locale === "id" ? "id-ID" : "en-US", {
    maximumFractionDigits: 6,
  });
  return value < 0 ? `(${s})` : s;
}
