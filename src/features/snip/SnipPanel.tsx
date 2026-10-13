/**
 * Panel sum snip: hasil kotak yang baru ditarik (draf) + daftar sum snip tersimpan.
 * Sum snip yang punya total menggantikan hasil footing otomatis untuk total itu (koreksi).
 */
import type { NumberToken } from "../../domain/pdf/numberTokens";
import { formatAmount, type NumberLocale } from "../../domain/parsing/parseAmount";
import { formatDiff } from "../../domain/footing/verticalFooting";
import type { SnipEvaluation } from "../../domain/snip/sumSnip";

interface Props {
  snipMode: boolean;
  onToggleMode: () => void;
  draft: SnipEvaluation | null;
  /** Angka yang bisa dijadikan total untuk draf (angka terakhir di kotak). */
  draftLast: NumberToken | null;
  onDraftTotal: (useLast: boolean) => void;
  onSave: () => void;
  onSendToExcel: (() => void) | null;
  onDiscard: () => void;
  saved: SnipEvaluation[];
  activeId: string | null;
  onPick: (ev: SnipEvaluation) => void;
  onRemove: (id: string) => void;
  locale: NumberLocale;
  excelNote: string | null;
}

export function statusText(ev: SnipEvaluation): string {
  switch (ev.status) {
    case "foot":
      return "F cocok (selisih 0)";
    case "fail":
      return `✗ selisih ${formatDiff(ev.difference ?? 0)}`;
    case "open":
      return `○ cek manual${ev.difference !== null ? ` (selisih ${formatDiff(ev.difference)})` : ""}`;
    case "sum":
      return "Σ jumlah (tanpa pembanding)";
  }
}

export function SnipPanel(p: Props) {
  const d = p.draft;
  return (
    <section className="panel snip">
      <h2>
        Sum snip <span className="count">{p.saved.length}</span>
      </h2>
      <div className="actions-row">
        <button type="button" className={p.snipMode ? "primary" : ""} aria-pressed={p.snipMode} onClick={p.onToggleMode}>
          {p.snipMode ? "Σ Mode tarik kotak: AKTIF" : "Σ Tarik kotak"}
        </button>
      </div>
      {p.snipMode && !d && (
        <p className="small muted">
          Tarik kotak di halaman PDF, di atas angka vertikal atau horizontal. Angka dalam kurung dihitung negatif.
          Klik tombol di atas lagi untuk kembali memilih angka biasa.
        </p>
      )}

      {d && (
        <div className={`snip-draft ss-${d.status}`}>
          <dl className="facts">
            <dt>Banyak angka</dt>
            <dd>
              {d.tokens.length} ({d.orientation})
            </dd>
            <dt>Jumlah</dt>
            <dd className="mono">{formatAmount(d.sum, p.locale)}</dd>
            {d.total && (
              <>
                <dt>Total di PDF</dt>
                <dd className="mono">{d.total.text}</dd>
              </>
            )}
            <dt>Hasil</dt>
            <dd>
              <strong>{statusText(d)}</strong>
            </dd>
          </dl>
          {d.reason && <p className="small muted">{d.reason}</p>}
          {p.draftLast && (
            <label className="check">
              <input type="checkbox" checked={!!d.total} onChange={(e) => p.onDraftTotal(e.target.checked)} />
              Angka terakhir (<span className="mono">{p.draftLast.text}</span>) adalah total pembanding
            </label>
          )}
          {d.total && (
            <p className="small muted">
              Saat disimpan, hasil ini <strong>menggantikan</strong> hasil footing otomatis untuk total{" "}
              <span className="mono">{d.total.text}</span>.
            </p>
          )}
          <div className="actions-row">
            <button type="button" className="primary" onClick={p.onSave}>
              Simpan
            </button>
            {p.onSendToExcel && (
              <button type="button" onClick={p.onSendToExcel} title="Simpan, lalu tulis jumlahnya ke sel aktif Excel">
                Kirim ke Excel
              </button>
            )}
            <button type="button" onClick={p.onDiscard}>
              Buang
            </button>
          </div>
          {p.excelNote && <p className="small muted">{p.excelNote}</p>}
        </div>
      )}

      {p.saved.length > 0 && (
        <ul className="occ-list">
          {p.saved.map((ev) => {
            const first = ev.total ?? ev.tokens[0];
            return (
              <li key={ev.snip.id} className="snip-item">
                <button
                  type="button"
                  className={`occ foot-item ss-${ev.status}${ev.snip.id === p.activeId ? " is-active" : ""}`}
                  onClick={() => p.onPick(ev)}
                >
                  <span className="occ-page">Hal. {ev.snip.page}</span>
                  <span className="occ-label">{first?.label || "(tanpa label)"}</span>
                  <span className="occ-val mono">Σ {formatAmount(ev.sum, p.locale)}</span>
                  <span className="tag info">{statusText(ev)}</span>
                </button>
                <button type="button" className="link" onClick={() => p.onRemove(ev.snip.id)}>
                  Hapus
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
