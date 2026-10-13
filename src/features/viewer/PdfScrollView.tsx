/**
 * Viewer PDF "scroll terus": semua halaman berurutan ke bawah.
 *
 * - Hanya halaman yang terlihat (± 1 halaman) yang dirender ke canvas; halaman lain hanya kotak kosong
 *   seukuran halaman, sehingga PDF 80+ halaman tetap ringan.
 * - Kotak angka dihitung dari koordinat PDF → koordinat layar, sehingga tepat di zoom berapa pun.
 * - Nomor halaman aktif dilaporkan ke atas (toolbar) saat pengguna menggulir.
 * - "Loncat ke angka" = gulir sampai angka tersebut berada di tengah layar.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy, PageViewport, RenderTask } from "pdfjs-dist";
import type { NumberToken } from "../../domain/pdf/numberTokens";
import type { Occurrence, MatchType } from "../../domain/matching/findOccurrences";
import { formatDiff, type TokenStatus } from "../../domain/footing/verticalFooting";
import type { FootingBlock } from "../../domain/footing/blocks";
import { MARK_TEXT } from "../footing/marks";
import type { NavTarget } from "../../app/useReviewer";

const GAP = 10; // jarak antarhalaman (px)
const PAD = 8; // tepi dalam area gulir (px)

interface Props {
  doc: PDFDocumentProxy;
  /** Viewport skala 1 per halaman. */
  viewports: PageViewport[];
  zoom: number; // 1 = pas lebar kontainer
  tokens: NumberToken[];
  selectedId: string | null;
  occurrences: Occurrence[];
  focusId: string | null;
  nav: NavTarget;
  /** Tanda footing per angka; null = footing belum dijalankan / disembunyikan. */
  marks: Map<string, TokenStatus> | null;
  /** Angka yang disorot sebagai komponen dari total terpilih. */
  highlight: Set<string>;
  /** Blok warna footing per halaman; null = tidak ditampilkan. */
  blocks: Map<number, FootingBlock[]> | null;
  /** Footing yang sedang dipilih (bloknya ditebalkan). */
  activeFootingId: string | null;
  onSelect: (t: NumberToken) => void;
  onPageChange: (page: number) => void;
}

interface PageLayout {
  top: number;
  left: number;
  width: number;
  height: number;
  vp: PageViewport;
}

