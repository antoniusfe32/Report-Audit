/**
 * Mengubah potongan teks PDF (hasil pdf.js getTextContent) menjadi daftar
 * "token angka" yang bisa diklik, lengkap dengan kotak koordinat dalam
 * SATUAN HALAMAN PDF (bukan piksel layar), sehingga tetap valid saat di-zoom.
 *
 * Fungsi murni: input data, output data. Tidak bergantung pada pdf.js langsung.
 */
import { parseAmount, type NumberLocale, type ParsedAmount } from "../parsing/parseAmount";

/** Bentuk minimal text item pdf.js yang kita butuhkan. */
export interface RawTextItem {
  str: string;
  /** Matriks transformasi [a, b, c, d, e, f]; e,f = posisi baseline kiri dalam satuan PDF. */
  transform: number[];
  /** Lebar dalam satuan PDF. */
  width: number;
  /** Tinggi (≈ ukuran font) dalam satuan PDF. */
  height: number;
}

/** Kotak dalam koordinat PDF: x ke kanan, y ke ATAS (asal di kiri-bawah halaman). */
export interface PdfBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type TokenHint = "amount" | "likely-reference" | "likely-year";

export interface NumberToken {
  id: string;
  page: number; // 1-based
  text: string;
  parsed: ParsedAmount;
  box: PdfBox;
  /** Teks label di kiri pada baris yang sama (mis. "Kas dan setara kas"). */
  label: string;
  /** Perkiraan jenis angka; referensi catatan & tahun ditampilkan lebih samar. */
  hint: TokenHint;
}

interface WordSpan {
  text: string;
  start: number;
  end: number;
}

/** Pecah string menjadi kata (dipisah spasi), sambil menggabung "Rp" dengan angka sesudahnya. */
export function splitWords(str: string): WordSpan[] {
  const words: WordSpan[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    words.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  // Buang tanda baca kalimat yang menempel di belakang angka: "410.200.000." / "Rp15.480),"
  for (const w of words) {
    const trimmed = w.text.replace(/(?<=\d\)?)[.,;:]+$/, "");
    w.end -= w.text.length - trimmed.length;
    w.text = trimmed;
  }
  // Gabung mata uang yang berdiri sendiri dengan kata berikutnya: "Rp" "125.750"
  const merged: WordSpan[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1];
    if (next && /^(\(?rp\.?|\(?idr|\(?usd)$/i.test(w.text)) {
      merged.push({ text: str.slice(w.start, next.end), start: w.start, end: next.end });
      i++;
    } else {
      merged.push(w);
    }
  }
  return merged;
}

function hasLetters(s: string): boolean {
  return /[A-Za-zÀ-ÿ]{2,}/.test(s);
}

function classify(word: string, parsed: ParsedAmount): TokenHint {
  const bare = word.replace(/[()]/g, "");
  if (/^(19|20)\d{2}$/.test(bare)) return "likely-year";
  // Angka kecil tanpa pemisah (1–2 digit, atau 1a/2.3) biasanya nomor catatan.
  if (/^\d{1,2}$/.test(bare) && !parsed.negative) return "likely-reference";
  return "amount";
}

export function extractNumberTokens(
  items: RawTextItem[],
  page: number,
  locale: NumberLocale,
): NumberToken[] {
  const tokens: NumberToken[] = [];
  const textItems = items.filter((it) => it.str.trim() !== "");

  textItems.forEach((item, itemIndex) => {
    const [, , , , e, f] = item.transform;
    const h = item.height || Math.abs(item.transform[3]) || 8;
    const len = item.str.length || 1;

    const isSingleCell = splitWords(item.str).length === 1;
    for (const w of splitWords(item.str)) {
      let parsed = parseAmount(w.text, locale);
      // Di dalam kalimat, kurung yang tidak berpasangan biasanya kurung kalimat, bukan tanda negatif:
      // "(2024: Rp15.480)" → jangan anggap 2024 negatif.
      const unbalanced = (w.text.match(/\(/g)?.length ?? 0) !== (w.text.match(/\)/g)?.length ?? 0);
      if (!isSingleCell && unbalanced) {
        parsed = { ...parseAmount(w.text.replace(/[()]/g, ""), locale), display: w.text };
      }
      const isWholeItemDash = parsed.kind === "dash" && item.str.trim() === w.text;
      if (parsed.kind !== "number" && !isWholeItemDash) continue;

      // Posisi horizontal diperkirakan proporsional terhadap jumlah karakter.
      const x0 = e + (item.width * w.start) / len;
      const x1 = e + (item.width * w.end) / len;
      const box: PdfBox = { x0, y0: f - h * 0.25, x1, y1: f + h * 0.85 };

      tokens.push({
        id: `p${page}-i${itemIndex}-c${w.start}`,
        page,
        text: w.text,
        parsed,
        box,
        label: findRowLabel(textItems, f, h, x0),
        hint: classify(w.text, parsed),
      });
    }
  });

  return tokens.sort((a, b) => b.box.y1 - a.box.y1 || a.box.x0 - b.box.x0);
}

/**
 * Label baris = gabungan teks berhuruf di sebelah kiri angka, pada baris yang sama.
 * Baris dianggap sama bila selisih baseline < 40% tinggi font.
 */
export function findRowLabel(
  items: RawTextItem[],
  baselineY: number,
  height: number,
  tokenX0: number,
): string {
  const tolerance = height * 0.4;
  return items
    .filter((it) => {
      const [, , , , e, f] = it.transform;
      return Math.abs(f - baselineY) < tolerance && e < tokenX0 - 1 && hasLetters(it.str);
    })
    .sort((a, b) => a.transform[4] - b.transform[4])
    .map((it) => it.str.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ringkasan kualitas teks per halaman, untuk mendeteksi PDF hasil scan. */
export interface PageTextStats {
  page: number;
  textItems: number;
  numberTokens: number;
}

export function looksScanned(stats: PageTextStats[]): boolean {
  if (stats.length === 0) return true;
  const emptyPages = stats.filter((s) => s.textItems === 0).length;
  return emptyPages / stats.length > 0.5;
}
