"""
Membuat PDF laporan keuangan SINTETIS untuk pengujian Report Audit.
Semua nama perusahaan, bank, dan angka adalah fiktif.

Jalankan:
  python scripts/make_sample_pdf.py samples/contoh-laporan-keuangan.pdf            (tie-out, Fase 0)
  python scripts/make_sample_pdf.py --footing samples/contoh-footing.pdf           (footing, Fase 1)
"""
import sys
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

W, H = A4
COMPANY = "PT SAMUDERA CONTOH NUSANTARA"
X_LABEL, X_NOTE, X_CY, X_PY = 60, 318, 450, 535


def fmt(v):
    """Format Indonesia: titik ribuan, negatif dalam kurung, nol jadi '-'."""
    if v is None:
        return ""
    if v == 0:
        return "-"
    s = f"{abs(v):,}".replace(",", ".")
    return f"({s})" if v < 0 else s


class Doc:
    def __init__(self, path, invariant=0):
        # invariant=1: tanpa tanggal/ID acak, sehingga file hasil selalu identik (sidik SHA-256 stabil).
        self.c = canvas.Canvas(path, pagesize=A4, invariant=invariant)
        self.c.setTitle("Contoh Laporan Keuangan (Sintetis)")
        self.c.setAuthor("Data sintetis untuk pengujian")
        self.page = 0

    def new_page(self, title, subtitle="31 Desember 2025 dan 2024", unit="(Dinyatakan dalam ribuan Rupiah)"):
        if self.page:
            self.footer()
            self.c.showPage()
        self.page += 1
        c = self.c
        c.setFont("Helvetica-Bold", 11)
        c.drawString(X_LABEL, H - 60, COMPANY)
        c.drawString(X_LABEL, H - 75, title)
        c.setFont("Helvetica", 9)
        c.drawString(X_LABEL, H - 89, subtitle)
        c.drawString(X_LABEL, H - 101, unit)
        self.y = H - 135

    def footer(self):
        self.c.setFont("Helvetica-Oblique", 7.5)
        self.c.drawString(X_LABEL, 40, "Data sintetis - bukan laporan keuangan entitas mana pun.")
        self.c.drawRightString(X_PY, 40, str(self.page))

    def header_row(self, with_note=True):
        c = self.c
        c.setFont("Helvetica-Bold", 9)
        if with_note:
            c.drawCentredString(X_NOTE, self.y, "Catatan")
        c.drawRightString(X_CY, self.y, "2025")
        c.drawRightString(X_PY, self.y, "2024")
        c.line(X_LABEL, self.y - 4, X_PY, self.y - 4)
        self.y -= 18

    def section(self, text):
        self.c.setFont("Helvetica-Bold", 9)
        self.c.drawString(X_LABEL, self.y, text)
        self.y -= 14

    def row(self, label, cy, py, note=None, bold=False, indent=0, rule=False, double=False):
        c = self.c
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 9)
        c.drawString(X_LABEL + indent, self.y, label)
        if note:
            c.drawCentredString(X_NOTE, self.y, str(note))
        if rule:
            c.line(X_CY - 70, self.y + 10, X_CY, self.y + 10)
            c.line(X_PY - 70, self.y + 10, X_PY, self.y + 10)
        if double:  # garis ganda di bawah jumlah akhir
            for x in (X_CY, X_PY):
                c.line(x - 70, self.y - 3, x, self.y - 3)
                c.line(x - 70, self.y - 5, x, self.y - 5)
        c.drawRightString(X_CY, self.y, fmt(cy))
        c.drawRightString(X_PY, self.y, fmt(py))
        self.y -= 14 if not bold else 18

    def text(self, s, size=9):
        self.c.setFont("Helvetica", size)
        self.c.drawString(X_LABEL, self.y, s)
        self.y -= 13

    def save(self):
        self.footer()
        self.c.save()


