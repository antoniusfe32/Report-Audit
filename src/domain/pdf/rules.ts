/**
 * Membaca GARIS HORIZONTAL dari daftar operator gambar PDF (hasil pdf.js `getOperatorList`).
 * Garis tipis di atas angka = penanda total di laporan keuangan.
 *
 * Yang dianggap garis:
 * - segmen lurus yang di-stroke (operator `l` / `re` tanpa tinggi), dan
 * - persegi panjang tipis yang di-fill (cara Word menggambar border tabel / garis bawah).
 *
 * Koordinat hasil dalam SATUAN HALAMAN PDF (sama dengan koordinat teks), dengan
 * memperhitungkan transformasi (`cm`, save/restore, form XObject).
 *
 * Fungsi murni: format operator pdf.js diterima sebagai data + tabel kode operator.
 */

export interface HRule {
  x0: number;
  x1: number;
  /** Posisi vertikal garis (y ke atas, satuan PDF). */
  y: number;
  thickness: number;
}

/** Bentuk minimal hasil `page.getOperatorList()`. */
export interface OperatorListLike {
  fnArray: ArrayLike<number>;
  argsArray: unknown[];
}

/** Subset kode operator pdf.js (`pdfjs.OPS`) yang dibutuhkan. */
export interface OpCodes {
  save: number;
  restore: number;
  transform: number;
  setLineWidth: number;
  constructPath: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  stroke: number;
  closeStroke: number;
  fill: number;
  eoFill: number;
  fillStroke: number;
  eoFillStroke: number;
  closeFillStroke: number;
  closeEOFillStroke: number;
  setFillRGBColor: number;
  setStrokeRGBColor: number;
}

/** Kode perintah di dalam data path pdf.js (DrawOPS). */
const DRAW_MOVE = 0;
const DRAW_LINE = 1;
const DRAW_CURVE = 2;
const DRAW_QUAD = 3;
const DRAW_CLOSE = 4;

/** Garis lebih pendek dari ini (satuan PDF ≈ 1/72 inci) diabaikan: bukan garis total. */
const MIN_LENGTH = 12;
/** Persegi panjang setinggi ini atau kurang dianggap garis. */
const MAX_THICKNESS = 3;

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Terapkan m lalu n (konvensi PDF: titik × m × n). */
function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [x * m[0] + y * m[2] + m[4], x * m[1] + y * m[3] + m[5]];
}

interface GState {
  ctm: Matrix;
  lineWidth: number;
  fillWhite: boolean;
  strokeWhite: boolean;
}

/** pdf.js mengubah semua warna isian menjadi `setFillRGBColor` dengan argumen ["#rrggbb"]. */
function isNearWhite(args: unknown): boolean {
  const hex = Array.isArray(args) ? args[0] : args;
  if (typeof hex !== "string") return false;
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return !!m && [m[1], m[2], m[3]].every((c) => parseInt(c, 16) >= 0xf0);
}

/** Pecah data path pdf.js menjadi subpath berisi titik-titik (null bila ada kurva). */
function subpaths(data: ArrayLike<number>): ({ pts: [number, number][]; curved: boolean })[] {
  const out: { pts: [number, number][]; curved: boolean }[] = [];
  let cur: { pts: [number, number][]; curved: boolean } | null = null;
  let i = 0;
  while (i < data.length) {
    const op = data[i];
    if (op === DRAW_MOVE) {
      cur = { pts: [[data[i + 1], data[i + 2]]], curved: false };
      out.push(cur);
      i += 3;
    } else if (op === DRAW_LINE) {
      if (!cur) {
        cur = { pts: [], curved: false };
        out.push(cur);
      }
      cur.pts.push([data[i + 1], data[i + 2]]);
      i += 3;
    } else if (op === DRAW_CURVE) {
      if (cur) cur.curved = true;
      i += 7;
    } else if (op === DRAW_QUAD) {
      if (cur) cur.curved = true;
      i += 5;
    } else if (op === DRAW_CLOSE) {
      if (cur && cur.pts.length) cur.pts.push(cur.pts[0]);
      i += 1;
    } else {
      break; // format tidak dikenal: berhenti dengan aman
    }
  }
  return out;
}

