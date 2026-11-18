import { loadPdf, transformPdf, MAX_BYTES } from './pdf-editor-core.mjs';
const $ = id => document.getElementById(id);
const file = $('file'), status = $('status'), editor = $('editor'), list = $('pages'), download = $('download');
let generation = 0, bytes = null, pages = [], busy = false;
function invalidate() { generation++; busy = false; download.disabled = !bytes || !pages.length; }
function render() {
  list.replaceChildren();
  pages.forEach((page, i) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `Halaman asal ${page.index + 1} — putar tambahan ${page.rotation}°`;
    li.append(label);
    const actions = document.createElement('div'); actions.className = 'actions';
    function button(text, description, disabled, action) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = text;
      b.setAttribute('aria-label', `${description} halaman asal ${page.index + 1}`); b.disabled = disabled;
      b.addEventListener('click', () => { action(); invalidate(); render(); status.textContent = 'Perubahan siap diunduh.'; }); actions.append(b);
    }
    button('↑ Atas', 'Naikkan', i === 0, () => { [pages[i-1], pages[i]] = [pages[i], pages[i-1]]; });
    button('↓ Bawah', 'Turunkan', i === pages.length-1, () => { [pages[i+1], pages[i]] = [pages[i], pages[i+1]]; });
    button('↻ Putar', 'Putar', false, () => { page.rotation = (page.rotation + 90) % 360; });
    button('Hapus', 'Hapus', pages.length === 1, () => { pages.splice(i,1); });
    li.append(actions); list.append(li);
  });
  download.disabled = busy || !bytes || !pages.length;
}
file.addEventListener('change', async () => {
  const token = ++generation, chosen = file.files[0]; bytes = null; pages = []; busy = false; editor.hidden = true; download.disabled = true;
  if (!chosen) { status.textContent = ''; return; }
  status.textContent = 'Membaca PDF…';
  try {
    if (!chosen.size || chosen.size > MAX_BYTES) throw new Error('Ukuran PDF harus lebih dari 0 dan maksimal 20 MB.');
    const nextBytes = await chosen.arrayBuffer();
    const pdf = await loadPdf(window.PDFLib, nextBytes);
    if (token !== generation) return;
    bytes = nextBytes; pages = Array.from({length: pdf.getPageCount()}, (_, index) => ({index, rotation:0}));
    editor.hidden = false; render(); status.textContent = `${chosen.name}: ${pages.length} halaman siap diatur.`;
  } catch (e) { if (token === generation) status.textContent = e.message || 'Gagal membaca PDF.'; }
});
for (const id of ['numbers','watermark']) $(id).addEventListener('input', () => { if (bytes) { invalidate(); status.textContent = 'Perubahan siap diunduh.'; } });
download.addEventListener('click', async () => {
  if (!bytes || busy) return;
  const token = ++generation, selected = pages.map(p => ({...p})), snapshot = bytes;
  const options = {numbers:$('numbers').checked, watermark:$('watermark').value.trim()};
  busy = true; download.disabled = true; status.textContent = 'Membuat PDF…';
  try {
    const result = await transformPdf(window.PDFLib, snapshot, selected, options);
    if (token !== generation) return;
    const url = URL.createObjectURL(new Blob([result], {type:'application/pdf'}));
    const a = document.createElement('a'); a.href = url; a.download = 'halaman-diedit.pdf'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    status.textContent = 'PDF selesai dibuat.';
  } catch(e) { if (token === generation) status.textContent = e.message || 'Gagal membuat PDF.'; }
  finally { if (token === generation) { busy = false; render(); } }
});
if (!window.PDFLib) status.textContent = 'Pustaka PDF gagal dimuat. Periksa koneksi lalu muat ulang halaman.';