function median(values: number[]): number {
  if (!values.length) return 1;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export function PdfScrollView(props: Props) {
  const { viewports, zoom, tokens, nav, onPageChange } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);

  // Pantau ukuran area gulir (task pane bisa diubah lebarnya)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  // Skala seragam: halaman berukuran umum (biasanya potret) pas selebar area pada zoom 100%.
  const baseWidth = useMemo(() => median(viewports.map((v) => v.width)), [viewports]);
  const scale = box.width ? Math.max(0.1, ((box.width - 2 * PAD) / baseWidth) * zoom) : 0;

  const { layout, totalHeight, totalWidth } = useMemo(() => {
    const vps = scale ? viewports.map((v) => v.clone({ scale })) : [];
    const totalWidth = Math.max(box.width, ...vps.map((v) => Math.floor(v.width) + 2 * PAD));
    let top = PAD;
    const layout: PageLayout[] = vps.map((vp) => {
      const width = Math.floor(vp.width);
      const height = Math.floor(vp.height);
      const item = { top, left: Math.max(PAD, (totalWidth - width) / 2), width, height, vp };
      top += height + GAP;
      return item;
    });
    return { layout, totalHeight: top - GAP + PAD, totalWidth };
  }, [viewports, scale, box.width]);

  // Halaman terlihat ± 1
  const viewBottom = scrollTop + box.height;
  let first = layout.findIndex((l) => l.top + l.height >= scrollTop);
  if (first < 0) first = Math.max(0, layout.length - 1);
  let last = first;
  while (last + 1 < layout.length && layout[last + 1].top <= viewBottom) last++;
  const activeFrom = Math.max(0, first - 1);
  const activeTo = Math.min(layout.length - 1, last + 1);

  // Halaman aktif = halaman yang memuat garis 35% dari atas layar
  const probe = scrollTop + box.height * 0.35;
  let current = layout.findIndex((l) => probe < l.top + l.height + GAP);
  if (current < 0) current = Math.max(0, layout.length - 1);
  useEffect(() => {
    if (layout.length) onPageChange(current + 1);
  }, [current, layout.length, onPageChange]);

  // Jaga posisi baca saat zoom/lebar berubah: simpan "halaman + persen" lalu pulihkan.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const anchor = useRef<{ index: number; frac: number } | null>(null);
  const rafRef = useRef(0);
  const onScroll = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const el = scrollRef.current;
      if (!el) return;
      setScrollTop(el.scrollTop);
      const lay = layoutRef.current;
      const i = lay.findIndex((l) => el.scrollTop < l.top + l.height + GAP);
      if (i >= 0) anchor.current = { index: i, frac: (el.scrollTop - lay[i].top) / lay[i].height };
    });
  };
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const prevScale = useRef(scale);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !scale || prevScale.current === scale) return;
    const wasMeasured = prevScale.current !== 0;
    prevScale.current = scale;
    const a = anchor.current;
    if (!wasMeasured || !a || !layout[a.index]) return;
    el.scrollTop = layout[a.index].top + a.frac * layout[a.index].height;
    setScrollTop(el.scrollTop);
  }, [scale, layout]);

  // Navigasi: loncat ke halaman / ke posisi angka
  const handledSeq = useRef(-1);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !layout.length || handledSeq.current === nav.seq) return;
    handledSeq.current = nav.seq;
    const L = layout[nav.page - 1];
    if (!L) return;
    let top = L.top - PAD;
    let left: number | undefined;
    const t = nav.tokenId ? tokens.find((x) => x.id === nav.tokenId) : undefined;
    if (t) {
      const [x, y] = L.vp.convertToViewportPoint(t.box.x0, t.box.y1) as number[];
      top = L.top + y - box.height / 2;
      left = L.left + x - box.width / 2;
    }
    // Di task pane sempit viewer bisa berada di luar layar (pengguna sedang di panel bawah): tampilkan dulu.
    const rect = el.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) el.scrollIntoView({ block: "start" });
    // Jarak jauh: lompat langsung (tanpa animasi) agar halaman di antaranya tidak ikut dirender.
    const near = Math.abs(top - el.scrollTop) < box.height * 2;
    el.scrollTo({ top: Math.max(0, top), left: left === undefined ? undefined : Math.max(0, left), behavior: near ? "smooth" : "auto" });
  }, [nav, layout, tokens, box]);

  const tokensByPage = useMemo(() => {
    const m = new Map<number, NumberToken[]>();
    for (const t of tokens) {
      const list = m.get(t.page) ?? [];
      list.push(t);
      m.set(t.page, list);
    }
    return m;
  }, [tokens]);

  const occMap = useMemo(() => new Map(props.occurrences.map((o) => [o.token.id, o.match])), [props.occurrences]);

  return (
    <div className="page-wrap scroll-view" ref={scrollRef} onScroll={onScroll}>
      <div className="scroll-content" style={{ height: totalHeight, width: totalWidth }}>
        {layout.map((L, i) => (
          <PageView
            key={i}
            doc={props.doc}
            pageNumber={i + 1}
            layout={L}
            active={i >= activeFrom && i <= activeTo}
            tokens={tokensByPage.get(i + 1) ?? EMPTY}
            selectedId={props.selectedId}
            occMap={occMap}
            focusId={props.focusId}
            marks={props.marks}
            highlight={props.highlight}
            blocks={props.blocks?.get(i + 1) ?? NO_BLOCKS}
            activeFootingId={props.activeFootingId}
            onSelect={props.onSelect}
          />
        ))}
      </div>
    </div>
  );
}

const EMPTY: NumberToken[] = [];
const NO_BLOCKS: FootingBlock[] = [];

const BLOCK_TEXT: Record<FootingBlock["kind"], string> = {
  component: "Angka yang dijumlahkan",
  "total-foot": "Total cocok",
  "total-fail": "Total tidak cocok",
  "total-open": "Total perlu cek manual",
};

interface PageProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  layout: PageLayout;
  active: boolean;
  tokens: NumberToken[];
  selectedId: string | null;
  occMap: Map<string, MatchType>;
  focusId: string | null;
  marks: Map<string, TokenStatus> | null;
  highlight: Set<string>;
  blocks: FootingBlock[];
  activeFootingId: string | null;
  onSelect: (t: NumberToken) => void;
}

