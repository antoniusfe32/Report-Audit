/**
 * Sesi review yang bertahan walaupun jendela besar ditutup.
 *
 * Panel samping (task pane) = tempat penyimpanan sesi di MEMORI: isi PDF + progres review
 * (koreksi manual, skala, footing aktif, halaman). Tidak ada yang ditulis ke disk, server, atau workbook.
 * - PDF dibuka di jendela besar → dikirim ke panel samping; progres dikirim setiap berubah.
 * - Jendela besar dibuka lagi → panel samping mengirim PDF + progres → jendela besar melanjutkan.
 * - PDF dibuka di panel samping lalu klik "Jendela besar" → PDF ikut pindah (tidak perlu pilih file lagi).
 * Sesi hilang bila panel samping ditutup atau Excel/browser ditutup.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Reviewer } from "./useReviewer";
import type { SessionState } from "./session";
import { sendToTaskPane, type DialogHandle, type HostStatus } from "../services/office/officeService";
import {
  ChunkAssembler,
  base64ToBytes,
  bytesToBase64,
  toChunks,
  type ChunkMsg,
  type PdfMeta,
  type ToPaneMessage,
} from "../services/office/messages";

interface StoredPdf {
  meta: Omit<PdfMeta, "state">;
  base64: string;
}

export interface DialogSession {
  /** Panel samping: nama PDF yang tersimpan untuk jendela besar (null bila belum ada). */
  storedName: string | null;
  /** Panel samping: tangani pesan sesi dari jendela besar. */
  handlePaneMessage: (m: ToPaneMessage) => void;
  /** Jendela besar: tangani potongan PDF dari panel samping. */
  handleDialogChunk: (c: ChunkMsg) => void;
  /** Panel samping: lupakan sesi tersimpan. */
  forget: () => void;
  /** Panel samping: dipanggil setelah jendela besar terbuka (kirim sesi bila jendela besar sudah siap duluan). */
  onDialogOpened: () => void;
  /** Jendela besar: sedang memulihkan sesi dari panel samping. */
  restoring: boolean;
}

export function useDialogSession(
  r: Reviewer,
  host: HostStatus,
  isDialog: boolean,
  dialogRef: MutableRefObject<DialogHandle | null>,
): DialogSession {
  const inExcel = host === "excel";
  const latest = useRef(r);
  latest.current = r;

  // ================= Panel samping =================
  const stored = useRef<StoredPdf | null>(null);
  const storedState = useRef<SessionState | null>(null);
  const [storedName, setStoredName] = useState<string | null>(null);
  const paneAssembler = useRef(new ChunkAssembler());

  // PDF yang dibuka langsung di panel samping juga menjadi sesi (agar bisa dipindah ke jendela besar).
  useEffect(() => {
    if (isDialog || !r.pdf) return;
    stored.current = {
      meta: { fileName: r.pdf.fileName, fingerprint: r.pdf.fingerprint },
      base64: bytesToBase64(r.pdf.bytes),
    };
    setStoredName(r.pdf.fileName);
  }, [isDialog, r.pdf]);
  useEffect(() => {
    if (!isDialog && r.pdf) storedState.current = r.session;
  }, [isDialog, r.pdf, r.session]);

  const pendingReady = useRef(false);
  const sendStoredToDialog = useCallback(() => {
    const dialog = dialogRef.current;
    const s = stored.current;
    if (!dialog) {
      pendingReady.current = true; // jendela besar siap sebelum panel menerima pegangannya
      return;
    }
    pendingReady.current = false;
    if (!s) return;
    const state: SessionState = storedState.current ?? {
      locale: "id",
      overrides: {},
      scaleChoice: "auto",
      footingOn: false,
      page: 1,
    };
    for (const c of toChunks("pdf", s.base64, `${Date.now()}`, { ...s.meta, state })) {
      if (!dialog.send(c)) break;
    }
  }, [dialogRef]);

  const handlePaneMessage = useCallback(
    (m: ToPaneMessage) => {
      if (m.type === "dialog-ready") {
        sendStoredToDialog();
      } else if (m.type === "session-state") {
        if (stored.current?.meta.fingerprint === m.fingerprint) storedState.current = m.state;
      } else if (m.type === "chunk" && m.channel === "pdf") {
        const done = paneAssembler.current.add(m);
        if (!done?.meta) return;
        stored.current = {
          meta: { fileName: done.meta.fileName, fingerprint: done.meta.fingerprint },
          base64: done.data,
        };
        storedState.current = done.meta.state;
        setStoredName(done.meta.fileName);
      }
    },
    [sendStoredToDialog],
  );

  const onDialogOpened = useCallback(() => {
    if (pendingReady.current) sendStoredToDialog();
  }, [sendStoredToDialog]);

  const forget = useCallback(() => {
    stored.current = null;
    storedState.current = null;
    setStoredName(null);
  }, []);

  // ================= Jendela besar =================
  const dialogAssembler = useRef(new ChunkAssembler());
  const [restoring, setRestoring] = useState(false);
  /** Sidik PDF yang datang dari panel samping (tidak perlu dikirim balik). */
  const fromPane = useRef<string | null>(null);

  const handleDialogChunk = useCallback((c: ChunkMsg) => {
    if (c.channel !== "pdf") return;
    setRestoring(true);
    const done = dialogAssembler.current.add(c);
    if (!done) return;
    if (!done.meta) {
      setRestoring(false);
      return;
    }
    const { fileName, fingerprint, state } = done.meta;
    fromPane.current = fingerprint;
    const bytes = base64ToBytes(done.data);
    const file = new File([bytes], fileName, { type: "application/pdf" });
    void latest.current.openFile(file, { fingerprint, state }).finally(() => setRestoring(false));
  }, []);

  // PDF baru dibuka di jendela besar → simpan salinannya di panel samping.
  useEffect(() => {
    if (!isDialog || !inExcel || !r.pdf) return;
    if (fromPane.current === r.pdf.fingerprint) return;
    const meta: PdfMeta = { fileName: r.pdf.fileName, fingerprint: r.pdf.fingerprint, state: latest.current.session };
    for (const c of toChunks("pdf", bytesToBase64(r.pdf.bytes), `${Date.now()}`, meta)) {
      if (!sendToTaskPane(c)) break;
    }
    fromPane.current = r.pdf.fingerprint;
  }, [isDialog, inExcel, r.pdf]);

  // Progres berubah → kirim ke panel samping (ditunda sebentar).
  useEffect(() => {
    if (!isDialog || !inExcel || !r.pdf) return;
    const fingerprint = r.pdf.fingerprint;
    const state = r.session;
    const t = window.setTimeout(() => sendToTaskPane({ type: "session-state", fingerprint, state }), 400);
    return () => window.clearTimeout(t);
  }, [isDialog, inExcel, r.pdf, r.session]);

  return { storedName, handlePaneMessage, handleDialogChunk, forget, onDialogOpened, restoring };
}
