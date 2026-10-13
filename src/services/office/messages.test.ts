import { describe, expect, it } from "vitest";
import { ChunkAssembler, parseMessage, toChunks } from "./messages";

describe("pesan jendela besar ↔ panel samping", () => {
  it("data besar dipotong lalu disusun kembali utuh, urutan kedatangan bebas", () => {
    const json = JSON.stringify(Array.from({ length: 500 }, (_, i) => ["F-p1-i" + i, "Footing", i * 1.5, "Jumlah ✗"]));
    const chunks = toChunks(json, "b1", 1000);
    expect(chunks.length).toBeGreaterThan(5);
    const asm = new ChunkAssembler();
    const shuffled = [...chunks].reverse();
    const results = shuffled.map((c) => asm.add(c));
    expect(results.slice(0, -1).every((x) => x === null)).toBe(true);
    expect(results[results.length - 1]).toBe(json);
  });

  it("batch baru menggantikan batch lama yang belum lengkap", () => {
    const asm = new ChunkAssembler();
    const old = toChunks("x".repeat(30), "lama", 10);
    asm.add(old[0]);
    const fresh = toChunks("baru", "baru", 10);
    expect(asm.add(fresh[0])).toBe("baru");
  });

  it("parseMessage menolak teks yang bukan pesan", () => {
    expect(parseMessage("bukan json")).toBeNull();
    expect(parseMessage('{"a":1}')).toBeNull();
    expect(parseMessage('{"type":"selection"}')).toEqual({ type: "selection" });
  });
});
