import { describe, expect, it } from "vitest";
import { extractHorizontalRules, type OpCodes } from "./rules";

// Kode operator sama dengan pdf.js (pdfjs.OPS); ditulis ulang agar test tidak bergantung pada pdf.js.
const OPS: OpCodes = {
  save: 10,
  restore: 11,
  transform: 12,
  setLineWidth: 2,
  constructPath: 91,
  paintFormXObjectBegin: 74,
  paintFormXObjectEnd: 75,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closeFillStroke: 26,
  closeEOFillStroke: 27,
  setFillRGBColor: 59,
  setStrokeRGBColor: 58,
};
const M = 0; // moveTo
const L = 1; // lineTo
const C = 2; // curveTo
const Z = 4; // closePath
const END_PATH = 28;

function opList(...ops: [number, unknown[] | null][]) {
  return { fnArray: ops.map((o) => o[0]), argsArray: ops.map((o) => o[1]) };
}
const path = (paintOp: number, data: number[]) => [OPS.constructPath, [paintOp, [new Float32Array(data)], null]] as [number, unknown[]];
const rect = (x: number, y: number, w: number, h: number) => [M, x, y, L, x + w, y, L, x + w, y + h, L, x, y + h, Z];

describe("extractHorizontalRules", () => {
  it("membaca garis stroke horizontal", () => {
    const rules = extractHorizontalRules(opList(path(OPS.stroke, [M, 380, 600, L, 450, 600])), OPS);
    expect(rules).toEqual([{ x0: 380, x1: 450, y: 600, thickness: 1 }]);
  });

  it("membaca persegi panjang tipis yang di-fill (gaya Word)", () => {
    const rules = extractHorizontalRules(opList(path(OPS.fill, rect(100, 500, 80, 0.75))), OPS);
    expect(rules).toHaveLength(1);
    expect(rules[0].y).toBeCloseTo(500.375);
    expect(rules[0].x1 - rules[0].x0).toBeCloseTo(80);
  });

  it("mengabaikan garis vertikal, garis pendek, kotak tebal, dan kurva", () => {
    const rules = extractHorizontalRules(
      opList(
        path(OPS.stroke, [M, 100, 100, L, 100, 300]),
        path(OPS.stroke, [M, 100, 100, L, 105, 100]),
        path(OPS.fill, rect(100, 100, 80, 20)),
        path(OPS.stroke, [M, 100, 100, C, 120, 100, 140, 100, 160, 100]),
      ),
      OPS,
    );
    expect(rules).toEqual([]);
  });

  it("mengabaikan path clipping dan kotak isian putih", () => {
    const rules = extractHorizontalRules(
      opList(
        path(END_PATH, rect(100, 100, 80, 1)),
        [OPS.setFillRGBColor, ["#ffffff"]],
        path(OPS.fill, rect(100, 200, 80, 1)),
        [OPS.setFillRGBColor, ["#000000"]],
        path(OPS.fill, rect(100, 300, 80, 1)),
      ),
      OPS,
    );
    expect(rules.map((r) => Math.round(r.y))).toEqual([301]);
  });

  it("memperhitungkan transformasi (cm) dan save/restore", () => {
    const rules = extractHorizontalRules(
      opList(
        [OPS.save, null],
        // Word sering membalik sumbu y: 1 0 0 -1 0 842
        [OPS.transform, [1, 0, 0, -1, 0, 842]],
        path(OPS.stroke, [M, 50, 42, L, 150, 42]),
        [OPS.restore, null],
        path(OPS.stroke, [M, 50, 42, L, 150, 42]),
      ),
      OPS,
    );
    expect(rules.map((r) => r.y).sort((a, b) => a - b)).toEqual([42, 800]);
  });

  it("memperhitungkan matriks form XObject", () => {
    const rules = extractHorizontalRules(
      opList(
        [OPS.paintFormXObjectBegin, [[2, 0, 0, 2, 10, 10], [0, 0, 100, 100]]],
        path(OPS.stroke, [M, 0, 5, L, 20, 5]),
        [OPS.paintFormXObjectEnd, []],
        path(OPS.stroke, [M, 0, 5, L, 20, 5]),
      ),
      OPS,
    );
    expect(rules).toContainEqual({ x0: 10, x1: 50, y: 20, thickness: 2 });
    expect(rules).toContainEqual({ x0: 0, x1: 20, y: 5, thickness: 1 });
  });

  it("garis yang digambar dua kali dihitung sekali", () => {
    const rules = extractHorizontalRules(
      opList(path(OPS.stroke, [M, 380, 600, L, 450, 600]), path(OPS.stroke, [M, 380, 600, L, 450, 600])),
      OPS,
    );
    expect(rules).toHaveLength(1);
  });

  it("border putih (stroke) tidak dianggap garis", () => {
    const rules = extractHorizontalRules(
      opList(
        [OPS.setStrokeRGBColor, ["#ffffff"]],
        path(OPS.stroke, [M, 380, 600, L, 450, 600]),
        [OPS.setStrokeRGBColor, ["#000000"]],
        path(OPS.stroke, [M, 380, 500, L, 450, 500]),
      ),
      OPS,
    );
    expect(rules.map((r) => r.y)).toEqual([500]);
  });

  it("border tipis yang digambar sebagai kotak (dua tepi berdekatan) = satu garis, bukan garis ganda", () => {
    const rules = extractHorizontalRules(opList(path(OPS.stroke, rect(380, 600, 70, 0.75))), OPS);
    expect(rules).toHaveLength(1);
  });

  it("garis ganda sungguhan (berjarak 2 satuan) tetap dua garis", () => {
    const rules = extractHorizontalRules(
      opList(path(OPS.stroke, [M, 380, 600, L, 450, 600]), path(OPS.stroke, [M, 380, 598, L, 450, 598])),
      OPS,
    );
    expect(rules).toHaveLength(2);
  });
});
