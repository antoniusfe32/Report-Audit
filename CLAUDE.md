# CLAUDE.md — aturan kerja proyek Report Audit

## Konteks
- Pemilik: analis Accounting Process & Reporting (latar audit Big Four), **bukan developer**. Jelaskan dalam
  bahasa Indonesia yang praktis, beri perintah persis, jangan pakai jargon tanpa penjelasan.
- Produk: add-in Excel (Office.js) untuk footing & tie-out draft laporan keuangan PDF. Dipakai sendiri, di
  **Excel web**. Hosting: GitHub Pages dari folder `docs/` (hasil `npm run build`).
- Ini alat bantu review, bukan pengganti judgment. Nilai sama ≠ tie. Sistem hanya menyarankan, reviewer memutuskan.

## Batas keras
1. **Lokal saja**: PDF tidak pernah dikirim ke server/API/AI mana pun. Tidak ada telemetry. Jangan log isi tabel.
2. **Jangan commit data asli** perusahaan. Data uji hanya sintetis (`scripts/make_sample_pdf.py`).
3. Jangan meniru kode, desain, nama, atau ikon produk komersial (mis. DataSnipper).
4. Tanda negatif tidak boleh hilang; angka ambigu ditandai, tidak dikonversi diam-diam.
5. Footing tidak boleh "lulus" bila ada komponen hilang/ambigu atau skala belum ditetapkan.

## Teknis
- React + TypeScript + Vite. pdf.js memakai **build legacy** (`pdfjs-dist/legacy/...`) karena build standar v6
  butuh fitur JS terlalu baru untuk WebView Excel. Jangan diganti tanpa uji di Excel.
- Logika bisnis = fungsi murni di `src/domain/` (parsing, token angka, matching) + unit test. Komponen React tipis.
- Koordinat disimpan dalam **satuan halaman PDF**, bukan piksel layar.
- Office.js hanya lewat `src/services/office/`. Aplikasi harus tetap jalan di browser biasa (mode pratinjau).
- Tambah dependency hanya dengan alasan jelas (fungsi, lisensi, ukuran bundle).

## Setiap selesai satu perubahan
Jalankan dan laporkan hasil **sebenarnya**: `npx tsc -b --noEmit`, `npm test`, `npm run build`.
Jangan klaim fitur jalan di Excel sebelum pemilik mengujinya di Excel. Sebutkan jelas apa yang belum diuji.
Berikan ringkasan perubahan, file yang diubah, dan saran pesan commit. Jangan push tanpa diminta.
