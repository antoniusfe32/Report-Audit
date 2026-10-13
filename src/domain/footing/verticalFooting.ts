/**
 * Auto footing VERTIKAL untuk seluruh dokumen.
 *
 * Cara kerja (per halaman, per kolom):
 * 1. Kolom = angka yang tepi kanannya rata vertikal. Angka di dalam kalimat, tahun, dan kolom nomor
 *    catatan tidak ikut.
 * 2. Kolom dipecah menjadi blok tabel bila di antara dua angka ada teks yang melintang di atas kolom
 *    (judul kolom, tahun "2025", paragraf).
 * 3. Angka dianggap TOTAL bila ada garis horizontal tepat di atasnya, labelnya diawali
 *    "Jumlah/Total/Neto", atau ditandai manual oleh pengguna.
 * 4. Komponen total = angka-angka "terbuka" tepat di atasnya. Semua angka biasa sejak total sebelumnya
 *    WAJIB ikut; boleh diperluas ke atas mencakup total sebelumnya (subtotal berjalan, mis. laba bruto →
 *    laba sebelum pajak) atau beberapa subtotal (Jumlah aset lancar + tidak lancar = JUMLAH ASET).
 * 5. Toleransi 0: cocok hanya bila selisih tepat 0 (dihitung dengan bilangan bulat, bebas galat pecahan).
 *
 * Sistem lebih baik berkata "○ cek manual" daripada salah memberi F. Karena itu F dibatalkan bila
 * ada angka ambigu, skala belum ditetapkan, atau tabel kemungkinan lanjutan dari halaman sebelumnya.
 *
 * Fungsi murni: tidak bergantung pada pdf.js atau React.
 */
import type { NumberToken, RawTextItem } from "../pdf/numberTokens";
import type { HRule } from "../pdf/rules";
import type { Scale } from "./scale";

/** Koreksi manual pengguna untuk satu angka. */
export type Override = "total" | "not-total" | "exclude";
export type Overrides = Record<string, Override>;

/** ✓ komponen cocok · F total cocok · ✗ total selisih · ○ belum tercakup / perlu cek manual. */
export type Mark = "check" | "foot" | "fail" | "open";
export type TotalBasis = "garis" | "label" | "manual";

export interface Footing {
  id: string;
  page: number;
  totalId: string;
  componentIds: string[];
  reported: number;
  computed: number;
  /** Nilai dilaporkan − nilai hitung. */
  difference: number;
  status: "foot" | "fail" | "open";
  /** Penjelasan untuk tooltip/panel; kosong bila cocok tanpa catatan. */
  reason: string;
  basis: TotalBasis[];
}

export interface TokenStatus {
  mark: Mark;
  reason: string;
  /** Footing di mana angka ini adalah totalnya. */
  footingId?: string;
  /** Footing di mana angka ini menjadi komponen. */
  componentOf?: string;
  /** Untuk total: nilai dilaporkan − nilai hitung. */
  difference?: number;
}

export interface FootingSummary {
  foot: number;
  fail: number;
  /** Total yang tidak bisa disimpulkan (perlu cek manual). */
  openTotals: number;
  check: number;
  /** Semua angka bertanda ○. */
  open: number;
}

export interface FootingResult {
  footings: Footing[];
  byToken: Map<string, TokenStatus>;
  summary: FootingSummary;
}

export interface FootingInput {
  tokens: NumberToken[];
  /** Text item per halaman (indeks 0 = hal. 1). */
  textItems: RawTextItem[][];
  /** Garis horizontal per halaman (indeks 0 = hal. 1). */
  rules: HRule[][];
  /** Skala efektif per halaman; null = belum ditetapkan. */
  scales: (Scale | null)[];
  overrides?: Overrides;
}

const TOTAL_LABEL_RE = /^(jumlah|total|sub[\s-]?(jumlah|total)|neto|bersih)\b/i;

// ---------------------------------------------------------------------------
// Kolom
// ---------------------------------------------------------------------------

export interface Column {
  page: number;
  tokens: NumberToken[]; // urut atas → bawah
  /** Rentang horizontal kolom (satuan PDF). */
  x0: number;
  x1: number;
  /** Posisi tepi kanan (median). */
  right: number;
}

const fontHeight = (t: NumberToken) => (t.box.y1 - t.box.y0) / 1.1;
const isYear = (t: NumberToken) => t.hint === "likely-year" && !t.prose;

