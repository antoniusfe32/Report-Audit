# Roadmap Report Audit

Prinsip: setiap fase harus **dipakai di satu siklus closing nyata** sebelum fase berikutnya dimulai.

## Fase 0 — Eksperimen kelayakan ✅ selesai (12 Okt 2026)
- [x] Viewer PDF lokal (pdf.js legacy) + zoom + navigasi halaman
- [x] Indeks angka per halaman dengan koordinat PDF + label baris
- [x] Parser angka format Indonesia/US, kurung = negatif, dash = nol, catatan kaki dilepas
- [x] Cari nilai sama di seluruh dokumen, loncat dan sorot hasilnya
- [x] Tombol unduh manifest otomatis untuk GitHub Pages
- [x] Terpasang dan terbuka di **Excel desktop** (sideload via registry `HKCU\...\WEF\Developer`) dan Excel web
- [x] Tie-out (cari angka sama lintas halaman) dinilai pemilik **sudah oke**

Masukan pemilik dari uji Fase 0:
- Navigasi halaman per tombol merepotkan → ganti scroll terus.
- Jendela besar membingungkan karena membuka PDF kedua secara terpisah → lihat 1.2.
- Footing belum ada; ini kebutuhan utama berikutnya.

---

## Fase 1 — Spesifikasi (disepakati dengan pemilik, 12 Okt 2026)

Konteks dokumen: draft LK diexport dari Word, **dinyatakan dalam ribuan Rupiah**, total ditandai
**garis di atas angka**. Draft awal sering punya selisih pembulatan — itu harus TERLIHAT, bukan ditoleransi.

### Masukan uji draft asli (13 Okt 2026)
- [x] Angka terpecah di PDF (mis. "9,8" terbaca "8"; hanya digit belakang yang terbaca) → potongan angka
      yang bersebelahan kini digabung, diberi peringatan, dan potongan mentahnya tampil di panel
      ("Potongan PDF") untuk diagnostik. Uji: `samples/contoh-angka-terpecah.pdf`.
- [x] Tie-out antar halaman mengabaikan tanda (kurung/minus); perbedaan tanda tetap ditampilkan
      ("tanda berlawanan"), tidak lagi diperlakukan sebagai peringatan merah. Desimal tetap dibedakan.
- [ ] Sum snip (1.4) belum ada — urutan berikutnya menunggu keputusan pemilik.

### Keputusan pemilik (13 Okt 2026, setelah uji draft asli)
- [x] Tampilan footing memakai **blok warna utuh**: biru muda = angka yang dijumlahkan (satu blok per rangkaian),
      hijau = total cocok, merah = total selisih, abu-abu = total perlu cek manual. Simbol F / ✗ / ○ tetap ada.
- [x] Register Excel (1.5) dikerjakan lebih dulu, dengan perubahan: **semua** hasil footing (termasuk F) masuk ke
      `RA_Register` secara otomatis setiap footing dijalankan/dikoreksi; klik baris register → viewer menyorot
      total + komponennya. Komentar reviewer tidak ditimpa; footing yang hilang setelah koreksi → "tidak berlaku".
- [ ] Jendela besar: Office tidak mengizinkan add-in me-minimize dialog. Lihat 1.2.
- [x] Jendela besar ditutup lalu dibuka lagi **tidak perlu memilih PDF lagi**: PDF + progres (koreksi manual, skala,
      footing aktif, halaman) disimpan di memori panel samping dan dikirim kembali (lihat 1.2).

### 1.1 Viewer: scroll terus — kode selesai 13 Okt 2026, **menunggu uji pemilik di Excel**
- [x] Semua halaman ditampilkan berurutan ke bawah; nomor halaman di toolbar ikut berubah saat scroll.
- [x] Hanya halaman yang terlihat (± 1 halaman) yang dirender ke canvas, agar PDF 80+ halaman tetap ringan.
- [x] "Loncat ke halaman" (dari hasil tie, register Excel) = scroll ke posisi angka.
- [x] Panel **Diagnostik ekstraksi** TETAP ada selama pengembangan (disembunyikan nanti). Kini ada kolom **Garis**.

### 1.2 Jendela besar: satu dokumen, panel kecil jadi remote
- [x] Klik "Jendela besar" → PDF yang sedang terbuka (+ halaman aktif + hasil footing/tie) **dipindahkan** ke
      dialog Office. Pengguna tidak perlu memilih file lagi. ✅ 13 Okt 2026 (belum diuji di Excel), termasuk arah
      sebaliknya: PDF yang dibuka di jendela besar disimpan di panel samping, sehingga jendela besar bisa ditutup
      dan dibuka lagi tanpa kehilangan progres. Sesi hanya di memori; hilang bila panel samping ditutup.
      Catatan teknis: dialog & task pane tidak berbagi memori/penyimpanan secara andal (storage partitioning di
      Excel web) → kirim isi PDF lewat `messageChild` (DialogApi 1.2) secara **dipotong-potong (chunk) base64**,
      lalu dialog membangun ulang file dan memverifikasi sidik SHA-256.
- [ ] Task pane berubah menjadi **panel ringkas**: nama dokumen, ringkasan (jumlah F / ✗ / ○), tombol
      "kembalikan ke panel". Office tidak mengizinkan add-in menutup task pane sendiri; pengguna boleh menutupnya
      manual, tetapi fitur klik-Excel→PDF (1.5) butuh task pane tetap terbuka.
- [ ] Hanya boleh ada **satu** viewer aktif. Tidak ada lagi tombol "Buka PDF" di dialog bila dibuka dari task pane.

### 1.3 Auto footing & cross footing (satu tombol untuk seluruh dokumen)
Aturan keras: **toleransi 0.** Tidak ada status "hampir cocok". Selisih 1 = gagal.

