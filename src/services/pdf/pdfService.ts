/**
 * Semua interaksi dengan pdf.js ada di sini.
 * PDF dibaca dari file lokal ke memori browser; tidak ada yang diunggah.
 */
// Pakai build "legacy" pdf.js: build standar v6 memakai fitur JavaScript yang sangat
// baru (mis. Map.getOrInsertComputed) yang belum ada di banyak browser / WebView
// Excel. Build legacy menyertakan polyfill sehingga jalan di browser yang lebih tua.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, PageViewport } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { RawTextItem } from "../../domain/pdf/numberTokens";
import { extractHorizontalRules, type HRule } from "../../domain/pdf/rules";

// Worker pdf.js dibundel bersama aplikasi (bukan dari CDN pihak ketiga).
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface LoadedPdf {
  doc: PDFDocumentProxy;
  fileName: string;
  fileSize: number;
  /** SHA-256 isi file; dipakai untuk mendeteksi PDF yang berubah versi. */
  fingerprint: string;
  pageCount: number;
  /**
   * Isi file di memori (tidak pernah dikirim ke server). Dipakai untuk memindahkan PDF antara panel samping
   * dan jendela besar tanpa memilih file lagi.
   */
  bytes: Uint8Array;
  /** Lepaskan memori & worker pdf.js untuk dokumen ini. */
  destroy: () => Promise<void>;
}

export class PdfLoadError extends Error {
  constructor(
    public readonly userMessage: string,
    public readonly detail: string,
  ) {
    super(userMessage);
  }
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) return "tidak-tersedia";
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function loadPdf(file: File): Promise<LoadedPdf> {
  const buffer = await file.arrayBuffer();
  const head = new TextDecoder().decode(new Uint8Array(buffer.slice(0, 1024)));
  if (!head.includes("%PDF-")) {
    throw new PdfLoadError(
      "File ini bukan PDF.",
      `Header file tidak mengandung penanda %PDF- (nama: ${file.name.slice(-40)}).`,
    );
  }

  const fingerprint = await sha256Hex(buffer);

  try {
    // pdf.js mengambil alih buffer, jadi kirim salinan.
    const task = pdfjs.getDocument({ data: new Uint8Array(buffer.slice(0)) });
    const doc = await task.promise;
    return {
      doc,
      fileName: file.name,
      fileSize: file.size,
      fingerprint,
      pageCount: doc.numPages,
      bytes: new Uint8Array(buffer),
      destroy: () => task.destroy(),
    };
  } catch (err) {
    const name = (err as { name?: string })?.name ?? "";
    if (name === "PasswordException") {
      throw new PdfLoadError(
        "PDF ini dilindungi password.",
        "Buka proteksi PDF terlebih dahulu (mis. simpan ulang tanpa password), lalu coba lagi.",
      );
    }
    if (name === "InvalidPDFException") {
      throw new PdfLoadError("PDF rusak atau tidak bisa dibaca.", String(err));
    }
    throw new PdfLoadError("Gagal membuka PDF.", String(err));
  }
}

export interface PageInfo {
  items: RawTextItem[];
  /** Viewport skala 1; untuk ukuran lain pakai `viewport.clone({ scale })`. */
  viewport: PageViewport;
}

/** Ambil semua text item satu halaman (koordinat PDF) beserta ukuran halamannya. */
export async function getPageInfo(doc: PDFDocumentProxy, pageNumber: number): Promise<PageInfo> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const items: RawTextItem[] = [];
  for (const it of content.items) {
    if ("str" in it && typeof it.str === "string") {
      items.push({
        str: it.str,
        transform: it.transform as number[],
        width: it.width,
        height: it.height,
        fontName: it.fontName,
      });
    }
  }
  return { items, viewport: page.getViewport({ scale: 1 }) };
}

export interface PageLayout {
  /** Garis horizontal (penanda total), dalam koordinat PDF. */
  rules: HRule[];
  /** Nama font (dari `fontNames`) yang tebal. */
  boldFonts: string[];
}

/** Tebal bila nama font asli mengandung Bold/Black/Heavy/Semibold/Demi (mis. "Arial-BoldMT"). */
const BOLD_NAME = /bold|black|heavy|semibold|demi/i;

/**
 * Tata letak satu halaman yang tidak ada di teks: garis tabel dan font tebal.
 * `fontNames` = nama font internal yang dipakai text item halaman ini.
 */
export async function getPageLayout(doc: PDFDocumentProxy, pageNumber: number, fontNames: string[]): Promise<PageLayout> {
  const page = await doc.getPage(pageNumber);
  const ops = await page.getOperatorList();
  const rules = extractHorizontalRules(ops, pdfjs.OPS);
  // Setelah daftar operator dibuat, data font tersedia di commonObjs.
  const boldFonts = [...new Set(fontNames)].filter((name) => {
    try {
      if (!page.commonObjs.has(name)) return false;
      const f = page.commonObjs.get(name) as { bold?: boolean; black?: boolean; name?: string };
      return !!(f.bold || f.black || (f.name && BOLD_NAME.test(f.name)));
    } catch {
      return false;
    }
  });
  // Lepaskan cache operator halaman yang sedang tidak tampil, agar PDF besar tetap ringan.
  page.cleanup();
  return { rules, boldFonts };
}
