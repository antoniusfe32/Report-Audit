/**
 * Panel footing: satu tombol untuk seluruh dokumen, skala angka, ringkasan F / ✗ / ○,
 * dan daftar total yang perlu perhatian (klik → loncat ke angkanya).
 * Semua hasil adalah SARAN sistem; keputusan tetap di tangan reviewer.
 */
import type { NumberToken } from "../../domain/pdf/numberTokens";
import {
  formatDiff,
  type Footing,
  type FootingResult,
  type Override,
  type Overrides,
} from "../../domain/footing/verticalFooting";
import { SCALE_LABEL, type Scale, type ScaleSummary } from "../../domain/footing/scale";
import type { ScaleChoice } from "../../app/useReviewer";
import type { RegisterMode } from "../../app/useExcelRegister";

interface Props {
  footing: FootingResult | null;
  footingOn: boolean;
  busy: boolean;
  tokens: NumberToken[];
  scaleSummary: ScaleSummary;
  scaleChoice: ScaleChoice;
  documentScale: Scale | null;
  overrides: Overrides;
  onCancelOverride: (tokenId: string) => void;
  onRun: () => void;
  onHide: () => void;
  onScaleChoice: (s: ScaleChoice) => void;
  onClearOverrides: () => void;
  onPick: (t: NumberToken) => void;
  /** Status register Excel. */
  excel: { mode: RegisterMode; status: { ok: boolean; text: string } | null; busy: boolean; onSync: () => void };
}

const SCALES: Scale[] = ["penuh", "ribuan", "jutaan", "miliaran"];

export function FootingPanel(p: Props) {
  const byId = new Map(p.tokens.map((t) => [t.id, t]));
  const detectedPages = p.scaleSummary.perPage.filter(Boolean).length;
  const pagesWithoutScale = p.scaleSummary.perPage.filter((s) => !s).length;

  const scaleValue = p.scaleChoice === "auto" ? "auto" : (p.scaleChoice ?? "none");
  const autoText = p.scaleSummary.documentDefault
    ? `Otomatis: ${SCALE_LABEL[p.scaleSummary.documentDefault]}`
    : "Otomatis: tidak terdeteksi";

  return (
    <section className="panel footing">
      <h2>Footing vertikal</h2>
      {!p.footingOn ? (
        <>
          <p className="small muted">
            Menjumlahkan setiap kolom angka di seluruh dokumen dan membandingkannya dengan total (angka bergaris di
            atasnya atau berlabel Jumlah/Total/Neto). Toleransi 0.
          </p>
          <button type="button" className="primary" onClick={p.onRun} disabled={p.busy}>
            Jalankan footing (seluruh dokumen)
          </button>
        </>
      ) : (
        <div className="actions-row">
          <button type="button" onClick={p.onHide}>
            Sembunyikan tanda
          </button>
          {Object.keys(p.overrides).length > 0 && (
            <button type="button" onClick={p.onClearOverrides} title="Hapus semua koreksi manual">
              Hapus {Object.keys(p.overrides).length} koreksi manual
            </button>
          )}
        </div>
      )}

      <label className="field">
        <span>Skala angka (untuk halaman tanpa pernyataan skala)</span>
        <select
          value={scaleValue}
          onChange={(e) => {
            const v = e.target.value;
            p.onScaleChoice(v === "auto" ? "auto" : v === "none" ? null : (v as Scale));
          }}
        >
          <option value="auto">{autoText}</option>
          {SCALES.map((s) => (
            <option key={s} value={s}>
              {SCALE_LABEL[s]}
            </option>
          ))}
          <option value="none">Belum ditetapkan</option>
        </select>
      </label>
      <p className="small muted">
        {detectedPages > 0
          ? `Pernyataan skala ditemukan di ${detectedPages} halaman (berlaku untuk halaman itu sendiri).`
          : "Tidak ada pernyataan skala di dokumen."}
        {p.scaleSummary.mixed && " Ada lebih dari satu skala di dokumen — periksa."}
      </p>
      {!p.documentScale && pagesWithoutScale > 0 && (
        <div className="notice warn small">
          ⚠ Skala belum ditetapkan untuk {pagesWithoutScale} halaman. Di halaman tersebut tidak ada total yang bisa
          dinyatakan cocok (F) sampai skala dipilih.
        </div>
      )}

      {p.footingOn && !p.footing && <p className="small muted">Membaca garis tabel…</p>}
      {p.footing && <ExcelStatus {...p.excel} />}
      {Object.keys(p.overrides).length > 0 && (
        <OverrideList overrides={p.overrides} byId={byId} onPick={p.onPick} onCancel={p.onCancelOverride} />
      )}
      {p.footing && <Results footing={p.footing} byId={byId} onPick={p.onPick} />}
    </section>
  );
}

