# Arsitektur POS Offline

## Keputusan teknologi

- API: FastAPI dan Pydantic untuk mempertahankan pola endpoint/response yang digunakan frontend POS lama.
- Data server: PostgreSQL 16, SQLAlchemy 2, dan Alembic.
- Data Android: SQLite terenkripsi (SQLCipher) melalui `@capacitor-community/sqlite`.
- UI Android: React 19, Vite, dan Capacitor 8; hanya route transaksi POS, nota, produk, sinkronisasi, dan printer yang diaktifkan.
- UI web: build React yang sama disajikan FastAPI, termasuk halaman admin produk di `/admin/products`.
- Konektivitas: `@capacitor/network` memicu sinkronisasi setelah jaringan kembali tersedia.

## Batas sistem

FastAPI pada proyek ini adalah backend POS mandiri, bukan proxy runtime ke UltimatePOS/Laravel. Bentuk data dan route POS dipertahankan agar komponen frontend stabil dapat digunakan, sedangkan model internal dibuat khusus transaksi POS dan PostgreSQL.

Route kompatibilitas utama:

| Kebutuhan | Endpoint |
| --- | --- |
| Login/verifikasi | `POST /api/v1/auth/login/`, `GET /api/v1/auth/token/verify/` |
| Bootstrap POS | `GET /api/v1/income/pos/bootstrap` |
| Produk/customer/stok | `GET /api/v1/income/pos/products`, `GET /api/v1/income/pos/contacts`, `GET /api/v1/pos-data/product-stock-report` |
| Transaksi/nota | `POST /api/v1/income/pos/transactions`, `DELETE /api/v1/income/pos/transactions/{id}`, `GET /api/v1/income/pos/transactions/{id}/invoice` |
| Offline sync | `GET /api/v1/sync/bootstrap`, `POST /api/v1/sync/push`, `GET /api/v1/sync/pull` |
| Blok invoice | `POST /api/v1/income/pos/invoice-numbers/reserve` |
| Import/export | `/api/v1/products/import/preview`, `/api/v1/products/import/commit`, `/api/v1/products/export` |

## Alur offline

1. Login online pertama menyimpan token perangkat.
2. Bootstrap menyalin katalog, customer, lokasi, stok, cursor, dan blok 100 nomor invoice ke SQLite.
3. Saat transaksi dibuat, nomor invoice diklaim serta transaksi, pengurangan stok lokal, dan operasi outbox disimpan dalam satu transaksi SQLite.
4. UI langsung memakai data lokal dan tidak menunggu server.
5. Saat online, outbox dikirim dengan `operation_id` UUID. Backend menyimpan hasil operasi sehingga retry aman dan tidak menggandakan transaksi.
6. Perubahan server ditarik berdasarkan sequence monotonik, bukan jam perangkat.

Nomor invoice dibagikan per perangkat dalam blok yang tidak tumpang tindih. Formatnya `PBBTTTTNNNN`; contoh urutan pertama Oktober 2026 adalah `P1020260001`.

## Integritas dan pengembangan multi-user

Semua data bisnis membawa `business_id`; user, lokasi, stok, invoice, transaksi, log perubahan, dan token sudah dipisahkan pada lapisan data/API. Versi awal membuat satu business, satu admin, satu lokasi, dan customer `Umum`. Penambahan banyak user dapat dilakukan tanpa mengubah tabel transaksi; tahap berikutnya perlu UI administrasi user/role dan kebijakan otorisasi per lokasi.

Transaksi final tidak dapat diedit, tetapi dapat dihapus dari daftar melalui void yang tercatat. Void menyimpan alasan/pengguna/waktu, mengembalikan stok, dan tidak memakai ulang nomor invoice. QRIS sengaja mengembalikan status belum dikonfigurasi sampai provider dan webhook dipilih.

## Operasional produksi

- Jalankan API hanya lewat HTTPS dan ganti password bootstrap/secret bawaan.
- Gunakan migration Alembic pada deploy, backup PostgreSQL terjadwal, serta monitoring error sinkronisasi.
- Gunakan signing key Android produksi; APK yang disertakan adalah debug build untuk pengujian.
- Uji printer, scanner, lifecycle/background, serta skenario putus jaringan pada perangkat Android fisik sebelum go-live.
