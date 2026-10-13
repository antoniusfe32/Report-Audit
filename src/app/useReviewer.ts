/**
 * State utama aplikasi: dokumen terbuka, indeks angka, angka terpilih, hasil pencarian, footing.
 * Logika bisnis (parsing, pencarian, footing) tetap di folder domain/; hook ini hanya merangkai.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import type { PageViewport } from "pdfjs-dist";
import {
  extractNumberTokens,
  looksScanned,
  type NumberToken,
  type PageTextStats,
  type RawTextItem,
} from "../domain/pdf/numberTokens";
import type { NumberLocale } from "../domain/parsing/parseAmount";
import type { HRule } from "../domain/pdf/rules";
import { findOccurrences } from "../domain/matching/findOccurrences";
import { computeVerticalFooting, type Override, type Overrides } from "../domain/footing/verticalFooting";
import { detectScale, effectiveScales, pageText, summarizeScales, type Scale } from "../domain/footing/scale";
import { getPageInfo, getPageRules, loadPdf, PdfLoadError, type LoadedPdf } from "../services/pdf/pdfService";

export interface AppError {
  message: string;
  detail?: string;
}

/** Permintaan scroll ke halaman / angka tertentu. `seq` naik setiap permintaan baru. */
export interface NavTarget {
  page: number;
  tokenId?: string;
  seq: number;
}

/** "auto" = pakai hasil deteksi; null = pengguna menyatakan skala belum ditetapkan. */
export type ScaleChoice = Scale | "auto" | null;

export function useReviewer() {
  const [pdf, setPdf] = useState<LoadedPdf | null>(null);
  const [rawPages, setRawPages] = useState<RawTextItem[][]>([]);
  const [viewports, setViewports] = useState<PageViewport[]>([]);
  const [locale, setLocale] = useState<NumberLocale>("id");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [selected, setSelected] = useState<NumberToken | null>(null);
  const [page, setPage] = useState(1);
  const [nav, setNav] = useState<NavTarget>({ page: 1, seq: 0 });
  const [focusId, setFocusId] = useState<string | null>(null);

  // Footing
  const [rules, setRules] = useState<HRule[][] | null>(null);
  const [footingOn, setFootingOn] = useState(false);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [scaleChoice, setScaleChoice] = useState<ScaleChoice>("auto");
  const loadSeq = useRef(0);

  const openFile = useCallback(
    async (file: File) => {
      const seq = ++loadSeq.current;
      setError(null);
      setSelected(null);
      setLoading("Membuka PDF…");
      try {
        if (pdf) await pdf.destroy();
        const loaded = await loadPdf(file);
        const pages: RawTextItem[][] = [];
        const vps: PageViewport[] = [];
        for (let p = 1; p <= loaded.pageCount; p++) {
          setLoading(`Membaca teks halaman ${p} dari ${loaded.pageCount}…`);
          const info = await getPageInfo(loaded.doc, p);
          pages.push(info.items);
          vps.push(info.viewport);
        }
        if (seq !== loadSeq.current) {
          await loaded.destroy(); // file lain sudah dipilih selama membaca
          return;
        }
        setPdf(loaded);
        setRawPages(pages);
        setViewports(vps);
        setRules(null);
        setFootingOn(false);
        setOverrides({});
        setScaleChoice("auto");
        setPage(1);
        setNav((n) => ({ page: 1, seq: n.seq + 1 }));
      } catch (err) {
        if (err instanceof PdfLoadError) setError({ message: err.userMessage, detail: err.detail });
        else setError({ message: "Terjadi kesalahan saat membuka file.", detail: String(err) });
      } finally {
        setLoading(null);
      }
    },
    [pdf],
  );

  // Indeks angka dihitung ulang bila setting format angka diganti.
  const tokens = useMemo(
    () => rawPages.flatMap((items, i) => extractNumberTokens(items, i + 1, locale)),
    [rawPages, locale],
  );

  const stats: (PageTextStats & { rules: number | null })[] = useMemo(
    () =>
      rawPages.map((items, i) => ({
        page: i + 1,
        textItems: items.filter((it) => it.str.trim() !== "").length,
        numberTokens: tokens.filter((t) => t.page === i + 1).length,
        rules: rules ? (rules[i]?.length ?? 0) : null,
      })),
    [rawPages, tokens, rules],
  );

  const scanned = pdf ? looksScanned(stats) : false;

  // ---------------- Skala ----------------
  const scaleSummary = useMemo(
    () => summarizeScales(rawPages.map((items) => detectScale(pageText(items)))),
    [rawPages],
  );
  const documentScale: Scale | null = scaleChoice === "auto" ? scaleSummary.documentDefault : scaleChoice;
  const pageScales = useMemo(
    () => effectiveScales(scaleSummary.perPage, documentScale),
    [scaleSummary, documentScale],
  );

  // ---------------- Footing ----------------
  const runFooting = useCallback(async () => {
    if (!pdf) return;
    setFootingOn(true);
    if (rules) return;
    const seq = loadSeq.current;
    const out: HRule[][] = [];
    try {
      for (let p = 1; p <= pdf.pageCount; p++) {
        setLoading(`Membaca garis tabel halaman ${p} dari ${pdf.pageCount}…`);
        out.push(await getPageRules(pdf.doc, p));
        if (seq !== loadSeq.current) return;
      }
      setRules(out);
    } catch (err) {
      setFootingOn(false);
      setError({ message: "Gagal membaca garis tabel dari PDF.", detail: String(err) });
    } finally {
      setLoading(null);
    }
  }, [pdf, rules]);

  const footing = useMemo(
    () =>
      footingOn && rules
        ? computeVerticalFooting({ tokens, textItems: rawPages, rules, scales: pageScales, overrides })
        : null,
    [footingOn, rules, tokens, rawPages, pageScales, overrides],
  );

  const setOverride = useCallback((tokenId: string, ov: Override | null) => {
    setOverrides((o) => {
      const next = { ...o };
      if (ov) next[tokenId] = ov;
      else delete next[tokenId];
      return next;
    });
  }, []);

  // ---------------- Pilihan & navigasi ----------------
  // Pilihan lama mungkin tidak valid lagi setelah locale berubah → cari token dengan id sama.
  const current = selected ? (tokens.find((t) => t.id === selected.id) ?? null) : null;
  const occurrences = useMemo(() => (current ? findOccurrences(current, tokens) : []), [current, tokens]);

  const goTo = useCallback((token: NumberToken) => {
    setNav((n) => ({ page: token.page, tokenId: token.id, seq: n.seq + 1 }));
    setFocusId(token.id);
  }, []);

  const goToPage = useCallback((p: number) => {
    setNav((n) => ({ page: p, seq: n.seq + 1 }));
  }, []);

  return {
    pdf,
    tokens,
    viewports,
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
    nav,
    goTo,
    goToPage,
    focusId,
    openFile,
    // footing
    footing,
    footingOn,
    setFootingOn,
    runFooting,
    overrides,
    setOverride,
    clearOverrides: () => setOverrides({}),
    scaleSummary,
    scaleChoice,
    setScaleChoice,
    documentScale,
    pageScales,
  };
}

export type Reviewer = ReturnType<typeof useReviewer>;
