import { useEffect, useMemo, useRef, useState } from "react";
import { useReviewer } from "./useReviewer";
import { useExcelRegister } from "./useExcelRegister";
import { useDialogSession } from "./useDialogSession";
import type { ToPaneMessage } from "../services/office/messages";
import { PdfScrollView } from "../features/viewer/PdfScrollView";
import { SelectionPanel } from "../features/panel/SelectionPanel";
import { FootingPanel } from "../features/footing/FootingPanel";
import { FootingDetail } from "../features/footing/FootingDetail";
import { footingBlocks, type FootingBlock } from "../domain/footing/blocks";
import { pageDiagnostics } from "../domain/footing/diagnostics";
import { evaluateSnip, orientationOf, selectTokens, suggestTotal, type Snip } from "../domain/snip/sumSnip";
import { formatAmount } from "../domain/parsing/parseAmount";
import { formatDiff } from "../domain/footing/verticalFooting";
import type { PdfBox } from "../domain/pdf/numberTokens";
import { SnipPanel } from "../features/snip/SnipPanel";
import type { SnipShape } from "../features/viewer/PdfScrollView";
import {
  onParentMessage,
  openLargeWindow,
  readyOffice,
  writeValueToActiveCell,
  sendToTaskPane,
  writeToActiveCell,
  type DialogHandle,
  type HostStatus,
  type SelectionPayload,
} from "../services/office/officeService";
import { appBaseUrl, downloadManifest } from "../services/office/manifest";
import type { NumberToken } from "../domain/pdf/numberTokens";

const isDialog = new URLSearchParams(window.location.search).get("mode") === "dialog";

function toPayload(t: NumberToken): SelectionPayload {
  return { type: "selection", page: t.page, text: t.text, value: t.parsed.value, label: t.label };
}

