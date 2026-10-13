/**
 * Hanya untuk test: baca PDF sintetis dengan pdf.js versi Node, dengan cara yang sama seperti aplikasi
 * (text item + garis horizontal per halaman).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractNumberTokens, type NumberToken, type RawTextItem } from "../domain/pdf/numberTokens";
import { extractHorizontalRules, type HRule } from "../domain/pdf/rules";

export interface LoadedSample {
  tokens: NumberToken[];
  textItems: RawTextItem[][];
  rules: HRule[][];
  boldFonts: Set<string>;
}

export function samplePath(name: string): string {
  return fileURLToPath(new URL(`../../samples/${name}`, import.meta.url));
}

export async function loadSamplePdf(name: string): Promise<LoadedSample> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(readFileSync(samplePath(name)));
  const task = pdfjs.getDocument({ data, verbosity: 0 });
  const doc = await task.promise;
  const out: LoadedSample = { tokens: [], textItems: [], rules: [], boldFonts: new Set() };
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: RawTextItem[] = content.items.flatMap((it) =>
      "str" in it && "transform" in it
        ? [{ str: it.str, transform: it.transform as number[], width: it.width, height: it.height, fontName: it.fontName }]
        : [],
    );
    out.textItems.push(items);
    out.tokens.push(...extractNumberTokens(items, p, "id"));
    out.rules.push(extractHorizontalRules(await page.getOperatorList(), pdfjs.OPS));
    for (const it of items) {
      const f = it.fontName && page.commonObjs.has(it.fontName) ? page.commonObjs.get(it.fontName) : null;
      if (f && (f.bold || f.black)) out.boldFonts.add(it.fontName!);
    }
  }
  await task.destroy();
  return out;
}
