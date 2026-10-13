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
  /** Bagian tambahan di bawah detail angka (mis. detail footing). */
  extra?: ReactNode;
}

const HINT_LABEL: Record<NumberToken["hint"], string> = {
  amount: "Nominal",
  "likely-reference": "Kemungkinan nomor catatan",
  "likely-year": "Kemungkinan tahun",
};

export function SelectionPanel({ token, occurrences, locale, onGoTo, actions, extra }: Props) {
  if (!token) {
    return (
      <section className="panel muted">
        <p>Klik angka di halaman PDF untuk melihat detailnya dan mencari angka yang sama di halaman lain.</p>
      </section>
    );
  }

  const p = token.parsed;

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
        <dt title="Potongan teks persis seperti tersimpan di PDF (untuk diagnostik salah baca)">Potongan PDF</dt>
        <dd className="mono small">{token.source.map((x) => `«${x}»`).join(" ")}</dd>
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

      {extra}

      <h2>
        Lokasi lain dengan angka sama <span className="count">{occurrences.length}</span>
      </h2>
      <p className="muted small">Tanda kurung/minus diabaikan saat mencari; perbedaan tanda tetap ditandai.</p>
      {p.value === 0 && <p className="muted small">Nilai nol tidak dicari (terlalu umum).</p>}
      {occurrences.length === 0 && p.value !== 0 && (
        <p className="muted small">Tidak ditemukan angka yang sama di dokumen ini.</p>
      )}
      <ul className="occ-list">
        {occurrences.map((o) => (
          <li key={o.token.id}>
            <button type="button" className={`occ occ-${o.match}`} onClick={() => onGoTo(o.token)}>
              <span className="occ-page">Hal. {o.token.page}</span>
              <span className="occ-label">{o.token.label || "(tanpa label)"}</span>
              <span className="occ-val mono">{o.token.text}</span>
              {o.match === "sign-mismatch" && (
                <span className="tag sign" title="Angka sama, tanda berlawanan (mis. positif di laporan utama, dalam kurung di CALK)">
                  tanda berlawanan
                </span>
              )}
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