/** Kelompokkan angka satu halaman menjadi kolom berdasarkan tepi kanan yang rata. */
export function buildColumns(pageTokens: NumberToken[]): Column[] {
  const candidates = pageTokens
    .filter((t) => !t.prose && t.hint !== "likely-year" && t.parsed.value !== null)
    .sort((a, b) => a.box.x1 - b.box.x1);

  const clusters: NumberToken[][] = [];
  for (const t of candidates) {
    const last = clusters[clusters.length - 1];
    const tol = Math.max(3.5, 0.45 * fontHeight(t));
    if (last && t.box.x1 - last[last.length - 1].box.x1 <= tol) last.push(t);
    else clusters.push([t]);
  }

  const columns: Column[] = [];
  for (const cluster of clusters) {
    const sorted = [...cluster].sort((a, b) => b.box.y1 - a.box.y1 || a.box.x0 - b.box.x0);
    if (!sorted.some((t) => t.hint === "amount")) continue; // kolom nomor catatan
    // Angka kecil tanpa pemisah (mirip nomor catatan / nomor halaman) hanya ikut bila berada DI DALAM
    // tabel: diapit nominal, atau tepat di bawah nominal (bukan nomor halaman jauh di kaki halaman).
    const kept: NumberToken[] = [];
    sorted.forEach((t, i) => {
      if (t.hint === "amount") {
        kept.push(t);
        return;
      }
      const prev = kept[kept.length - 1];
      const below = sorted.slice(i + 1).some((u) => u.hint === "amount");
      const near = prev && prev.box.y0 - t.box.y1 <= 2.5 * fontHeight(t);
      if (prev && (below || near)) kept.push(t);
    });
    const rights = kept.map((t) => t.box.x1).sort((a, b) => a - b);
    columns.push({
      page: kept[0].page,
      tokens: kept,
      x0: Math.min(...kept.map((t) => t.box.x0)),
      x1: Math.max(...kept.map((t) => t.box.x1)),
      right: rights[Math.floor(rights.length / 2)],
    });
  }
  return columns;
}

function hasLetters(s: string): boolean {
  return /[A-Za-zÀ-ÿ]{2,}/.test(s);
}

function overlaps(a0: number, a1: number, b0: number, b1: number, min: number): boolean {
  return Math.min(a1, b1) - Math.max(a0, b0) >= min;
}

/** Pecah kolom menjadi blok tabel: teks/tahun yang melintang di atas kolom = awal tabel baru. */
export function splitBlocks(col: Column, items: RawTextItem[], pageTokens: NumberToken[]): NumberToken[][] {
  const barriers: { mid: number }[] = [];
  for (const it of items) {
    if (!hasLetters(it.str)) continue;
    const x0 = it.transform[4];
    const x1 = x0 + it.width;
    const h = it.height || Math.abs(it.transform[3]) || 8;
    if (overlaps(x0, x1, col.x0, col.x1, Math.min(6, 0.5 * (x1 - x0)))) {
      barriers.push({ mid: it.transform[5] + 0.3 * h });
    }
  }
  for (const t of pageTokens) {
    if (isYear(t) && overlaps(t.box.x0, t.box.x1, col.x0, col.x1, 0.5 * (t.box.x1 - t.box.x0))) {
      barriers.push({ mid: (t.box.y0 + t.box.y1) / 2 });
    }
  }

  const blocks: NumberToken[][] = [];
  let cur: NumberToken[] = [];
  col.tokens.forEach((t, i) => {
    const above = col.tokens[i - 1];
    if (above && barriers.some((b) => b.mid < above.box.y0 && b.mid > t.box.y1)) {
      blocks.push(cur);
      cur = [];
    }
    cur.push(t);
  });
  if (cur.length) blocks.push(cur);
  return blocks;
}

// ---------------------------------------------------------------------------
// Garis total
// ---------------------------------------------------------------------------

type LineMark = "above" | "double-below-previous" | null;

/** Apakah ada garis tepat di atas angka `t` (dan di bawah angka `above` di kolom yang sama)? */
export function lineAbove(t: NumberToken, above: NumberToken | undefined, rules: HRule[]): LineMark {
  const h = fontHeight(t);
  const bottom = t.box.y1 - 1.5;
  const top = Math.min(above ? above.box.y0 + 1.5 : Infinity, t.box.y1 + 1.6 * h);
  const width = t.box.x1 - t.box.x0;
  const hits = rules.filter(
    (r) => r.y >= bottom && r.y <= top && overlaps(r.x0, r.x1, t.box.x0, t.box.x1, 0.5 * width),
  );
  if (hits.length === 0) return null;
  // Dua garis berdekatan = garis ganda di BAWAH total sebelumnya, bukan penanda angka ini.
  const double = hits.some((a) => hits.some((b) => a !== b && Math.abs(a.y - b.y) <= 4));
  if (double) return above ? "double-below-previous" : null;
  return "above";
}

// ---------------------------------------------------------------------------
// Aritmetika tepat (toleransi 0)
// ---------------------------------------------------------------------------

function decimals(v: number): number {
  const s = String(Math.abs(v));
  if (s.includes("e")) return 6;
  const i = s.indexOf(".");
  return i < 0 ? 0 : Math.min(6, s.length - i - 1);
}

