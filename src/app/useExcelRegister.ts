/**
 * Sambungan hasil footing ↔ register Excel.
 *
 * - Panel samping (task pane): menulis ke sheet RA_Register dan mendengarkan klik sel di sheet itu.
 * - Jendela besar (dialog Office): TIDAK bisa menulis ke workbook. Hasil footing dikirim ke panel samping
 *   (dipotong-potong), panel samping yang menulis; klik baris register diteruskan balik ke jendela besar.
 *   Karena itu panel samping harus tetap terbuka.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Reviewer } from "./useReviewer";
import { sendToTaskPane, type DialogHandle, type HostStatus } from "../services/office/officeService";
import { registerRows, resolveLocation, shortFingerprint, type RegisterRow } from "../domain/register/register";
import { syncRegister, watchRegisterSelection, type RegisterPick } from "../services/office/registerService";
import { ChunkAssembler, toChunks, type ChunkMsg, type ToDialogMessage } from "../services/office/messages";

export type RegisterMode = "pane" | "dialog" | "off";

export interface RegisterUi {
  mode: RegisterMode;
  status: { ok: boolean; text: string } | null;
  busy: boolean;
  sync: () => void;
  /** Panel samping: terima potongan register dari jendela besar. */
  receiveChunk: (c: ChunkMsg) => void;
  /** Jendela besar: tangani pesan register dari panel samping. */
  handleParentMessage: (m: ToDialogMessage) => void;
}

