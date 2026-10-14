/**
 * Tie yang DIKONFIRMASI reviewer: dua angka di lokasi berbeda (mis. laporan posisi keuangan ↔ catatan)
 * dinyatakan sama oleh reviewer. Sistem hanya menyarankan (nilai sama); konfirmasi = keputusan reviewer.
 * Tanda (kurung/minus) boleh berbeda — perbedaan tanda tetap dicatat.
 *
 * Fungsi murni.
 */
import type { NumberToken } from "../pdf/numberTokens";
import { exactDifference } from "../footing/verticalFooting";

export interface Tie {
  /** Id stabil dari pasangan angka (urutan tidak berpengaruh). */
  id: string;
  a: string;
  b: string;
}

/** Id tie dari dua id angka, tidak bergantung urutan. */
export function tieId(x: string, y: string): string {
  return [x, y].sort().join("~");
}

export function makeTie(x: string, y: string): Tie {
  const [a, b] = [x, y].sort();
  return { id: tieId(a, b), a, b };
}

export interface TieEvaluation {
  tie: Tie;
  a: NumberToken | null;
  b: NumberToken | null;
  /** |a| − |b| (tie dikonfirmasi seharusnya 0). */
  difference: number | null;
  signDiffers: boolean;
}

export function evaluateTie(tie: Tie, byId: Map<string, NumberToken>): TieEvaluation {
  const a = byId.get(tie.a) ?? null;
  const b = byId.get(tie.b) ?? null;
  if (!a || !b) return { tie, a, b, difference: null, signDiffers: false };
  const va = a.parsed.value ?? 0;
  const vb = b.parsed.value ?? 0;
  return {
    tie,
    a,
    b,
    difference: exactDifference(Math.abs(va), [Math.abs(vb)]).difference,
    signDiffers: Math.sign(va) !== Math.sign(vb) && va !== 0 && vb !== 0,
  };
}

/** Id angka-angka yang sudah di-tie dengan angka tertentu. */
export function tiedWith(tokenId: string, ties: Tie[]): string[] {
  return ties.flatMap((t) => (t.a === tokenId ? [t.b] : t.b === tokenId ? [t.a] : []));
}
