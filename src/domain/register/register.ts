/**
 * Register Excel (`RA_Register`): satu baris per hasil review (saat ini: setiap footing).
 *
 * Fungsi murni: menyusun baris, menggabungkan dengan isi register yang sudah ada (komentar reviewer
 * tidak boleh hilang), dan membaca kembali lokasi angka dari kolom tersembunyi "Lokasi".
 * Penulisan ke Excel ada di services/office/registerService.ts.
 *
 * PDF TIDAK disimpan di workbook. Lokasi = halaman + id angka + kotak koordinat PDF + sidik SHA-256.
 */
import type { NumberToken, PdfBox } from "../pdf/numberTokens";
import type { Footing, FootingResult } from "../footing/verticalFooting";
import type { SnipEvaluation } from "../snip/sumSnip";

export const REGISTER_SHEET = "RA_Register";
export const REGISTER_TABLE = "RA_Register";

export const REGISTER_COLUMNS = [
  "ID",
  "Jenis",
  "Halaman",
  "Label",
  "Nilai dilaporkan",
  "Nilai hitung",
  "Selisih",
  "Status",
  "Komentar",
  "Sidik dokumen",
  "Lokasi",
] as const;

export const COL = {
  id: 0,
  type: 1,
  page: 2,
  label: 3,
  reported: 4,
  computed: 5,
  difference: 6,
  status: 7,
  comment: 8,
  fingerprint: 9,
  location: 10,
} as const;

export type Cell = string | number | boolean;
export type RegisterRow = Cell[];

export const STATUS_TEXT: Record<Footing["status"], string> = {
  foot: "F cocok",
  fail: "✗ selisih",
  open: "○ cek manual",
};
export const STALE_STATUS = "tidak berlaku";
/** Sum snip tanpa total pembanding: hanya jumlah. */
export const SUM_ONLY_STATUS = "Σ jumlah";
/** Jenis baris yang dikelola otomatis oleh aplikasi (boleh diberi status "tidak berlaku"). */
export const MANAGED_TYPES = ["Footing", "Sum snip"];

/** Lokasi angka yang terlibat, disimpan sebagai JSON di kolom tersembunyi. */
export interface RegisterLocation {
  v: 1;
  /** Sidik SHA-256 lengkap dokumen. */
  doc: string;
  page: number;
  /** Id angka yang disorot utama (total). */
  focus: string;
  /** Id semua angka yang terlibat (total + komponen). */
  ids: string[];
  /** Kotak koordinat PDF [halaman, x0, y0, x1, y1] untuk setiap id, sebagai cadangan bila id berubah. */
  boxes: [number, number, number, number, number][];
}

export const shortFingerprint = (fp: string) => fp.slice(0, 12);

const round = (n: number) => Math.round(n * 10) / 10;
const boxOf = (t: NumberToken): [number, number, number, number, number] => [
  t.page,
  round(t.box.x0),
  round(t.box.y0),
  round(t.box.x1),
  round(t.box.y1),
];

/** Baris register untuk setiap footing (F, ✗, dan ○), urut halaman lalu posisi. */
export function footingRows(result: FootingResult, tokens: NumberToken[], fingerprint: string): RegisterRow[] {
  const byId = new Map(tokens.map((t) => [t.id, t]));
  const rows: RegisterRow[] = [];
  for (const f of result.footings) {
    if (f.snipId) continue; // baris sum snip disusun oleh snipRows
    const total = byId.get(f.totalId);
    if (!total) continue;
    const involved = [total, ...f.componentIds.map((id) => byId.get(id)).filter((t): t is NumberToken => !!t)];
    const loc: RegisterLocation = {
      v: 1,
      doc: fingerprint,
      page: f.page,
      focus: total.id,
      ids: involved.map((t) => t.id),
      boxes: involved.map(boxOf),
    };
    const row: RegisterRow = [];
    row[COL.id] = `F-${total.id}`;
    row[COL.type] = "Footing";
    row[COL.page] = f.page;
    row[COL.label] = total.label || "(tanpa label)";
    row[COL.reported] = f.reported;
    row[COL.computed] = f.computed;
    row[COL.difference] = f.difference;
    row[COL.status] = STATUS_TEXT[f.status];
    row[COL.comment] = "";
    row[COL.fingerprint] = shortFingerprint(fingerprint);
    row[COL.location] = JSON.stringify(loc);
    rows.push(row);
  }
  return rows;
}

const SNIP_STATUS: Record<SnipEvaluation["status"], string> = {
  foot: STATUS_TEXT.foot,
  fail: STATUS_TEXT.fail,
  open: STATUS_TEXT.open,
  sum: SUM_ONLY_STATUS,
};

