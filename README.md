# Life Journal

Jurnal pribadi multi-pengguna yang bisa dibuka dari browser di perangkat mana pun.

## Website

Versi online tersedia di <https://farrelllovell.github.io/life-journal/>. Halaman statis di-host dari GitHub Pages; aplikasi tidak memerlukan laptop tetap menyala.

## Cara kerja data

- Supabase Auth menangani akun email/kata sandi dan Google.
- Entry, goals, dan insight disimpan di tabel Supabase `journal_entries`, `journal_goals`, dan `journal_insights`.
- Row Level Security (RLS) membatasi setiap pengguna ke baris miliknya. Pengunjung yang belum masuk tidak dapat membaca atau menulis jurnal.
- Akun baru mulai dengan jurnal kosong. Contoh jurnal awal hanya tersedia pada akun pemilik lama.
- Entry AI Inbox dibuat dari teks yang pengguna tempel sendiri; aplikasi tidak membaca riwayat ChatGPT secara otomatis.
- Ringkasan saat ini disusun dari entry tersimpan tanpa panggilan AI eksternal. Penjadwalan tengah malam belum diaktifkan.

## Menjalankan atau menyiapkan database baru

1. Atur URL proyek dan publishable key di `supabase-config.js`. Publishable key aman untuk frontend hanya bila RLS aktif.
2. Jalankan isi `supabase/schema.sql` di SQL Editor Supabase.
3. Pastikan tabel `public` tersedia pada Data API dan kebijakan RLS sudah dibuat.
4. Di Supabase Auth, atur Site URL serta URL redirect yang digunakan GitHub Pages.
5. Publikasikan file aplikasi di root branch `main` GitHub Pages.

Jangan pernah menaruh `service_role` atau secret key di file frontend atau repository.

## Data lama pada browser

Saat akun pemilik lama masuk dari browser yang sebelumnya menyimpan entry, aplikasi menggabungkan entry lokal yang belum ada di cloud ke database milik akun tersebut, lalu menghapus salinan lokal setelah proses berhasil. Akun pengguna lain tidak mengimpor data browser itu.

Gunakan tombol **Ekspor JSON** untuk membuat backup yang dapat diunduh kapan saja. Proses ringkasan AI terjadwal memerlukan konfigurasi backend dan persetujuan terpisah untuk penggunaan API berbayar.

