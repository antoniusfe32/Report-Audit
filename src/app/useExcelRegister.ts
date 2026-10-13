/**
 * Sambungan hasil footing ↔ register Excel (task pane saja):
 * - setiap hasil footing berubah (jalankan, koreksi manual, ganti skala) → register diperbarui otomatis;
 * - klik baris di sheet RA_Register → viewer loncat dan menyorot angka-angkanya.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Reviewer } from "./useReviewer";
import type { HostStatus } from "../services/office/officeService";
import { footingRows, resolveLocation, shortFingerprint } from "../domain/register/register";
import { syncRegister, watchRegisterSelection, type RegisterPick } from "../services/office/registerService";

export function useExcelRegister(r: Reviewer, host: HostStatus, enabled: boolean, flash: (msg: string) => void) {
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const active = enabled && host === "excel";

  // Selalu pakai state terbaru di dalam pendengar Excel.
  const latest = useRef({ r, flash });
  latest.current = { r, flash };

  const onPick = useCallback((pick: RegisterPick) => {
    const { r, flash } = latest.current;
    const loc = pick.location;
    if (!r.pdf) {
      flash(`Baris ${pick.id}: buka dulu PDF yang sama (sidik ${shortFingerprint(loc.doc)}).`);
      return;
    }
    const sameDoc = loc.doc === r.pdf.fingerprint;
    const found = resolveLocation(loc, r.tokens);
    const focus = found.find((t) => t.id === loc.focus) ?? found[0];
    if (!focus) {
      flash(`Baris ${pick.id}: angkanya tidak ditemukan di PDF yang terbuka.`);
      return;
    }
    if (!sameDoc) flash("⚠ Versi draft berbeda dari register (sidik tidak sama); lokasi mungkin bergeser.");
    if (!r.footingOn) void r.runFooting();
    r.select(focus);
    r.goTo(focus);
  }, []);

  // Pendengar klik sel: dipasang sekali setelah sheet register ada.
  const unwatch = useRef<(() => void) | null>(null);
  const ensureWatch = useCallback(async () => {
    if (unwatch.current) return;
    try {
      unwatch.current = await watchRegisterSelection(onPick);
    } catch (err) {
      console.warn("[Report Audit] gagal memasang pendengar register", err);
    }
  }, [onPick]);

  useEffect(() => {
    if (!active) return;
    void ensureWatch();
    return () => {
      unwatch.current?.();
      unwatch.current = null;
    };
  }, [active, ensureWatch]);

  // Sinkron otomatis (ditunda sebentar agar koreksi beruntun hanya ditulis sekali).
  const queue = useRef<Promise<void>>(Promise.resolve());
  const sync = useCallback(() => {
    const { r } = latest.current;
    if (!r.footing || !r.pdf) return;
    const rows = footingRows(r.footing, r.tokens, r.pdf.fingerprint);
    setSyncing(true);
    queue.current = queue.current.then(async () => {
      try {
        const res = await syncRegister(rows);
        setSyncStatus(
          `Sheet RA_Register diperbarui: ${res.added} baris baru, ${res.updated} diperbarui` +
            (res.stale ? `, ${res.stale} tidak berlaku` : "") +
            ".",
        );
        await ensureWatch();
      } catch (err) {
        setSyncStatus(null);
        latest.current.r.setError({ message: "Gagal menulis register ke Excel.", detail: String(err) });
      } finally {
        setSyncing(false);
      }
    });
  }, [ensureWatch]);

  useEffect(() => {
    if (!active || !r.footing || !r.pdf) return;
    const t = window.setTimeout(sync, 800);
    return () => window.clearTimeout(t);
  }, [active, r.footing, r.pdf, sync]);

  return { active, syncStatus, syncing, sync };
}
