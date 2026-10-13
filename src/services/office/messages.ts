/**
 * Pesan antara jendela besar (dialog Office) dan panel samping (task pane).
 *
 * Dialog tidak bisa menulis ke workbook, jadi hasil footing dari jendela besar dikirim ke panel samping,
 * dan panel samping yang menulis ke Excel. Pesan besar dipotong-potong (chunk) agar aman dari batas
 * ukuran pesan Office.
 */
import type { SelectionPayload } from "./officeService";
import type { RegisterPick } from "./registerService";

/** Potongan data register (JSON baris) dari jendela besar → panel samping. */
export interface RegisterChunk {
  type: "register-chunk";
  batch: string;
  index: number;
  total: number;
  data: string;
}

/** Hasil penulisan register dari panel samping → jendela besar. */
export interface RegisterStatusMsg {
  type: "register-status";
  ok: boolean;
  text: string;
}

/** Klik baris register di Excel, diteruskan panel samping → jendela besar. */
export interface RegisterPickMsg {
  type: "register-pick";
  pick: RegisterPick;
}

export type ToPaneMessage = SelectionPayload | RegisterChunk;
export type ToDialogMessage = RegisterStatusMsg | RegisterPickMsg;

/** Ukuran aman per pesan (karakter). */
export const CHUNK_SIZE = 12_000;

export function toChunks(json: string, batch: string, size = CHUNK_SIZE): RegisterChunk[] {
  const total = Math.max(1, Math.ceil(json.length / size));
  return Array.from({ length: total }, (_, index) => ({
    type: "register-chunk" as const,
    batch,
    index,
    total,
    data: json.slice(index * size, (index + 1) * size),
  }));
}

/** Menyusun kembali potongan; mengembalikan JSON utuh bila semua potongan satu batch sudah diterima. */
export class ChunkAssembler {
  private batch = "";
  private parts: string[] = [];
  private received = 0;

  add(c: RegisterChunk): string | null {
    if (c.batch !== this.batch) {
      // Batch baru menggantikan yang lama (yang lama mungkin tidak lengkap).
      this.batch = c.batch;
      this.parts = new Array(c.total).fill(undefined);
      this.received = 0;
    }
    if (this.parts[c.index] === undefined) {
      this.parts[c.index] = c.data;
      this.received++;
    }
    if (this.received < c.total) return null;
    const json = this.parts.join("");
    this.batch = "";
    this.parts = [];
    this.received = 0;
    return json;
  }
}

/** Parse pesan JSON yang diterima; null bila bukan pesan Report Audit. */
export function parseMessage<T extends { type: string }>(raw: string): T | null {
  try {
    const m = JSON.parse(raw) as T;
    return m && typeof m.type === "string" ? m : null;
  } catch {
    return null;
  }
}