Status 13 Okt 2026: **footing vertikal** selesai di kode (menunggu uji pemilik di Excel); cross footing berikutnya.

- [x] Bangun struktur tabel dari posisi token: **kolom** = angka dengan tepi kanan rata vertikal.
      Kolom dipecah menjadi tabel baru bila ada teks/tahun melintang di atas kolom (judul kolom, paragraf).
      (**Baris** sejajar baseline baru dibutuhkan untuk cross footing.)
- [x] Baca **garis horizontal** dari PDF (pdf.js `getOperatorList`: path/rectangle tipis) dan kaitkan ke angka
      di bawahnya → kandidat total kuat. Label "Jumlah/Total/Neto/JUMLAH" = konfirmasi tambahan.
      Garis ganda di bawah jumlah akhir, garis bawah judul kolom, dan border grid tabel tidak dianggap penanda total.
- [x] Footing vertikal: total = jumlah angka langsung di atasnya sejak total/garis sebelumnya; mendukung
      bertingkat (Jumlah aset lancar + Jumlah aset tidak lancar = JUMLAH ASET) dan subtotal berjalan
      (laba bruto + beban = laba sebelum pajak). Kurung = negatif. Semua angka biasa sejak total sebelumnya wajib ikut.
- [ ] Cross footing horizontal untuk tabel bertotal kolom: **mutasi ekuitas**, **mutasi aset tetap / aset hak
      guna**, tabel segmen (saldo awal + penambahan − pengurangan = saldo akhir). Tabel mutasi dicek dua arah.
- [x] Status per angka (warna + simbol + tooltip, tidak hanya warna):
      | Tanda | Arti |
      |---|---|
      | ✓ hijau | komponen yang masuk ke footing yang cocok |
      | **F** hijau | total dengan selisih **tepat 0** |
      | **✗** merah | total (ada garis/label) yang selisihnya ≠ 0 — **tampilkan besar selisih**, mis. "selisih 1" |
      | ○ abu-abu | angka yang belum tercakup footing mana pun → dicek manual |
      F tidak diberikan (jadi ○ + alasan) bila ada angka ambigu, skala belum ditetapkan, atau tabel tampak
      lanjutan dari halaman sebelumnya.
- [x] Nomor catatan, tahun, persentase tidak ikut footing (juga nomor halaman dan angka di dalam kalimat).
- [ ] Koreksi manual: klik angka → "ini total" / "keluarkan dari tabel" ✅ (+ "bukan total"); tarik kotak → paksa
      jadi satu tabel ⏳ (dikerjakan bersama 1.4 karena memakai mekanisme tarik kotak yang sama).
      Koreksi langsung menghitung ulang ✅.
- [x] Uji dengan PDF sintetis baru (`scripts/make_sample_pdf.py --footing` → `samples/contoh-footing.pdf`):
      laporan posisi keuangan bertingkat, **mutasi ekuitas**, **mutasi aset tetap**, dalam ribuan, bergaris total,
      dengan 5 **selisih 1 yang disengaja** (semua ✗) dan tabel terpotong ke halaman berikutnya (○, bukan salah F).

### 1.4 Sum snip (tarik kotak)
- [ ] Di viewer (terutama jendela besar): tarik kotak di atas angka vertikal ATAU horizontal → tampil jumlah
      angka terpilih, banyaknya angka, kurung = negatif.
- [ ] Bila angka terakhir di kotak tampak total (garis/label) → bandingkan, tampilkan selisih (toleransi 0).
- [ ] Tombol **Kirim ke Excel**: tulis hasil SUM ke sel aktif + catat ke `RA_Register` (lihat 1.5).
- [ ] Sum snip juga berfungsi sebagai alat koreksi bila auto footing salah membaca tabel.

### 1.5 Register Excel + klik Excel → sorot di PDF — footing selesai di kode 13 Okt 2026, **belum diuji di Excel**
- [x] Tabel Excel terstruktur **`RA_Register`** (sheet `RA_Register`, dibuat otomatis bila belum ada; tidak
      menimpa data lain). Kolom terlihat: ID, Jenis (Footing/Cross footing/Sum snip/Tie), Halaman, Label, Nilai
      dilaporkan, Nilai hitung, Selisih, Status, Komentar, Sidik dokumen (singkat). Kolom tersembunyi: lokasi
      (halaman + kotak koordinat PDF semua angka yang terlibat, JSON).
- [ ] Hasil auto footing ~~yang ✗ dan ○~~ **semua (F, ✗, ○)** ✅, sum snip ⏳, dan tie yang dikonfirmasi ⏳ masuk ke register.
- [ ] Task pane memasang listener `onSelectionChanged`; saat pengguna mengklik baris register → viewer
      (task pane ✅ atau jendela besar via `messageChild` ⏳ bersama 1.2) loncat ke halaman dan **menyorot semua angka**
      yang terlibat.
- [x] PDF **tidak** disimpan di workbook (kerahasiaan & ukuran file). Membuka ulang workbook → pengguna membuka
      PDF yang sama; bila sidik SHA-256 berbeda dari register → peringatan "versi draft berbeda, lokasi mungkin
      bergeser". (Berbeda dari DataSnipper yang menyimpan dokumen di workbook — keputusan sadar.)

### Urutan pengerjaan yang disarankan
1.1 → 1.3 (vertikal dulu, lalu cross footing) → 1.4 → 1.5 → 1.2.
Setiap langkah: typecheck, `npm test`, `npm run build`, lalu pemilik uji di Excel sebelum lanjut.

---

## Nanti (setelah Fase 1 dipakai di satu closing)
- Simpan & buka ulang sesi review lengkap, perbandingan versi draft (angka yang berubah antar draft)
- OCR lokal untuk PDF scan
- Sembunyikan panel diagnostik
