# XYDOWN

Website downloader khusus TikTok dengan antarmuka responsif, halaman donasi, dan panel admin tersembunyi.

## Fitur
- Hanya menerima tautan TikTok publik.
- Menampilkan hasil media dan pilihan format sebelum pengguna mengunduh.
- Logo XY pada header dan footer.
- Tombol donasi Saweria dan Sociabuzz.
- Panel admin tersembunyi untuk mengubah teks website dan tautan donasi.
- Tidak meminta username, password, atau cookie akun TikTok.
- Tidak mendukung konten privat, konten yang memerlukan autentikasi, atau konten yang dilindungi DRM.

## Struktur
- `index.html` — halaman utama.
- `assets/app.js` — antarmuka, proses download, donasi, dan panel admin.
- `assets/style.css` — tampilan responsif.
- `server.js` — API Node.js untuk TikTok dan pengaturan admin.
- `xy-logo.svg` — logo XY.

## Menjalankan backend
Gunakan Node.js 20 atau lebih baru. Pasang `yt-dlp` dan FFmpeg pada server jika diperlukan oleh proses media. Jalankan:

```bash
npm start
```

## Mengaktifkan panel admin tersembunyi
Atur environment variable berikut pada panel hosting/Pterodactyl:

```env
ADMIN_PASSWORD=buat-kata-sandi-admin-yang-kuat
```

Restart backend setelah mengatur variabel tersebut.

Panel admin tidak ditampilkan di navigasi publik. Buka dengan menekan logo XY lima kali dengan cepat, atau gunakan shortcut Ctrl + Shift + X. Login memakai nilai `ADMIN_PASSWORD`.

Panel admin dapat mengubah judul, deskripsi, teks tentang, serta tautan Saweria dan Sociabuzz. Pengaturan disimpan ke file `xydown-settings.json` di folder backend, jadi folder aplikasi harus dapat ditulisi oleh proses Node.js.

## Donasi
Tautan awal Saweria dan Sociabuzz merupakan alamat umum. Ganti dengan tautan donasi milik project melalui panel admin sebelum website dipublikasikan.

## Penggunaan yang bertanggung jawab
Unduh hanya konten yang kamu miliki atau yang memang diizinkan untuk disimpan. Hormati hak cipta, privasi kreator, dan ketentuan layanan TikTok. XYDOWN tidak menyediakan cara untuk melewati login, paywall, DRM, atau pembatasan akses.

<!-- XYDOWN redeploy trigger: 2026-11-22 -->