/** Baris register untuk setiap sum snip (dengan atau tanpa total pembanding). */
export function snipRows(evals: SnipEvaluation[], fingerprint: string): RegisterRow[] {
  return evals
    .filter((ev) => ev.tokens.length > 0)
    .map((ev) => {
      const focus = ev.total ?? ev.tokens[0];
      const loc: RegisterLocation = {
        v: 1,
        doc: fingerprint,
        page: ev.snip.page,
        focus: focus.id,
        ids: ev.tokens.map((t) => t.id),
        boxes: ev.tokens.map(boxOf),
      };
      const row: RegisterRow = [];
      row[COL.id] = `S-${ev.snip.id}`;
      row[COL.type] = "Sum snip";
      row[COL.page] = ev.snip.page;
      row[COL.label] = ev.total
        ? ev.total.label || "(tanpa label)"
        : `${focus.label || "(tanpa label)"} (${ev.tokens.length} angka)`;
      row[COL.reported] = ev.total ? (ev.total.parsed.value ?? "") : "";
      row[COL.computed] = ev.sum;
      row[COL.difference] = ev.difference ?? "";
      row[COL.status] = SNIP_STATUS[ev.status];
      row[COL.comment] = "";
      row[COL.fingerprint] = shortFingerprint(fingerprint);
      row[COL.location] = JSON.stringify(loc);
      return row;
    });
}

/** Semua baris register untuk dokumen ini: footing otomatis (bila dijalankan) + semua sum snip. */
export function registerRows(
  footing: FootingResult | null,
  snips: SnipEvaluation[],
  tokens: NumberToken[],
  fingerprint: string,
): RegisterRow[] {
  return [...(footing ? footingRows(footing, tokens, fingerprint) : []), ...snipRows(snips, fingerprint)];
}

export interface RegisterPlan {
  /** Baris lama yang diperbarui (indeks baris badan tabel). */
  updates: { index: number; row: RegisterRow }[];
  /** Baris lama dari dokumen yang sama yang tidak lagi dihasilkan (mis. setelah koreksi "bukan total"). */
  stale: number[];
  /** Baris kosong yang bisa dipakai ulang (tabel Excel baru selalu punya satu baris kosong). */
  fillBlank: { index: number; row: RegisterRow }[];
  /** Baris baru yang ditambahkan di bawah. */
  appends: RegisterRow[];
}

const isBlank = (row: Cell[]) => row.every((c) => c === "" || c === null || c === undefined);

/**
 * Gabungkan hasil baru dengan isi register yang ada.
 * - Baris dengan ID + sidik yang sama diperbarui; KOMENTAR reviewer dipertahankan.
 * - Baris footing lama dari dokumen yang sama yang tidak muncul lagi → status "tidak berlaku" (tidak dihapus).
 * - Baris milik dokumen lain / jenis lain tidak disentuh.
 */
export function planRegisterUpdate(existing: Cell[][], fresh: RegisterRow[], types: string[] = MANAGED_TYPES): RegisterPlan {
  const plan: RegisterPlan = { updates: [], stale: [], fillBlank: [], appends: [] };
  const key = (r: Cell[]) => `${r[COL.id]}|${r[COL.fingerprint]}`;
  const freshByKey = new Map(fresh.map((r) => [key(r), r]));
  const seen = new Set<string>();
  const blanks: number[] = [];
  const fps = new Set(fresh.map((r) => r[COL.fingerprint]));

  existing.forEach((old, index) => {
    if (isBlank(old)) {
      blanks.push(index);
      return;
    }
    const k = key(old);
    const next = freshByKey.get(k);
    if (next && !seen.has(k)) {
      seen.add(k);
      const row = [...next];
      if (String(old[COL.comment] ?? "") !== "") row[COL.comment] = old[COL.comment];
      plan.updates.push({ index, row });
    } else if (
      types.includes(String(old[COL.type])) &&
      fps.has(old[COL.fingerprint]) &&
      old[COL.status] !== STALE_STATUS
    ) {
      plan.stale.push(index);
    }
  });

  const remaining = fresh.filter((r) => !seen.has(key(r)));
  remaining.forEach((row, i) => {
    if (i < blanks.length) plan.fillBlank.push({ index: blanks[i], row });
    else plan.appends.push(row);
  });
  return plan;
}

/** Baca kolom "Lokasi"; null bila kosong/rusak (mis. baris yang diketik manual). */
export function parseLocation(value: unknown): RegisterLocation | null {
  if (typeof value !== "string" || !value.startsWith("{")) return null;
  try {
    const loc = JSON.parse(value) as RegisterLocation;
    if (loc?.v !== 1 || typeof loc.doc !== "string" || !Array.isArray(loc.ids) || typeof loc.page !== "number") {
      return null;
    }
    return loc;
  } catch {
    return null;
  }
}

/**
 * Cari kembali angka-angka dari lokasi register di dokumen yang sedang terbuka.
 * Pakai id; bila id tidak ditemukan (mis. format angka diganti), pakai kotak koordinat terdekat.
 */
export function resolveLocation(loc: RegisterLocation, tokens: NumberToken[]): NumberToken[] {
  const byId = new Map(tokens.map((t) => [t.id, t]));
  return loc.ids
    .map((id, i) => {
      const hit = byId.get(id);
      if (hit) return hit;
      const b = loc.boxes[i];
      if (!b) return undefined;
      const [page, x0, y0, x1, y1] = b;
      const target: PdfBox = { x0, y0, x1, y1 };
      let best: NumberToken | undefined;
      let bestD = 3; // satuan PDF; lebih jauh dari ini dianggap tidak ada
      for (const t of tokens) {
        if (t.page !== page) continue;
        const d = Math.abs(t.box.x1 - target.x1) + Math.abs(t.box.y0 - target.y0);
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      return best;
    })
    .filter((t): t is NumberToken => !!t);
}
