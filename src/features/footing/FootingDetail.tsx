/**
 * Detail footing untuk angka terpilih + koreksi manual
 * ("ini total" / "bukan total" / "keluarkan dari footing"). Koreksi langsung menghitung ulang.
 */
import type { NumberToken } from "../../domain/pdf/numberTokens";
import { formatAmount, type NumberLocale } from "../../domain/parsing/parseAmount";
import { formatDiff, type FootingResult, type Override } from "../../domain/footing/verticalFooting";
import { MARK_TEXT } from "./marks";

interface Props {
  token: NumberToken;
  footing: FootingResult;
  tokens: NumberToken[];
  override: Override | undefined;
  locale: NumberLocale;
  onOverride: (ov: Override | null) => void;
  onGoTo: (t: NumberToken) => void;
}

const OVERRIDE_TEXT: Record<Override, string> = {
  total: "ditandai sebagai total",
  "not-total": "ditandai bukan total",
  exclude: "dikeluarkan dari footing",
};

export function FootingDetail({ token, footing, tokens, override, locale, onOverride, onGoTo }: Props) {
  const st = footing.byToken.get(token.id);
  const own = st?.footingId ? footing.footings.find((f) => f.id === st.footingId) : undefined;
  const parent = st?.componentOf ? footing.footings.find((f) => f.id === st.componentOf) : undefined;
  const byId = new Map(tokens.map((t) => [t.id, t]));
  const parentToken = parent ? byId.get(parent.totalId) : undefined;

  return (
    <div className="footing-detail">
      <h2>Footing</h2>
      {st ? (
        <p className={`fstatus fb-${st.mark}`}>
          <strong>{MARK_TEXT[st.mark]}</strong>
          <br />
          <span className="small">{st.reason}</span>
        </p>
      ) : (
        <p className="small muted">Angka ini tidak ikut footing (nomor catatan / tahun).</p>
      )}

      {own && own.componentIds.length > 0 && (
        <table className="ftable">
          <tbody>
            {own.componentIds.map((id) => {
              const c = byId.get(id);
              if (!c) return null;
              return (
                <tr key={id} onClick={() => onGoTo(c)} title="Klik untuk menuju angka ini">
                  <td>{c.label || "(tanpa label)"}</td>
                  <td className="mono num-cell">{c.text}</td>
                </tr>
              );
            })}
            <tr className="sum">
              <td>Jumlah hitung</td>
              <td className="mono num-cell">{formatAmount(own.computed, locale)}</td>
            </tr>
            <tr>
              <td>Dilaporkan</td>
              <td className="mono num-cell">{token.text}</td>
            </tr>
            <tr className={own.difference === 0 ? "ok" : "bad"}>
              <td>Selisih</td>
              <td className="mono num-cell">{formatDiff(own.difference)}</td>
            </tr>
          </tbody>
        </table>
      )}
      {parentToken && (
        <p className="small">
          Komponen dari{" "}
          <button type="button" className="link" onClick={() => onGoTo(parentToken)}>
            {parentToken.label || "(tanpa label)"} {parentToken.text}
          </button>
        </p>
      )}

      <div className="actions-row">
        {override && (
          <span className="small muted">
            Koreksi manual: {OVERRIDE_TEXT[override]}.{" "}
            <button type="button" className="link" onClick={() => onOverride(null)}>
              Batalkan
            </button>
          </span>
        )}
        {!override && !own && (
          <button type="button" onClick={() => onOverride("total")} title="Jadikan angka ini total dari angka di atasnya">
            Ini total
          </button>
        )}
        {!override && own && (
          <button type="button" onClick={() => onOverride("not-total")} title="Perlakukan sebagai angka biasa">
            Bukan total
          </button>
        )}
        {!override && (
          <button type="button" onClick={() => onOverride("exclude")} title="Keluarkan angka ini dari footing">
            Keluarkan dari footing
          </button>
        )}
      </div>
    </div>
  );
}