export function extractHorizontalRules(ops: OperatorListLike, OPS: OpCodes): HRule[] {
  const rules: HRule[] = [];
  const stack: GState[] = [];
  let gs: GState = { ctm: IDENTITY, lineWidth: 1, fillWhite: false, strokeWhite: false };

  const strokeOps = new Set([OPS.stroke, OPS.closeStroke]);
  const fillOps = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);

  // Lebar garis dalam satuan halaman ≈ lineWidth × skala vertikal CTM.
  const scaleY = (m: Matrix) => Math.hypot(m[2], m[3]) || 1;

  for (let k = 0; k < ops.fnArray.length; k++) {
    const fn = ops.fnArray[k];
    const args = ops.argsArray[k] as unknown[] | null;

    if (fn === OPS.save) {
      stack.push({ ...gs });
    } else if (fn === OPS.restore) {
      gs = stack.pop() ?? gs;
    } else if (fn === OPS.transform && args) {
      gs = { ...gs, ctm: multiply(args.slice(0, 6) as Matrix, gs.ctm) };
    } else if (fn === OPS.paintFormXObjectBegin) {
      stack.push({ ...gs });
      const m = args?.[0];
      if (Array.isArray(m) || ArrayBuffer.isView(m)) {
        gs = { ...gs, ctm: multiply(Array.from(m as ArrayLike<number>).slice(0, 6) as Matrix, gs.ctm) };
      }
    } else if (fn === OPS.paintFormXObjectEnd) {
      gs = stack.pop() ?? gs;
    } else if (fn === OPS.setLineWidth && args) {
      gs = { ...gs, lineWidth: Number(args[0]) || 0 };
    } else if (fn === OPS.setFillRGBColor) {
      // Kotak putih (mis. latar sel) tidak terlihat sebagai garis.
      gs = { ...gs, fillWhite: isNearWhite(args) };
    } else if (fn === OPS.setStrokeRGBColor) {
      // Border putih (Word sering menggambarnya di setiap baris tabel) tidak terlihat → bukan garis.
      gs = { ...gs, strokeWhite: isNearWhite(args) };
    } else if (fn === OPS.constructPath && args) {
      const paintOp = args[0] as number;
      const isStroke = strokeOps.has(paintOp);
      const isFill = fillOps.has(paintOp);
      if (!isStroke && !isFill) continue; // mis. path untuk clipping
      const data = (args[1] as unknown[] | null)?.[0];
      if (!data || !(Array.isArray(data) || ArrayBuffer.isView(data))) continue;

      for (const sp of subpaths(data as ArrayLike<number>)) {
        if (sp.curved || sp.pts.length < 2) continue;
        const pts = sp.pts.map(([x, y]) => apply(gs.ctm, x, y));
        if (isStroke && !gs.strokeWhite) {
          const thickness = gs.lineWidth * scaleY(gs.ctm);
          if (thickness > MAX_THICKNESS) continue;
          for (let i = 1; i < pts.length; i++) {
            const [ax, ay] = pts[i - 1];
            const [bx, by] = pts[i];
            if (Math.abs(ay - by) <= 0.5 && Math.abs(bx - ax) >= MIN_LENGTH) {
              rules.push({ x0: Math.min(ax, bx), x1: Math.max(ax, bx), y: (ay + by) / 2, thickness: thickness || 0.5 });
            }
          }
        }
        if (isFill && !gs.fillWhite) {
          const xs = pts.map((p) => p[0]);
          const ys = pts.map((p) => p[1]);
          const x0 = Math.min(...xs);
          const x1 = Math.max(...xs);
          const y0 = Math.min(...ys);
          const y1 = Math.max(...ys);
          const h = y1 - y0;
          if (h <= MAX_THICKNESS && x1 - x0 >= MIN_LENGTH && (x1 - x0) >= h * 5) {
            rules.push({ x0, x1, y: (y0 + y1) / 2, thickness: h || 0.5 });
          }
        }
      }
    }
  }

  return dedupe(rules);
}

/**
 * Garis yang digambar dua kali (stroke + fill, border sel bertumpuk) atau satu border tipis yang tergambar
 * sebagai dua tepi kotak (selisih ≤ 1,2 satuan) dihitung SATU garis, agar tidak terbaca sebagai garis ganda.
 */
function dedupe(rules: HRule[]): HRule[] {
  const sorted = [...rules].sort((a, b) => b.y - a.y || a.x0 - b.x0);
  const out: HRule[] = [];
  for (const r of sorted) {
    const dup = out.find((o) => {
      if (Math.abs(o.y - r.y) > 1.2) return false;
      const overlap = Math.min(o.x1, r.x1) - Math.max(o.x0, r.x0);
      return overlap >= 0.8 * Math.min(o.x1 - o.x0, r.x1 - r.x0);
    });
    if (!dup) {
      out.push({ ...r });
    } else {
      dup.x0 = Math.min(dup.x0, r.x0);
      dup.x1 = Math.max(dup.x1, r.x1);
      dup.thickness = Math.max(dup.thickness, Math.abs(dup.y - r.y) + r.thickness);
    }
  }
  return out;
}
