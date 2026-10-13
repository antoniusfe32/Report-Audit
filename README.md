# Report Audit — eksperimen kelayakan

Add-in Excel pribadi untuk membantu **footing dan tie-out** draft laporan keuangan (PDF).
Versi ini adalah **eksperimen kelayakan**: tujuannya membuktikan bahwa add-in bisa berjalan
di Excel web kantor sebelum fitur footing dan tie-out dibangun penuh.

PDF dibaca **di dalam browser** dan tidak diunggah ke mana pun. Yang di-host di GitHub hanya kode aplikasinya.

## Yang sudah bisa

| Fitur | Status |
|---|---|
| Buka PDF dari laptop, **scroll terus** semua halaman, zoom | ✅ Fase 1.1 — **belum diuji di Excel** |
| Angka terbaca otomatis dan bisa diklik (garis bawah tipis) | ✅ |
| Detail angka: teks asli, nilai hasil parsing, halaman, label baris | ✅ |
| Format Indonesia/US, angka dalam kurung = negatif, "-" = nol | ✅ |
| **Cari lokasi lain dengan angka sama** (tanda kurung/minus diabaikan, tetap ditandai), lalu loncat ke halamannya | ✅ |
| Angka yang terpecah di PDF (mis. "9" + ",8") digabung kembali + peringatan | ✅ **belum diuji di Excel** |
| Peringatan PDF hasil scan (tanpa teks) | ✅ |
| Sidik (SHA-256) dokumen, untuk deteksi PDF berganti versi | ✅ (ditampilkan, belum dibandingkan) |
| Tulis angka terpilih ke sel aktif Excel (+ referensi halaman) | ✅ kode siap, **belum diuji di Excel** |
| Jendela besar (Office dialog) | ✅ kode siap, **belum diuji di Excel** |
| **Footing vertikal** satu tombol untuk seluruh dokumen (✓ / F / ✗ selisih / ○), toleransi 0 | ✅ Fase 1.3 — **belum diuji di Excel** |
| Koreksi manual footing: "ini total" / "bukan total" / "keluarkan dari footing" | ✅ Fase 1.3 — **belum diuji di Excel** |
| Tampilan footing berupa **blok warna** (biru = dijumlahkan, hijau = total cocok, merah = selisih) | ✅ |
| **Register Excel `RA_Register`**: semua hasil footing otomatis masuk; klik baris → sorot di PDF | ✅ kode siap, **belum diuji di Excel** |
| Cross footing horizontal (mutasi ekuitas, aset tetap), tarik kotak, sum snip | ⏳ langkah berikutnya |

## Cara memasang (sekali saja)

### 1. Buat repo GitHub
1. Login ke github.com → klik **+** (kanan atas) → **New repository**.
2. Nama repo: `Report-Audit` · pilih **Public** · klik **Create repository**. (Sudah dibuat.)
   > Repo publik hanya berisi kode. **Jangan pernah** upload PDF/data perusahaan ke repo.

### 2. Upload isi zip
1. Ekstrak zip ini di laptop.
2. Di halaman repo baru, klik link **uploading an existing file**.
3. Buka folder hasil ekstrak, **pilih semua isinya** (bukan foldernya), lalu drag ke browser.
   Pastikan folder `docs` ikut terunggah.
4. Klik **Commit changes**.

### 3. Aktifkan GitHub Pages
1. Di repo: **Settings → Pages**.
2. *Source*: **Deploy from a branch** · *Branch*: **main** · folder **/docs** → **Save**.
3. Tunggu 1–2 menit, lalu buka alamat yang ditampilkan di Settings → Pages (mis. `https://antoniusfe32.github.io/Report-Audit/`).
   Aplikasi akan tampil dengan panel **"Pasang ke Excel"**.

### 4. Pasang ke Excel web
1. Di halaman tadi, klik **Unduh manifest.xml**. URL-nya sudah otomatis terisi, jadi tidak perlu diedit.
2. Buka Excel web → **Home → Add-ins → Advanced… → Upload My Add-in** → pilih `manifest.xml` → **Upload**.
3. Tombol **Report Audit** muncul di tab Home.

> Catatan: add-in yang di-upload manual bisa hilang kalau cache browser dibersihkan atau ganti browser.
> Kalau itu terjadi, cukup upload ulang `manifest.xml` yang sama.

## Checklist uji di Excel (tolong laporkan hasilnya)

- [ ] Panel Report Audit terbuka dan **tidak** ada tulisan "Mode pratinjau browser".
- [ ] Buka `samples/contoh-laporan-keuangan.pdf`, lalu klik `125.750.420` di hal. 2. Harus muncul lokasi lain di hal. 4.
- [ ] Klik sel kosong di Excel → klik angka → **Tulis ke sel aktif**. Nilai dan referensinya harus masuk ke 2 sel.
- [ ] Klik **Jendela besar ⧉**. Jendela terbuka? (Kalau diblokir: izinkan popup untuk situs Excel.)
- [ ] Di jendela besar, buka PDF, klik angka. Angka harus muncul di panel "Dari jendela besar" di task pane.
- [ ] Coba dengan **satu draft PDF asli** (di laptop saja; jangan upload ke mana pun). Apakah angka dan label terbaca benar?
      Buka **Diagnostik ekstraksi per halaman** kalau ada halaman yang angkanya 0.

### Fase 1.1 + 1.3 (scroll terus & footing vertikal)

