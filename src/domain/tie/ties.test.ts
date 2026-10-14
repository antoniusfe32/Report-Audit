import { describe, expect, it } from "vitest";
import { extractNumberTokens, type RawTextItem } from "../pdf/numberTokens";
import { evaluateTie, makeTie, tieId, tiedWith } from "./ties";

const item = (str: string, x: number, y: number): RawTextItem => ({
  str,
  transform: [9, 0, 0, 9, x, y],
  width: str.length * 5,
  height: 9,
});

describe("tie", () => {
  it("id tie tidak bergantung urutan pilih", () => {
    expect(tieId("p2-i1-c0", "p5-i9-c0")).toBe(tieId("p5-i9-c0", "p2-i1-c0"));
    expect(makeTie("b", "a")).toEqual({ id: "a~b", a: "a", b: "b" });
  });

  it("tiedWith mengembalikan pasangan dari kedua arah", () => {
    const ties = [makeTie("a", "b"), makeTie("c", "a")];
    expect(tiedWith("a", ties).sort()).toEqual(["b", "c"]);
    expect(tiedWith("b", ties)).toEqual(["a"]);
  });

  it("tanda berlawanan dicatat; selisih dihitung dari nilai absolut", () => {
    const toks = extractNumberTokens([item("125.750", 300, 700), item("(125.750)", 300, 600)], 1, "id");
    const byId = new Map(toks.map((t) => [t.id, t]));
    const ev = evaluateTie(makeTie(toks[0].id, toks[1].id), byId);
    expect([ev.difference, ev.signDiffers]).toEqual([0, true]);
  });
});
