/**
 * State utama aplikasi: dokumen terbuka, indeks angka, angka terpilih, hasil pencarian, footing.
 * Logika bisnis (parsing, pencarian, footing) tetap di folder domain/; hook ini hanya merangkai.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getPageInfo, getPageLayout, loadPdf, PdfLoadError, type LoadedPdf } from "../services/pdf/pdfService";
import type { SessionState } from "./session";
import { evaluateSnip, type Snip } from "../domain/snip/sumSnip";

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
  const [boldFonts, setBoldFonts] = useState<Set<string>>(new Set());
  const [footingOn, setFootingOn] = useState(false);
  /** Garis & font tebal juga dibutuhkan sum snip (usulan total), walau footing otomatis belum dijalankan. */
  const [layoutWanted, setLayoutWanted] = useState(false);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [snips, setSnips] = useState<Snip[]>([]);
  /** Riwayat koreksi (koreksi manual & sum snip) untuk tombol Urungkan. */
  const history = useRef<{ overrides: Overrides; snips: Snip[]; label: string }[]>([]);
  const [lastAction, setLastAction] = useState<string | null>(null);
  /** Sum snip yang sedang disorot (mis. setelah klik barisnya di register Excel). */
  const [activeSnipId, setActiveSnipId] = useState<string | null>(null);
  const [scaleChoice, setScaleChoice] = useState<ScaleChoice>("auto");
  const loadSeq = useRef(0);

  /**
   * Buka PDF. `restore` = lanjutkan progres yang dipindahkan dari jendela lain; sidik file harus sama
   * persis dengan yang tercatat (bukti file tidak rusak/berubah saat dipindahkan).
   */
  const openFile = useCallback(
    async (file: File, restore?: { fingerprint: string; state: SessionState }) => {
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
        if (restore && restore.fingerprint !== loaded.fingerprint) {
          await loaded.destroy();
          throw new PdfLoadError(
            "PDF yang dipindahkan tidak identik dengan aslinya.",
            `Sidik berbeda (diharapkan ${restore.fingerprint.slice(0, 12)}, diterima ${loaded.fingerprint.slice(0, 12)}). Buka PDF secara manual.`,
          );
        }
        const st = restore?.state;
        const startPage = st ? Math.min(Math.max(1, st.page), loaded.pageCount) : 1;
        rulesLoading.current = false;
        setPdf(loaded);
        setRawPages(pages);
        setViewports(vps);
        setRules(null);
        setLocale(st?.locale ?? "id");
        setFootingOn(st?.footingOn ?? false);
        setOverrides(st?.overrides ?? {});
        setSnips(st?.snips ?? []);
        history.current = [];
        setLastAction(null);
        setScaleChoice(st?.scaleChoice ?? "auto");
        setPage(startPage);
        setNav((n) => ({ page: startPage, seq: n.seq + 1 }));
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
  // Garis tabel dibaca sekali per dokumen, saat footing pertama kali diaktifkan (juga saat sesi dipulihkan).
  const rulesLoading = useRef(false);
  useEffect(() => {
    if (!(footingOn || layoutWanted) || !pdf || rules || rulesLoading.current) return;
    rulesLoading.current = true;
    const seq = loadSeq.current;
    (async () => {
      const out: HRule[][] = [];
      const bold = new Set<string>();
      try {
        for (let p = 1; p <= pdf.pageCount; p++) {
          setLoading(`Membaca garis tabel halaman ${p} dari ${pdf.pageCount}…`);
          const fonts = (rawPages[p - 1] ?? []).flatMap((it) => (it.fontName ? [it.fontName] : []));
          const layout = await getPageLayout(pdf.doc, p, fonts);
          out.push(layout.rules);
          layout.boldFonts.forEach((f) => bold.add(f));
          if (seq !== loadSeq.current) return;
        }
        setBoldFonts(bold);
        setRules(out);
      } catch (err) {
        setFootingOn(false);
        setError({ message: "Gagal membaca garis tabel dari PDF.", detail: String(err) });
      } finally {
        rulesLoading.current = false;
        setLoading(null);
      }
    })();
  }, [footingOn, layoutWanted, pdf, rules, rawPages]);

  const runFooting = useCallback(async () => {
    if (pdf) setFootingOn(true);
  }, [pdf]);

  const footing = useMemo(
    () =>
      footingOn && rules
        ? computeVerticalFooting({ tokens, textItems: rawPages, rules, scales: pageScales, overrides, boldFonts, snips })
        : null,
    [footingOn, rules, tokens, rawPages, pageScales, overrides, boldFonts, snips],
  );

  // ---------------- Koreksi (dengan riwayat untuk Urungkan) ----------------
  const latestCorrections = useRef({ overrides, snips });
  latestCorrections.current = { overrides, snips };
  const remember = useCallback((label: string) => {
    history.current.push({ ...latestCorrections.current, label });
    if (history.current.length > 50) history.current.shift();
    setLastAction(label);
  }, []);

  const setOverride = useCallback(
    (tokenId: string, ov: Override | null) => {
      const text: Record<Override, string> = {
        total: "ditandai sebagai total",
        "not-total": "ditandai bukan total",
        exclude: "dikeluarkan dari footing",
      };
      remember(ov ? `Angka ${text[ov]}` : "Koreksi manual dibatalkan");
      setOverrides((o) => {
        const next = { ...o };
        if (ov) next[tokenId] = ov;
        else delete next[tokenId];
        return next;
      });
    },
    [remember],
  );

  const clearOverrides = useCallback(() => {
    remember("Semua koreksi manual dihapus");
    setOverrides({});
  }, [remember]);

  const addSnip = useCallback(
    (snip: Snip) => {
      remember("Sum snip disimpan");
      setSnips((list) => [...list.filter((x) => x.id !== snip.id), snip]);
    },
    [remember],
  );

  const removeSnip = useCallback(
    (id: string) => {
      remember("Sum snip dihapus");
      setSnips((list) => list.filter((x) => x.id !== id));
    },
    [remember],
  );

  /** Kembalikan koreksi ke keadaan sebelum tindakan terakhir. */
  const undo = useCallback(() => {
    const prev = history.current.pop();
    if (!prev) return;
    setOverrides(prev.overrides);
    setSnips(prev.snips);
    setLastAction(history.current.length ? `Dibatalkan. Sebelumnya: ${history.current[history.current.length - 1].label}` : null);
  }, []);

  /** Evaluasi semua sum snip tersimpan (tetap tersedia walaupun footing otomatis tidak dijalankan). */
  const snipEvals = useMemo(() => {
    const byId = new Map(tokens.map((t) => [t.id, t]));
    return snips.map((sn) => evaluateSnip(sn, byId, !!pageScales[sn.page - 1]));
  }, [snips, tokens, pageScales]);

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

  /**
   * Terapkan progres dari jendela lain untuk PDF yang sama (halaman tidak diubah: tiap jendela
   * punya posisi gulir sendiri). Hanya bagian yang berbeda yang diubah.
   */
  const applySession = useCallback((st: SessionState) => {
    setLocale((v) => (v === st.locale ? v : st.locale));
    setScaleChoice((v) => (v === st.scaleChoice ? v : st.scaleChoice));
    setFootingOn((v) => (v === st.footingOn ? v : st.footingOn));
    setOverrides((v) => (JSON.stringify(v) === JSON.stringify(st.overrides) ? v : { ...st.overrides }));
    const remoteSnips = st.snips ?? [];
    setSnips((v) => (JSON.stringify(v) === JSON.stringify(remoteSnips) ? v : remoteSnips));
  }, []);

  /** Progres review saat ini (dipindahkan bersama PDF ke/dari jendela besar). */
  const session: SessionState = useMemo(
    () => ({ locale, overrides, scaleChoice, footingOn, page, snips }),
    [locale, overrides, scaleChoice, footingOn, page, snips],
  );

  return {
    session,
    applySession,
    rules,
    boldFonts,
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
    clearOverrides,
    snips,
    snipEvals,
    addSnip,
    removeSnip,
    undo,
    lastAction,
    dismissLastAction: () => setLastAction(null),
    activeSnipId,
    setActiveSnipId,
    ensureLayout: () => setLayoutWanted(true),
    scaleSummary,
    scaleChoice,
    setScaleChoice,
    documentScale,
    pageScales,
  };
}

export type Reviewer = ReturnType<typeof useReviewer>;