- [ ] Buka `samples/contoh-angka-terpecah.pdf` → klik `125.750.420`: harus terbaca utuh, dengan peringatan
      "terpecah". Footing tabelnya harus F di kedua kolom.
- [ ] Di draft asli, klik angka yang sebelumnya salah baca → lihat baris **Potongan PDF** di panel. Laporkan
      bentuknya (boleh ganti digitnya), mis. `«9» «,8»` atau `«1 25.750»`.

- [ ] Buka `samples/contoh-footing.pdf`. Gulir ke bawah: semua halaman tampil berurutan dan nomor **Hal.** di toolbar ikut berubah.
- [ ] Ketik `4` di kotak Hal. → viewer langsung bergulir ke halaman 4.
- [ ] Klik **Jalankan footing (seluruh dokumen)**. Ringkasan harus: **✗ 5**, dan daftar "Total tidak cocok" berisi
      Jumlah aset lancar (selisih 1), JUMLAH LIABILITAS (selisih -1), LABA SEBELUM PAJAK (selisih 1),
      Saldo 31 Desember 2025 (selisih 1), Jumlah biaya perolehan (selisih -1).
- [ ] "Total perlu cek manual" berisi 2 × **Jumlah** di hal. 5 (tabel persediaan terpotong dari hal. 4).
- [ ] Klik salah satu baris ✗ → viewer loncat ke angkanya; panel "Angka terpilih" menampilkan rincian komponen.
- [ ] Klik angka biasa → **Keluarkan dari footing** → hasil langsung berubah; **Batalkan** mengembalikannya.
- [ ] Coba dengan **draft PDF asli**: apakah total terbaca (garis di atas angka)? Catat halaman yang hasilnya salah
      dan buka **Diagnostik** (kolom **Garis**) — angka 0 di kolom Garis berarti garis tabel tidak terbaca.
- [ ] Coba PDF besar (80+ halaman): apakah scroll tetap lancar?

### Register Excel (RA_Register)

- [ ] Di workbook kosong: buka `samples/contoh-footing.pdf` → **Jalankan footing**. Dalam ±1 detik muncul sheet
      **RA_Register** berisi satu baris per total (status F cocok / ✗ selisih / ○ cek manual) dan pesan hijau di panel.
- [ ] Klik sel di baris "Jumlah aset lancar" (✗) → viewer loncat ke hal. 1 dan menyorot total + komponennya.
- [ ] Ketik komentar di kolom **Komentar** → klik **Kirim ulang ke Excel** → komentar tidak hilang.
- [ ] Klik angka total di PDF → **Bukan total** → baris tersebut di register menjadi "tidak berlaku".
- [ ] Tutup lalu buka lagi add-in, buka PDF yang sama, klik baris register → tetap tersorot.
- [ ] **Lewat jendela besar:** biarkan panel samping terbuka → **Jendela besar ⧉** → buka PDF → **Jalankan footing**.
      Kotak "Register Excel" di jendela besar harus berubah menjadi pesan hijau "Sheet RA_Register diperbarui…".
      Klik baris register di Excel → jendela besar menyorot angkanya.
- [ ] Kalau sheet tidak muncul: baca kotak **Register Excel** di panel footing (kuning = tidak terhubung ke Excel,
      merah = pesan error) dan laporkan isinya.

## Batasan yang diketahui

- Label baris yang terbungkus ke 2 baris hanya terbaca baris pertamanya.
- Footing membaca tanda dari PDF: angka **dalam kurung = negatif**. Bila beban disajikan tanpa kurung lalu
  dikurangkan (mis. "Nilai tercatat = biaya perolehan − akumulasi" dengan akumulasi tanpa kurung), hasilnya ✗ —
  koreksi manual atau sum snip (Fase 1.4) dibutuhkan.
- Kolom yang seluruh angkanya 1–2 digit tanpa pemisah ribuan dianggap kolom nomor catatan dan tidak di-footing.
- Total pertama di halaman yang tampak seperti lanjutan tabel halaman sebelumnya selalu ○ (cek manual),
  walaupun cocok — lebih aman daripada F palsu.
- Pilihan **Skala angka** berlaku untuk halaman yang tidak mencantumkan skala; halaman yang mencantumkan
  "(Dinyatakan dalam ribuan Rupiah)" memakai skalanya sendiri.
- Persentase (`4,50%`) belum dianggap angka.
- Pencarian hanya mencari **angka persis sama** (tanda diabaikan). Belum ada skala (ribuan/jutaan) atau toleransi pembulatan.
- PDF hasil scan tidak didukung (tidak ada OCR).
- "Nilai sama" ≠ "tie". Sistem hanya memberi saran; keputusan tetap di reviewer.

## Untuk pengembangan (Claude Code di laptop)

```
npm install
npm test          # unit test + uji integrasi PDF sintetis (samples/*.pdf)
npm run dev       # server lokal untuk mencoba di browser
npm run build     # hasil ke folder docs/ (yang dilayani GitHub Pages)

# PDF sintetis (butuh Python + reportlab); data fiktif
python scripts/make_sample_pdf.py samples/contoh-laporan-keuangan.pdf
python scripts/make_sample_pdf.py --footing samples/contoh-footing.pdf
python scripts/make_sample_pdf.py --terpecah samples/contoh-angka-terpecah.pdf
```

Aturan kerja untuk Claude Code ada di `CLAUDE.md`. Rencana fase ada di `ROADMAP.md`.
