/**
 * Panel footing: satu tombol untuk seluruh dokumen, skala angka, ringkasan F / ✗ / ○,
 * dan daftar total yang perlu perhatian (klik → loncat ke angkanya).
 * Semua hasil adalah SARAN sistem; keputusan tetap di tangan reviewer.
 */
import type { NumberToken } from "../../domain/pdf/numberTokens";
import { formatDiff, type Footing, type FootingResult } from "../../domain/footing/verticalFooting";
import { SCALE_LABEL, type Scale, type ScaleSummary } from "../../domain/footing/scale";
import type { ScaleChoice } from "../../app/useReviewer";

interface Props {
  footing: FootingResult | null;
  footingOn: boolean;
  busy: boolean;
  tokens: NumberToken[];
  scaleSummary: ScaleSummary;
  scaleChoice: ScaleChoice;
  documentScale: Scale | null;
  overrideCount: number;
  onRun: () => void;
  onHide: () => void;
  onScaleChoice: (s: ScaleChoice) => void;
  onClearOverrides: () => void;
  onPick: (t: NumberToken) => void;
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
          {p.overrideCount > 0 && (
            <button type="button" onClick={p.onClearOverrides} title="Hapus semua koreksi manual">
              Hapus {p.overrideCount} koreksi manual
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
