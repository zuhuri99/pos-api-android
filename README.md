# ASAS POS

POS mandiri dengan FastAPI/PostgreSQL 16 dan aplikasi Android React/Capacitor. UI selalu membaca dan menulis SQLite lokal; backend disinkronkan saat koneksi tersedia.

## Nomor invoice

Format nomor: `P{bulan 2 digit}{tahun 4 digit}{urutan 4 digit}`. Contoh transaksi pertama Oktober 2026 adalah `P1020260001`. Backend membagikan blok nomor ke perangkat agar nomor dapat dibuat saat offline.

## Deployment production Coolify

Production menggunakan `https://pos2.asas.id`. FastAPI menyajikan frontend React yang sudah dibangun sekaligus API. Compose menggunakan PostgreSQL 16 yang sudah ada melalui variabel `DATABASE_URL`; tidak ada container atau volume database baru. Frontend web telah diprebuild ke `frontend_dist`, jadi deployment Coolify tidak menjalankan Node/Vite di VPS.

Alamat utama:

- Admin produk web: `https://pos2.asas.id/admin/products`
- Kasir web: `https://pos2.asas.id/pos`
- Dokumentasi API: `https://pos2.asas.id/docs`

Petunjuk lengkap tersedia di [COOLIFY.md](./COOLIFY.md). Template variabel tersedia di `.env.coolify.example`.

## Menjalankan backend lokal

```bash
cp backend/.env.example backend/.env
docker compose -f docker-compose.yml -f docker-compose.local.yml --env-file backend/.env up --build
```

Untuk Compose lokal, isi `DATABASE_URL` dengan PostgreSQL 16 yang dapat dijangkau container. API: `http://localhost:8000`, OpenAPI: `http://localhost:8000/docs`. Ganti password bootstrap dan secret sebelum production.

## Menjalankan frontend

```bash
cd frontend
cp .env.example .env
npm ci
npm run dev
```

Build Android:

```bash
npm run build:android
cd android
./gradlew :app:assembleDebug
```

APK Android harus menggunakan endpoint HTTPS. Login pertama dan pengisian katalog/nomor invoice membutuhkan koneksi. Setelah itu transaksi tunai, pencarian produk, nota, printer, dan export CSV dapat digunakan offline. QRIS dan import produk membutuhkan koneksi. Database Android dienkripsi dengan SQLCipher dan backup aplikasi Android dinonaktifkan.

## Aturan sinkronisasi

- Setiap transaksi mempunyai UUID perangkat dan setiap operasi mempunyai UUID unik.
- Retry request tidak membuat transaksi ganda.
- Transaksi disimpan lokal sebelum dikirim ke server.
- Transaksi draft maupun final dapat dikoreksi; perubahan stok dicatat sebagai pergerakan koreksi. Penghapusan dilakukan sebagai void yang mengembalikan stok dan tetap menyimpan audit.
- Server memvalidasi stok. Konflik stok ditampilkan sebagai transaksi yang perlu diperiksa.
- Cursor sinkronisasi berasal dari sequence server, bukan jam perangkat.
- Tombol **Hapus** pada detail nota membuat void: stok dikembalikan, alasan dicatat, nomor invoice tetap terpakai, dan operasi dapat diantrekan saat offline.

## Backup database melalui email

Container API menyediakan perintah berikut untuk membuat backup PostgreSQL format custom, memvalidasinya dengan `pg_restore`, lalu mengirimkannya sebagai lampiran melalui Resend ke seluruh alamat pada `TRANSACTION_NOTIFICATION_EMAILS`:

```bash
docker compose exec -T api python -m app.backup
```

Contoh cron harian pukul 02.00 WIB pada host Docker:

```cron
CRON_TZ=Asia/Jakarta
0 2 * * * cd /PATH/KE/PROJECT && /usr/bin/docker compose exec -T api python -m app.backup >> /var/log/asas-pos-backup.log 2>&1
```

Jika memakai Scheduled Task Coolify, jalankan `python -m app.backup` langsung di container service `api`. Job mengembalikan exit code nonzero apabila pembuatan, validasi, atau pengiriman email gagal. File sementara otomatis dihapus setelah email dikirim. Lampiran mentah dibatasi 29 MB agar tetap berada di bawah batas total email Resend setelah Base64; database yang lebih besar harus memakai penyimpanan backup eksternal.

Contoh pemulihan ke database tujuan:

```bash
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="postgresql://USER:PASSWORD@HOST:5432/DATABASE_TUJUAN" asas-pos-NAMA_DATABASE-YYYYMMDD-HHMMSS-WIB.dump
```

Jalankan pemulihan terlebih dahulu pada database terpisah untuk menguji integritas dan prosedur restore.

## Import produk

Gunakan CSV UTF-8 atau XLSX dengan header:

```text
sku,name,variation_name,variation_sku,selling_price,initial_stock,category,enable_stock,is_active
```

Import melakukan preview dan validasi sebelum commit. Export CSV dibuat dari cache Android sehingga dapat digunakan saat offline.
