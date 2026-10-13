import { describe, expect, it } from "vitest";
import { ChunkAssembler, base64ToBytes, bytesToBase64, parseMessage, toChunks } from "./messages";

const STATE = { locale: "id" as const, overrides: { "p1-i3-c0": "exclude" as const }, scaleChoice: "auto" as const, footingOn: true, page: 4 };

describe("pesan jendela besar ↔ panel samping", () => {
  it("data besar dipotong lalu disusun kembali utuh, urutan kedatangan bebas", () => {
    const json = JSON.stringify(Array.from({ length: 500 }, (_, i) => ["F-p1-i" + i, "Footing", i * 1.5, "Jumlah ✗"]));
    const chunks = toChunks("register", json, "b1", undefined, 1000);
    expect(chunks.length).toBeGreaterThan(5);
    const asm = new ChunkAssembler();
    const results = [...chunks].reverse().map((c) => asm.add(c));
    expect(results.slice(0, -1).every((x) => x === null)).toBe(true);
    expect(results[results.length - 1]?.data).toBe(json);
  });

  it("keterangan PDF (nama, sidik, progres) ikut sampai", () => {
    const meta = { fileName: "draft.pdf", fingerprint: "abc", state: STATE };
    const asm = new ChunkAssembler();
    let out = null;
    for (const c of toChunks("pdf", "x".repeat(250), "b2", meta, 100)) out = asm.add(c);
    expect(out).toEqual({ data: "x".repeat(250), meta });
  });

  it("batch baru menggantikan batch lama yang belum lengkap", () => {
    const asm = new ChunkAssembler();
    asm.add(toChunks("pdf", "x".repeat(30), "lama", undefined, 10)[0]);
    expect(asm.add(toChunks("pdf", "baru", "baru", undefined, 10)[0])?.data).toBe("baru");
  });

  it("isi PDF (biner) tetap identik setelah base64 bolak-balik", () => {
    const bytes = new Uint8Array(200_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) % 256;
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("parseMessage menolak teks yang bukan pesan", () => {
    expect(parseMessage("bukan json")).toBeNull();
    expect(parseMessage('{"a":1}')).toBeNull();
    expect(parseMessage('{"type":"selection"}')).toEqual({ type: "selection" });
  });
});
