/**
 * Satu sesi review di dua jendela: panel samping (task pane) dan jendela besar (dialog Office).
 *
 * - PDF dibuka di jendela besar → otomatis juga dibuka di panel samping (dan sebaliknya: klik "Jendela besar"
 *   membawa PDF panel samping). Pengguna bisa berpindah jendela tanpa memilih file lagi.
 * - Progres (koreksi manual, skala, format angka, footing aktif) disinkronkan dua arah. Halaman tidak
 *   disinkronkan: tiap jendela punya posisi gulir sendiri.
 * - Panel samping menyimpan salinan sesi di MEMORI, sehingga jendela besar bisa ditutup dan dibuka lagi.
 *   Tidak ada yang ditulis ke disk, server, atau workbook. Sesi hilang bila panel samping ditutup.
 *
 * Pencegahan gema: progres yang baru diterima dari jendela lain tidak dikirim balik (lastApplied).
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Reviewer } from "./useReviewer";
import { sessionKey, type SessionState } from "./session";
import { sendToTaskPane, type DialogHandle, type HostStatus } from "../services/office/officeService";
import {
  ChunkAssembler,
  base64ToBytes,
  bytesToBase64,
  toChunks,
  type PdfMeta,
  type ToDialogMessage,
  type ToPaneMessage,
} from "../services/office/messages";

interface StoredPdf {
  meta: Omit<PdfMeta, "state">;
  base64: string;
}

export interface DialogSession {
  /** Panel samping: sidik & nama PDF yang tersimpan untuk jendela besar (null bila belum ada). */
  stored: { name: string; fingerprint: string } | null;
  /** Panel samping: tangani pesan sesi dari jendela besar. */
  handlePaneMessage: (m: ToPaneMessage) => void;
  /** Jendela besar: tangani pesan sesi dari panel samping. */
  handleParentMessage: (m: ToDialogMessage) => void;
  /** Panel samping: lupakan sesi tersimpan. */
  forget: () => void;
  /** Panel samping: dipanggil setelah jendela besar terbuka (kirim sesi bila jendela besar sudah siap duluan). */
  onDialogOpened: () => void;
  /** Sedang membuka PDF yang dikirim dari jendela lain. */
  restoring: boolean;
}

const DEFAULT_STATE: SessionState = {
  locale: "id",
  overrides: {},
  scaleChoice: "auto",
  footingOn: false,
  page: 1,
  snips: [],
  ties: [],
};

