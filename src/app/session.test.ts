import { describe, expect, it } from "vitest";
import { sessionKey, type SessionState } from "./session";

const base: SessionState = { locale: "id", overrides: {}, scaleChoice: "auto", footingOn: true, page: 1 };

describe("sessionKey", () => {
  it("halaman tidak mempengaruhi kunci (tiap jendela boleh di halaman berbeda)", () => {
    expect(sessionKey({ ...base, page: 7 })).toBe(sessionKey(base));
  });
  it("urutan koreksi manual tidak mempengaruhi kunci", () => {
    const a = { ...base, overrides: { x: "exclude" as const, y: "total" as const } };
    const b = { ...base, overrides: { y: "total" as const, x: "exclude" as const } };
    expect(sessionKey(a)).toBe(sessionKey(b));
  });
  it("perubahan progres mengubah kunci", () => {
    expect(sessionKey({ ...base, footingOn: false })).not.toBe(sessionKey(base));
    expect(sessionKey({ ...base, scaleChoice: null })).not.toBe(sessionKey(base));
    expect(sessionKey({ ...base, overrides: { x: "exclude" } })).not.toBe(sessionKey(base));
  });
});
