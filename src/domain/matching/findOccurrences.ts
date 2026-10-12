/**
 * Pencarian angka yang sama di seluruh dokumen (versi awal untuk eksperimen).
 *
 * Hasilnya hanya SARAN lokasi. Angka yang sama belum tentu berhubungan;
 * keputusan tie tetap di tangan reviewer.
 */
import type { NumberToken } from "../pdf/numberTokens";

export type MatchType = "same-value" | "sign-mismatch";

export interface Occurrence {
  token: NumberToken;
  match: MatchType;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

export function findOccurrences(selected: NumberToken, all: NumberToken[]): Occurrence[] {
  const v = selected.parsed.value;
  if (v === null || v === 0) return []; // nol/dash terlalu umum untuk dicari

  const out: Occurrence[] = [];
  for (const t of all) {
    if (t.id === selected.id) continue;
    const tv = t.parsed.value;
    if (tv === null || tv === 0) continue;
    // Nomor catatan & tahun hanya dicocokkan dengan sesama jenisnya
    if ((t.hint === "amount") !== (selected.hint === "amount")) continue;

    if (nearlyEqual(tv, v)) out.push({ token: t, match: "same-value" });
    else if (nearlyEqual(Math.abs(tv), Math.abs(v))) out.push({ token: t, match: "sign-mismatch" });
  }
  return out.sort((a, b) => a.token.page - b.token.page || b.token.box.y1 - a.token.box.y1);
}