export function useDialogSession(
  r: Reviewer,
  host: HostStatus,
  isDialog: boolean,
  dialogRef: MutableRefObject<DialogHandle | null>,
  /** Jendela besar: sidik PDF yang juga terbuka di panel samping (panel yang menulis register). */
  paneMirror: MutableRefObject<string | null>,
  flash: (msg: string) => void,
): DialogSession {
  const inExcel = host === "excel";
  const latest = useRef({ r, flash });
  latest.current = { r, flash };
  const [restoring, setRestoring] = useState(false);

  /** Kunci progres terakhir yang DITERIMA dari jendela lain (tidak dikirim balik). */
  const lastApplied = useRef<string | null>(null);
  /** Progres terbaru dari jendela lain untuk PDF yang sedang dibuka (diterapkan setelah selesai dibuka). */
  const pendingRemote = useRef<{ fingerprint: string; state: SessionState } | null>(null);

  const applyRemote = useCallback((fingerprint: string, state: SessionState) => {
    const rr = latest.current.r;
    if (rr.pdf?.fingerprint !== fingerprint) {
      pendingRemote.current = { fingerprint, state }; // PDF-nya masih dibuka
      return;
    }
    lastApplied.current = sessionKey(state);
    rr.applySession(state);
  }, []);

  /** Buka PDF kiriman jendela lain; progresnya tidak dikirim balik. */
  const openRemote = useCallback((base64: string, meta: PdfMeta) => {
    lastApplied.current = sessionKey(meta.state);
    pendingRemote.current = null;
    setRestoring(true);
    const file = new File([base64ToBytes(base64)], meta.fileName, { type: "application/pdf" });
    void latest.current.r.openFile(file, { fingerprint: meta.fingerprint, state: meta.state }).finally(() => setRestoring(false));
  }, []);

  // Setelah PDF selesai dibuka: terapkan progres yang datang selama proses membuka.
  useEffect(() => {
    const p = pendingRemote.current;
    if (r.pdf && p && p.fingerprint === r.pdf.fingerprint) {
      pendingRemote.current = null;
      lastApplied.current = sessionKey(p.state);
      r.applySession(p.state);
    }
  }, [r.pdf, r]);

  // ================= Panel samping =================
  const stored = useRef<StoredPdf | null>(null);
  const storedState = useRef<SessionState | null>(null);
  const [storedInfo, setStoredInfo] = useState<{ name: string; fingerprint: string } | null>(null);
  const paneAssembler = useRef(new ChunkAssembler());
  /** Sidik PDF yang sedang terbuka di jendela besar (diketahui panel samping). */
  const dialogDoc = useRef<string | null>(null);

  const tellMirror = useCallback(() => {
    const fp = latest.current.r.pdf?.fingerprint ?? null;
    dialogRef.current?.send({ type: "pane-mirror", fingerprint: fp });
  }, [dialogRef]);

  // PDF yang terbuka di panel samping = sesi tersimpan (agar bisa dibawa ke jendela besar).
  useEffect(() => {
    if (isDialog || !r.pdf) return;
    if (stored.current?.meta.fingerprint !== r.pdf.fingerprint) {
      stored.current = {
        meta: { fileName: r.pdf.fileName, fingerprint: r.pdf.fingerprint },
        base64: bytesToBase64(r.pdf.bytes),
      };
      setStoredInfo({ name: r.pdf.fileName, fingerprint: r.pdf.fingerprint });
    }
    // PDF baru dibuka di panel samping saat jendela besar terbuka → jendela besar ikut membukanya.
    if (dialogRef.current && dialogDoc.current !== r.pdf.fingerprint) sendStoredRef.current();
    else tellMirror();
  }, [isDialog, r.pdf, tellMirror, dialogRef]);

  // Progres di panel samping berubah → simpan, dan kirim ke jendela besar bila sedang terbuka.
  useEffect(() => {
    if (isDialog || !r.pdf) return;
    storedState.current = r.session;
    const key = sessionKey(r.session);
    if (key === lastApplied.current) return; // baru diterima dari jendela besar
    lastApplied.current = null;
    const fingerprint = r.pdf.fingerprint;
    const state = r.session;
    const t = window.setTimeout(() => dialogRef.current?.send({ type: "session-state", fingerprint, state }), 400);
    return () => window.clearTimeout(t);
  }, [isDialog, r.pdf, r.session, dialogRef]);

  const pendingReady = useRef(false);
  const sendStoredToDialog = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      pendingReady.current = true; // jendela besar siap sebelum panel menerima pegangannya
      return;
    }
    pendingReady.current = false;
    const s = stored.current;
    if (!s) return;
    const state = storedState.current ?? DEFAULT_STATE;
    for (const c of toChunks("pdf", s.base64, `${Date.now()}`, { ...s.meta, state })) {
      if (!dialog.send(c)) return;
    }
    dialogDoc.current = s.meta.fingerprint;
    tellMirror();
  }, [dialogRef, tellMirror]);
  const sendStoredRef = useRef(sendStoredToDialog);
  sendStoredRef.current = sendStoredToDialog;

  const handlePaneMessage = useCallback(
    (m: ToPaneMessage) => {
      if (m.type === "dialog-ready") {
        sendStoredToDialog();
      } else if (m.type === "session-state") {
        if (stored.current?.meta.fingerprint === m.fingerprint) storedState.current = m.state;
        applyRemote(m.fingerprint, m.state);
      } else if (m.type === "chunk" && m.channel === "pdf") {
        const done = paneAssembler.current.add(m);
        if (!done?.meta) return;
        const { fileName, fingerprint, state } = done.meta;
        dialogDoc.current = fingerprint;
        stored.current = { meta: { fileName, fingerprint }, base64: done.data };
        storedState.current = state;
        setStoredInfo({ name: fileName, fingerprint });
        // Buka juga di panel samping, agar bisa langsung lanjut kerja di sini.
        if (latest.current.r.pdf?.fingerprint !== fingerprint) {
          latest.current.flash(`PDF dari jendela besar juga dibuka di panel ini: ${fileName}`);
          openRemote(done.data, done.meta);
        }
      }
    },
    [sendStoredToDialog, applyRemote, openRemote],
  );

  const onDialogOpened = useCallback(() => {
    if (pendingReady.current) sendStoredToDialog();
  }, [sendStoredToDialog]);

  const forget = useCallback(() => {
    stored.current = null;
    storedState.current = null;
    setStoredInfo(null);
  }, []);

  // ================= Jendela besar =================
  const dialogAssembler = useRef(new ChunkAssembler());
  /** Sidik PDF yang datang dari panel samping (tidak perlu dikirim balik). */
  const fromPane = useRef<string | null>(null);

  const handleParentMessage = useCallback(
    (m: ToDialogMessage) => {
      if (m.type === "pane-mirror") {
        paneMirror.current = m.fingerprint;
      } else if (m.type === "session-state") {
        applyRemote(m.fingerprint, m.state);
      } else if (m.type === "chunk" && m.channel === "pdf") {
        setRestoring(true);
        const done = dialogAssembler.current.add(m);
        if (!done) return;
        if (!done.meta) {
          setRestoring(false);
          return;
        }
        fromPane.current = done.meta.fingerprint;
        if (latest.current.r.pdf?.fingerprint === done.meta.fingerprint) {
          setRestoring(false);
          applyRemote(done.meta.fingerprint, done.meta.state);
          return;
        }
        openRemote(done.data, done.meta);
      }
    },
    [applyRemote, openRemote, paneMirror],
  );

  // PDF baru dibuka di jendela besar → kirim ke panel samping (panel ikut membukanya).
  useEffect(() => {
    if (!isDialog || !inExcel || !r.pdf) return;
    if (fromPane.current === r.pdf.fingerprint) return;
    const meta: PdfMeta = { fileName: r.pdf.fileName, fingerprint: r.pdf.fingerprint, state: latest.current.r.session };
    for (const c of toChunks("pdf", bytesToBase64(r.pdf.bytes), `${Date.now()}`, meta)) {
      if (!sendToTaskPane(c)) break;
    }
    fromPane.current = r.pdf.fingerprint;
  }, [isDialog, inExcel, r.pdf]);

  // Progres di jendela besar berubah → kirim ke panel samping (juga halaman, untuk dibuka lagi nanti).
  const lastSentPage = useRef(0);
  useEffect(() => {
    if (!isDialog || !inExcel || !r.pdf) return;
    const key = sessionKey(r.session);
    if (key === lastApplied.current && r.session.page === lastSentPage.current) return;
    if (key !== lastApplied.current) lastApplied.current = null;
    const fingerprint = r.pdf.fingerprint;
    const state = r.session;
    const t = window.setTimeout(() => {
      lastSentPage.current = state.page;
      sendToTaskPane({ type: "session-state", fingerprint, state });
    }, 400);
    return () => window.clearTimeout(t);
  }, [isDialog, inExcel, r.pdf, r.session]);

  return {
    stored: storedInfo,
    handlePaneMessage,
    handleParentMessage,
    forget,
    onDialogOpened,
    restoring,
  };
}
