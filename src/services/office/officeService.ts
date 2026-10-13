/**
 * Pembungkus Office.js: deteksi host, tulis ke Excel, dan jendela dialog.
 * Semua fungsi aman dipanggil di browser biasa (tanpa Office) — akan menolak
 * dengan pesan yang jelas, bukan crash.
 */

import { parseMessage, type ToDialogMessage, type ToPaneMessage } from "./messages";

export type HostStatus = "loading" | "excel" | "browser";

export interface SelectionPayload {
  type: "selection";
  page: number;
  text: string;
  value: number | null;
  label: string;
}

export function readyOffice(): Promise<HostStatus> {
  return new Promise((resolve) => {
    const officeGlobal = (globalThis as { Office?: typeof Office }).Office;
    if (!officeGlobal?.onReady) {
      resolve("browser");
      return;
    }
    // Di dalam Excel, onReady selalu terpanggil (Excel web kadang lambat) → tunggu cukup lama.
    // Di browser biasa office.js juga memanggil onReady (host kosong), jadi batas waktu ini jarang terpakai.
    const timer = setTimeout(() => resolve("browser"), 15000);
    officeGlobal.onReady((info) => {
      clearTimeout(timer);
      resolve(info.host === officeGlobal.HostType.Excel ? "excel" : "browser");
    });
  });
}

/**
 * Tulis nilai ke sel aktif dan referensi sumbernya ke sel di sebelah kanan.
 * Contoh: [125750] [Hal. 3 · Kas dan setara kas · "125.750"]
 */
export async function writeToActiveCell(payload: SelectionPayload): Promise<string> {
  let address = "";
  await Excel.run(async (context) => {
    const cell = context.workbook.getActiveCell();
    const target = cell.getResizedRange(0, 1);
    const ref = `Hal. ${payload.page} · ${payload.label || "(tanpa label)"} · "${payload.text}"`;
    target.values = [[payload.value ?? "", ref]];
    cell.numberFormat = [["#,##0;(#,##0);-"]];
    target.load("address");
    await context.sync();
    address = target.address;
  });
  return address;
}

/** Tulis satu nilai (angka saja) ke sel aktif. Mengembalikan alamat sel. */
export async function writeValueToActiveCell(value: number): Promise<string> {
  let address = "";
  await Excel.run(async (context) => {
    const cell = context.workbook.getActiveCell();
    cell.values = [[value]];
    cell.numberFormat = [[Number.isInteger(value) ? "#,##0;(#,##0);-" : "#,##0.##;(#,##0.##);-"]];
    cell.load("address");
    await context.sync();
    address = cell.address;
  });
  return address;
}

export type DialogHandle = {
  close: () => void;
  /** Kirim pesan ke jendela besar (DialogApi 1.2). false bila tidak didukung/gagal. */
  send: (msg: ToDialogMessage) => boolean;
};

/**
 * Buka aplikasi yang sama di jendela besar (Office Dialog API).
 * Di Excel web jendela ini muncul sebagai popup browser.
 */
export function openLargeWindow(
  onMessage: (msg: ToPaneMessage) => void,
  onClosed: () => void,
): Promise<DialogHandle> {
  const url = new URL(window.location.href);
  url.searchParams.set("mode", "dialog");
  return new Promise((resolve, reject) => {
    Office.context.ui.displayDialogAsync(
      url.toString(),
      { height: 85, width: 70, displayInIframe: false },
      (result) => {
        if (result.status === Office.AsyncResultStatus.Failed) {
          const code = result.error.code;
          const hint =
            code === 12009
              ? "Popup diblokir browser. Izinkan popup untuk situs Excel, lalu coba lagi."
              : code === 12007
                ? "Jendela besar sudah terbuka."
                : `Gagal membuka jendela (kode ${code}): ${result.error.message}`;
          reject(new Error(hint));
          return;
        }
        const dialog = result.value;
        dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => {
          if ("message" in arg) {
            const data = parseMessage<ToPaneMessage>(arg.message);
            if (data) onMessage(data);
          }
        });
        dialog.addEventHandler(Office.EventType.DialogEventReceived, () => onClosed());
        resolve({
          close: () => dialog.close(),
          send: (msg) => {
            try {
              dialog.messageChild(JSON.stringify(msg));
              return true;
            } catch {
              return false;
            }
          },
        });
      },
    );
  });
}

/** Dipanggil dari dalam jendela besar untuk mengirim pesan ke task pane. */
export function sendToTaskPane(payload: ToPaneMessage): boolean {
  try {
    Office.context.ui.messageParent(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/**
 * Dipanggil di dalam jendela besar: terima pesan dari task pane (DialogApi 1.2).
 * Mengembalikan false bila host tidak mendukung.
 */
export function onParentMessage(handler: (msg: ToDialogMessage) => void): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (!Office.context.requirements.isSetSupported("DialogApi", "1.2")) {
        resolve(false);
        return;
      }
      Office.context.ui.addHandlerAsync(
        Office.EventType.DialogParentMessageReceived,
        (arg: { message?: string }) => {
          const msg = arg.message ? parseMessage<ToDialogMessage>(arg.message) : null;
          if (msg) handler(msg);
        },
        (res) => resolve(res.status === Office.AsyncResultStatus.Succeeded),
      );
    } catch {
      resolve(false);
    }
  });
}