function Results({
  footing,
  byId,
  onPick,
}: {
  footing: FootingResult;
  byId: Map<string, NumberToken>;
  onPick: (t: NumberToken) => void;
}) {
  const { summary } = footing;
  const fails = footing.footings.filter((f) => f.status === "fail");
  const opens = footing.footings.filter((f) => f.status === "open");
  return (
    <>
      <div className="fsummary" aria-label="Ringkasan footing">
        <span className="chip fb-foot" title="Total dengan selisih tepat 0">
          F <strong>{summary.foot}</strong>
        </span>
        <span className="chip fb-fail" title="Total dengan selisih ≠ 0">
          ✗ <strong>{summary.fail}</strong>
        </span>
        <span className="chip fb-open" title="Angka yang belum tercakup footing / perlu cek manual">
          ○ <strong>{summary.open}</strong>
        </span>
        <span className="chip fb-check" title="Komponen footing yang cocok">
          ✓ <strong>{summary.check}</strong>
        </span>
      </div>

      <FootingList title="Total tidak cocok" items={fails} byId={byId} onPick={onPick} empty="Tidak ada." />
      <FootingList
        title="Total perlu cek manual"
        items={opens}
        byId={byId}
        onPick={onPick}
        empty="Tidak ada."
        showReason
      />
      <p className="small muted legend">
        <span className="fb-check">✓</span> komponen cocok · <span className="fb-foot">F</span> total cocok ·{" "}
        <span className="fb-fail">✗</span> selisih ≠ 0 · <span className="fb-open">○</span> belum tercakup / cek
        manual. Arahkan kursor ke angka untuk alasannya.
      </p>
      <p className="small muted disclaimer">
        Footing otomatis adalah saran berdasarkan tata letak PDF. Reviewer tetap memeriksa susunan tabel dan
        keputusannya.
      </p>
    </>
  );
}

function FootingList({
  title,
  items,
  byId,
  onPick,
  empty,
  showReason = false,
}: {
  title: string;
  items: Footing[];
  byId: Map<string, NumberToken>;
  onPick: (t: NumberToken) => void;
  empty: string;
  showReason?: boolean;
}) {
  return (
    <>
      <h3>
        {title} <span className="count">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="small muted">{empty}</p>
      ) : (
        <ul className="occ-list">
          {items.map((f) => {
            const t = byId.get(f.totalId);
            if (!t) return null;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  className={`occ foot-item fi-${f.status}`}
                  onClick={() => onPick(t)}
                  title={f.reason || undefined}
                >
                  <span className="occ-page">Hal. {f.page}</span>
                  <span className="occ-label">{t.label || "(tanpa label)"}</span>
                  <span className="occ-val mono">{t.text}</span>
                  {f.status === "fail" && <span className="tag neg">selisih {formatDiff(f.difference)}</span>}
                  {showReason && f.reason && <span className="tag info">{f.reason}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

const MODE_TEXT: Record<RegisterMode, string> = {
  pane: "Semua hasil footing (F, ✗, ○) otomatis masuk ke sheet RA_Register. Klik baris di sheet itu untuk menyorot angkanya di PDF. Kolom Komentar tidak ditimpa.",
  dialog:
    "Jendela besar tidak bisa menulis ke workbook: hasil dikirim ke panel samping Report Audit, lalu panel samping yang menulis ke sheet RA_Register. Jangan tutup panel samping.",
  off: "Tidak terhubung ke Excel (mode pratinjau browser), jadi hasil TIDAK ditulis ke sheet RA_Register.",
};

function ExcelStatus({ mode, status, busy, onSync }: Props["excel"]) {
  return (
    <div className={`excel-sync ${mode === "off" ? "is-off" : ""}`}>
      <p className="small">
        <strong>Register Excel:</strong> {MODE_TEXT[mode]}
      </p>
      {mode !== "off" && (
        <div className="actions-row">
          <button type="button" onClick={onSync} disabled={busy}>
            {busy ? "Menulis ke Excel…" : "Kirim ulang ke Excel"}
          </button>
        </div>
      )}
      {status && <p className={`small ${status.ok ? "ok-text" : "err-text"}`}>{status.text}</p>}
    </div>
  );
}

const OVERRIDE_LABEL: Record<Override, string> = {
  total: "ditandai total",
  "not-total": "bukan total",
  exclude: "dikeluarkan",
};

/** Daftar koreksi manual: klik untuk menuju angkanya, "Batalkan" untuk menghapus satu koreksi. */
function OverrideList({
  overrides,
  byId,
  onPick,
  onCancel,
}: {
  overrides: Overrides;
  byId: Map<string, NumberToken>;
  onPick: (t: NumberToken) => void;
  onCancel: (tokenId: string) => void;
}) {
  const entries = Object.entries(overrides)
    .map(([id, ov]) => ({ id, ov, t: byId.get(id) }))
    .sort((a, b) => (a.t?.page ?? 0) - (b.t?.page ?? 0) || (b.t?.box.y1 ?? 0) - (a.t?.box.y1 ?? 0));
  return (
    <>
      <h3>
        Koreksi manual <span className="count">{entries.length}</span>
      </h3>
      <ul className="occ-list override-list">
        {entries.map(({ id, ov, t }) => (
          <li key={id} className="snip-item">
            <button type="button" className="occ" onClick={() => t && onPick(t)} disabled={!t}>
              <span className="occ-page">{t ? `Hal. ${t.page}` : "?"}</span>
              <span className="occ-label">{t?.label || "(tanpa label)"}</span>
              <span className="occ-val mono">{t?.text ?? "angka tidak ditemukan"}</span>
              <span className="tag info">{OVERRIDE_LABEL[ov]}</span>
            </button>
            <button type="button" className="link" onClick={() => onCancel(id)}>
              Batalkan
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
