/**
 * State utama aplikasi: dokumen terbuka, indeks angka, angka terpilih, hasil pencarian.
 * Logika bisnis (parsing, pencarian) tetap di folder domain/; hook ini hanya merangkai.
 */
import { useCallback, useMemo, useState } from "react";
import {
  extractNumberTokens,
  looksScanned,
  type NumberToken,
  type PageTextStats,
  type RawTextItem,
} from "../domain/pdf/numberTokens";
import type { NumberLocale } from "../domain/parsing/parseAmount";
import { findOccurrences } from "../domain/matching/findOccurrences";
import { getPageTextItems, loadPdf, PdfLoadError, type LoadedPdf } from "../services/pdf/pdfService";

export interface AppError {
  message: string;
  detail?: string;
}

export function useReviewer() {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [rawPages, setRawPages] = useState<RawTextItem[][]>([]);
  const [locale, setLocale] = useState<NumberLocale>("id");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [selected, setSelected] = useState<NumberToken | null>(null);
  const [page, setPage] = useState(1);
  const [focusId, setFocusId] = useState<string | null>(null);

  const openFile = useCallback(async (file: File) => {
    setError(null);
    setSelected(null);
    setLoading("Membuka PDF…");
    try {
      if (pdf) await pdf.destroy();
      const loaded = await loadPdf(file);
      const pages: RawTextItem[][] = [];
      for (let p = 1; p <= loaded.pageCount; p++) {
        setLoading(`Membaca teks halaman ${p} dari ${loaded.pageCount}…`);
        pages.push(await getPageTextItems(loaded.doc, p));
      }
      setPdf(loaded);
      setRawPages(pages);
      setPage(1);
    } catch (err) {
      if (err instanceof PdfLoadError) setError({ message: err.userMessage, detail: err.detail });
      else setError({ message: "Terjadi kesalahan saat membuka file.", detail: String(err) });
    } finally {
      setLoading(null);
    }
  }, [pdf]);

  // Indeks angka dihitung ulang bila setting format angka diganti.
  const tokens = useMemo(
    () => rawPages.flatMap((items, i) => extractNumberTokens(items, i + 1, locale)),
    [rawPages, locale],
  );

  const stats: PageTextStats[] = useMemo(
    () =>
      rawPages.map((items, i) => ({
        page: i + 1,
        textItems: items.filter((it) => it.str.trim() !== "").length,
        numberTokens: tokens.filter((t) => t.page === i + 1).length,
      })),
    [rawPages, tokens],
  );

  const scanned = pdf ? looksScanned(stats) : false;

  // Pilihan lama mungkin tidak valid lagi setelah locale berubah → cari token dengan id sama.
  const current = selected ? (tokens.find((t) => t.id === selected.id) ?? null) : null;
  const occurrences = useMemo(() => (current ? findOccurrences(current, tokens) : []), [current, tokens]);

  const goTo = useCallback((token: NumberToken) => {
    setPage(token.page);
    setFocusId(token.id);
  }, []);

  return {
    pdf,
    tokens,
    stats,
    scanned,
    locale,
    setLocale,
    loading,
    error,
    setError,
    selected: current,
    select: setSelected,
    occurrences,
    page,
    setPage,
    focusId,
    goTo,
    openFile,
  };
}

export type Reviewer = ReturnType<typeof useReviewer>;
