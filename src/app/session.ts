/**
 * Progres review yang ikut dipindahkan/disimpan bersama PDF (di memori panel samping),
 * sehingga menutup lalu membuka lagi jendela besar tidak memulai dari nol.
 */
import type { NumberLocale } from "../domain/parsing/parseAmount";
import type { Overrides } from "../domain/footing/verticalFooting";
import type { Scale } from "../domain/footing/scale";

export interface SessionState {
  locale: NumberLocale;
  overrides: Overrides;
  /** "auto" | skala | null (= belum ditetapkan). */
  scaleChoice: Scale | "auto" | null;
  footingOn: boolean;
  page: number;
}
