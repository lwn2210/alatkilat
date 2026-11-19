# AlatKilat — status dan bukti (19 November 2026)

## Pisahkan sumber
- Checkout asli `/Users/hellmeet/.openclaw/workspace/micro-tools-web` tetap pada `f2582b3376b47a2f1005d39b4c867e8907b10ea3`; ini bukan sumber yang saat ini diterbitkan. Jangan memperbarui checkout itu untuk menyimpulkan status live.
- GitHub `main` yang dibaca saat koreksi: `2a256733eceed202e92c07a141995f43b1f22e97`. GitHub Pages `https://lwn2210.github.io/alatkilat/` menyajikan index dengan hash yang sama dengan commit tersebut. Bukti publikasi dan batas smoke test: `~/.hermes/portfolio-work/release-candidate/deployment-result.md`. Kandidat koreksi label dan penanganan dependensi ekstraktor ini berada di checkout terisolasi dan **belum diterbitkan**; live masih menunjukkan label lama sampai ada persetujuan dan deployment.
- Ledger `~/.hermes/portfolio-work/roadmap-progress.json` mencatat pekerjaan integrasi lokal lanjutan; field release false di sana tidak boleh ditafsirkan sebagai status GitHub main/Pages saat ini. Fase lanjutan dan kelengkapan roadmap tetap terpisah dari release tersebut; jangan mengubah atau menimpa checkout integrasi yang sedang dikerjakan.

## Bukti live yang sudah ada — cakupan terbatas
Lima alat berikut telah diuji dalam skenario terbatas di Chrome terhadap GitHub Pages normal TLS, bukan sekadar uji lokal: PDF ke Word (01), Editor PDF (02), Paket Lamaran (03), PDF ke Gambar (04), Batch Gambar (05). Lihat `~/.hermes/portfolio-work/live-sequential/01-word/report.md` hingga `05-batch/report.md`, serta addendum penggantian konten 04 dan decode 05. Ini bukan sertifikasi seluruh situs, semua masukan, atau keamanan.

Ekstrak Teks PDF lama: simulasi pemblokiran modul PDF.js pada live menimbulkan pesan gagal; setelah rute dipulihkan dan halaman dimuat ulang, PDF digital tiga halaman diekstrak dan TXT aktual diperiksa. Bukti `~/.hermes/portfolio-work/catalog-status-fix/extract-outage.log` dan `extract-recovery.txt`. Ini bukan outage alami dan bukan pemulihan tanpa reload.

## Batas dan pekerjaan tersisa
- Perangkat fisik, Safari/Firefox dan perangkat bermemori rendah belum tercakup oleh bukti live di atas; batas aplikasi bukan jaminan bebas kehabisan memori.
- OCR tabel scan bergaris dapat menghilangkan sel; mode PDF→Word dan fallback visual tidak menjamin transkripsi. Ekstrak Teks PDF lama hanya membaca text layer dan bukan OCR scan.
- Overlay editor dapat kecil atau bertumpuk; pengujian terbatas tidak menjamin keterbacaan untuk semua PDF. Skenario race menggunakan seam terkontrol, bukan bukti seluruh timing alami atau pelepasan memori seketika.
- Koreksi label dan tracker ini menunggu review parent; tidak ada commit, push atau deployment dalam koreksi ini.