export function useExcelRegister(
  r: Reviewer,
  host: HostStatus,
  isDialog: boolean,
  flash: (msg: string) => void,
  dialogRef: MutableRefObject<DialogHandle | null>,
  /** Jendela besar: sidik PDF yang juga terbuka di panel samping. */
  paneMirror: MutableRefObject<string | null>,
): RegisterUi {
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const mode: RegisterMode = host !== "excel" ? "off" : isDialog ? "dialog" : "pane";

  // Selalu pakai state terbaru di dalam pendengar Excel/dialog.
  const latest = useRef({ r, flash });
  latest.current = { r, flash };

  /** Sorot angka dari baris register di viewer INI (bila PDF-nya terbuka di sini). */
  const showPick = useCallback((pick: RegisterPick): boolean => {
    const { r, flash } = latest.current;
    const loc = pick.location;
    if (!r.pdf) return false;
    const found = resolveLocation(loc, r.tokens);
    const focus = found.find((t) => t.id === loc.focus) ?? found[0];
    if (!focus) {
      flash(`Baris ${pick.id}: angkanya tidak ditemukan di PDF yang terbuka.`);
      return true;
    }
    if (loc.doc !== r.pdf.fingerprint) {
      flash("⚠ Versi draft berbeda dari register (sidik tidak sama); lokasi mungkin bergeser.");
    }
    if (pick.id.startsWith("S-")) r.setActiveSnipId(pick.id.slice(2));
    else if (!r.footingOn) void r.runFooting();
    r.select(focus);
    r.goTo(focus);
    return true;
  }, []);

  // ---------------- Panel samping ----------------
  const onPickInPane = useCallback(
    (pick: RegisterPick) => {
      const shown = showPick(pick);
      const forwarded = dialogRef.current?.send({ type: "register-pick", pick }) ?? false;
      if (!shown && !forwarded) {
        latest.current.flash(
          `Baris ${pick.id}: buka dulu PDF yang sama (sidik ${shortFingerprint(pick.location.doc)}).`,
        );
      }
    },
    [showPick, dialogRef],
  );

  const unwatch = useRef<(() => void) | null>(null);
  const ensureWatch = useCallback(async () => {
    if (unwatch.current) return;
    try {
      unwatch.current = await watchRegisterSelection(onPickInPane);
    } catch (err) {
      console.warn("[Report Audit] gagal memasang pendengar register", err);
    }
  }, [onPickInPane]);

  useEffect(() => {
    if (mode !== "pane") return;
    void ensureWatch();
    return () => {
      unwatch.current?.();
      unwatch.current = null;
    };
  }, [mode, ensureWatch]);

  /** Tulis baris ke Excel (antrian, agar tidak bertabrakan). */
  const queue = useRef<Promise<void>>(Promise.resolve());
  const write = useCallback(
    (rows: RegisterRow[], fromDialog: boolean) => {
      setBusy(true);
      queue.current = queue.current.then(async () => {
        let msg: { ok: boolean; text: string };
        try {
          const res = await syncRegister(rows);
          msg = {
            ok: true,
            text:
              `Sheet RA_Register diperbarui: ${res.added} baris baru, ${res.updated} diperbarui` +
              (res.stale ? `, ${res.stale} tidak berlaku` : "") +
              ".",
          };
          await ensureWatch();
        } catch (err) {
          msg = { ok: false, text: `Gagal menulis register ke Excel: ${String(err)}` };
          if (!fromDialog) latest.current.r.setError({ message: "Gagal menulis register ke Excel.", detail: String(err) });
        }
        setStatus(msg);
        if (fromDialog) {
          latest.current.flash(msg.text);
          dialogRef.current?.send({ type: "register-status", ...msg });
        }
        setBusy(false);
      });
    },
    [ensureWatch, dialogRef],
  );

  const assembler = useRef(new ChunkAssembler());
  const receiveChunk = useCallback(
    (c: ChunkMsg) => {
      const done = assembler.current.add(c);
      if (done === null) return;
      try {
        write(JSON.parse(done.data) as RegisterRow[], true);
      } catch (err) {
        dialogRef.current?.send({ type: "register-status", ok: false, text: `Data register rusak: ${String(err)}` });
      }
    },
    [write, dialogRef],
  );

  // ---------------- Jendela besar ----------------
  const handleParentMessage = useCallback(
    (m: ToDialogMessage) => {
      if (m.type === "register-pick") showPick(m.pick);
      if (m.type === "register-status") {
        setStatus({ ok: m.ok, text: m.text });
        setBusy(false);
      }
    },
    [showPick],
  );

  // ---------------- Kirim (otomatis setiap hasil footing berubah) ----------------
  /** Sudah pernah menulis register untuk dokumen ini (agar penghapusan sum snip terakhir ikut tercatat). */
  const synced = useRef(false);
  useEffect(() => {
    synced.current = false;
  }, [r.pdf]);
  const sync = useCallback(() => {
    const { r } = latest.current;
    if (!r.pdf || (!r.footing && r.snips.length === 0 && !synced.current)) return;
    const rows = registerRows(r.footing, r.snipEvals, r.tokens, r.pdf.fingerprint);
    synced.current = true;
    if (mode === "pane") {
      write(rows, false);
    } else if (mode === "dialog") {
      if (paneMirror.current === r.pdf.fingerprint) {
        // PDF yang sama terbuka di panel samping dengan progres yang sama: panel itu yang menulis ke Excel.
        setStatus({ ok: true, text: "PDF ini juga terbuka di panel samping; panel samping yang menulis ke sheet RA_Register." });
        return;
      }
      const chunks = toChunks("register", JSON.stringify(rows), `${Date.now()}`);
      const ok = chunks.every((c) => sendToTaskPane(c));
      setBusy(ok);
      setStatus(
        ok
          ? { ok: true, text: "Hasil dikirim ke panel samping untuk ditulis ke Excel…" }
          : { ok: false, text: "Gagal mengirim ke panel samping. Pastikan panel samping Report Audit masih terbuka." },
      );
    }
  }, [mode, write, paneMirror]);

  useEffect(() => {
    if (mode === "off" || !r.pdf || (!r.footing && r.snips.length === 0 && !synced.current)) return;
    const t = window.setTimeout(sync, 800);
    return () => window.clearTimeout(t);
  }, [mode, r.footing, r.snipEvals, r.pdf, sync]);

  return { mode, status, busy, sync, receiveChunk, handleParentMessage };
}
