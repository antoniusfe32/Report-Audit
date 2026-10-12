# Roadmap Report Audit

Prinsip: setiap fase harus **dipakai di satu siklus closing nyata** sebelum fase berikutnya dimulai.

## Fase 0 — Eksperimen kelayakan (versi ini)
- [x] Viewer PDF lokal (pdf.js legacy) + zoom + navigasi halaman
- [x] Indeks angka per halaman dengan koordinat PDF + label baris
- [x] Parser angka format Indonesia/US, kurung = negatif, dash = nol, catatan kaki dilepas
- [x] Cari nilai sama di seluruh dokumen, loncat dan sorot hasilnya
- [x] Tombol unduh manifest otomatis untuk GitHub Pages
- [ ] **Uji di Excel web kantor**: sideload, tulis ke sel, jendela besar (lihat checklist di README)
- [ ] Uji dengan 1 draft PDF asli (di laptop saja)

## Fase 1 — Tie-out yang bisa dipakai
- [ ] Konfirmasi tie (tied / bukan) + komentar; tanda "T" di PDF
- [ ] Register tie ke tabel Excel terstruktur (`RA_Ties`), termasuk halaman dan sidik dokumen
- [ ] Peringatan bila PDF yang dibuka berbeda sidik dengan register
- [ ] Skala (ribuan/jutaan) per dokumen + toleransi pembulatan

## Fase 2 — Footing & cross-footing
- [ ] Seleksi kotak di halaman → tabel baris/kolom yang bisa dikoreksi
- [ ] Pilih angka komponen (+/−) dan total → hitung selisih
- [ ] Tanda F / CF berwarna + teks di PDF; register `RA_Tests` di Excel

## Nanti (hanya bila fase 1–2 sudah stabil)
- Simpan & buka ulang sesi review, saran subtotal otomatis, OCR lokal untuk PDF scan, perbandingan versi draft
