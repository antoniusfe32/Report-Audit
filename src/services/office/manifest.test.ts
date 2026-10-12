import { describe, expect, it } from "vitest";
import { appBaseUrl, buildManifest } from "./manifest";

describe("manifest", () => {
  it("menurunkan alamat folder aplikasi dari URL halaman", () => {
    expect(appBaseUrl("https://budi.github.io/report-audit/index.html")).toBe("https://budi.github.io/report-audit/");
    expect(appBaseUrl("https://budi.github.io/report-audit/")).toBe("https://budi.github.io/report-audit/");
    expect(appBaseUrl("https://budi.github.io/report-audit/?mode=x")).toBe("https://budi.github.io/report-audit/");
  });

  it("mengisi semua URL dengan alamat hosting dan tidak menyisakan placeholder", () => {
    const xml = buildManifest("https://budi.github.io/report-audit/");
    expect(xml).toContain('<SourceLocation DefaultValue="https://budi.github.io/report-audit/index.html"/>');
    expect(xml).toContain("<AppDomain>https://budi.github.io</AppDomain>");
    expect(xml).toContain('DefaultValue="https://budi.github.io/report-audit/commands.html"');
    expect(xml).not.toMatch(/GANTI_|\$\{|undefined/);
    // XML harus well-formed: setiap URL di atribut berada dalam kutip
    // 4 di bagian atas + 3 ikon + 3 URL di Resources
    expect(xml.match(/DefaultValue="https:\/\/budi\.github\.io\/report-audit\//g)?.length).toBe(10);
  });

  it("menolak alamat non-HTTPS (Office mewajibkan HTTPS)", () => {
    expect(() => buildManifest("http://localhost:8765/report-audit/")).toThrow(/HTTPS/);
  });
});
