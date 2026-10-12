/**
 * Semua interaksi dengan pdf.js ada di sini.
 * PDF dibaca dari file lokal ke memori browser; tidak ada yang diunggah.
 */
// Pakai build "legacy" pdf.js: build standar v6 memakai fitur JavaScript yang sangat
// baru (mis. Map.getOrInsertComputed) yang belum ada di banyak browser / WebView
// Excel. Build legacy menyertakan polyfill sehingga jalan di browser yang lebih tua.
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { RawTextItem } from "../../domain/pdf/numberTokens";

// Worker pdf.js dibundel bersama aplikasi (bukan dari CDN pihak ketiga).
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface LoadedPdf {
  doc: PDFDocumentProxy;
  fileName: string;
  fileSize: number;
  /** SHA-256 isi file; dipakai untuk mendeteksi PDF yang berubah versi. */
  fingerprint: string;
  pageCount: number;
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

/** Ambil semua text item satu halaman dalam koordinat PDF. */
export async function getPageTextItems(doc: PDFDocumentProxy, pageNumber: number): Promise<RawTextItem[]> {
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
      });
    }
  }
  return items;
}