export function App() {
  const r = useReviewer();
  const [host, setHost] = useState<HostStatus>("loading");
  // Di task pane sempit, "pas lebar" membuat teks terlalu kecil → mulai dari 200%.
  const [zoom, setZoom] = useState(() => (window.innerWidth < 500 ? 2 : 1));
  const [status, setStatus] = useState<string | null>(null);
  const [remote, setRemote] = useState<SelectionPayload | null>(null);
  const dialogRef = useRef<DialogHandle | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    readyOffice().then(setHost);
  }, []);

  const flash = (msg: string) => {
    setStatus(msg);
    window.setTimeout(() => setStatus((s) => (s === msg ? null : s)), 5000);
  };

  const writePayload = async (payload: SelectionPayload) => {
    try {
      const addr = await writeToActiveCell(payload);
      flash(`Ditulis ke ${addr.split("!").pop()}`);
    } catch (err) {
      r.setError({ message: "Gagal menulis ke Excel.", detail: String(err) });
    }
  };

  const handleSelect = (t: NumberToken) => {
    r.select(t);
    if (isDialog && host === "excel") {
      if (sendToTaskPane(toPayload(t))) flash("Angka dikirim ke panel Excel");
    }
  };

  const paneMirror = useRef<string | null>(null);
  const register = useExcelRegister(r, host, isDialog, flash, dialogRef, paneMirror);
  const session = useDialogSession(r, host, isDialog, dialogRef, paneMirror, flash);
  // Pendengar pesan dipasang sekali; selalu teruskan ke versi terbaru hook di atas.
  const handlers = useRef({ register, session });
  handlers.current = { register, session };

  // ---- Panel samping: pesan dari jendela besar ----
  const onPaneMessage = (msg: ToPaneMessage) => {
    const h = handlers.current;
    if (msg.type === "selection") setRemote(msg);
    else if (msg.type === "write-cell") void writeCell(msg.value, true);
    else if (msg.type === "chunk" && msg.channel === "register") h.register.receiveChunk(msg);
    else h.session.handlePaneMessage(msg);
  };

  const openDialog = async () => {
    try {
      dialogRef.current = await openLargeWindow(onPaneMessage, () => {
        dialogRef.current = null;
      });
      handlers.current.session.onDialogOpened();
    } catch (err) {
      r.setError({ message: (err as Error).message });
    }
  };

  // ---- Jendela besar: pesan dari panel samping, lalu minta sesi tersimpan ----
  const [linkError, setLinkError] = useState<string | null>(null);
  const parentLinked = useRef(false);
  useEffect(() => {
    if (!isDialog || host !== "excel" || parentLinked.current) return;
    parentLinked.current = true;
    void onParentMessage((m) => {
      const h = handlers.current;
      if (m.type === "cell-status") flashRef.current(m.text);
      else if (m.type === "register-pick" || m.type === "register-status") h.register.handleParentMessage(m);
      else h.session.handleParentMessage(m);
    }).then((ok) => {
      if (ok) sendToTaskPane({ type: "dialog-ready" });
      else
        setLinkError(
          "Excel ini belum mendukung pesan ke jendela besar (DialogApi 1.2): PDF dan hasil footing tidak bisa " +
            "dipindahkan antara jendela besar dan panel samping. Perbarui Excel atau pakai panel samping.",
        );
    });
  }, [host]);


  const pageCount = r.pdf?.pageCount ?? 0;

  // ---------------- Sum snip ----------------
  const [snipMode, setSnipMode] = useState(false);
  const [draft, setDraft] = useState<Snip | null>(null);
  const flashRef = useRef(flash);
  flashRef.current = flash;
  const tokensById = useMemo(() => new Map(r.tokens.map((t) => [t.id, t])), [r.tokens]);

  const onSnipBox = (page: number, box: PdfBox) => {
    const sel = selectTokens(r.tokens, page, box);
    if (sel.length === 0) {
      flash("Tidak ada angka di dalam kotak.");
      return;
    }
    const total = suggestTotal(sel, { rules: r.rules?.[page - 1] ?? [], boldFonts: r.boldFonts });
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    setDraft({ id, page, box, tokenIds: sel.map((t) => t.id), totalId: total?.id ?? null });
    r.setActiveSnipId(null);
  };

  const draftEval = useMemo(
    () => (draft ? evaluateSnip(draft, tokensById, !!r.pageScales[draft.page - 1]) : null),
    [draft, tokensById, r.pageScales],
  );
  /** Angka terakhir draf (calon total): paling bawah (vertikal) atau paling kanan (horizontal). */
  const draftLast = useMemo(() => {
    if (!draftEval || draftEval.tokens.length < 2) return null;
    const toks = draftEval.tokens;
    return orientationOf(toks) === "horizontal"
      ? [...toks].sort((a, b) => a.box.x0 - b.box.x0)[toks.length - 1]
      : toks[toks.length - 1];
  }, [draftEval]);

  /** Tulis nilai ke sel aktif (panel samping); `fromDialog` = permintaan dari jendela besar. */
  const writeCell = async (value: number, fromDialog: boolean) => {
    try {
      const addr = await writeValueToActiveCell(value);
      const text = `Jumlah ${formatAmount(value, r.locale)} ditulis ke ${addr.split("!").pop()}`;
      flashRef.current(text);
      if (fromDialog) dialogRef.current?.send({ type: "cell-status", ok: true, text });
    } catch (err) {
      const text = `Gagal menulis ke Excel: ${String(err)}`;
      if (fromDialog) dialogRef.current?.send({ type: "cell-status", ok: false, text });
      else r.setError({ message: "Gagal menulis ke Excel.", detail: String(err) });
    }
  };

  const saveDraft = () => {
    if (!draft) return;
    r.addSnip(draft);
    r.setActiveSnipId(draft.id);
    setDraft(null);
  };
  const sendDraftToExcel = () => {
    if (!draft || !draftEval) return;
    const value = draftEval.sum;
    saveDraft();
    if (isDialog) {
      if (sendToTaskPane({ type: "write-cell", value })) flash("Dikirim ke panel samping untuk ditulis ke sel aktif…");
      else flash("Gagal mengirim ke panel samping. Pastikan panel samping Report Audit masih terbuka.");
    } else void writeCell(value, false);
  };

  const snipShapes = useMemo(() => {
    const m = new Map<number, SnipShape[]>();
    const add = (page: number, sh: SnipShape) => m.set(page, [...(m.get(page) ?? []), sh]);
    const tag = (ev: { sum: number; status: string; difference: number | null }) =>
      `Σ ${formatAmount(ev.sum, r.locale)}` +
      (ev.status === "foot" ? " · F" : ev.status === "fail" ? ` · ✗ ${formatDiff(ev.difference ?? 0)}` : ev.status === "open" ? " · ○" : "");
    for (const ev of r.snipEvals) {
      add(ev.snip.page, { id: ev.snip.id, box: ev.snip.box, label: tag(ev), kind: "saved", status: ev.status, active: ev.snip.id === r.activeSnipId });
    }
    if (draftEval) {
      add(draftEval.snip.page, { id: "draft", box: draftEval.snip.box, label: tag(draftEval), kind: "draft", status: draftEval.status, active: true });
    }
    return m;
  }, [r.snipEvals, r.activeSnipId, draftEval, r.locale]);

  // Sorot susunan footing dari angka terpilih: komponen dari total, atau total + komponen saudaranya.
  const selectedStatus = r.selected ? r.footing?.byToken.get(r.selected.id) : undefined;
  const activeFootingId = selectedStatus ? (selectedStatus.footingId ?? selectedStatus.componentOf ?? null) : null;
  const highlight = useMemo(() => {
    const ids = new Set<string>();
    const f = r.footing?.footings.find((x) => x.id === activeFootingId);
    if (f) {
      ids.add(f.totalId);
      f.componentIds.forEach((id) => ids.add(id));
    }
    return ids;
  }, [r.footing, activeFootingId]);

  // Blok warna footing per halaman (dihitung sekali per hasil footing).
  const blocks = useMemo(() => {
    if (!r.footing) return null;
    const byId = new Map(r.tokens.map((t) => [t.id, t]));
    const m = new Map<number, FootingBlock[]>();
    for (let p = 1; p <= pageCount; p++) m.set(p, footingBlocks(r.footing, byId, p));
    return m;
  }, [r.footing, r.tokens, pageCount]);

  return (
    <div className={`app ${isDialog ? "is-dialog" : "is-pane"}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ∑
          </span>
          <span>Report Audit</span>
          <span className="badge-exp">uji coba</span>
        </div>
        <span className="local" title="PDF dibaca di dalam browser ini dan tidak diunggah ke mana pun.">
          ● Diproses lokal
        </span>
      </header>

      <div className="layout">
        <div className="main-col">
          <section className="docbar">
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) r.openFile(f);
                e.target.value = "";
              }}
            />
            <button type="button" className="primary" onClick={() => fileInput.current?.click()}>
              {r.pdf ? "Ganti PDF" : "Buka PDF"}
            </button>
            {host === "excel" && !isDialog && (
              <button type="button" onClick={openDialog} title="Buka viewer di jendela terpisah yang lebih besar">
                Jendela besar ⧉
              </button>
            )}
            <label className="locale">
              Format angka
              <select value={r.locale} onChange={(e) => r.setLocale(e.target.value as "id" | "en")}>
                <option value="id">Indonesia (1.234,56)</option>
                <option value="en">US (1,234.56)</option>
              </select>
            </label>
          </section>

          {r.loading && <div className="notice info">{r.loading}</div>}
          {r.error && (
            <div className="notice error" role="alert">
              <strong>{r.error.message}</strong>
              {r.error.detail && (
                <details>
                  <summary>Detail teknis</summary>
                  <p className="mono small">{r.error.detail}</p>
                </details>
              )}
              <button type="button" className="link" onClick={() => r.setError(null)}>
                Tutup
              </button>
            </div>
          )}
          {status && <div className="notice ok">{status}</div>}
          {r.lastAction && (
            <div className="notice info undo-note">
              <span>{r.lastAction}</span>
              <button type="button" onClick={r.undo}>
                ↶ Urungkan
              </button>
              <button type="button" className="link" onClick={r.dismissLastAction} aria-label="Tutup">
                ✕
              </button>
            </div>
          )}
          {linkError && <div className="notice warn">{linkError}</div>}
          {session.restoring && (
            <div className="notice info">
              {isDialog ? "Memulihkan PDF dan progres dari panel samping…" : "Membuka PDF dari jendela besar…"}
            </div>
          )}
          {!isDialog && host === "excel" && session.stored && session.stored.fingerprint !== r.pdf?.fingerprint && (
            <div className="notice info session-note">
              <span>
                Sesi tersimpan di panel ini: <strong>{session.stored.name}</strong>. Klik <strong>Jendela besar ⧉</strong>{" "}
                untuk melanjutkan tanpa memilih file lagi. Sesi hilang bila panel ini ditutup.
              </span>
              <button type="button" className="link" onClick={session.forget}>
                Lupakan sesi
              </button>
            </div>
          )}

          {r.pdf && (
            <section className="docinfo">
              <div className="docname" title={r.pdf.fileName}>
                {r.pdf.fileName}
              </div>
              <div className="docmeta">
                {pageCount} hal · {r.tokens.filter((t) => t.hint === "amount").length} angka terbaca · sidik{" "}
                <span className="mono" title={`SHA-256: ${r.pdf.fingerprint}`}>
                  {r.pdf.fingerprint.slice(0, 10)}
                </span>
              </div>
              {r.scanned && (
                <div className="notice warn">
                  ⚠ Sebagian besar halaman tidak punya teks. Kemungkinan PDF hasil scan, sehingga angka tidak bisa
                  diklik. OCR belum didukung.
                </div>
              )}
            </section>
          )}

          {r.pdf && (
            <nav className="toolbar" aria-label="Navigasi halaman">
              <button type="button" disabled={r.page <= 1} onClick={() => r.goToPage(r.page - 1)} aria-label="Halaman sebelumnya">
                ‹
              </button>
              <span className="pageno">
                Hal.{" "}
                <input
                  type="number"
                  min={1}
                  max={pageCount}
                  value={r.page}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 1 && n <= pageCount) r.goToPage(n);
                  }}
                />{" "}
                / {pageCount}
              </span>
              <button type="button" disabled={r.page >= pageCount} onClick={() => r.goToPage(r.page + 1)} aria-label="Halaman berikutnya">
                ›
              </button>
              <span className="spacer" />
              <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Perkecil">
                −
              </button>
              <span className="zoom">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => Math.min(4, z + 0.25))} aria-label="Perbesar">
                +
              </button>
              <button type="button" onClick={() => setZoom(1)} title="Pas lebar">
                ↔
              </button>
            </nav>
          )}

          {r.pdf ? (
            <PdfScrollView
              doc={r.pdf.doc}
              viewports={r.viewports}
              zoom={zoom}
              tokens={r.tokens}
              selectedId={r.selected?.id ?? null}
              occurrences={r.occurrences}
              focusId={r.focusId}
              nav={r.nav}
              marks={r.footing?.byToken ?? null}
              highlight={highlight}
              blocks={blocks}
              activeFootingId={activeFootingId}
              snipMode={snipMode}
              onSnipBox={onSnipBox}
              snipShapes={snipShapes}
              onSelect={handleSelect}
              onPageChange={r.setPage}
            />
          ) : (
            !r.loading && (
              <section className="empty">
                <p>
                  <strong>Mulai dengan membuka PDF laporan keuangan.</strong>
                </p>
                <p className="muted small">
                  File dibaca langsung di perangkat ini. Tidak ada data yang dikirim ke server. Gunakan PDF hasil
                  export dari Word/Excel, bukan hasil scan.
                </p>
              </section>
            )
          )}
        </div>

        <aside className="side-col">
          {host === "browser" && !isDialog && <InstallPanel />}
          {remote && !isDialog && (
            <section className="panel remote">
              <h2>Dari jendela besar</h2>
              <p>
                <span className="mono">{remote.text}</span> · Hal. {remote.page} · {remote.label || "(tanpa label)"}
              </p>
              {host === "excel" && (
                <button type="button" className="primary" onClick={() => writePayload(remote)}>
                  Tulis ke sel aktif
                </button>
              )}
            </section>
          )}
          {r.pdf && (
            <SnipPanel
              snipMode={snipMode}
              onToggleMode={() => {
                if (!snipMode) r.ensureLayout();
                setSnipMode(!snipMode);
              }}
              draft={draftEval}
              draftLast={draftLast}
              onDraftTotal={(useLast) => draft && setDraft({ ...draft, totalId: useLast && draftLast ? draftLast.id : null })}
              onSave={saveDraft}
              onSendToExcel={host === "excel" ? sendDraftToExcel : null}
              onDiscard={() => setDraft(null)}
              saved={r.snipEvals}
              activeId={r.activeSnipId}
              onPick={(ev) => {
                r.setActiveSnipId(ev.snip.id);
                const focus = ev.total ?? ev.tokens[0];
                if (focus) {
                  r.select(focus);
                  r.goTo(focus);
                }
              }}
              onRemove={(id) => {
                r.removeSnip(id);
                if (r.activeSnipId === id) r.setActiveSnipId(null);
              }}
              locale={r.locale}
              excelNote={host === "excel" ? null : "Mode pratinjau browser: Kirim ke Excel hanya tersedia di dalam Excel."}
            />
          )}
          <SelectionPanel
            token={r.selected}
            occurrences={r.occurrences}
            locale={r.locale}
            onGoTo={r.goTo}
            actions={
              r.selected && host === "excel" && !isDialog ? (
                <button type="button" className="primary" onClick={() => writePayload(toPayload(r.selected!))}>
                  Tulis ke sel aktif
                </button>
              ) : r.selected && host === "browser" ? (
                <span className="muted small">Mode pratinjau browser — fitur Excel tidak aktif.</span>
              ) : null
            }
            extra={
              r.selected && r.footing ? (
                <FootingDetail
                  token={r.selected}
                  footing={r.footing}
                  tokens={r.tokens}
                  override={r.overrides[r.selected.id]}
                  locale={r.locale}
                  onOverride={(ov) => r.setOverride(r.selected!.id, ov)}
                  onGoTo={(t) => {
                    r.select(t);
                    r.goTo(t);
                  }}
                />
              ) : null
            }
          />
          {r.pdf && (
            <FootingPanel
              footing={r.footing}
              footingOn={r.footingOn}
              busy={!!r.loading}
              tokens={r.tokens}
              scaleSummary={r.scaleSummary}
              scaleChoice={r.scaleChoice}
              documentScale={r.documentScale}
              overrides={r.overrides}
              onCancelOverride={(id) => r.setOverride(id, null)}
              onRun={r.runFooting}
              onHide={() => r.setFootingOn(false)}
              onScaleChoice={r.setScaleChoice}
              onClearOverrides={r.clearOverrides}
              excel={{ mode: register.mode, status: register.status, busy: register.busy, onSync: register.sync }}
              onPick={(t) => {
                r.select(t);
                r.goTo(t);
              }}
            />
          )}
          {r.pdf && (
            <PageStats
              stats={r.stats}
              current={r.page}
              onPick={r.goToPage}
              diagnostics={() =>
                pageDiagnostics({
                  page: r.page,
                  tokens: r.tokens,
                  rules: r.rules?.[r.page - 1] ?? null,
                  boldFonts: r.boldFonts,
                  footing: r.footing,
                })
              }
            />
          )}
        </aside>
      </div>
    </div>
  );
}

/** Muncul hanya saat situs dibuka di browser biasa (bukan di dalam Excel). */
function InstallPanel() {
  const base = appBaseUrl(window.location.href);
  const isHttps = window.location.protocol === "https:";
  const [err, setErr] = useState<string | null>(null);
  return (
    <section className="panel install">
      <h2>Pasang ke Excel</h2>
      <p className="small">
        Halaman ini sedang dibuka di browser biasa. Untuk memakainya di Excel, unduh manifest lalu upload lewat{" "}
        <strong>Home → Add-ins → Advanced… → Upload My Add-in</strong>.
      </p>
      <p className="small muted">
        Alamat aplikasi: <span className="mono">{base}</span>
      </p>
      {isHttps ? (
        <button
          type="button"
          className="primary"
          onClick={() => {
            try {
              downloadManifest(window.location.href);
            } catch (e) {
              setErr(String(e));
            }
          }}
        >
          Unduh manifest.xml
        </button>
      ) : (
        <p className="small muted">Manifest hanya bisa dibuat dari alamat HTTPS (mis. GitHub Pages).</p>
      )}
      {err && <div className="notice error">{err}</div>}
    </section>
  );
}

function PageStats({
  stats,
  current,
  onPick,
  diagnostics,
}: {
  stats: { page: number; textItems: number; numberTokens: number; rules: number | null }[];
  current: number;
  onPick: (p: number) => void;
  /** Teks diagnostik halaman aktif dengan angka disamarkan. */
  diagnostics: () => string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <details className="panel stats">
      <summary>Diagnostik ekstraksi per halaman</summary>
      <table>
        <thead>
          <tr>
            <th>Hal.</th>
            <th>Potongan teks</th>
            <th>Angka</th>
            <th title="Garis horizontal (dibaca saat footing dijalankan)">Garis</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.page} className={s.page === current ? "cur" : ""} onClick={() => onPick(s.page)}>
              <td>{s.page}</td>
              <td>{s.textItems}</td>
              <td>{s.numberTokens}</td>
              <td>{s.rules ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="diag">
        <button
          type="button"
          onClick={() => {
            setText(diagnostics());
            setCopied(false);
          }}
        >
          Diagnostik hal. {current} (angka disamarkan)
        </button>
        {text && (
          <>
            <p className="small muted">
              Semua digit diganti 9; label baris tetap terlihat. Periksa dulu isinya, lalu salin dan kirim ke
              pengembang bila ada salah baca. PDF tidak perlu dikirim.
            </p>
            <textarea className="mono small" readOnly value={text} rows={10} onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                } catch {
                  setCopied(false); // izin clipboard ditolak: pilih teks lalu Ctrl+C
                }
              }}
            >
              {copied ? "Tersalin ✓" : "Salin"}
            </button>
          </>
        )}
      </div>
    </details>
  );
}
