# Model offline Android

SQLite menyimpan katalog, customer, lokasi, blok nomor invoice, transaksi, dan outbox. UI POS tidak menunggu server ketika menyimpan transaksi.

Status transaksi lokal:

- `pending`: belum dikirim.
- `synced`: telah diterima server.
- `failed`: server menolak atau terjadi error; payload tetap berada di perangkat.

Saat online, mesin sinkronisasi melakukan bootstrap katalog, mengisi minimal 100 nomor invoice bulanan, mendorong outbox dalam batch, lalu menarik change log berdasarkan cursor.

