import { beforeAll, describe, expect, it } from "vitest";
import { loadSamplePdf, type LoadedSample } from "../../test/loadSamplePdf";
import { computeVerticalFooting, type FootingResult } from "./verticalFooting";
import { footingBlocks } from "./blocks";
import type { NumberToken } from "../pdf/numberTokens";

let s: LoadedSample;
let r: FootingResult;
let byId: Map<string, NumberToken>;
beforeAll(async () => {
  s = await loadSamplePdf("contoh-footing.pdf");
  r = computeVerticalFooting({ ...s, scales: s.textItems.map(() => "ribuan") });
  byId = new Map(s.tokens.map((t) => [t.id, t]));
});

const footingOf = (page: number, label: string, text: string) => {
  const t = s.tokens.find((x) => x.page === page && x.label === label && x.text === text)!;
  return r.footings.find((f) => f.totalId === t.id)!;
};

describe("footingBlocks", () => {
  it("komponen berurutan menjadi SATU blok biru, total satu blok sendiri", () => {
    const f = footingOf(5, "Jumlah pihak ketiga", "111.215.710");
    const blocks = footingBlocks(r, byId, 5).filter((b) => b.footingId === f.id);
    expect(blocks.map((b) => b.kind)).toEqual(["component", "total-foot"]);
    const [comp, total] = blocks;
    // Blok komponen mencakup ketiga angka dan berada di atas total
    for (const id of f.componentIds) {
      const t = byId.get(id)!;
      expect(comp.box.y1).toBeGreaterThanOrEqual(t.box.y1);
      expect(comp.box.y0).toBeLessThanOrEqual(t.box.y0);
    }
    expect(comp.box.y0).toBeGreaterThan(total.box.y1);
  });

  it("total yang selisih diberi blok merah", () => {
    const f = footingOf(1, "Jumlah aset lancar", "283.760.931");
    expect(footingBlocks(r, byId, 1).find((b) => b.footingId === f.id && b.kind !== "component")?.kind).toBe(
      "total-fail",
    );
  });

  it("total bertingkat: subtotal tetap blok total (hijau), tidak ditimpa blok komponen", () => {
    const f = footingOf(1, "JUMLAH ASET", "1.334.001.231");
    const blocks = footingBlocks(r, byId, 1).filter((b) => b.footingId === f.id);
    expect(blocks.map((b) => b.kind)).toEqual(["total-foot"]);
  });

  it("subtotal berjalan: blok biru tidak melintasi subtotal di antaranya", () => {
    const f = footingOf(2, "LABA SEBELUM PAJAK PENGHASILAN", "200.141.110");
    const comps = footingBlocks(r, byId, 2).filter((b) => b.footingId === f.id && b.kind === "component");
    expect(comps).toHaveLength(1); // 4 beban berurutan; LABA BRUTO berwarna total sendiri
    const bruto = s.tokens.find((t) => t.page === 2 && t.label === "LABA BRUTO" && t.text === "324.110.150")!;
    expect(comps[0].box.y1).toBeLessThan(bruto.box.y0);
  });
});
