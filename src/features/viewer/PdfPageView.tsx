/**
 * Menampilkan satu halaman PDF + lapisan kotak angka yang bisa diklik.
 * Kotak dihitung dari koordinat PDF → koordinat layar setiap kali zoom berubah,
 * sehingga posisi tetap tepat di zoom berapa pun.
 */
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, PageViewport, RenderTask } from "pdfjs-dist";
import type { NumberToken } from "../../domain/pdf/numberTokens";
import type { Occurrence } from "../../domain/matching/findOccurrences";

interface Props {
  doc: PDFDocumentProxy;
  page: number;
  zoom: number; // 1 = pas lebar kontainer
  tokens: NumberToken[]; // token halaman ini saja
  selectedId: string | null;
  occurrences: Occurrence[];
  focusId: string | null;
  onSelect: (t: NumberToken) => void;
}

export function PdfPageView({ doc, page, zoom, tokens, selectedId, occurrences, focusId, onSelect }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Pantau lebar kontainer (task pane bisa diubah lebarnya)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!containerWidth) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    setRenderError(null);
    (async () => {
      try {
        const pdfPage = await doc.getPage(page);
        const base = pdfPage.getViewport({ scale: 1 });
        const scale = ((containerWidth - 4) / base.width) * zoom;
        const vp = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width = `${Math.floor(vp.width)}px`;
        canvas.style.height = `${Math.floor(vp.height)}px`;
        task = pdfPage.render({
          canvas,
          viewport: vp,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        await task.promise;
        if (!cancelled) setViewport(vp);
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (!cancelled && name !== "RenderingCancelledException") {
          console.warn("[Report Audit] render gagal", err);
          setRenderError(`Halaman ${page} gagal ditampilkan. (${String(err)})`);
        }
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoom, containerWidth]);

  // Gulir ke angka tujuan setelah lompat halaman
  useEffect(() => {
    if (!focusId || !viewport) return;
    const el = wrapRef.current?.querySelector(`[data-token="${focusId}"]`);
    el?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
  }, [focusId, viewport]);

  const occMap = new Map(occurrences.map((o) => [o.token.id, o.match]));

  return (
    <div className="page-wrap" ref={wrapRef}>
      {renderError && <div className="notice error">{renderError}</div>}
      <div className="page-stage">
        <canvas ref={canvasRef} aria-label={`Halaman ${page}`} />
        {viewport &&
          tokens.map((t) => {
            const [ax, ay] = viewport.convertToViewportPoint(t.box.x0, t.box.y0) as number[];
            const [bx, by] = viewport.convertToViewportPoint(t.box.x1, t.box.y1) as number[];
            const left = Math.min(ax, bx);
            const top = Math.min(ay, by);
            const match = occMap.get(t.id);
            const classes = ["num", `hint-${t.hint}`];
            if (t.id === selectedId) classes.push("is-selected");
            if (match) classes.push(`is-${match}`);
            if (t.id === focusId) classes.push("is-focus");
            if (t.parsed.ambiguous) classes.push("is-ambiguous");
            const title =
              t.id === selectedId
                ? "Angka terpilih"
                : match === "same-value"
                  ? "Nilai sama"
                  : match === "sign-mismatch"
                    ? "Nilai sama, tanda berbeda"
                    : `Klik untuk memilih ${t.text}`;
            return (
              <button
                key={t.id}
                type="button"
                data-token={t.id}
                className={classes.join(" ")}
                style={{ left, top, width: Math.abs(bx - ax), height: Math.abs(by - ay) }}
                title={title}
                aria-label={`${t.text}, ${t.label || "tanpa label"}`}
                onClick={() => onSelect(t)}
              />
            );
          })}
      </div>
    </div>
  );
}