/** Bandingkan total dengan jumlah komponen memakai bilangan bulat (tanpa galat pecahan). */
export function exactDifference(reported: number, components: number[]): { computed: number; difference: number } {
  const d = Math.max(decimals(reported), ...components.map(decimals));
  const f = 10 ** d;
  const sum = components.reduce((acc, v) => acc + Math.round(v * f), 0);
  const rep = Math.round(reported * f);
  return { computed: sum / f, difference: (rep - sum) / f };
}

// ---------------------------------------------------------------------------
// Footing
// ---------------------------------------------------------------------------

interface Entry {
  token: NumberToken;
  isTotal: boolean;
}

interface ColumnTail {
  right: number;
  trailingItems: number;
}

const value = (t: NumberToken) => t.parsed.value ?? 0;

function describe(t: NumberToken): string {
  return `${t.label || "(tanpa label)"} ${t.text} (hal. ${t.page})`;
}

export function computeVerticalFooting(input: FootingInput): FootingResult {
  const overrides = input.overrides ?? {};
  const footings: Footing[] = [];
  const byToken = new Map<string, TokenStatus>();
  const notes = new Map<string, string>(); // catatan untuk angka yang tidak jadi total
  const inColumn = new Set<string>();

  const pageCount = Math.max(input.textItems.length, ...input.tokens.map((t) => t.page), 0);
  const tokensByPage = new Map<number, NumberToken[]>();
  for (const t of input.tokens) {
    const list = tokensByPage.get(t.page) ?? [];
    list.push(t);
    tokensByPage.set(t.page, list);
  }

  let prevTails: ColumnTail[] = [];

  for (let page = 1; page <= pageCount; page++) {
    const pageTokens = tokensByPage.get(page) ?? [];
    const items = input.textItems[page - 1] ?? [];
    const rules = input.rules[page - 1] ?? [];
    const scale = input.scales[page - 1] ?? null;
    const tails: ColumnTail[] = [];

    for (const col of buildColumns(pageTokens)) {
      for (const t of col.tokens) inColumn.add(t.id);
      const active = col.tokens.filter((t) => overrides[t.id] !== "exclude");
      if (active.length === 0) continue;

      // Garis di atas setiap angka (dihitung pada urutan kolom tanpa angka yang dikeluarkan).
      const lines = new Map<string, LineMark>();
      active.forEach((t, i) => lines.set(t.id, lineAbove(t, active[i - 1], rules)));
      const lined = [...lines.values()].filter((v) => v === "above").length;
      // Garis di atas hampir semua angka = border tabel (grid), bukan penanda total.
      const gridLike = active.length >= 4 && lined / active.length > 0.6;

      const continued = prevTails.some((p) => Math.abs(p.right - col.right) <= 6 && p.trailingItems > 0);
      const firstId = active[0].id;
      let firstTotalSeen = false;

      const activeCol: Column = { ...col, tokens: active };
      const blocks = splitBlocks(activeCol, items, pageTokens);
      let lastOpen: Entry[] = [];

      for (const block of blocks) {
        const open: Entry[] = [];
        for (const t of block) {
          const ov = overrides[t.id];
          const basis: TotalBasis[] = [];
          if (ov === "total") basis.push("manual");
          if (ov !== "not-total") {
            if (!gridLike && lines.get(t.id) === "above") basis.push("garis");
            if (TOTAL_LABEL_RE.test(t.label.trim())) basis.push("label");
          }
          if (basis.length === 0) {
            open.push({ token: t, isTotal: false });
            continue;
          }
          const lineOnly = basis.length === 1 && basis[0] === "garis";

          // Angka biasa sejak total terakhir WAJIB ikut.
          let loose = 0;
          for (let i = open.length - 1; i >= 0 && !open[i].isTotal; i--) loose++;
          const minK = loose > 0 ? loose : 2;

          type Cand = { k: number; computed: number; difference: number };
          const cands: Cand[] = [];
          for (let k = minK; k <= open.length; k++) {
            const set = open.slice(open.length - k).map((e) => value(e.token));
            cands.push({ k, ...exactDifference(value(t), set) });
          }
          const exact = cands.find((c) => c.difference === 0);
          const best =
            exact ??
            [...cands].sort((a, b) => Math.abs(a.difference) - Math.abs(b.difference) || a.k - b.k)[0];

          if (!best || (lineOnly && loose === 0 && !exact)) {
            if (lineOnly) {
              // Garis tanpa komponen yang masuk akal (mis. garis bawah judul kolom): bukan total.
              notes.set(
                t.id,
                "Ada garis di atas angka ini, tetapi tidak ada susunan komponen yang cocok; diperlakukan sebagai angka biasa.",
              );
              open.push({ token: t, isTotal: false });
              continue;
            }
          }

          const components = best ? open.slice(open.length - best.k) : [];
          const reasons: string[] = [];
          let status: Footing["status"] = best && best.difference === 0 ? "foot" : best ? "fail" : "open";
          if (!best) reasons.push("Tidak ada angka di atasnya untuk dijumlahkan.");

          const involved = [t, ...components.map((e) => e.token)];
          const ambiguous = involved.filter((x) => x.parsed.ambiguous);
          if (ambiguous.length) {
            status = "open";
            reasons.push(
              `Format angka ambigu (${ambiguous.map((x) => x.text).join(", ")}); hasil tidak bisa disimpulkan.`,
            );
          }
          if (!firstTotalSeen && continued && components.some((e) => e.token.id === firstId)) {
            status = "open";
            reasons.push(
              "Tabel kemungkinan lanjutan dari halaman sebelumnya; komponen di halaman sebelumnya tidak ikut dihitung.",
            );
          }
          if (status === "foot" && !scale) {
            status = "open";
            reasons.push("Skala angka (mis. ribuan Rupiah) belum ditetapkan.");
          }
          firstTotalSeen = true;

          const footing: Footing = {
            id: `f-${t.id}`,
            page,
            totalId: t.id,
            componentIds: components.map((e) => e.token.id),
            reported: value(t),
            computed: best?.computed ?? 0,
            difference: best?.difference ?? value(t),
            status,
            reason: reasons.join(" "),
            basis,
          };
          footings.push(footing);
          open.splice(open.length - components.length, components.length);
          open.push({ token: t, isTotal: true });
        }
        lastOpen = open;
      }

      let trailing = 0;
      for (let i = lastOpen.length - 1; i >= 0 && !lastOpen[i].isTotal; i--) trailing++;
      tails.push({ right: col.right, trailingItems: trailing });
    }
    prevTails = tails;
  }

  // ---------------- Tanda per angka ----------------
  const tokenById = new Map(input.tokens.map((t) => [t.id, t]));
  for (const f of footings) {
    const mark: Mark = f.status === "foot" ? "foot" : f.status === "fail" ? "fail" : "open";
    byToken.set(f.totalId, { mark, reason: totalReason(f), footingId: f.id, difference: f.difference });
  }
  for (const f of footings) {
    const total = tokenById.get(f.totalId)!;
    for (const id of f.componentIds) {
      const existing = byToken.get(id);
      if (existing?.footingId) {
        existing.componentOf = f.id;
        continue;
      }
      byToken.set(id, {
        mark: f.status === "foot" ? "check" : "open",
        reason:
          f.status === "foot"
            ? `Komponen dari ${describe(total)} — cocok.`
            : `Komponen dari ${describe(total)} yang ${f.status === "fail" ? "✗ tidak cocok" : "perlu cek manual"}.`,
        componentOf: f.id,
      });
    }
  }
  for (const t of input.tokens) {
    if (byToken.has(t.id)) continue;
    if (overrides[t.id] === "exclude") {
      byToken.set(t.id, { mark: "open", reason: "Dikeluarkan dari footing (koreksi manual)." });
    } else if (t.hint === "amount" || inColumn.has(t.id)) {
      byToken.set(t.id, {
        mark: "open",
        reason: notes.get(t.id) ?? "Belum tercakup footing mana pun — cek manual.",
      });
    }
  }

  const marks = [...byToken.values()];
  return {
    footings,
    byToken,
    summary: {
      foot: footings.filter((f) => f.status === "foot").length,
      fail: footings.filter((f) => f.status === "fail").length,
      openTotals: footings.filter((f) => f.status === "open").length,
      check: marks.filter((m) => m.mark === "check").length,
      open: marks.filter((m) => m.mark === "open").length,
    },
  };
}

const BASIS_TEXT: Record<TotalBasis, string> = {
  garis: "garis di atas angka",
  label: "label baris",
  manual: "ditandai manual",
};

function totalReason(f: Footing): string {
  const n = f.componentIds.length;
  const via = `Total (${f.basis.map((b) => BASIS_TEXT[b]).join(" + ")}), ${n} komponen.`;
  if (f.status === "foot") return `${via} Selisih 0.${f.reason ? ` ${f.reason}` : ""}`;
  if (f.status === "fail") return `${via} Selisih ${formatDiff(f.difference)}.${f.reason ? ` ${f.reason}` : ""}`;
  return `${via} Perlu cek manual: ${f.reason}${n ? ` (selisih terhitung ${formatDiff(f.difference)})` : ""}`;
}

/** "1" / "-1" / "1.250" — format Indonesia, tanda tetap terlihat. */
export function formatDiff(d: number): string {
  const s = Math.abs(d).toLocaleString("id-ID", { maximumFractionDigits: 6 });
  return d < 0 ? `-${s}` : s;
}
