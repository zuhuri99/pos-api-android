# Deployment backend di Coolify

Konfigurasi ini menjalankan **satu service aplikasi** yang berisi FastAPI dan build web React. PostgreSQL tidak dibuat ulang oleh Compose karena database PostgreSQL 16 sudah tersedia sebagai resource terpisah di Coolify.

Frontend production sudah tersedia dalam `frontend_dist`, sehingga VPS Coolify tidak menjalankan Node/Vite saat deployment. Container dibatasi default 1 CPU, RAM 512 MB, 50 request bersamaan, 10 thread kerja, dan maksimal 8 koneksi PostgreSQL. Naikkan batas hanya setelah melihat metrik penggunaan VPS.

## Membuat resource

1. Tambahkan repository ini sebagai Docker Compose Application di Coolify.
2. Pilih `docker-compose.yml` dari root repository.
3. Hubungkan resource aplikasi dan PostgreSQL ke server/destination network yang sama. Jika databasenya berada di resource Coolify lain, aktifkan koneksi ke predefined network bila diperlukan.
4. Buat/pilih database khusus aplikasi POS pada instance PostgreSQL 16 tersebut. Jangan memakai database yang tabelnya dipakai aplikasi lain karena nama tabel seperti `users`, `products`, dan `sales` bersifat umum.
5. Salin URL koneksi internal database khusus itu ke `DATABASE_URL` aplikasi. Skema `postgresql://` maupun `postgres://` diterima dan otomatis memakai driver psycopg.
6. Masukkan semua variabel pada `.env.coolify.example` di Environment Variables. Jangan commit nilai rahasia.
7. Atur domain service `api` ke `https://pos2.asas.id` dengan port internal `8000`.
8. Pastikan DNS `pos2.asas.id` mengarah ke server Coolify, aktifkan HTTPS, lalu deploy.

Jika variabel resource pernah tersimpan di dashboard, pastikan `API_MEMORY_LIMIT=512m`, `API_CPU_LIMIT=1.0`, `API_MAX_CONCURRENCY=50`, dan `API_THREAD_LIMIT=10`. Nilai tersimpan Coolify mengalahkan default Compose.

Compose memakai `${VARIABLE:?}` untuk `DATABASE_URL`, `APP_SECRET`, `ADMIN_PASSWORD`, `USER_PASSWORD`, dan `USER_DELETE_PIN`, sehingga Coolify menolak deployment jika nilai penting tersebut kosong.

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

Setelah login sebagai admin, halaman import/export produk tersedia di `https://pos2.asas.id/admin/products`. Route React lain tetap dapat dibuka langsung karena FastAPI memberikan fallback ke `index.html`, sedangkan route `/api/*`, `/docs`, dan `/openapi.json` tetap ditangani sebagai endpoint backend.

Saat server dimulai, aplikasi memastikan hanya dua akun aktif sesuai environment: `ADMIN_USERNAME` sebagai admin dan `USER_USERNAME` sebagai kasir. Password, peran, dan status aktif keduanya selalu disinkronkan dari environment; akun lain pada business yang sama dinonaktifkan. Gunakan password kuat dan PIN penghapusan yang tidak mudah ditebak. Mengubah nilainya di Coolify lalu me-restart service akan memperbarui akun.

## Catatan jaringan database

Gunakan hostname/URL **internal** dari database Coolify, bukan `localhost`. `localhost` di container API menunjuk ke container API sendiri. Port PostgreSQL tidak perlu dipublikasikan ke internet selama API dan database dapat saling menjangkau pada jaringan Docker yang sama.

## Memperbarui frontend web

Build frontend dilakukan di komputer pengembangan, bukan VPS:

```bash
cd frontend
npm ci
npm run build
rsync -a --delete dist/ ../frontend_dist/
```

Commit `frontend_dist` bersama perubahan source sebelum redeploy. Build Android tetap menggunakan `npm run build:android` dan tidak mengubah build web tersebut.
