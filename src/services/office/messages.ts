/**
 * Pesan antara jendela besar (dialog Office) dan panel samping (task pane).
 *
 * - Dialog tidak bisa menulis ke workbook → hasil footing dikirim ke panel samping, panel yang menulis.
 * - Dialog dan panel tidak berbagi memori/penyimpanan secara andal (storage partitioning di Excel web)
 *   → isi PDF + progres review dikirim lewat pesan, dipotong-potong (chunk) base64, lalu penerima
 *   membangun ulang file dan memverifikasi sidik SHA-256.
 * PDF hanya berpindah di dalam komputer pengguna (antar jendela add-in); tidak ada yang dikirim ke server.
 */
import type { SelectionPayload } from "./officeService";
import type { RegisterPick } from "./registerService";
import type { SessionState } from "../../app/session";

export type ChunkChannel = "register" | "pdf";

/** Keterangan PDF yang dipindahkan (ikut di potongan pertama). */
export interface PdfMeta {
  fileName: string;
  fingerprint: string;
  state: SessionState;
}

export interface ChunkMsg {
  type: "chunk";
  channel: ChunkChannel;
  batch: string;
  index: number;
  total: number;
  data: string;
  meta?: PdfMeta;
}

export interface RegisterStatusMsg {
  type: "register-status";
  ok: boolean;
  text: string;
}
export interface RegisterPickMsg {
  type: "register-pick";
  pick: RegisterPick;
}
/** Progres review terbaru (tanpa isi PDF). */
export interface SessionStateMsg {
  type: "session-state";
  fingerprint: string;
  state: SessionState;
}
/** Jendela besar siap menerima PDF dari panel samping. */
export interface DialogReadyMsg {
  type: "dialog-ready";
}

export type ToPaneMessage = SelectionPayload | ChunkMsg | SessionStateMsg | DialogReadyMsg;
export type ToDialogMessage = RegisterStatusMsg | RegisterPickMsg | ChunkMsg;

/** Ukuran per pesan (karakter). Batas resmi tidak didokumentasikan; nilai ini konservatif. */
export const CHUNK_SIZE = 64_000;

export function toChunks(channel: ChunkChannel, data: string, batch: string, meta?: PdfMeta, size = CHUNK_SIZE): ChunkMsg[] {
  const total = Math.max(1, Math.ceil(data.length / size));
  return Array.from({ length: total }, (_, index) => ({
    type: "chunk" as const,
    channel,
    batch,
    index,
    total,
    data: data.slice(index * size, (index + 1) * size),
    ...(index === 0 && meta ? { meta } : {}),
  }));
}

/** Menyusun kembali potongan satu kanal; mengembalikan data utuh (+ meta) bila batch sudah lengkap. */
export class ChunkAssembler {
  private batch = "";
  private parts: (string | undefined)[] = [];
  private received = 0;
  private meta: PdfMeta | undefined;

  add(c: ChunkMsg): { data: string; meta?: PdfMeta } | null {
    if (c.batch !== this.batch) {
      // Batch baru menggantikan yang lama (yang lama mungkin tidak lengkap).
      this.batch = c.batch;
      this.parts = new Array(c.total).fill(undefined);
      this.received = 0;
      this.meta = undefined;
    }
    if (c.meta) this.meta = c.meta;
    if (this.parts[c.index] === undefined) {
      this.parts[c.index] = c.data;
      this.received++;
    }
    if (this.received < c.total) return null;
    const out = { data: this.parts.join(""), meta: this.meta };
    this.batch = "";
    this.parts = [];
    this.received = 0;
    this.meta = undefined;
    return out;
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

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
