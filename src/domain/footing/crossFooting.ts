/**
 * Cross footing HORIZONTAL: untuk tabel bertotal kolom (mutasi ekuitas, mutasi aset tetap / aset hak guna,
 * tabel segmen), setiap baris dicek: angka paling kanan = jumlah angka di kirinya.
 * Bersama footing vertikal, tabel mutasi tercek dua arah.
 *
 * Baris hanya dicek bila:
 * - ada ≥ 3 angka di kolom angka (2 kolom = laporan komparatif 2025/2024, bukan tabel mutasi),
 * - judul kolom paling kanan menunjukkan total ("Jumlah", "Total", "Saldo akhir", "31 Desember", "Nilai tercatat"),
 * - judul kolom tidak semuanya tanggal/tahun (tabel komparatif beberapa periode bukan tabel mutasi).
 *
 * Toleransi 0. Kurung = negatif. Bila kolom berjudul "Pengurangan/Penghapusan/Pelepasan" disajikan TANPA kurung
 * dan baris hanya cocok bila kolom itu dikurangkan, hasilnya cocok DENGAN keterangan (tidak diam-diam).
 *
 * Fungsi murni.
 */
import type { NumberToken, RawTextItem } from "../pdf/numberTokens";
import type { Scale } from "./scale";
import type { Overrides } from "./verticalFooting";
import { buildColumns, exactDifference } from "./verticalFooting";
import { evaluateSnip, type Snip } from "../snip/sumSnip";

export interface CrossFooting {
  id: string;
  page: number;
  totalId: string;
  /** Angka di kiri total, urut kiri → kanan. */
  componentIds: string[];
  reported: number;
  computed: number;
  difference: number;
  status: "foot" | "fail" | "open";
  reason: string;
  /** Judul kolom total, mis. "Jumlah ekuitas". */
  header: string;
  /** Komponen yang dikurangkan (kolom "Pengurangan" tanpa kurung). */
  subtractedIds: string[];
  snipId?: string;
}

export interface CrossInput {
  tokens: NumberToken[];
  textItems: RawTextItem[][];
  scales: (Scale | null)[];
  overrides?: Overrides;
  snips?: Snip[];
}

const TOTAL_HEADER = /\b(jumlah|total|saldo akhir|akhir tahun|akhir periode|31 desember|nilai tercatat|nilai buku|ending|carrying)\b/i;
const SUBTRACT_HEADER = /\b(pengurangan|penghapusan|pelepasan|penjualan aset|disposals?|deductions?|write-?offs?)\b/i;
const DATE_HEADER = /^\s*(\d{1,2}\s+[a-z]+(\s+\d{4})?|\d{4}|[a-z]+\s+\d{4})\s*$/i;

const fontHeight = (t: NumberToken) => (t.box.y1 - t.box.y0) / 1.1;
const hasLetters = (s: string) => /[A-Za-zÀ-ÿ]{2,}/.test(s);

/**
 * Judul kolom = teks berhuruf terdekat DI ATAS angka yang melintang di atas kolom itu
 * (badan kolom angka tidak berisi huruf, jadi teks berhuruf terdekat adalah judulnya).
 * Judul 2–3 baris ("Jumlah" / "ekuitas") digabung.
 */
export function columnHeader(t: NumberToken, colX0: number, colX1: number, items: RawTextItem[]): string {
  const above = items
    .filter((it) => {
      if (!hasLetters(it.str)) return false;
      const x0 = it.transform[4];
      const x1 = x0 + it.width;
      const ov = Math.min(x1, colX1) - Math.max(x0, colX0);
      return ov >= Math.min(6, 0.5 * (x1 - x0)) && it.transform[5] > t.box.y1;
    })
    .sort((a, b) => a.transform[5] - b.transform[5]); // terdekat dulu
  if (!above.length) return "";
  const nearest = above[0].transform[5];
  const h = fontHeight(t);
  return above
    .filter((it) => it.transform[5] - nearest <= 2.6 * h)
    .sort((a, b) => b.transform[5] - a.transform[5]) // atas → bawah
    .map((it) => it.str.trim())
    .join(" ")
    .replace(/\s+/g, " ");
}

