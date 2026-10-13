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
import {
  onParentMessage,
  openLargeWindow,
  readyOffice,
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
      if (m.type === "register-pick" || m.type === "register-status") h.register.handleParentMessage(m);
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
              overrideCount={Object.keys(r.overrides).length}
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
