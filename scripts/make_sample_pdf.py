"""
Membuat PDF laporan keuangan SINTETIS untuk pengujian Report Audit.
Semua nama perusahaan, bank, dan angka adalah fiktif.

Jalankan:  python scripts/make_sample_pdf.py samples/contoh-laporan-keuangan.pdf
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
    def __init__(self, path):
        self.c = canvas.Canvas(path, pagesize=A4)
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

    def row(self, label, cy, py, note=None, bold=False, indent=0, rule=False):
        c = self.c
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 9)
        c.drawString(X_LABEL + indent, self.y, label)
        if note:
            c.drawCentredString(X_NOTE, self.y, str(note))
        if rule:
            c.line(X_CY - 70, self.y + 10, X_CY, self.y + 10)
            c.line(X_PY - 70, self.y + 10, X_PY, self.y + 10)
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


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "contoh-laporan-keuangan.pdf")
