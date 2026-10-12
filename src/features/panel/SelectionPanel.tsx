/**
 * Detail angka terpilih + daftar lokasi lain dengan nilai yang sama.
 * Semua label di sini adalah SARAN sistem, bukan kesimpulan reviewer.
 */
import type { ReactNode } from "react";
import type { NumberToken } from "../../domain/pdf/numberTokens";
import type { Occurrence } from "../../domain/matching/findOccurrences";
import { formatAmount, type NumberLocale } from "../../domain/parsing/parseAmount";

interface Props {
  token: NumberToken | null;
  occurrences: Occurrence[];
  locale: NumberLocale;
  onGoTo: (t: NumberToken) => void;
  actions?: ReactNode;
}

const HINT_LABEL: Record<NumberToken["hint"], string> = {
  amount: "Nominal",
  "likely-reference": "Kemungkinan nomor catatan",
  "likely-year": "Kemungkinan tahun",
};

export function SelectionPanel({ token, occurrences, locale, onGoTo, actions }: Props) {
  if (!token) {
    return (
      <section className="panel muted">
        <p>Klik angka di halaman PDF untuk melihat detailnya dan mencari angka yang sama di halaman lain.</p>
      </section>
    );
  }

  const p = token.parsed;
  const same = occurrences.filter((o) => o.match === "same-value");
  const signDiff = occurrences.filter((o) => o.match === "sign-mismatch");

  return (
    <section className="panel" aria-live="polite">
      <h2>Angka terpilih</h2>
      <dl className="facts">
        <dt>Teks di PDF</dt>
        <dd className="mono">{token.text}</dd>
        <dt>Dibaca sebagai</dt>
        <dd className="mono">
          {formatAmount(p.value, locale)}
          {p.negative && <span className="tag neg">negatif</span>}
        </dd>
        <dt>Halaman</dt>
        <dd>{token.page}</dd>
        <dt>Label baris</dt>
        <dd>{token.label || <em>tidak ditemukan</em>}</dd>
        <dt>Jenis</dt>
        <dd>{HINT_LABEL[token.hint]}</dd>
        {p.footnote && (
          <>
            <dt>Catatan kaki</dt>
            <dd className="mono">{p.footnote}</dd>
          </>
        )}
        {p.currency && (
          <>
            <dt>Mata uang</dt>
            <dd>{p.currency}</dd>
          </>
        )}
      </dl>

      {p.warnings.length > 0 && (
        <div className="notice warn" role="alert">
          {p.warnings.map((w) => (
            <p key={w}>⚠ {w}</p>
          ))}
        </div>
      )}

      {actions && <div className="actions">{actions}</div>}

      <h2>
        Lokasi lain dengan nilai sama <span className="count">{occurrences.length}</span>
      </h2>
      {p.value === 0 && <p className="muted small">Nilai nol tidak dicari (terlalu umum).</p>}
      {occurrences.length === 0 && p.value !== 0 && (
        <p className="muted small">Tidak ditemukan angka yang sama di dokumen ini.</p>
      )}
      <ul className="occ-list">
        {[...same, ...signDiff].map((o) => (
          <li key={o.token.id}>
            <button type="button" className={`occ occ-${o.match}`} onClick={() => onGoTo(o.token)}>
              <span className="occ-page">Hal. {o.token.page}</span>
              <span className="occ-label">{o.token.label || "(tanpa label)"}</span>
              <span className="occ-val mono">{o.token.text}</span>
              {o.match === "sign-mismatch" && <span className="tag neg">tanda beda</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="muted small disclaimer">
        Nilai yang sama belum tentu berhubungan. Keputusan tie tetap di tangan reviewer.
      </p>
    </section>
  );
}
