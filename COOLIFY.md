# Deployment backend di Coolify

Konfigurasi ini menjalankan **satu service API saja**. PostgreSQL tidak dibuat ulang oleh Compose karena database PostgreSQL 16 sudah tersedia sebagai resource terpisah di Coolify.

## Membuat resource

1. Tambahkan repository ini sebagai Docker Compose Application di Coolify.
2. Pilih `docker-compose.yml` dari root repository.
3. Hubungkan resource aplikasi dan PostgreSQL ke server/destination network yang sama. Jika databasenya berada di resource Coolify lain, aktifkan koneksi ke predefined network bila diperlukan.
4. Buat/pilih database khusus aplikasi POS pada instance PostgreSQL 16 tersebut. Jangan memakai database yang tabelnya dipakai aplikasi lain karena nama tabel seperti `users`, `products`, dan `sales` bersifat umum.
5. Salin URL koneksi internal database khusus itu ke `DATABASE_URL` aplikasi. Skema `postgresql://` maupun `postgres://` diterima dan otomatis memakai driver psycopg.
6. Masukkan semua variabel pada `.env.coolify.example` di Environment Variables. Jangan commit nilai rahasia.
7. Atur domain service `api` ke `https://pos2.asas.id` dengan port internal `8000`.
8. Pastikan DNS `pos2.asas.id` mengarah ke server Coolify, aktifkan HTTPS, lalu deploy.

Compose memakai `${VARIABLE:?}` untuk `DATABASE_URL`, `APP_SECRET`, dan `BOOTSTRAP_PASSWORD`, sehingga Coolify menolak deployment jika nilai penting tersebut kosong.

## Health check

Endpoint `GET /health` memeriksa proses API sekaligus menjalankan `SELECT 1` ke PostgreSQL. Health check internal menggunakan:

```text
http://127.0.0.1:8000/health
```

Berikan start period minimal 30 detik karena container menjalankan `alembic upgrade head` sebelum Uvicorn aktif. Dockerfile dan Compose sudah berisi konfigurasi tersebut.

## Pemeriksaan setelah deploy

```bash
curl --fail https://pos2.asas.id/health
curl --fail https://pos2.asas.id/openapi.json
```

Respons health yang benar:

```json
{"status":"ok","database":"ok"}
```

Login pertama membuat data awal bila database masih kosong: satu business, user bootstrap, lokasi `Toko Utama`, dan customer `Umum`. Setelah berhasil masuk, segera gunakan password bootstrap yang kuat. Mengubah `BOOTSTRAP_PASSWORD` setelah user tercipta tidak mengubah password user lama.

## Catatan jaringan database

Gunakan hostname/URL **internal** dari database Coolify, bukan `localhost`. `localhost` di container API menunjuk ke container API sendiri. Port PostgreSQL tidak perlu dipublikasikan ke internet selama API dan database dapat saling menjangkau pada jaringan Docker yang sama.