def main(path):
    d = Doc(path)

    # ---------------- Angka sumber ----------------
    kas = {"Kas": (1_250_420, 1_180_315),
           "Bank Contoh Satu (Rupiah)": (45_300_000, 41_020_000),
           "Bank Contoh Dua (Rupiah)": (29_200_000, 25_000_000),
           "Bank Contoh Satu (Dolar AS)": (20_000_000, 18_000_000),
           "Deposito berjangka": (30_000_000, 25_000_000)}
    kas_total = tuple(sum(v[i] for v in kas.values()) for i in (0, 1))

    piut_3 = (190_420_110, 180_004_118)
    piut_rel = (66_115_650, 59_000_000)
    piut_bruto = (piut_3[0] + piut_rel[0], piut_3[1] + piut_rel[1])
    ckpe = (-8_220_000, -7_100_000)
    piut_neto = (piut_bruto[0] + ckpe[0], piut_bruto[1] + ckpe[1])

    current_assets = [("Kas dan setara kas", kas_total, 4),
                      ("Piutang usaha - neto", piut_neto, 5),
                      ("Persediaan", (18_402_550, 17_115_903), 6),
                      ("Biaya dibayar dimuka", (9_880_000, 7_250_400), 7)]
    noncurrent_assets = [("Aset tetap - neto", (1_215_670_880, 1_180_442_019), 8),
                         ("Aset hak guna - neto", (86_415_300, 94_120_760), 9)]
    current_liab = [("Utang usaha", (152_330_410, 140_882_519), 10),
                    ("Liabilitas sewa - jangka pendek", (22_410_000, 21_007_300), 9),
                    ("Utang pajak", (11_205_660, 9_880_104), 11)]
    noncurrent_liab = [("Liabilitas sewa - jangka panjang", (61_990_300, 72_850_110), 9),
                       ("Liabilitas imbalan kerja", (14_502_870, 13_220_405), None)]

    def tot(rows):
        return tuple(sum(r[1][i] for r in rows) for i in (0, 1))

    ca, nca = tot(current_assets), tot(noncurrent_assets)
    ta = (ca[0] + nca[0], ca[1] + nca[1])
    cl, ncl = tot(current_liab), tot(noncurrent_liab)
    tl = (cl[0] + ncl[0], cl[1] + ncl[1])
    modal = (500_000_000, 500_000_000)
    saldo_laba = (ta[0] - tl[0] - modal[0], ta[1] - tl[1] - modal[1])
    te = (modal[0] + saldo_laba[0], modal[1] + saldo_laba[1])

    # Segmen pendapatan (untuk cross-footing)
    seg = [("Sewa kapal", 410_200_000, 280_115_300, 0),
           ("Jasa keagenan", 95_300_000, 60_410_000, 12_000_000),
           ("Jasa lainnya", 20_115_000, 24_300_000, 10_000_000)]
    revenue_cy = sum(a + b + c for _, a, b, c in seg)

    # ---------------- Hal. 1: sampul ----------------
    d.page = 1
    c = d.c
    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(W / 2, H / 2 + 40, COMPANY)
    c.setFont("Helvetica", 12)
    c.drawCentredString(W / 2, H / 2 + 15, "Laporan Keuangan")
    c.drawCentredString(W / 2, H / 2 - 5, "Tanggal 31 Desember 2025 dan untuk tahun yang berakhir pada tanggal tersebut")
    c.setFont("Helvetica-Oblique", 9)
    c.drawCentredString(W / 2, H / 2 - 40, "DRAFT - data sintetis untuk pengujian aplikasi")

    # ---------------- Hal. 2: posisi keuangan ----------------
    d.new_page("LAPORAN POSISI KEUANGAN")
    d.header_row()
    d.section("ASET")
    d.section("Aset lancar")
    for label, v, n in current_assets:
        d.row(label, *v, note=n, indent=8)
    d.row("Jumlah aset lancar", *ca, bold=True, rule=True)
    d.section("Aset tidak lancar")
    for label, v, n in noncurrent_assets:
        d.row(label, *v, note=n, indent=8)
    d.row("Jumlah aset tidak lancar", *nca, bold=True, rule=True)
    d.row("JUMLAH ASET", *ta, bold=True, rule=True)
    d.y -= 6
    d.section("LIABILITAS DAN EKUITAS")
    d.section("Liabilitas jangka pendek")
    for label, v, n in current_liab:
        d.row(label, *v, note=n, indent=8)
    d.row("Jumlah liabilitas jangka pendek", *cl, bold=True, rule=True)
    d.section("Liabilitas jangka panjang")
    for label, v, n in noncurrent_liab:
        d.row(label, *v, note=n, indent=8)
    d.row("Jumlah liabilitas jangka panjang", *ncl, bold=True, rule=True)
    d.row("JUMLAH LIABILITAS", *tl, bold=True, rule=True)
    d.section("Ekuitas")
    d.row("Modal saham", *modal, indent=8)
    d.row("Saldo laba", *saldo_laba, indent=8)
    d.row("JUMLAH EKUITAS", *te, bold=True, rule=True)
    d.row("JUMLAH LIABILITAS DAN EKUITAS", te[0] + tl[0], te[1] + tl[1], bold=True, rule=True)

    # ---------------- Hal. 3: laba rugi ----------------
    rev = (revenue_cy, 845_210_660)
    cogs = (-701_330_150, -652_880_410)
    gross = (rev[0] + cogs[0], rev[1] + cogs[1])
    ga = (-85_402_330, -80_115_200)
    other = (3_215_400, -1_880_500)
    fin = (-8_902_110, -9_550_330)
    pbt = tuple(gross[i] + ga[i] + other[i] + fin[i] for i in (0, 1))
    tax = (-27_650_300, -22_400_150)
    np_ = (pbt[0] + tax[0], pbt[1] + tax[1])
    d.new_page("LAPORAN LABA RUGI DAN PENGHASILAN KOMPREHENSIF LAIN",
               subtitle="Untuk tahun yang berakhir 31 Desember 2025 dan 2024")
    d.header_row()
    d.row("Pendapatan usaha", *rev, note=12)
    d.row("Beban pokok pendapatan", *cogs, note=13)
    d.row("LABA BRUTO", *gross, bold=True, rule=True)
    d.row("Beban umum dan administrasi", *ga, note=14)
    d.row("Pendapatan (beban) lain-lain - neto", *other)
    d.row("Biaya keuangan", *fin, note=9)
    d.row("LABA SEBELUM PAJAK PENGHASILAN", *pbt, bold=True, rule=True)
    d.row("Beban pajak penghasilan", *tax, note=11)
    d.row("LABA TAHUN BERJALAN", *np_, bold=True, rule=True)

    # ---------------- Hal. 4: catatan 4 & 5 ----------------
    d.new_page("CATATAN ATAS LAPORAN KEUANGAN")
    d.section("4. KAS DAN SETARA KAS")
    d.header_row(with_note=False)
    for label, (cy, py) in kas.items():
        d.row(label, cy, py, indent=8)
    d.row("Jumlah", *kas_total, bold=True, rule=True)
    d.text("Deposito berjangka memperoleh bunga tahunan 4,50% - 5,25%.")
    d.text("Kurs penutupan yang digunakan adalah Rp16.250 per USD 1 (2024: Rp15.480).")
    d.y -= 12
    d.section("5. PIUTANG USAHA")
    d.header_row(with_note=False)
    d.row("Pihak ketiga", *piut_3, indent=8)
    d.row("Pihak berelasi*", *piut_rel, indent=8)
    d.row("Jumlah", *piut_bruto, bold=True, rule=True)
    d.row("Cadangan kerugian kredit ekspektasian", *ckpe, indent=8)
    d.row("Neto", *piut_neto, bold=True, rule=True)
    d.text("* Pihak berelasi merupakan entitas sepengendali (fiktif).", size=8)

    # ---------------- Hal. 5: catatan 12 (cross-footing) ----------------
    d.new_page("CATATAN ATAS LAPORAN KEUANGAN (lanjutan)",
               subtitle="Untuk tahun yang berakhir 31 Desember 2025")
    d.section("12. PENDAPATAN USAHA PER SEGMEN - 2025")
    cols = [("Marine", 300), ("Offshore", 380), ("Lainnya", 455), ("Jumlah", 535)]
    c = d.c
    c.setFont("Helvetica-Bold", 9)
    for name, x in cols:
        c.drawRightString(x, d.y, name)
    c.line(X_LABEL, d.y - 4, 535, d.y - 4)
    d.y -= 18
    col_tot = [0, 0, 0, 0]
    for label, a, b, cc in seg:
        vals = [a, b, cc, a + b + cc]
        c.setFont("Helvetica", 9)
        c.drawString(X_LABEL + 8, d.y, label)
        for (name, x), v in zip(cols, vals):
            c.drawRightString(x, d.y, fmt(v))
        col_tot = [t + v for t, v in zip(col_tot, vals)]
        d.y -= 14
    c.setFont("Helvetica-Bold", 9)
    c.drawString(X_LABEL, d.y, "Jumlah")
    for (name, x), v in zip(cols, col_tot):
        c.line(x - 62, d.y + 10, x, d.y + 10)
        c.drawRightString(x, d.y, fmt(v))
    d.y -= 30
    d.text("Pendapatan dari satu pelanggan (fiktif) melebihi 10% dari jumlah pendapatan usaha,")
    d.text(f"yaitu sebesar {fmt(410_200_000)} pada segmen Marine.")

    d.save()
    print("pendapatan", fmt(revenue_cy), "aset", fmt(ta[0]), "laba", fmt(np_[0]))