export function computeCrossFooting(input: CrossInput): CrossFooting[] {
  const overrides = input.overrides ?? {};
  const out: CrossFooting[] = [];
  const byPage = new Map<number, NumberToken[]>();
  for (const t of input.tokens) byPage.set(t.page, [...(byPage.get(t.page) ?? []), t]);

  for (const [page, pageTokens] of byPage) {
    const items = input.textItems[page - 1] ?? [];
    const scaleSet = !!input.scales[page - 1];
    const cols = buildColumns(pageTokens);
    if (cols.length < 3) continue;
    const colOf = new Map<string, number>();
    cols.forEach((c, i) => c.tokens.forEach((t) => colOf.set(t.id, i)));

    // Baris = angka kolom dengan baseline sejajar.
    const inCols = pageTokens
      .filter((t) => colOf.has(t.id) && overrides[t.id] !== "exclude")
      .sort((a, b) => b.box.y0 - a.box.y0 || a.box.x0 - b.box.x0);
    const rows: NumberToken[][] = [];
    for (const t of inCols) {
      const row = rows[rows.length - 1];
      if (row && Math.abs(row[0].box.y0 - t.box.y0) <= 0.4 * fontHeight(t)) row.push(t);
      else rows.push([t]);
    }

    for (const row of rows) {
      if (row.length < 3) continue;
      const sorted = [...row].sort((a, b) => a.box.x1 - b.box.x1);
      // Satu angka per kolom (dua angka di kolom yang sama = bukan baris tabel biasa).
      if (new Set(sorted.map((t) => colOf.get(t.id))).size !== sorted.length) continue;
      const total = sorted[sorted.length - 1];
      if (overrides[total.id] === "not-total") continue;
      const comps = sorted.slice(0, -1);
      const headerOf = (t: NumberToken) => {
        const c = cols[colOf.get(t.id)!];
        return columnHeader(t, c.x0, c.x1, items);
      };
      const totalHeader = headerOf(total);
      if (!TOTAL_HEADER.test(totalHeader)) continue;
      const compHeaders = comps.map(headerOf);
      if ([totalHeader, ...compHeaders].every((h) => DATE_HEADER.test(h.replace(/\b\d{4}\b/g, "").trim() || "2000"))) {
        continue; // komparatif beberapa tanggal
      }

      const values = comps.map((t) => t.parsed.value ?? 0);
      const reported = total.parsed.value ?? 0;
      let { computed, difference } = exactDifference(reported, values);
      let subtractedIds: string[] = [];
      const reasons: string[] = [];
      if (difference !== 0) {
        // Kolom "Pengurangan" disajikan positif tanpa kurung?
        const flip = comps.map((t, i) => SUBTRACT_HEADER.test(compHeaders[i]) && (t.parsed.value ?? 0) > 0);
        if (flip.some(Boolean)) {
          const alt = exactDifference(reported, values.map((v, i) => (flip[i] ? -v : v)));
          if (alt.difference === 0) {
            ({ computed, difference } = alt);
            subtractedIds = comps.filter((_, i) => flip[i]).map((t) => t.id);
            reasons.push("Kolom pengurangan disajikan tanpa kurung; dikurangkan dari saldo.");
          }
        }
      }
      let status: CrossFooting["status"] = difference === 0 ? "foot" : "fail";
      const ambiguous = sorted.filter((t) => t.parsed.ambiguous);
      if (ambiguous.length) {
        status = "open";
        reasons.push(`Format angka ambigu (${ambiguous.map((t) => t.text).join(", ")}).`);
      }
      if (status === "foot" && !scaleSet) {
        status = "open";
        reasons.push("Skala angka (mis. ribuan Rupiah) belum ditetapkan.");
      }
      out.push({
        id: `x-${total.id}`,
        page,
        totalId: total.id,
        componentIds: comps.map((t) => t.id),
        reported,
        computed,
        difference,
        status,
        reason: reasons.join(" "),
        header: totalHeader,
        subtractedIds,
      });
    }
  }

  // Sum snip horizontal bertotal menggantikan cross footing otomatis untuk total itu.
  const byId = new Map(input.tokens.map((t) => [t.id, t]));
  for (const snip of input.snips ?? []) {
    if (!snip.totalId) continue;
    const ev = evaluateSnip(snip, byId, !!input.scales[snip.page - 1]);
    if (!ev.total || ev.orientation !== "horizontal") continue;
    const i = out.findIndex((c) => c.totalId === snip.totalId);
    if (i >= 0) out.splice(i, 1);
    out.push({
      id: `xs-${snip.id}`,
      page: snip.page,
      totalId: ev.total.id,
      componentIds: ev.components.map((t) => t.id),
      reported: ev.total.parsed.value ?? 0,
      computed: ev.sum,
      difference: ev.difference ?? 0,
      status: ev.status === "sum" ? "open" : ev.status,
      reason: ev.reason,
      header: "sum snip (koreksi pengguna)",
      subtractedIds: [],
      snipId: snip.id,
    });
  }
  return out.sort((a, b) => a.page - b.page);
}
