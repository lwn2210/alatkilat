const $ = id => document.getElementById(id);
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_IMAGES = 32 * 1024 * 1024;
let revision = 0, current = null, library;
class Obsolete extends Error {}
function valid(job) { if (job.revision !== revision) throw new Obsolete(); }
function invalidate() {
  revision++;
  if (current) {
    try { current.render?.cancel(); } catch {}
    if (current.task) void current.task.destroy().catch(() => {});
  }
  current = null;
  $('start').disabled = false;
  $('cancel').disabled = true;
  $('progress').value = 0;
}
for (const id of ['file', 'pages', 'format']) {
  $(id).addEventListener(id === 'format' || id === 'file' ? 'change' : 'input', () => {
    invalidate();
    $('filename').textContent = $('file').files[0]?.name || '';
    $('status').textContent = 'Pilihan berubah. Klik Buat untuk memproses pilihan terbaru.';
  });
}
$('cancel').addEventListener('click', () => { invalidate(); $('status').textContent = 'Dibatalkan. Tidak ada hasil lama yang diunduh.'; });
function selectedPages(text, count) {
  if (!text.trim() || text.length > 400) throw new Error('Isi pilihan halaman, contoh 3,1,5-7.');
  const result = [], seen = new Set();
  for (const token of text.split(',')) {
    const m = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error('Pilihan halaman tidak valid. Gunakan nomor dan rentang naik.');
    const a = Number(m[1]), b = Number(m[2] || m[1]);
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a < 1 || b < a || b > count) throw new Error('Pilihan halaman di luar PDF atau rentang terbalik.');
    if (b - a + 1 > 30 || result.length + b - a + 1 > 30) throw new Error('Maksimum 30 halaman pilihan.');
    for (let n = a; n <= b; n++) {
      if (seen.has(n)) throw new Error('Halaman duplikat tidak didukung.');
      seen.add(n); result.push(n);
    }
  }
  return result;
}
// Stored ZIP: images already compressed; fixed ASCII entry names, no external ZIP dependency.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zipImages(entries) {
  const local = [], central = []; let offset = 0, directorySize = 0;
  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name), bytes = entry.bytes, crc = crc32(bytes);
    const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true);
    view.setUint16(12, 33, true); // 1980-01-01, deterministic timestamp.
    view.setUint32(14, crc, true); view.setUint32(18, bytes.length, true); view.setUint32(22, bytes.length, true);
    view.setUint16(26, name.length, true); header.set(name, 30);
    const dir = new Uint8Array(46 + name.length), d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(14, 33, true);
    d.setUint32(16, crc, true); d.setUint32(20, bytes.length, true); d.setUint32(24, bytes.length, true);
    d.setUint16(28, name.length, true); d.setUint32(42, offset, true); dir.set(name, 46);
    local.push(header, bytes); central.push(dir); offset += header.length + bytes.length; directorySize += dir.length;
  }
  if (offset + directorySize + 22 > 40 * 1024 * 1024) throw new Error('ZIP melebihi batas 40 MiB.');
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true);
  e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: 'application/zip' });
}
async function pdfLibrary() {
  if (!library) library = import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.min.mjs').then(lib => {
    lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.min.mjs'; return lib;
  }).catch(error => { library = null; throw error; });
  return library;
}
$('start').addEventListener('click', async () => {
  invalidate();
  const job = { revision, task: null, render: null }; current = job;
  const file = $('file').files[0], selection = $('pages').value, format = $('format').value;
  $('start').disabled = true; $('cancel').disabled = false; $('status').textContent = 'Membaca PDF…';
  const entries = []; let pdf;
  try {
    if (!file || !file.size || file.size > MAX_BYTES) throw new Error('Pilih PDF berisi data, maksimum 20 MiB.');
    if (!['png', 'jpeg'].includes(format)) throw new Error('Format gambar tidak didukung.');
    const bytes = await file.arrayBuffer(); valid(job);
    if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new Error('Data PDF kosong atau melebihi 20 MiB.');
    const lib = await pdfLibrary(); valid(job);
    job.task = lib.getDocument({ data: bytes, isEvalSupported: false });
    pdf = await job.task.promise; valid(job);
    if (pdf.numPages > 100) throw new Error('PDF maksimum 100 halaman.');
    const selected = selectedPages(selection, pdf.numPages);
    let totalPixels = 0, totalBytes = 0;
    // Preflight every selected page before allocating any raster canvas.
    for (const n of selected) {
      const page = await pdf.getPage(n);
      try {
        valid(job);
        const viewport = page.getViewport({ scale: 1 }), width = Math.ceil(viewport.width), height = Math.ceil(viewport.height), pixels = width * height;
        if (![width, height, pixels].every(Number.isSafeInteger) || width < 1 || height < 1 || pixels > 4000000) throw new Error('Dimensi halaman tidak valid atau melebihi 4 juta piksel.');
        totalPixels += pixels;
        if (totalPixels > 30000000) throw new Error('Total gambar melebihi 30 juta piksel. Kurangi pilihan halaman.');
      } finally { page.cleanup(); }
    }
    for (let i = 0; i < selected.length; i++) {
      valid(job); const n = selected[i], page = await pdf.getPage(n); let canvas;
      try {
        valid(job); $('status').textContent = `Menggambar halaman ${n} (${i + 1}/${selected.length})…`;
        const viewport = page.getViewport({ scale: 1 }); canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas tidak tersedia.');
        job.render = page.render({ canvasContext: ctx, viewport, background: '#ffffff' });
        await job.render.promise; job.render = null; valid(job);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, format === 'png' ? 'image/png' : 'image/jpeg', 0.9)); valid(job);
        if (!blob) throw new Error('Pembuatan gambar gagal. Coba halaman lebih kecil.');
        totalBytes += blob.size;
        if (totalBytes > MAX_IMAGES) throw new Error('Data gambar melebihi 32 MiB. Kurangi halaman atau pilih JPG.');
        const imageBytes = new Uint8Array(await blob.arrayBuffer()); valid(job);
        entries.push({ name: `halaman-${String(n).padStart(3, '0')}.${format === 'png' ? 'png' : 'jpg'}`, bytes: imageBytes });
        $('progress').value = (i + 1) / selected.length;
      } finally { if (canvas) { canvas.width = 0; canvas.height = 0; } page.cleanup(); }
    }
    valid(job); const zip = zipImages(entries); valid(job);
    const url = URL.createObjectURL(zip), a = document.createElement('a');
    try { a.href = url; a.download = 'alatkilat-halaman.zip'; a.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 10000); }
    $('status').textContent = `Selesai: ${entries.length} gambar dalam ZIP (${zip.size} byte).`;
  } catch (error) {
    if (job.revision === revision) $('status').textContent = error.name === 'PasswordException' ? 'Gagal: PDF terenkripsi tidak didukung.' : `Gagal: ${error.message || 'Pustaka tidak tersedia. Periksa koneksi lalu coba lagi.'}`;
  } finally {
    entries.length = 0;
    try { if (job.task) await job.task.destroy(); } catch {}
    if (job.revision === revision) { current = null; $('start').disabled = false; $('cancel').disabled = true; }
  }
});