# =====================================================================
# PDF sintetis untuk uji FOOTING (Fase 1.3)
# Semua angka fiktif, dalam ribuan Rupiah. Selisih yang DISENGAJA:
#   hal. 1  "Jumlah aset lancar" 2025          selisih  +1  -> harus ✗
#   hal. 1  "JUMLAH LIABILITAS" 2024           selisih  -1  -> harus ✗
#   hal. 2  "LABA SEBELUM PAJAK PENGHASILAN" 2024  selisih +1 -> harus ✗
#   hal. 3  "Saldo 31 Desember 2025" kolom Saldo laba  +1  -> harus ✗
#   hal. 4  "Jumlah biaya perolehan" kolom Penambahan  -1  -> harus ✗
# Jumlah di atasnya dihitung dari angka yang TAMPIL, sehingga total bertingkat tetap F.
# Tabel "9. PERSEDIAAN" terpotong dari hal. 4 ke hal. 5 -> "Jumlah"-nya harus ○ (bukan F, bukan ✗).
# =====================================================================

def grid_header(d, headers, xs, size=8):
    """Judul kolom dua baris, rata kanan, dengan garis di bawahnya."""
    c = d.c
    c.setFont("Helvetica-Bold", size)
    for (l1, l2), x in zip(headers, xs):
        if l1:
            c.drawRightString(x, d.y, l1)
        if l2:
            c.drawRightString(x, d.y - 10, l2)
    d.y -= 10
    c.line(X_LABEL, d.y - 4, xs[-1], d.y - 4)
    d.y -= 17


