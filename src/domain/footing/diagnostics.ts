/**
 * Diagnostik satu halaman untuk dikirim ke pengembang TANPA membagikan PDF atau angka asli.
 * Semua digit (di angka maupun label) diganti "9"; yang tersisa hanya struktur: label baris, posisi kolom,
 * tebal/tidak, garis di atas angka, dan status footing. Pengguna tetap memeriksa teksnya sebelum mengirim.
 */
import type { NumberToken } from "../pdf/numberTokens";
import type { HRule } from "../pdf/rules";
import type { FootingResult } from "./verticalFooting";

export const mask = (s: string) => s.replace(/\d/g, "9");

const r1 = (n: number) => Math.round(n);

export interface DiagnosticsInput {
  page: number;
  tokens: NumberToken[];
  rules: HRule[] | null;
  boldFonts: Set<string>;
  footing: FootingResult | null;
}

export function pageDiagnostics({ page, tokens, rules, boldFonts, footing }: DiagnosticsInput): string {
  const pageTokens = tokens.filter((t) => t.page === page).sort((a, b) => b.box.y1 - a.box.y1 || a.box.x0 - b.box.x0);
  const out: string[] = [];
  out.push(`Report Audit — diagnostik hal. ${page} (angka disamarkan: semua digit = 9)`);
  out.push(
    rules
      ? `Garis horizontal: ${rules.length}` +
          (rules.length ? ` → ${rules.map((r) => `y${r1(r.y)}:x${r1(r.x0)}-${r1(r.x1)}`).join(", ")}` : "")
      : "Garis horizontal: belum dibaca (jalankan footing dulu)",
  );
  out.push("y | x-kanan | angka | tebal | jenis | status | label");
  for (const t of pageTokens) {
    const st = footing?.byToken.get(t.id);
    const f = st?.footingId ? footing?.footings.find((x) => x.id === st.footingId) : undefined;
    const bold = t.fontNames.length > 0 && t.fontNames.every((n) => boldFonts.has(n));
    const status = st
      ? `${st.mark}${f ? ` total(${f.basis.join("+")}, ${f.componentIds.length} komp)` : ""}`
      : "-";
    out.push(
      [
        r1(t.box.y0),
        r1(t.box.x1),
        mask(t.text) + (t.source.length > 1 ? " (terpecah)" : ""),
        bold ? "tebal" : "",
        t.prose ? "kalimat" : t.hint,
        status,
        mask(t.label),
      ].join(" | "),
    );
  }
  return out.join("\n");
}
