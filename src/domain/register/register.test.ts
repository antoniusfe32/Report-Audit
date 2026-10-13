import { beforeAll, describe, expect, it } from "vitest";
import { loadSamplePdf, type LoadedSample } from "../../test/loadSamplePdf";
import { computeVerticalFooting, type FootingResult } from "../footing/verticalFooting";
import {
  COL,
  REGISTER_COLUMNS,
  STALE_STATUS,
  footingRows,
  parseLocation,
  planRegisterUpdate,
  resolveLocation,
  type RegisterRow,
} from "./register";

const FP = "ab12cd34ef56" + "0".repeat(52);
let s: LoadedSample;
let r: FootingResult;
let rows: RegisterRow[];
beforeAll(async () => {
  s = await loadSamplePdf("contoh-footing.pdf");
  r = computeVerticalFooting({ ...s, scales: s.textItems.map(() => "ribuan") });
  rows = footingRows(r, s.tokens, FP);
});

describe("footingRows", () => {
  it("satu baris untuk SETIAP footing (F, ✗, dan ○)", () => {
    expect(rows).toHaveLength(r.footings.length);
    const statuses = new Set(rows.map((x) => x[COL.status]));
    expect(statuses).toEqual(new Set(["F cocok", "✗ selisih", "○ cek manual"]));
    for (const row of rows) expect(row).toHaveLength(REGISTER_COLUMNS.length);
  });

  it("baris ✗ memuat nilai dilaporkan, nilai hitung, dan selisih", () => {
    const row = rows.find((x) => x[COL.label] === "Jumlah aset lancar" && x[COL.status] === "✗ selisih")!;
    expect(row[COL.page]).toBe(1);
    expect(row[COL.reported]).toBe(283_760_931);
    expect(row[COL.computed]).toBe(283_760_930);
    expect(row[COL.difference]).toBe(1);
    expect(row[COL.fingerprint]).toBe("ab12cd34ef56");
  });

  it("lokasi tersimpan sebagai JSON dan bisa dibaca kembali ke angka yang sama", () => {
    const row = rows.find((x) => x[COL.label] === "JUMLAH ASET")!;
    const loc = parseLocation(row[COL.location])!;
    expect(loc.doc).toBe(FP);
    const found = resolveLocation(loc, s.tokens);
    expect(found.map((t) => t.label)).toEqual(["JUMLAH ASET", "Jumlah aset lancar", "Jumlah aset tidak lancar"]);
  });

  it("bila id berubah, angka ditemukan dari kotak koordinat", () => {
    const row = rows.find((x) => x[COL.label] === "Jumlah pihak ketiga")!;
    const loc = parseLocation(row[COL.location])!;
    const renamed = s.tokens.map((t) => ({ ...t, id: `x-${t.id}` }));
    expect(resolveLocation(loc, renamed)).toHaveLength(loc.ids.length);
  });

  it("parseLocation menolak isi yang bukan lokasi", () => {
    expect(parseLocation("")).toBeNull();
    expect(parseLocation("{rusak")).toBeNull();
    expect(parseLocation('{"v":2}')).toBeNull();
    expect(parseLocation(123)).toBeNull();
  });
});

describe("planRegisterUpdate", () => {
  const row = (id: string, status: string, comment = "", fp = "ab12cd34ef56", type = "Footing"): RegisterRow => {
    const x: RegisterRow = Array(REGISTER_COLUMNS.length).fill("");
    x[COL.id] = id;
    x[COL.type] = type;
    x[COL.status] = status;
    x[COL.comment] = comment;
    x[COL.fingerprint] = fp;
    return x;
  };

  it("tabel baru (satu baris kosong): baris kosong dipakai dulu, sisanya ditambahkan", () => {
    const plan = planRegisterUpdate([Array(11).fill("")], [row("F-a", "F cocok"), row("F-b", "✗ selisih")]);
    expect(plan.fillBlank.map((u) => u.index)).toEqual([0]);
    expect(plan.appends).toHaveLength(1);
  });

  it("menjalankan ulang: baris lama diperbarui dan KOMENTAR reviewer dipertahankan", () => {
    const existing = [row("F-a", "✗ selisih", "sudah dikonfirmasi ke tim"), row("F-b", "F cocok")];
    const plan = planRegisterUpdate(existing, [row("F-a", "F cocok"), row("F-b", "F cocok")]);
    expect(plan.appends).toHaveLength(0);
    expect(plan.updates.map((u) => [u.index, u.row[COL.status], u.row[COL.comment]])).toEqual([
      [0, "F cocok", "sudah dikonfirmasi ke tim"],
      [1, "F cocok", ""],
    ]);
  });

  it("footing yang hilang setelah koreksi ditandai 'tidak berlaku', tidak dihapus", () => {
    const existing = [row("F-a", "F cocok", "catatan"), row("F-b", "F cocok")];
    const plan = planRegisterUpdate(existing, [row("F-a", "F cocok")]);
    expect(plan.stale).toEqual([1]);
    expect(STALE_STATUS).toBe("tidak berlaku");
  });

  it("baris dokumen lain dan jenis lain tidak disentuh", () => {
    const existing = [row("F-a", "F cocok", "", "lainlainlain"), row("T-1", "Tie", "", "ab12cd34ef56", "Tie")];
    const plan = planRegisterUpdate(existing, [row("F-z", "F cocok")]);
    expect(plan.updates).toEqual([]);
    expect(plan.stale).toEqual([]);
    expect(plan.appends).toHaveLength(1);
  });
});
