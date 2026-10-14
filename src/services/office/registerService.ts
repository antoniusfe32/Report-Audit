/**
 * Register Excel `RA_Register` lewat Office.js:
 * - tulis/perbarui hasil footing (tabel Excel terstruktur di sheet sendiri; data lain tidak ditimpa),
 * - dengarkan klik sel di sheet register → kembalikan lokasi angka agar viewer menyorotnya.
 *
 * Isi baris disusun oleh domain/register (fungsi murni). Di sini hanya urusan Excel.
 * BELUM DIUJI DI EXCEL sampai pemilik mengujinya.
 */
import {
  COL,
  REGISTER_COLUMNS,
  REGISTER_SHEET,
  REGISTER_TABLE,
  STALE_STATUS,
  SUM_ONLY_STATUS,
  TIE_STATUS,
  parseLocation,
  planRegisterUpdate,
  type Cell,
  type RegisterLocation,
  type RegisterRow,
} from "../../domain/register/register";

const NUMBER_FORMAT = "#,##0.##;(#,##0.##);-";
const STATUS_FILL: Record<string, string> = {
  "F cocok": "#C6EFCE",
  "✗ selisih": "#FFC7CE",
  "○ cek manual": "#E7E6E6",
  [STALE_STATUS]: "#FFFFFF",
  [SUM_ONLY_STATUS]: "#E4DFEC",
  [TIE_STATUS]: "#DDEBF7",
  [`${TIE_STATUS} (tanda berlawanan)`]: "#DDEBF7",
};

export interface RegisterSyncResult {
  added: number;
  updated: number;
  stale: number;
}

/** Kolom huruf untuk indeks 0-based (cukup untuk < 26 kolom). */
const colLetter = (i: number) => String.fromCharCode(65 + i);

export async function syncRegister(fresh: RegisterRow[]): Promise<RegisterSyncResult> {
  let result: RegisterSyncResult = { added: 0, updated: 0, stale: 0 };
  await Excel.run(async (ctx) => {
    const wb = ctx.workbook;
    let sheet = wb.worksheets.getItemOrNullObject(REGISTER_SHEET);
    let table = wb.tables.getItemOrNullObject(REGISTER_TABLE);
    await ctx.sync();

    if (table.isNullObject) {
      if (sheet.isNullObject) {
        sheet = wb.worksheets.add(REGISTER_SHEET);
      } else {
        // Sheet bernama RA_Register sudah ada tanpa tabel: jangan timpa isinya.
        const used = sheet.getUsedRangeOrNullObject(true);
        await ctx.sync();
        if (!used.isNullObject) {
          throw new Error(
            `Sheet "${REGISTER_SHEET}" sudah berisi data lain. Ganti nama sheet tersebut, lalu jalankan lagi.`,
          );
        }
      }
      const last = colLetter(REGISTER_COLUMNS.length - 1);
      const header = sheet.getRange(`A1:${last}1`);
      header.values = [[...REGISTER_COLUMNS]];
      table = sheet.tables.add(`A1:${last}1`, true);
      table.name = REGISTER_TABLE;
      // Kolom "Lokasi" (JSON koordinat) disembunyikan.
      sheet.getRange(`${colLetter(COL.location)}:${colLetter(COL.location)}`).columnHidden = true;
      await ctx.sync();
    }

    const body = table.getDataBodyRange();
    body.load("values");
    await ctx.sync();
    const plan = planRegisterUpdate(body.values as Cell[][], fresh);

    for (const u of [...plan.updates, ...plan.fillBlank]) body.getRow(u.index).values = [u.row];
    for (const i of plan.stale) body.getCell(i, COL.status).values = [[STALE_STATUS]];
    if (plan.appends.length) table.rows.add(undefined, plan.appends);
    await ctx.sync();

    // Format angka & warna status untuk seluruh isi tabel.
    const all = table.getDataBodyRange();
    all.load("values,rowCount");
    await ctx.sync();
    const n = all.rowCount;
    all.getColumn(COL.reported).getResizedRange(0, COL.difference - COL.reported).numberFormat = Array.from(
      { length: n },
      () => [NUMBER_FORMAT, NUMBER_FORMAT, NUMBER_FORMAT],
    );
    (all.values as Cell[][]).forEach((row, i) => {
      const fill = STATUS_FILL[String(row[COL.status])];
      if (fill) all.getCell(i, COL.status).format.fill.color = fill;
    });
    // Autofit semua kolom kecuali "Lokasi" (tersembunyi) yang selalu kolom terakhir.
    table.getRange().getResizedRange(0, -1).format.autofitColumns();
    await ctx.sync();

    result = {
      added: plan.appends.length + plan.fillBlank.length,
      updated: plan.updates.length,
      stale: plan.stale.length,
    };
  });
  return result;
}

export type RegisterPick = { location: RegisterLocation; id: string };

/**
 * Pasang pendengar klik sel pada sheet register. Mengembalikan fungsi untuk melepasnya,
 * atau null bila sheet register belum ada.
 */
export async function watchRegisterSelection(onPick: (pick: RegisterPick) => void): Promise<(() => void) | null> {
  let handler: OfficeExtension.EventHandlerResult<Excel.WorksheetSelectionChangedEventArgs> | null = null;
  await Excel.run(async (ctx) => {
    const sheet = ctx.workbook.worksheets.getItemOrNullObject(REGISTER_SHEET);
    await ctx.sync();
    if (sheet.isNullObject) return;
    handler = sheet.onSelectionChanged.add(async (ev) => {
      try {
        const pick = await readRegisterRow(ev.address);
        if (pick) onPick(pick);
      } catch (err) {
        console.warn("[Report Audit] gagal membaca baris register", err);
      }
    });
    await ctx.sync();
  });
  if (!handler) return null;
  const h = handler as OfficeExtension.EventHandlerResult<Excel.WorksheetSelectionChangedEventArgs>;
  return () => {
    Excel.run(h.context, async (ctx) => {
      h.remove();
      await ctx.sync();
    }).catch(() => undefined);
  };
}

/** Baca baris tabel register pada sel yang dipilih (memakai nama kolom, aman bila kolom digeser). */
async function readRegisterRow(address: string): Promise<RegisterPick | null> {
  let pick: RegisterPick | null = null;
  await Excel.run(async (ctx) => {
    const sheet = ctx.workbook.worksheets.getItem(REGISTER_SHEET);
    const table = ctx.workbook.tables.getItem(REGISTER_TABLE);
    const header = table.getHeaderRowRange();
    header.load("rowIndex,columnIndex,values,columnCount");
    const sel = sheet.getRange(address);
    sel.load("rowIndex");
    await ctx.sync();
    if (sel.rowIndex <= header.rowIndex) return;
    const names = (header.values[0] as Cell[]).map(String);
    const row = sheet.getRangeByIndexes(sel.rowIndex, header.columnIndex, 1, header.columnCount);
    row.load("values");
    await ctx.sync();
    const values = row.values[0] as Cell[];
    const location = parseLocation(values[names.indexOf("Lokasi")]);
    if (location) pick = { location, id: String(values[names.indexOf("ID")]) };
  });
  return pick;
}