const PageView = memo(function PageView({
  doc,
  pageNumber,
  layout,
  active,
  tokens,
  selectedId,
  occMap,
  focusId,
  marks,
  highlight,
  blocks,
  activeFootingId,
  onSelect,
}: PageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const { vp } = layout;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!active) {
      // Lepaskan memori canvas halaman yang jauh dari layar
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    let task: RenderTask | null = null;
    let cancelled = false;
    setRenderError(null);
    (async () => {
      try {
        const pdfPage = await doc.getPage(pageNumber);
        if (cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        task = pdfPage.render({
          canvas,
          viewport: vp,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        await task.promise;
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (!cancelled && name !== "RenderingCancelledException") {
          console.warn("[Report Audit] render gagal", err);
          setRenderError(`Halaman ${pageNumber} gagal ditampilkan. (${String(err)})`);
        }
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, vp, active]);

  return (
    <div
      className="page-stage"
      data-page={pageNumber}
      style={{ top: layout.top, left: layout.left, width: layout.width, height: layout.height }}
    >
      <canvas ref={canvasRef} style={{ width: layout.width, height: layout.height }} aria-label={`Halaman ${pageNumber}`} />
      {!active && <div className="page-placeholder">Hal. {pageNumber}</div>}
      {renderError && <div className="notice error page-error">{renderError}</div>}
      {active &&
        blocks.map((b, i) => {
          const [ax, ay] = vp.convertToViewportPoint(b.box.x0, b.box.y0) as number[];
          const [bx, by] = vp.convertToViewportPoint(b.box.x1, b.box.y1) as number[];
          const cls = ["fblock", `fk-${b.kind}`];
          // Ditebalkan: blok footing terpilih + subtotal yang menjadi komponennya.
          if (b.footingId === activeFootingId || (b.totalId && highlight.has(b.totalId))) cls.push("is-active");
          return (
            <div
              key={`b${i}`}
              className={cls.join(" ")}
              style={{ left: Math.min(ax, bx), top: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) }}
              title={BLOCK_TEXT[b.kind]}
              aria-hidden
            />
          );
        })}
      {active &&
        tokens.map((t) => {
          const [ax, ay] = vp.convertToViewportPoint(t.box.x0, t.box.y0) as number[];
          const [bx, by] = vp.convertToViewportPoint(t.box.x1, t.box.y1) as number[];
          const left = Math.min(ax, bx);
          const top = Math.min(ay, by);
          const width = Math.abs(bx - ax);
          const height = Math.abs(by - ay);
          const match = occMap.get(t.id);
          const st = marks?.get(t.id);
          const classes = ["num", `hint-${t.hint}`];
          if (t.id === selectedId) classes.push("is-selected");
          if (match) classes.push(`is-${match}`);
          if (t.id === focusId) classes.push("is-focus");
          if (t.parsed.ambiguous) classes.push("is-ambiguous");
          // Komponen sudah terlihat dari blok biru; tanda ○ hanya untuk angka yang belum tercakup.
          const inBlock = !!st?.componentOf && !st.footingId;
          if (st && !inBlock) classes.push(`fm-${st.mark}`);
          if (highlight.has(t.id)) classes.push("is-component");
          const base =
            t.id === selectedId
              ? "Angka terpilih"
              : match === "same-value"
                ? "Nilai sama"
                : match === "sign-mismatch"
                  ? "Angka sama, tanda berlawanan"
                  : `Klik untuk memilih ${t.text}`;
          const title = st ? `${base}\n${MARK_TEXT[st.mark]}\n${st.reason}` : base;
          return (
            <span key={t.id} className="num-wrap">
              <button
                type="button"
                data-token={t.id}
                className={classes.join(" ")}
                style={{ left, top, width, height }}
                title={title}
                aria-label={`${t.text}, ${t.label || "tanpa label"}${st ? `, ${MARK_TEXT[st.mark]}` : ""}`}
                onClick={() => onSelect(t)}
              />
              {st && !inBlock && (
                <span
                  className={`fbadge fb-${st.mark}`}
                  style={{ left: left + width + 2, top, height, fontSize: Math.max(9, height * 0.72) }}
                  aria-hidden
                >
                  {badgeText(st)}
                </span>
              )}
            </span>
          );
        })}
    </div>
  );
});

function badgeText(st: TokenStatus): string {
  switch (st.mark) {
    case "check":
      return "✓";
    case "foot":
      return "F";
    case "fail":
      // Ringkas agar tidak menutupi kolom sebelah; teks lengkap "selisih …" ada di tooltip & panel.
      return `✗ ${formatDiff(st.difference ?? 0)}`;
    case "open":
      return "○";
  }
}
