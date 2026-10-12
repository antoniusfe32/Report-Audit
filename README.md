# Report Audit — eksperimen kelayakan

Add-in Excel pribadi untuk membantu **footing dan tie-out** draft laporan keuangan (PDF).
Versi ini adalah **eksperimen kelayakan**: tujuannya membuktikan bahwa add-in bisa berjalan
di Excel web kantor sebelum fitur footing dan tie-out dibangun penuh.

PDF dibaca **di dalam browser** dan tidak diunggah ke mana pun. Yang di-host di GitHub hanya kode aplikasinya.

## Yang sudah bisa (versi 0.0.1)

| Fitur | Status |
|---|---|
| Buka PDF dari laptop, tampilkan per halaman, zoom | ✅ |
| Angka terbaca otomatis dan bisa diklik (garis bawah tipis) | ✅ |
| Detail angka: teks asli, nilai hasil parsing, halaman, label baris | ✅ |
| Format Indonesia/US, angka dalam kurung = negatif, "-" = nol | ✅ |
| **Cari lokasi lain dengan nilai sama**, lalu loncat ke halamannya | ✅ |
| Peringatan PDF hasil scan (tanpa teks) | ✅ |
| Sidik (SHA-256) dokumen, untuk deteksi PDF berganti versi | ✅ (ditampilkan, belum dibandingkan) |
| Tulis angka terpilih ke sel aktif Excel (+ referensi halaman) | ✅ kode siap, **belum diuji di Excel** |
| Jendela besar (Office dialog) | ✅ kode siap, **belum diuji di Excel** |
| Footing/cross-footing, tie confirm, register di Excel | ⏳ fase berikutnya |

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

## Batasan yang diketahui

- Label baris yang terbungkus ke 2 baris hanya terbaca baris pertamanya.
- Persentase (`4,50%`) belum dianggap angka.
- Pencarian hanya mencari **nilai persis sama** (termasuk beda tanda). Belum ada skala (ribuan/jutaan) atau toleransi pembulatan.
- PDF hasil scan tidak didukung (tidak ada OCR).
- "Nilai sama" ≠ "tie". Sistem hanya memberi saran; keputusan tetap di reviewer.

## Untuk pengembangan (Claude Code di laptop)

```
npm install
npm test          # unit test + uji integrasi PDF sintetis
npm run dev       # server lokal untuk mencoba di browser
npm run build     # hasil ke folder docs/ (yang dilayani GitHub Pages)
```

Aturan kerja untuk Claude Code ada di `CLAUDE.md`. Rencana fase ada di `ROADMAP.md`.
