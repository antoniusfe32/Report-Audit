import type { Mark } from "../../domain/footing/verticalFooting";

/** Teks tanda footing untuk tooltip dan panel (tidak hanya warna). */
export const MARK_TEXT: Record<Mark, string> = {
  check: "✓ Komponen footing cocok",
  foot: "F Total cocok (selisih 0)",
  fail: "✗ Total tidak cocok",
  open: "○ Cek manual",
};