def grid_row(d, label, values, xs, bold=False, indent=0, rule=False, double=False, size=8, colw=56):
    c = d.c
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    c.drawString(X_LABEL + indent, d.y, label)
    for v, x in zip(values, xs):
        if rule:
            c.line(x - colw, d.y + size + 1, x, d.y + size + 1)
        if double:
            c.line(x - colw, d.y - 3, x, d.y - 3)
            c.line(x - colw, d.y - 5, x, d.y - 5)
        c.drawRightString(x, d.y, fmt(v))
    d.y -= 16 if bold else 13


def colsum(rows):
    return [sum(col) for col in zip(*rows)]


def footing_sample(path):
    d = Doc(path, invariant=1)
    c = d.c

    # ---------- Catatan dulu (angka sumber untuk laporan utama) ----------
    # Mutasi aset tetap 2025: [1 Jan, penambahan, pengurangan, reklasifikasi]; saldo akhir = jumlah baris
    cost = [("Tanah", [120_000_000, 0, 0, 0]),
            ("Bangunan", [210_500_000, 4_200_000, 0, 1_500_000]),
            ("Kapal", [980_300_000, 85_000_000, -32_000_000, 6_000_000]),
            ("Peralatan", [45_880_100, 3_115_400, -1_200_000, 0]),
            ("Aset dalam penyelesaian", [7_500_000, 12_000_000, 0, -7_500_000])]
    accum = [("Bangunan", [-62_150_000, -10_525_000, 0, 0]),
             ("Kapal", [-301_440_200, -49_015_000, 28_800_000, 0]),
             ("Peralatan", [-30_110_000, -6_880_300, 1_150_000, 0])]
    cost = [(l, v + [sum(v)]) for l, v in cost]
    accum = [(l, v + [sum(v)]) for l, v in accum]
    cost_tot = colsum([v for _, v in cost])
    cost_tot_shown = list(cost_tot)
    cost_tot_shown[1] -= 1  # SENGAJA: selisih -1 di kolom Penambahan
    accum_tot = colsum([v for _, v in accum])
    nbv = [a + b for a, b in zip(cost_tot_shown, accum_tot)]
    fa_2025, fa_2024 = cost_tot[4] + accum_tot[4], cost_tot[0] + accum_tot[0]

    inv_a = [("Suku cadang kapal", (18_402_550, 17_115_903)),
             ("Bahan bakar", (12_115_000, 11_880_207)),
             ("Pelumas", (3_402_750, 3_115_000))]
    inv_b = [("Perlengkapan kantor", (1_235_000, 1_090_000)),
             ("Lain-lain", (5_200_000, 4_801_000))]
    inv_tot = tuple(sum(v[i] for _, v in inv_a + inv_b) for i in (0, 1))

    ap3 = [("Pemasok bahan bakar", (61_220_400, 55_880_120)),
           ("Galangan kapal", (40_115_000, 38_450_660)),
           ("Lain-lain", (9_880_310, 7_002_115))]
    ap3_tot = tuple(sum(v[i] for _, v in ap3) for i in (0, 1))
    ap_rel = (12_500_000, 10_000_000)
    ap_tot = (ap3_tot[0] + ap_rel[0], ap3_tot[1] + ap_rel[1])

    # ---------- Hal. 1: laporan posisi keuangan (bertingkat) ----------
    ca = [("Kas dan setara kas", (84_315_220, 79_002_145), 4),
          ("Piutang usaha - neto", (152_880_410, 140_115_982), 5),
          ("Persediaan", inv_tot, 9),
          ("Biaya dibayar dimuka", (6_210_000, 5_880_450), None),
          ("Aset lancar lainnya", (0, 1_250_000), None)]
    nca = [("Aset tetap - neto", (fa_2025, fa_2024), 8),
           ("Aset hak guna - neto", (45_115_300, 52_880_760), None)]
    cl = [("Utang usaha", ap_tot, 10),
          ("Utang pajak", (9_105_660, 8_440_104), None),
          ("Beban akrual", (12_330_000, 11_002_300), None)]
    ncl = [("Utang bank jangka panjang", (210_000_000, 240_000_000), None),
           ("Liabilitas imbalan kerja", (14_502_870, 13_220_405), None)]

    def tot(rows):
        return [sum(r[1][i] for r in rows) for i in (0, 1)]

    ca_t, nca_t, cl_t, ncl_t = tot(ca), tot(nca), tot(cl), tot(ncl)
    ca_shown = [ca_t[0] + 1, ca_t[1]]  # SENGAJA: selisih +1 (2025)
    ta = [ca_shown[i] + nca_t[i] for i in (0, 1)]
    tl = [cl_t[i] + ncl_t[i] for i in (0, 1)]
    tl_shown = [tl[0], tl[1] - 1]  # SENGAJA: selisih -1 (2024)
    modal, agio, oci = (500_000_000, 500_000_000), (25_000_000, 25_000_000), (-1_250_300, -880_100)
    saldo_laba = [ta[i] - tl[i] - modal[i] - agio[i] - oci[i] for i in (0, 1)]
    eq = [("Modal saham", modal), ("Tambahan modal disetor", agio),
          ("Saldo laba", tuple(saldo_laba)), ("Penghasilan komprehensif lain", oci)]
    te = [sum(v[i] for _, v in eq) for i in (0, 1)]

    d.new_page("LAPORAN POSISI KEUANGAN")
    d.header_row()
    d.section("ASET")
    d.section("Aset lancar")
    for label, v, n in ca:
        d.row(label, *v, note=n, indent=8)
    d.row("Jumlah aset lancar", *ca_shown, bold=True, rule=True)
    d.section("Aset tidak lancar")
    for label, v, n in nca:
        d.row(label, *v, note=n, indent=8)
    d.row("Jumlah aset tidak lancar", *nca_t, bold=True, rule=True)
    d.row("JUMLAH ASET", *ta, bold=True, rule=True, double=True)
    d.y -= 4
    d.section("LIABILITAS DAN EKUITAS")
    d.section("Liabilitas jangka pendek")
    for label, v, n in cl:
        d.row(label, *v, note=n, indent=8)
    d.row("Jumlah liabilitas jangka pendek", *cl_t, bold=True, rule=True)
    d.section("Liabilitas jangka panjang")
    for label, v, n in ncl:
        d.row(label, *v, note=n, indent=8)
    d.row("Jumlah liabilitas jangka panjang", *ncl_t, bold=True, rule=True)
    d.row("JUMLAH LIABILITAS", *tl_shown, bold=True, rule=True)
    d.section("Ekuitas")
    for label, v in eq:
        d.row(label, *v, indent=8)
    d.row("JUMLAH EKUITAS", *te, bold=True, rule=True)
    d.row("JUMLAH LIABILITAS DAN EKUITAS", tl_shown[0] + te[0], tl_shown[1] + te[1],
          bold=True, rule=True, double=True)

    # ---------- Hal. 2: laba rugi (subtotal berjalan) ----------
    rev = (1_125_440_300, 980_210_660)
    cogs = (-801_330_150, -712_880_410)
    gross = [rev[i] + cogs[i] for i in (0, 1)]
    opex = [("Beban umum dan administrasi", (-95_402_330, -88_115_200), 14),
            ("Beban penjualan", (-12_880_000, -11_250_400), None),
            ("Pendapatan (beban) lain-lain - neto", (3_215_400, -1_880_500), None),
            ("Biaya keuangan", (-18_902_110, -21_550_330), None)]
    pbt = [gross[i] + sum(v[i] for _, v, _ in opex) for i in (0, 1)]
    pbt_shown = [pbt[0], pbt[1] + 1]  # SENGAJA: selisih +1 (2024)
    tax = (-44_650_300, -32_400_150)
    np_ = [pbt_shown[i] + tax[i] for i in (0, 1)]
    remeas = (-370_200, 215_400)
    ci = [np_[i] + remeas[i] for i in (0, 1)]

    d.new_page("LAPORAN LABA RUGI DAN PENGHASILAN KOMPREHENSIF LAIN",
               subtitle="Untuk tahun yang berakhir 31 Desember 2025 dan 2024")
    d.header_row()
    d.row("Pendapatan usaha", *rev, note=12)
    d.row("Beban pokok pendapatan", *cogs, note=13)
    d.row("LABA BRUTO", *gross, bold=True, rule=True)
    for label, v, n in opex:
        d.row(label, *v, note=n)
    d.row("LABA SEBELUM PAJAK PENGHASILAN", *pbt_shown, bold=True, rule=True)
    d.row("Beban pajak penghasilan", *tax, note=11)
    d.row("LABA TAHUN BERJALAN", *np_, bold=True, rule=True)
    d.section("PENGHASILAN KOMPREHENSIF LAIN")
    d.row("Pengukuran kembali liabilitas imbalan kerja", *remeas, indent=8)
    d.row("JUMLAH PENGHASILAN KOMPREHENSIF TAHUN BERJALAN", *ci, bold=True, rule=True, double=True)

    # ---------- Hal. 3: laporan perubahan ekuitas (mutasi) ----------
    xs = [255, 325, 395, 465, 535]
    sl0, oci0 = 420_115_300, -1_095_500
    div24, div25 = -60_000_000, -75_000_000
    r_open = [500_000_000, 25_000_000, sl0, oci0]
    r_np24 = [0, 0, np_[1], 0]
    r_oci24 = [0, 0, 0, remeas[1]]
    r_div24 = [0, 0, div24, 0]
    r_close24 = colsum([r_open, r_np24, r_oci24, r_div24])
    r_np25 = [0, 0, np_[0], 0]
    r_oci25 = [0, 0, 0, remeas[0]]
    r_div25 = [0, 0, div25, 0]
    r_close25 = colsum([r_close24, r_np25, r_oci25, r_div25])

    def with_total(r):
        return r + [sum(r)]

    close25_shown = with_total(r_close25)
    close25_shown[2] += 1  # SENGAJA: selisih +1 kolom Saldo laba (kolom Jumlah tetap benar)

    d.new_page("LAPORAN PERUBAHAN EKUITAS", subtitle="Untuk tahun yang berakhir 31 Desember 2025 dan 2024")
    grid_header(d, [("Modal", "saham"), ("Tambahan", "modal disetor"), ("Saldo", "laba"),
                    ("Penghasilan", "kompr. lain"), ("Jumlah", "ekuitas")], xs)
    grid_row(d, "Saldo 1 Januari 2024", with_total(r_open), xs, bold=True)
    grid_row(d, "Laba tahun berjalan", with_total(r_np24), xs, indent=8)
    grid_row(d, "Penghasilan komprehensif lain", with_total(r_oci24), xs, indent=8)
    grid_row(d, "Dividen tunai", with_total(r_div24), xs, indent=8)
    grid_row(d, "Saldo 31 Desember 2024", with_total(r_close24), xs, bold=True, rule=True)
    grid_row(d, "Laba tahun berjalan", with_total(r_np25), xs, indent=8)
    grid_row(d, "Penghasilan komprehensif lain", with_total(r_oci25), xs, indent=8)
    grid_row(d, "Dividen tunai", with_total(r_div25), xs, indent=8)
    grid_row(d, "Saldo 31 Desember 2025", close25_shown, xs, bold=True, rule=True, double=True)

    # ---------- Hal. 4: catatan aset tetap (mutasi) + awal tabel persediaan ----------
    d.new_page("CATATAN ATAS LAPORAN KEUANGAN", subtitle="Untuk tahun yang berakhir 31 Desember 2025")
    d.section("8. ASET TETAP")
    grid_header(d, [("1 Januari", "2025"), ("Penambahan", ""), ("Pengurangan", ""),
                    ("Reklasifikasi", ""), ("31 Desember", "2025")], xs)
    d.section("Biaya perolehan")
    for label, v in cost:
        grid_row(d, label, v, xs, indent=8)
    grid_row(d, "Jumlah biaya perolehan", cost_tot_shown, xs, bold=True, rule=True)
    d.section("Akumulasi penyusutan")
    for label, v in accum:
        grid_row(d, label, v, xs, indent=8)
    grid_row(d, "Jumlah akumulasi penyusutan", accum_tot, xs, bold=True, rule=True)
    grid_row(d, "Nilai tercatat", nbv, xs, bold=True, rule=True, double=True)
    d.y -= 10
    d.text("Beban penyusutan dialokasikan ke beban pokok pendapatan dan beban umum dan administrasi.")
    d.text("Aset tetap diasuransikan terhadap risiko kerugian dengan nilai pertanggungan yang memadai.")
    d.y = 170
    d.section("9. PERSEDIAAN")
    d.header_row(with_note=False)
    for label, v in inv_a:
        d.row(label, *v, indent=8)

    # ---------- Hal. 5: lanjutan persediaan + utang usaha ----------
    d.new_page("CATATAN ATAS LAPORAN KEUANGAN (lanjutan)", subtitle="31 Desember 2025 dan 2024")
    d.section("9. PERSEDIAAN (lanjutan)")
    d.header_row(with_note=False)
    for label, v in inv_b:
        d.row(label, *v, indent=8)
    d.row("Jumlah", *inv_tot, bold=True, rule=True)
    d.y -= 14
    d.section("10. UTANG USAHA")
    d.header_row(with_note=False)
    d.section("Pihak ketiga")
    for label, v in ap3:
        d.row(label, *v, indent=8)
    d.row("Jumlah pihak ketiga", *ap3_tot, bold=True, rule=True)
    d.row("Pihak berelasi", *ap_rel, indent=8)
    d.row("Jumlah", *ap_tot, bold=True)  # total berlabel TANPA garis

    d.save()
    print("footing sample:", path, "aset", fmt(ta[0]), "persediaan", fmt(inv_tot[0]))


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--footing":
        footing_sample(args[1] if len(args) > 1 else "contoh-footing.pdf")
    else:
        main(args[0] if args else "contoh-laporan-keuangan.pdf")
