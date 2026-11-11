// AlatKilat - Core Application & Tool Engine

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  setupSearch();
  setupDragAndDrop();
  initDefaultDate();
});

// View Navigation
function switchView(viewName) {
  const home = document.getElementById('view-home');
  const toolContainer = document.getElementById('view-tool-container');
  const toolSections = document.querySelectorAll('.tool-content');

  if (viewName === 'home') {
    home.classList.remove('hidden');
    toolContainer.classList.add('hidden');
    toolSections.forEach(sec => sec.classList.add('hidden'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    home.classList.add('hidden');
    toolContainer.classList.remove('hidden');
    toolSections.forEach(sec => sec.classList.add('hidden'));

    const targetSec = document.getElementById(viewName);
    if (targetSec) {
      targetSec.classList.remove('hidden');
      const badge = document.getElementById('active-tool-badge');
      const title = targetSec.querySelector('h2');
      if (badge && title) badge.textContent = title.textContent;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  lucide.createIcons();
}

// Category Filtering
let activeCategory = 'all';
function filterCategory(cat) {
  activeCategory = cat;
  const pills = document.querySelectorAll('.cat-pill');
  pills.forEach(p => {
    p.classList.remove('active', 'bg-brand-500', 'text-white');
    p.classList.add('bg-slate-900', 'text-slate-400');
  });

  const activeBtn = event ? event.target : null;
  if (activeBtn) {
    activeBtn.classList.add('active', 'bg-brand-500', 'text-white');
    activeBtn.classList.remove('bg-slate-900', 'text-slate-400');
  }

  const cards = document.querySelectorAll('.tool-card');
  cards.forEach(card => {
    const q = document.getElementById('tool-search').value.toLowerCase().trim();
    if ((cat === 'all' || card.dataset.cat === cat) && (!q || card.textContent.toLowerCase().includes(q))) {
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
  });
}

// Live Search
function setupSearch() {
  const searchInput = document.getElementById('tool-search');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const cards = document.querySelectorAll('.tool-card');

    cards.forEach(card => {
      const text = card.textContent.toLowerCase();
      if ((activeCategory === 'all' || card.dataset.cat === activeCategory) && (!q || text.includes(q))) {
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
      }
    });
  });
}

// Initialize PDF.js worker if available
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Global Drag & Drop Helper
function setupDragAndDrop() {
  bindDrop('drop-compress-img', 'input-compress-img', handleCompressImageUpload);
  bindDrop('drop-pasfoto', 'input-pasfoto', handlePasfotoUpload);
  bindDrop('drop-merge-pdf', 'input-merge-pdf', handleMergePdfUpload);
  bindDrop('drop-img-pdf', 'input-img-pdf', handleImgToPdfUpload);
  bindDrop('drop-split-pdf', 'input-split-pdf', handleSplitPdfUpload);
  bindDrop('drop-compress-pdf', 'input-compress-pdf', handleCompressPdfUpload);
  bindDrop('drop-extract-pdf', 'input-extract-pdf', handleExtractPdfUpload);
  bindDrop('drop-audio-trimmer', 'input-audio-trimmer', handleAudioUpload);
  bindDrop('drop-ocr-img', 'input-ocr-img', handleOcrUpload);
}

function bindDrop(boxId, inputId, handler) {
  const box = document.getElementById(boxId);
  const input = document.getElementById(inputId);
  if (!box || !input) return;

  box.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) handler(e.target.files);
  });

  box.addEventListener('dragover', (e) => {
    e.preventDefault();
    box.classList.add('border-brand-500', 'bg-slate-800/50');
  });
  box.addEventListener('dragleave', () => {
    box.classList.remove('border-brand-500', 'bg-slate-800/50');
  });
  box.addEventListener('drop', (e) => {
    e.preventDefault();
    box.classList.remove('border-brand-500', 'bg-slate-800/50');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handler(e.dataTransfer.files);
    }
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ==========================================
// TOOL 1: KOMPRES FOTO PAS UKURAN
// ==========================================
let currentCompressTargetKB = 200;
let currentCompressFile = null;
let compressedBlob = null;

function setCompressTarget(kb) {
  currentCompressTargetKB = kb;
  const btns = document.querySelectorAll('.target-btn');
  btns.forEach(b => {
    b.classList.remove('active', 'bg-brand-600', 'text-white');
    b.classList.add('bg-slate-800', 'text-slate-300');
  });
  if (event && event.target) {
    event.target.classList.add('active', 'bg-brand-600', 'text-white');
    event.target.classList.remove('bg-slate-800', 'text-slate-300');
  }
  if (currentCompressFile) runImageCompression(currentCompressFile);
}

function handleCompressImageUpload(files) {
  const file = files[0];
  if (!file || !file.type.startsWith('image/')) return;
  currentCompressFile = file;
  document.getElementById('orig-size-img').textContent = formatBytes(file.size);
  runImageCompression(file);
}

async function runImageCompression(file) {
  const resultDiv = document.getElementById('result-compress-img');
  const previewImg = document.getElementById('preview-compress-img');
  const newSizeEl = document.getElementById('new-size-img');
  const dlBtn = document.getElementById('btn-dl-compress-img');

  resultDiv.classList.add('hidden');
  compressedBlob = null;
  dlBtn.onclick = null;
  const img = new Image();
  const reader = new FileReader();
  const fail = () => {
    currentCompressFile = null;
    alert('Gambar tidak dapat dibaca. Pilih berkas gambar yang valid.');
  };
  img.onerror = fail;
  reader.onerror = fail;

  reader.onload = (e) => {
    img.src = e.target.result;
    img.onload = async () => {
      let maxDim = Math.max(img.width, img.height);
      let quality = 0.92;
      let blob = null;

      // Iterative canvas resize & quality adjustment to land strictly under target KB
      const targetBytes = currentCompressTargetKB * 1024;

      for (let attempt = 0; attempt < 8; attempt++) {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1600 / maxDim);
        canvas.width = Math.round(img.width * scale * (1 - attempt * 0.08));
        canvas.height = Math.round(img.height * scale * (1 - attempt * 0.08));

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
        if (blob.size <= targetBytes || quality <= 0.25) break;
        quality -= 0.12;
      }

      compressedBlob = blob;
      const url = URL.createObjectURL(blob);
      previewImg.src = url;
      newSizeEl.textContent = formatBytes(blob.size);
      resultDiv.classList.remove('hidden');

      dlBtn.onclick = () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = `foto-terkompres-${currentCompressTargetKB}kb.jpg`;
        a.click();
      };
      lucide.createIcons();
    };
  };
  reader.readAsDataURL(file);
}

// ==========================================
// TOOL 2: PASFOTO BACKGROUND & RATIO
// ==========================================
let currentPasfotoImg = null;
let currentBgColor = '#d32f2f'; // default merah

function setBgColor(hex) {
  currentBgColor = hex;
  const btns = document.querySelectorAll('.bg-color-btn');
  btns.forEach(b => b.classList.remove('border-brand-500', 'scale-105'));
  if (event && event.target) {
    event.target.classList.add('border-brand-500', 'scale-105');
  }
  if (currentPasfotoImg) renderPasfoto();
}

function handlePasfotoUpload(files) {
  const file = files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.src = e.target.result;
    img.onload = () => {
      currentPasfotoImg = img;
      renderPasfoto();
    };
  };
  reader.readAsDataURL(file);
}

function renderPasfoto() {
  if (!currentPasfotoImg) return;
  const ratio = document.getElementById('select-pasfoto-ratio').value;
  const canvas = document.getElementById('canvas-pasfoto');
  const resultDiv = document.getElementById('result-pasfoto');
  const dlBtn = document.getElementById('btn-dl-pasfoto');

  let width = 300;
  let height = 400; // default 3x4
  if (ratio === '4x6') { width = 400; height = 600; }
  if (ratio === '2x3') { width = 200; height = 300; }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Fill Background
  ctx.fillStyle = currentBgColor;
  ctx.fillRect(0, 0, width, height);

  // Center crop image onto canvas
  const imgW = currentPasfotoImg.width;
  const imgH = currentPasfotoImg.height;
  const imgAspect = imgW / imgH;
  const canvasAspect = width / height;

  let sW, sH, sX, sY;
  if (imgAspect > canvasAspect) {
    sH = imgH;
    sW = imgH * canvasAspect;
    sX = (imgW - sW) / 2;
    sY = 0;
  } else {
    sW = imgW;
    sH = imgW / canvasAspect;
    sX = 0;
    sY = (imgH - sH) / 4; // slight top bias for portrait head
  }

  ctx.drawImage(currentPasfotoImg, sX, sY, sW, sH, 0, 0, width, height);
  resultDiv.classList.remove('hidden');

  dlBtn.onclick = () => {
    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `pasfoto-${ratio}-${currentBgColor === '#d32f2f' ? 'merah' : currentBgColor === '#ffffff' ? 'putih' : 'biru'}.jpg`;
      a.click();
    }, 'image/jpeg', 0.95);
  };
}

document.getElementById('select-pasfoto-ratio')?.addEventListener('change', renderPasfoto);

// ==========================================
// TOOL 3: GABUNG PDF (MERGE)
// ==========================================
let mergePdfFiles = [];

function handleMergePdfUpload(files) {
  for (let f of files) {
    if (f.type === 'application/pdf' || f.name.endsWith('.pdf')) {
      mergePdfFiles.push(f);
    }
  }
  updateMergeList();
}

function updateMergeList() {
  const list = document.getElementById('list-merge-pdf');
  const btn = document.getElementById('btn-run-merge-pdf');
  if (!list) return;

  list.innerHTML = '';
  mergePdfFiles.forEach((file, idx) => {
    const li = document.createElement('li');
    li.className = 'flex items-center justify-between p-2.5 bg-slate-800 rounded-lg';
    li.innerHTML = `
      <div class="flex items-center gap-2 truncate">
        <span class="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px]">${idx + 1}</span>
        <span class="truncate" data-file-name></span>
        <span class="text-[10px] text-slate-500">(${formatBytes(file.size)})</span>
      </div>
      <button onclick="removeMergeFile(${idx})" class="text-rose-400 hover:text-rose-300 px-2">Hapus</button>
    `;
    li.querySelector('[data-file-name]').textContent = file.name;
    list.appendChild(li);
  });

  btn.disabled = mergePdfFiles.length < 2;
  btn.onclick = executeMergePdf;
}

function removeMergeFile(idx) {
  mergePdfFiles.splice(idx, 1);
  updateMergeList();
}

async function executeMergePdf() {
  const btn = document.getElementById('btn-run-merge-pdf');
  btn.disabled = true;
  btn.textContent = 'Menggabungkan berkas...';

  try {
    const mergedPdf = await PDFLib.PDFDocument.create();

    for (let file of mergePdfFiles) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();
    const blob = new Blob([mergedBytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gabungan-dokumen-${Date.now()}.pdf`;
    a.click();
  } catch (err) {
    alert('Gagal menggabungkan PDF: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="combine" class="w-4 h-4"></i> Gabungkan & Download PDF`;
    lucide.createIcons();
  }
}

// ==========================================
// TOOL 4: FOTO / SCAN KE PDF
// ==========================================
let imgToPdfFiles = [];

function handleImgToPdfUpload(files) {
  for (let f of files) {
    if (f.type.startsWith('image/')) imgToPdfFiles.push(f);
  }
  updateImgToPdfList();
}

function updateImgToPdfList() {
  const list = document.getElementById('list-img-pdf');
  const btn = document.getElementById('btn-run-img-pdf');
  if (!list) return;

  list.innerHTML = '';
  imgToPdfFiles.forEach((file, idx) => {
    const li = document.createElement('li');
    li.className = 'flex items-center justify-between p-2.5 bg-slate-800 rounded-lg';
    li.innerHTML = `
      <div class="flex items-center gap-2 truncate">
        <span class="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px]">${idx + 1}</span>
        <span class="truncate" data-file-name></span>
      </div>
      <button onclick="removeImgToPdfFile(${idx})" class="text-rose-400 hover:text-rose-300 px-2">Hapus</button>
    `;
    li.querySelector('[data-file-name]').textContent = file.name;
    list.appendChild(li);
  });

  btn.disabled = imgToPdfFiles.length === 0;
  btn.onclick = executeImgToPdf;
}

function removeImgToPdfFile(idx) {
  imgToPdfFiles.splice(idx, 1);
  updateImgToPdfList();
}

async function executeImgToPdf() {
  const btn = document.getElementById('btn-run-img-pdf');
  btn.disabled = true;
  btn.textContent = 'Membuat Dokumen PDF...';

  try {
    const pdfDoc = await PDFLib.PDFDocument.create();
    // A4 standard points: 595.28 x 841.89
    const A4_W = 595.28;
    const A4_H = 841.89;

    for (let file of imgToPdfFiles) {
      const buffer = await file.arrayBuffer();
      let embeddedImg;
      if (file.type.includes('png')) {
        embeddedImg = await pdfDoc.embedPng(buffer);
      } else if (file.type === 'image/jpeg') {
        embeddedImg = await pdfDoc.embedJpg(buffer);
      } else {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        bitmap.close();
        const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        embeddedImg = await pdfDoc.embedPng(await png.arrayBuffer());
      }

      const page = pdfDoc.addPage([A4_W, A4_H]);
      const imgDims = embeddedImg.scaleToFit(A4_W - 60, A4_H - 60);

      page.drawImage(embeddedImg, {
        x: (A4_W - imgDims.width) / 2,
        y: (A4_H - imgDims.height) / 2,
        width: imgDims.width,
        height: imgDims.height,
      });
    }

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dokumen-foto-${Date.now()}.pdf`;
    a.click();
  } catch (err) {
    alert('Gagal membuat PDF: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="file-text" class="w-4 h-4"></i> Buat Dokumen PDF`;
    lucide.createIcons();
  }
}

// ==========================================
// TOOL 5: KALKULATOR PPh 21 TER (PP 58/2023)
// ==========================================
function hitungPPh21() {
  const bruto = parseFloat(document.getElementById('input-gaji-bruto').value) || 0;
  const kategori = document.getElementById('select-ptkp').value;
  const resultDiv = document.getElementById('result-pph21');

  if (bruto <= 0) {
    alert('Masukkan nominal gaji bruto yang valid.');
    return;
  }

  // Only the zero-rate boundaries have been checked against DJP's TER table.
  // Do not extrapolate a partial table into unverified taxable brackets.
  const validatedLimits = { A: 5400000, B: 6200000, C: 6600000 };
  resultDiv.classList.add('hidden');
  if (!Number.isFinite(bruto) || !validatedLimits[kategori] || bruto > validatedLimits[kategori]) {
    alert('Di luar rentang tervalidasi: A sampai Rp5.400.000, B sampai Rp6.200.000, C sampai Rp6.600.000. Hasil tidak dihitung; gunakan tabel TER resmi DJP.');
    return;
  }
  const rate = 0;

  const potongan = Math.round(bruto * rate);
  const bersih = bruto - potongan;

  document.getElementById('res-pph21-rate').textContent = (rate * 100).toFixed(2) + '%';
  document.getElementById('res-pph21-potongan').textContent = 'Rp ' + potongan.toLocaleString('id-ID');
  document.getElementById('res-pph21-bersih').textContent = 'Rp ' + bersih.toLocaleString('id-ID');

  resultDiv.classList.remove('hidden');
}

// ==========================================
// TOOL 6: GENERATOR KWITANSI PDF
// ==========================================
function initDefaultDate() {
  const dateInput = document.getElementById('kw-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }
}

function angkaKeTerbilang(nilai) {
  const huruf = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];
  nilai = Math.floor(nilai);
  if (nilai < 12) return huruf[nilai];
  if (nilai < 20) return angkaKeTerbilang(nilai - 10) + ' Belas';
  if (nilai < 100) return angkaKeTerbilang(Math.floor(nilai / 10)) + ' Puluh ' + angkaKeTerbilang(nilai % 10);
  if (nilai < 200) return 'Seratus ' + angkaKeTerbilang(nilai - 100);
  if (nilai < 1000) return angkaKeTerbilang(Math.floor(nilai / 100)) + ' Ratus ' + angkaKeTerbilang(nilai % 100);
  if (nilai < 2000) return 'Seribu ' + angkaKeTerbilang(nilai - 1000);
  if (nilai < 1000000) return angkaKeTerbilang(Math.floor(nilai / 1000)) + ' Ribu ' + angkaKeTerbilang(nilai % 1000);
  if (nilai < 1000000000) return angkaKeTerbilang(Math.floor(nilai / 1000000)) + ' Juta ' + angkaKeTerbilang(nilai % 1000000);
  if (nilai < 1000000000000) return angkaKeTerbilang(Math.floor(nilai / 1000000000)) + ' Miliar ' + angkaKeTerbilang(nilai % 1000000000);
  return 'Nominal Terlalu Besar';
}

function autoTerbilang() {
  const val = parseFloat(document.getElementById('kw-jumlah').value) || 0;
  const out = document.getElementById('kw-terbilang');
  if (val <= 0) {
    out.value = '';
    return;
  }
  const hasil = angkaKeTerbilang(val).replace(/\s+/g, ' ').trim() + ' Rupiah';
  out.value = hasil;
}

async function buatKwitansiPDF() {
  const no = document.getElementById('kw-no').value || 'KW-001';
  const tgl = document.getElementById('kw-date').value || '2026-11-10';
  const dari = document.getElementById('kw-dari').value || 'Pelanggan Terhormat';
  const jumlah = parseFloat(document.getElementById('kw-jumlah').value) || 0;
  const terbilang = document.getElementById('kw-terbilang').value || '-';
  const untuk = document.getElementById('kw-untuk').value || 'Pembayaran Jasa/Barang';
  const kota = document.getElementById('kw-kota').value || 'Jakarta';
  const penerima = document.getElementById('kw-penerima').value || 'Penerima Pembayaran';

  try {
  const pdfDoc = await PDFLib.PDFDocument.create();
  // Landscape half-page voucher: 595 x 350
  const page = pdfDoc.addPage([595, 360]);
  const font = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaOblique);

  // Outer border & header box
  page.drawRectangle({
    x: 20, y: 20, width: 555, height: 320,
    borderColor: PDFLib.rgb(0.2, 0.2, 0.2), borderWidth: 1.5,
  });

  page.drawText('KWITANSI PEMBAYARAN', { x: 35, y: 305, size: 16, font: fontBold, color: PDFLib.rgb(0.1, 0.1, 0.1) });
  page.drawText(`No: ${no}`, { x: 420, y: 305, size: 11, font: fontBold });

  page.drawLine({
    start: { x: 35, y: 295 }, end: { x: 560, y: 295 },
    thickness: 1, color: PDFLib.rgb(0.7, 0.7, 0.7)
  });

  // Rows
  const drawRow = (label, text, y) => {
    page.drawText(label, { x: 35, y: y, size: 10, font: font, color: PDFLib.rgb(0.3, 0.3, 0.3) });
    page.drawText(':', { x: 150, y: y, size: 10, font: fontBold });
    page.drawText(text, { x: 165, y: y, size: 10, font: fontBold, color: PDFLib.rgb(0.05, 0.05, 0.05) });
  };

  drawRow('Telah Diterima Dari', dari, 265);
  drawRow('Uang Sejumlah', `Rp ${jumlah.toLocaleString('id-ID')}`, 235);
  drawRow('Terbilang', terbilang, 205);
  drawRow('Untuk Pembayaran', untuk, 175);

  // Amount badge box
  page.drawRectangle({
    x: 35, y: 80, width: 220, height: 45,
    color: PDFLib.rgb(0.95, 0.95, 0.95),
    borderColor: PDFLib.rgb(0.2, 0.2, 0.2), borderWidth: 1,
  });
  page.drawText(`JUMLAH: Rp ${jumlah.toLocaleString('id-ID')}`, {
    x: 45, y: 98, size: 13, font: fontBold, color: PDFLib.rgb(0.05, 0.5, 0.3)
  });

  // Signature Block
  page.drawText(`${kota}, ${tgl}`, { x: 400, y: 130, size: 9, font: font });
  page.drawText('( Tanda Tangan & Nama Terang )', { x: 380, y: 55, size: 8, font: fontItalic, color: PDFLib.rgb(0.5, 0.5, 0.5) });
  page.drawText(penerima, { x: 400, y: 68, size: 10, font: fontBold });

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kwitansi-${no}.pdf`;
  a.click();
  } catch (err) {
    alert('Kwitansi gagal dibuat. Font PDF standar tidak mendukung semua karakter (misalnya emoji). Periksa isian dan gunakan karakter yang didukung. Detail: ' + err.message);
  }
}

// ==========================================
// TOOL 7: GENERATOR QR CODE
// ==========================================
let qrInstance = null;

function generateQRCode() {
  const text = document.getElementById('input-qr-text').value.trim();
  const box = document.getElementById('qrcode-box');
  const res = document.getElementById('result-qr');

  if (!text) {
    alert('Masukkan link atau teks terlebih dahulu.');
    return;
  }

  res.classList.add('hidden');
  box.innerHTML = '';
  qrInstance = null;
  try {
  qrInstance = new QRCode(box, {
    text: text,
    width: 200,
    height: 200,
    colorDark: '#0f172a',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
  } catch (err) {
    box.innerHTML = '';
    alert('Teks terlalu panjang atau tidak dapat dibuat menjadi QR. Pendekkan teks lalu coba lagi.');
    return;
  }

  res.classList.remove('hidden');
}

function downloadQRCode() {
  const img = document.querySelector('#qrcode-box img');
  if (img && img.src) {
    const a = document.createElement('a');
    a.href = img.src;
    a.download = `qrcode-${Date.now()}.png`;
    a.click();
  }
}

// ==========================================
// TOOL 8: CASE CONVERTER & STATS
// ==========================================
function updateTextStats() {
  const text = document.getElementById('input-case-text').value;
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const paragraphs = text.trim() ? text.split(/\n+/).filter(part => part.trim()).length : 0;

  document.getElementById('stat-chars').textContent = chars;
  document.getElementById('stat-words').textContent = words;
  document.getElementById('stat-paragraphs').textContent = paragraphs;
}

function transformText(type) {
  const el = document.getElementById('input-case-text');
  let val = el.value;

  if (type === 'upper') {
    el.value = val.toUpperCase();
  } else if (type === 'lower') {
    el.value = val.toLowerCase();
  } else if (type === 'title') {
    el.value = val.toLowerCase().replace(/(?:^|\s)\w/g, (m) => m.toUpperCase());
  } else if (type === 'slug') {
    el.value = val.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  updateTextStats();
}

function copyTransformedText() {
  const el = document.getElementById('input-case-text');
  if (!el.value) return;
  navigator.clipboard.writeText(el.value).then(() => {
    alert('Teks berhasil disalin ke clipboard!');
  });
}

// ==========================================
// TOOL 9: PISAH / POTONG PDF (SPLIT PDF)
// ==========================================
let splitPdfDoc = null;
let splitPdfBuffer = null;
let splitPdfTotalPages = 0;
let splitPdfOriginalName = 'dokumen.pdf';

async function handleSplitPdfUpload(files) {
  const file = files[0];
  if (!file || !(file.type === 'application/pdf' || file.name.endsWith('.pdf'))) return;

  splitPdfOriginalName = file.name;
  splitPdfBuffer = await file.arrayBuffer();

  try {
    splitPdfDoc = await PDFLib.PDFDocument.load(splitPdfBuffer);
    splitPdfTotalPages = splitPdfDoc.getPageCount();

    document.getElementById('split-pdf-name').textContent = file.name;
    document.getElementById('split-pdf-pages').textContent = `Total: ${splitPdfTotalPages} Halaman`;
    document.getElementById('box-split-controls').classList.remove('hidden');
    document.getElementById('input-split-range').value = `1-${Math.min(splitPdfTotalPages, 3)}`;
    lucide.createIcons();
  } catch (err) {
    alert('Gagal membaca PDF: ' + err.message);
  }
}

function setSplitPreset(type) {
  if (splitPdfTotalPages <= 0) return;
  const input = document.getElementById('input-split-range');

  if (type === 'first') {
    input.value = '1';
  } else if (type === 'odd') {
    const odds = [];
    for (let i = 1; i <= splitPdfTotalPages; i += 2) odds.push(i);
    input.value = odds.join(', ');
  } else if (type === 'even') {
    const evens = [];
    for (let i = 2; i <= splitPdfTotalPages; i += 2) evens.push(i);
    input.value = evens.length > 0 ? evens.join(', ') : '1';
  }
}

function parsePageRange(rangeStr, maxPages) {
  const pages = new Set();
  for (const part of rangeStr.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) return [];
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > maxPages) return [];
    for (let i = start; i <= end; i++) pages.add(i - 1);
  }
  return Array.from(pages).sort((a, b) => a - b);
}

async function executeSplitPdf() {
  if (!splitPdfDoc) return;
  const rangeStr = document.getElementById('input-split-range').value.trim();
  const pageIndices = parsePageRange(rangeStr, splitPdfTotalPages);

  if (pageIndices.length === 0) {
    alert('Rentang halaman tidak valid atau di luar jumlah total halaman (' + splitPdfTotalPages + ').');
    return;
  }

  const btn = document.getElementById('btn-run-split-pdf');
  btn.disabled = true;
  btn.textContent = 'Memisahkan halaman...';

  try {
    const newPdf = await PDFLib.PDFDocument.create();
    const copiedPages = await newPdf.copyPages(splitPdfDoc, pageIndices);
    copiedPages.forEach(p => newPdf.addPage(p));

    const pdfBytes = await newPdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pisah-${rangeStr.replace(/[^a-zA-Z0-9-]/g, '_')}-${splitPdfOriginalName}`;
    a.click();
  } catch (err) {
    alert('Gagal memisahkan PDF: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i data-lucide="scissors" class="w-4 h-4"></i> Pisahkan & Download PDF`;
    lucide.createIcons();
  }
}

// ==========================================
// TOOL 10: KOMPRES DOKUMEN PDF
// ==========================================
let compressPdfFile = null;
let compressPdfPreset = 'med'; // 'low', 'med', 'high'
let compressedPdfBlob = null;

function setPdfCompressPreset(preset) {
  compressPdfPreset = preset;
  const btnLow = document.getElementById('btn-comp-preset-low');
  const btnMed = document.getElementById('btn-comp-preset-med');
  const btnHigh = document.getElementById('btn-comp-preset-high');

  [btnLow, btnMed, btnHigh].forEach(b => {
    b.className = 'p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition text-center';
  });

  if (preset === 'low') {
    btnLow.className = 'p-2.5 rounded-lg bg-emerald-600 text-xs font-medium text-white transition text-center border border-emerald-400';
  } else if (preset === 'med') {
    btnMed.className = 'p-2.5 rounded-lg bg-emerald-600 text-xs font-medium text-white transition text-center border border-emerald-400';
  } else {
    btnHigh.className = 'p-2.5 rounded-lg bg-emerald-600 text-xs font-medium text-white transition text-center border border-emerald-400';
  }
}

function handleCompressPdfUpload(files) {
  const file = files[0];
  if (!file || !(file.type === 'application/pdf' || file.name.endsWith('.pdf'))) return;

  compressedPdfBlob = null;
  document.getElementById('btn-start-compress-pdf').classList.remove('hidden');
  compressPdfFile = file;
  document.getElementById('comp-pdf-name').textContent = file.name;
  document.getElementById('comp-pdf-orig-size').textContent = 'Ukuran: ' + formatBytes(file.size);
  document.getElementById('box-compress-pdf-controls').classList.remove('hidden');
  document.getElementById('result-compress-pdf').classList.add('hidden');
  lucide.createIcons();
}

async function executeCompressPdf() {
  if (!compressPdfFile || typeof pdfjsLib === 'undefined') {
    alert('PDF viewer library belum siap, coba refresh halaman.');
    return;
  }

  const startBtn = document.getElementById('btn-start-compress-pdf');
  const progressBox = document.getElementById('compress-pdf-progress-box');
  const progressBar = document.getElementById('compress-pdf-bar');
  const progressStatus = document.getElementById('compress-pdf-status');
  const progressPercent = document.getElementById('compress-pdf-percent');
  const resultDiv = document.getElementById('result-compress-pdf');

  startBtn.classList.add('hidden');
  progressBox.classList.remove('hidden');
  resultDiv.classList.add('hidden');

  try {
    const arrayBuffer = await compressPdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;

    const outPdf = await PDFLib.PDFDocument.create();

    // Scale and quality settings based on preset
    let scale = 1.0;
    let quality = 0.65;
    if (compressPdfPreset === 'low') { scale = 1.25; quality = 0.82; }
    if (compressPdfPreset === 'med') { scale = 0.95; quality = 0.65; }
    if (compressPdfPreset === 'high') { scale = 0.75; quality = 0.45; }

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pct = Math.round((pageNum / numPages) * 100);
      progressBar.style.width = pct + '%';
      progressPercent.textContent = pct + '%';
      progressStatus.textContent = `Mengompres halaman ${pageNum} dari ${numPages}...`;

      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport: viewport }).promise;

      const imgBlob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
      const imgBuffer = await imgBlob.arrayBuffer();
      const embeddedJpg = await outPdf.embedJpg(imgBuffer);

      // Keep original aspect ratio in points
      const origViewport = page.getViewport({ scale: 1.0 });
      const outPage = outPdf.addPage([origViewport.width, origViewport.height]);
      outPage.drawImage(embeddedJpg, {
        x: 0,
        y: 0,
        width: origViewport.width,
        height: origViewport.height,
      });
    }

    const compressedBytes = await outPdf.save();
    compressedPdfBlob = new Blob([compressedBytes], { type: 'application/pdf' });

    progressBox.classList.add('hidden');
    resultDiv.classList.remove('hidden');

    const origSize = compressPdfFile.size;
    const newSize = compressedPdfBlob.size;
    document.getElementById('res-comp-orig').textContent = formatBytes(origSize);
    document.getElementById('res-comp-new').textContent = formatBytes(newSize);

    const savingPct = Math.round(((origSize - newSize) / origSize) * 100);
    const savingEl = document.getElementById('res-comp-saving');
    if (savingPct > 0) {
      savingEl.textContent = `Berhasil menghemat: ${savingPct}% ukuran berkas! 🎉`;
      savingEl.className = 'text-xs text-brand-400 font-bold';
    } else {
      savingEl.textContent = 'Ukuran berkas sudah optimal.';
      savingEl.className = 'text-xs text-slate-400 font-medium';
    }

    document.getElementById('btn-dl-compress-pdf').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(compressedPdfBlob);
      a.download = `kompres-${compressPdfFile.name}`;
      a.click();
    };

    lucide.createIcons();
  } catch (err) {
    alert('Gagal mengompres PDF: ' + err.message);
    startBtn.classList.remove('hidden');
    progressBox.classList.add('hidden');
  }
}

// ==========================================
// TOOL 11: EKSTRAK TEKS & DATA PDF
// ==========================================
let currentExtractedText = '';

async function handleExtractPdfUpload(files) {
  const file = files[0];
  if (!file || !(file.type === 'application/pdf' || file.name.endsWith('.pdf'))) return;

  const progressBox = document.getElementById('extract-pdf-progress-box');
  const progressBar = document.getElementById('extract-pdf-bar');
  const progressStatus = document.getElementById('extract-pdf-status');
  const progressPercent = document.getElementById('extract-pdf-percent');
  const resultDiv = document.getElementById('result-extract-pdf');
  const outputArea = document.getElementById('output-extracted-text');

  progressBox.classList.remove('hidden');
  resultDiv.classList.add('hidden');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;

    let fullText = '';
    const contentPages = [];
    currentExtractedText = '';
    outputArea.value = '';

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const pct = Math.round((pageNum / numPages) * 100);
      progressBar.style.width = pct + '%';
      progressPercent.textContent = pct + '%';
      progressStatus.textContent = `Mengekstrak halaman ${pageNum} dari ${numPages}...`;

      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');

      contentPages.push(pageText.trim());
      if (pageText.trim()) fullText += `--- [ Halaman ${pageNum} ] ---\n` + pageText.trim() + '\n\n';
    }

    currentExtractedText = fullText.trim();
    outputArea.value = currentExtractedText;

    // Count only PDF text-layer content, never generated page labels.
    const contentText = contentPages.filter(Boolean).join('\n');
    const words = contentText ? contentText.split(/\s+/).length : 0;
    const chars = contentText.length;
    document.getElementById('extract-pdf-notice').textContent = contentText
      ? 'Hanya text layer yang diekstrak; halaman scan tanpa teks tidak menjalankan OCR. Statistik tidak menghitung label halaman.'
      : 'PDF ini tidak memiliki text layer yang terbaca. Ekstraksi ini bukan OCR PDF scan. Ubah halaman menjadi gambar, lalu gunakan OCR gambar.';

    document.getElementById('stat-extract-pages').textContent = `Halaman: ${numPages}`;
    document.getElementById('stat-extract-words').textContent = `Kata: ${words.toLocaleString('id-ID')}`;
    document.getElementById('stat-extract-chars').textContent = `Karakter: ${chars.toLocaleString('id-ID')}`;

    progressBox.classList.add('hidden');
    resultDiv.classList.remove('hidden');
    lucide.createIcons();
  } catch (err) {
    alert('Gagal mengekstrak teks dari PDF: ' + err.message);
    progressBox.classList.add('hidden');
  }
}

function copyExtractedText() {
  if (!currentExtractedText) return;
  navigator.clipboard.writeText(currentExtractedText).then(() => {
    alert('Seluruh teks berhasil disalin ke clipboard!');
  });
}

function downloadExtractedTxt() {
  if (!currentExtractedText) return;
  const blob = new Blob([currentExtractedText], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ekstrak-teks-${Date.now()}.txt`;
  a.click();
}

function downloadExtractedDoc() {
  if (!currentExtractedText) return;
  const htmlContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>Hasil Ekstrak Dokumen</title></head>
    <body style="font-family: Calibri, sans-serif; font-size: 11pt; line-height: 1.5;">
      ${currentExtractedText.replace(/\n\n/g, '<p></p>').replace(/\n/g, '<br/>')}
    </body>
    </html>
  `;
  const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ekstrak-dokumen-${Date.now()}.doc`;
  a.click();
}

// ==========================================
// TOOL 12: PEMOTONG AUDIO (AUDIO TRIMMER)
// ==========================================
let audioContext = null;
let currentAudioBuffer = null;
let currentAudioSource = null;
let isAudioPlaying = false;
let audioOriginalFileName = 'audio.mp3';

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

async function handleAudioUpload(files) {
  const file = files[0];
  if (!file || !file.type.startsWith('audio/')) return;

  audioOriginalFileName = file.name;
  const ctx = getAudioContext();
  const arrayBuffer = await file.arrayBuffer();

  try {
    currentAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const duration = currentAudioBuffer.duration;

    document.getElementById('audio-file-name').textContent = file.name;
    document.getElementById('audio-duration-info').textContent = 'Durasi: ' + formatAudioDuration(duration);
    document.getElementById('audio-start-time').value = '0';
    document.getElementById('audio-end-time').value = Math.min(30, duration).toString();
    document.getElementById('audio-end-time').max = duration.toFixed(1);

    document.getElementById('box-audio-controls').classList.remove('hidden');
    drawAudioWaveform(currentAudioBuffer);
    lucide.createIcons();
  } catch (err) {
    alert('Gagal memproses berkas audio: ' + err.message);
  }
}

function formatAudioDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function drawAudioWaveform(buffer) {
  const canvas = document.getElementById('canvas-waveform');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const width = canvas.width = canvas.parentElement.clientWidth || 600;
  const height = canvas.height = 96;

  ctx.fillStyle = '#020617';
  ctx.fillRect(0, 0, width, height);

  const rawData = buffer.getChannelData(0);
  const step = Math.ceil(rawData.length / width);
  const amp = height / 2;

  ctx.fillStyle = '#8b5cf6';
  for (let i = 0; i < width; i++) {
    let min = 1.0;
    let max = -1.0;
    for (let j = 0; j < step; j++) {
      const datum = rawData[(i * step) + j];
      if (datum < min) min = datum;
      if (datum > max) max = datum;
    }
    const yTop = (1 + min) * amp;
    const yBottom = Math.max(1, (max - min) * amp);
    ctx.fillRect(i, yTop, 1, yBottom);
  }
}

function updateAudioTrimInputs() {
  if (!currentAudioBuffer) return;
  const max = currentAudioBuffer.duration;
  let start = parseFloat(document.getElementById('audio-start-time').value) || 0;
  let end = parseFloat(document.getElementById('audio-end-time').value) || 0;

  if (start < 0) start = 0;
  if (start >= max) start = max - 0.5;
  if (end <= start) end = start + 1;
  if (end > max) end = max;

  document.getElementById('audio-start-time').value = start.toFixed(1);
  document.getElementById('audio-end-time').value = end.toFixed(1);
}

function togglePlayAudioSelection() {
  if (!currentAudioBuffer) return;
  const ctx = getAudioContext();
  const btn = document.getElementById('btn-play-audio-selection');

  if (isAudioPlaying) {
    if (currentAudioSource) {
      currentAudioSource.stop();
      currentAudioSource = null;
    }
    isAudioPlaying = false;
    btn.innerHTML = `<i data-lucide="play" class="w-4 h-4"></i> Putar Pilihan`;
    lucide.createIcons();
    return;
  }

  const start = parseFloat(document.getElementById('audio-start-time').value) || 0;
  const end = parseFloat(document.getElementById('audio-end-time').value) || currentAudioBuffer.duration;
  const duration = Math.max(0.1, end - start);

  currentAudioSource = ctx.createBufferSource();
  currentAudioSource.buffer = currentAudioBuffer;
  currentAudioSource.connect(ctx.destination);
  currentAudioSource.start(0, start, duration);

  isAudioPlaying = true;
  btn.innerHTML = `<i data-lucide="square" class="w-4 h-4"></i> Hentikan`;
  lucide.createIcons();

  currentAudioSource.onended = () => {
    isAudioPlaying = false;
    btn.innerHTML = `<i data-lucide="play" class="w-4 h-4"></i> Putar Pilihan`;
    lucide.createIcons();
  };
}

function executeDownloadTrimmedAudio() {
  if (!currentAudioBuffer) return;
  const start = parseFloat(document.getElementById('audio-start-time').value) || 0;
  const end = parseFloat(document.getElementById('audio-end-time').value) || currentAudioBuffer.duration;
  const sampleRate = currentAudioBuffer.sampleRate;
  const startOffset = Math.floor(start * sampleRate);
  const endOffset = Math.floor(end * sampleRate);
  const frameCount = Math.max(1, endOffset - startOffset);

  const ctx = getAudioContext();
  const numChannels = currentAudioBuffer.numberOfChannels;
  const trimmed = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let c = 0; c < numChannels; c++) {
    const src = currentAudioBuffer.getChannelData(c);
    const dest = trimmed.getChannelData(c);
    for (let i = 0; i < frameCount; i++) {
      dest[i] = src[startOffset + i] || 0;
    }
  }

  const wavBlob = audioBufferToWavBlob(trimmed);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(wavBlob);
  a.download = `potongan-${audioOriginalFileName.replace(/\.[^/.]+$/, '')}.wav`;
  a.click();
}

function audioBufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  // Interleave audio channels
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = buffer.getChannelData(c)[i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}

// ==========================================
// TOOL 13: JSON FORMATTER & VALIDATOR
// ==========================================
function validateJsonLive() {
  const editor = document.getElementById('input-json-editor');
  const statusText = document.getElementById('json-status-text');
  const statsText = document.getElementById('json-stats-text');
  const val = editor.value.trim();

  statsText.textContent = `${editor.value.length} Karakter`;

  if (!val) {
    statusText.textContent = 'Siap menerima data JSON.';
    statusText.className = 'text-slate-400';
    return;
  }

  try {
    JSON.parse(val);
    statusText.textContent = '✓ JSON Valid & Siap Digunakan';
    statusText.className = 'text-emerald-400 font-semibold';
  } catch (err) {
    statusText.textContent = '✕ ' + err.message;
    statusText.className = 'text-rose-400 font-semibold';
  }
}

function formatJson(spaces = 2) {
  const editor = document.getElementById('input-json-editor');
  try {
    const obj = JSON.parse(editor.value);
    editor.value = JSON.stringify(obj, null, spaces);
    validateJsonLive();
  } catch (err) {
    alert('JSON tidak valid: ' + err.message);
  }
}

function minifyJson() {
  const editor = document.getElementById('input-json-editor');
  try {
    const obj = JSON.parse(editor.value);
    editor.value = JSON.stringify(obj);
    validateJsonLive();
  } catch (err) {
    alert('JSON tidak valid: ' + err.message);
  }
}

function loadSampleJson() {
  const sample = {
    "project": "AlatKilat",
    "version": "1.2.0",
    "clientSide": true,
    "tools": [
      { "id": 1, "name": "Kompres Foto", "category": "photo" },
      { "id": 2, "name": "Split & Merge PDF", "category": "pdf" },
      { "id": 3, "name": "Audio Trimmer", "category": "audio" },
      { "id": 4, "name": "JSON Beautifier", "category": "dev" }
    ],
    "author": { "name": "Samudra", "role": "Owner" }
  };
  const editor = document.getElementById('input-json-editor');
  editor.value = JSON.stringify(sample, null, 2);
  validateJsonLive();
}

function clearJson() {
  const editor = document.getElementById('input-json-editor');
  editor.value = '';
  validateJsonLive();
}

function copyJsonText() {
  const editor = document.getElementById('input-json-editor');
  if (!editor.value) return;
  navigator.clipboard.writeText(editor.value).then(() => {
    alert('Kode JSON berhasil disalin ke clipboard!');
  });
}

function downloadJsonFile() {
  const editor = document.getElementById('input-json-editor');
  if (!editor.value) return;
  const blob = new Blob([editor.value], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `data-${Date.now()}.json`;
  a.click();
}

// ==========================================
// TOOL 14: HASH GENERATOR & ENCODER TESTER
// ==========================================
async function calculateCryptoHashes() {
  const input = document.getElementById('input-crypto-text').value;

  if (!input) {
    document.getElementById('hash-sha256').textContent = '-';
    document.getElementById('hash-sha512').textContent = '-';
    document.getElementById('hash-md5').textContent = '-';
    document.getElementById('hash-b64-enc').textContent = '-';
    document.getElementById('hash-b64-dec').textContent = '-';
    document.getElementById('hash-url-enc').textContent = '-';
    document.getElementById('hash-url-dec').textContent = '-';
    return;
  }

  const enc = new TextEncoder();
  const data = enc.encode(input);

  // SHA-256
  const sha256Buf = await crypto.subtle.digest('SHA-256', data);
  document.getElementById('hash-sha256').textContent = bufferToHex(sha256Buf);

  // SHA-512
  const sha512Buf = await crypto.subtle.digest('SHA-512', data);
  document.getElementById('hash-sha512').textContent = bufferToHex(sha512Buf);

  // MD5
  document.getElementById('hash-md5').textContent = calculateMD5(input);

  // Base64
  try {
    document.getElementById('hash-b64-enc').textContent = btoa(unescape(encodeURIComponent(input)));
  } catch (e) {
    document.getElementById('hash-b64-enc').textContent = 'Error Encode';
  }

  try {
    document.getElementById('hash-b64-dec').textContent = decodeURIComponent(escape(atob(input)));
  } catch (e) {
    document.getElementById('hash-b64-dec').textContent = '(Teks bukan Base64 valid)';
  }

  // URL Encode / Decode
  document.getElementById('hash-url-enc').textContent = encodeURIComponent(input);
  try {
    document.getElementById('hash-url-dec').textContent = decodeURIComponent(input);
  } catch (e) {
    document.getElementById('hash-url-dec').textContent = '(Bukan format URL valid)';
  }
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function copyHashResult(elementId) {
  const text = document.getElementById(elementId).textContent;
  if (!text || text === '-') return;
  navigator.clipboard.writeText(text).then(() => {
    alert('Hasil berhasil disalin ke clipboard!');
  });
}

// Compact MD5 Implementation
function calculateMD5(str) {
  function md5cycle(x, k) {
    var a = x[0], b = x[1], c = x[2], d = x[3];
    a = ff(a, b, c, d, k[0], 7, -680876936);
    d = ff(d, a, b, c, k[1], 12, -389564586);
    c = ff(c, d, a, b, k[2], 17, 606105819);
    b = ff(b, c, d, a, k[3], 22, -1044525330);
    a = ff(a, b, c, d, k[4], 7, -176418897);
    d = ff(d, a, b, c, k[5], 12, 1200080426);
    c = ff(c, d, a, b, k[6], 17, -1473231341);
    b = ff(b, c, d, a, k[7], 22, -45705983);
    a = ff(a, b, c, d, k[8], 7, 1770035416);
    d = ff(d, a, b, c, k[9], 12, -1958414417);
    c = ff(c, d, a, b, k[10], 17, -42063);
    b = ff(b, c, d, a, k[11], 22, -1990404162);
    a = ff(a, b, c, d, k[12], 7, 1804603682);
    d = ff(d, a, b, c, k[13], 12, -40341101);
    c = ff(c, d, a, b, k[14], 17, -1502002290);
    b = ff(b, c, d, a, k[15], 22, 1236535329);

    a = gg(a, b, c, d, k[1], 5, -165796510);
    d = gg(d, a, b, c, k[6], 9, -1069501632);
    c = gg(c, d, a, b, k[11], 14, 643717713);
    b = gg(b, c, d, a, k[0], 20, -373897302);
    a = gg(a, b, c, d, k[5], 5, -701558691);
    d = gg(d, a, b, c, k[10], 9, 38016083);
    c = gg(c, d, a, b, k[15], 14, -660478335);
    b = gg(b, c, d, a, k[4], 20, -405537848);
    a = gg(a, b, c, d, k[9], 5, 568446438);
    d = gg(d, a, b, c, k[14], 9, -1019803690);
    c = gg(c, d, a, b, k[3], 14, -187363961);
    b = gg(b, c, d, a, k[8], 20, 1163531501);
    a = gg(a, b, c, d, k[13], 5, -1444681467);
    d = gg(d, a, b, c, k[2], 9, -51403784);
    c = gg(c, d, a, b, k[7], 14, 1735328473);
    b = gg(b, c, d, a, k[12], 20, -1926607734);

    a = hh(a, b, c, d, k[5], 4, -378558);
    d = hh(d, a, b, c, k[8], 11, -2022574463);
    c = hh(c, d, a, b, k[11], 16, 1839030562);
    b = hh(b, c, d, a, k[14], 23, -35309556);
    a = hh(a, b, c, d, k[1], 4, -1530992060);
    d = hh(d, a, b, c, k[4], 11, 1272893353);
    c = hh(c, d, a, b, k[7], 16, -155497632);
    b = hh(b, c, d, a, k[10], 23, -1094730640);
    a = hh(a, b, c, d, k[13], 4, 681279174);
    d = hh(d, a, b, c, k[0], 11, -358537222);
    c = hh(c, d, a, b, k[3], 16, -722521979);
    b = hh(b, c, d, a, k[6], 23, 76029189);
    a = hh(a, b, c, d, k[9], 4, -640364487);
    d = hh(d, a, b, c, k[12], 11, -421815835);
    c = hh(c, d, a, b, k[15], 16, 530742520);
    b = hh(b, c, d, a, k[2], 23, -995338651);

    a = ii(a, b, c, d, k[0], 6, -198630844);
    d = ii(d, a, b, c, k[7], 10, 1126891415);
    c = ii(c, d, a, b, k[14], 15, -1416354905);
    b = ii(b, c, d, a, k[5], 21, -57434055);
    a = ii(a, b, c, d, k[12], 6, 1700485571);
    d = ii(d, a, b, c, k[3], 10, -1894986606);
    c = ii(c, d, a, b, k[10], 15, -1051523);
    b = ii(b, c, d, a, k[1], 21, -2054922799);
    a = ii(a, b, c, d, k[8], 6, 1873313359);
    d = ii(d, a, b, c, k[15], 10, -30611744);
    c = ii(c, d, a, b, k[6], 15, -1560198380);
    b = ii(b, c, d, a, k[13], 21, 1309151649);
    a = ii(a, b, c, d, k[4], 6, -145523070);
    d = ii(d, a, b, c, k[11], 10, -1120210379);
    c = ii(c, d, a, b, k[2], 15, 718787259);
    b = ii(b, c, d, a, k[9], 21, -343485551);

    x[0] = add32(a, x[0]);
    x[1] = add32(b, x[1]);
    x[2] = add32(c, x[2]);
    x[3] = add32(d, x[3]);
  }

  function cmn(q, a, b, x, s, t) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }
  function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }

  function add32(a, b) { return (a + b) & 0xFFFFFFFF; }

  function md51(s) {
    var n = s.length, state = [1732584193, -271733879, -1732584194, 271733878], i;
    for (i = 64; i <= s.length; i += 64) {
      md5cycle(state, md5blk(s.substring(i - 64, i)));
    }
    s = s.substring(i - 64);
    var tail = [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0];
    for (i = 0; i < s.length; i++) tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
    tail[i >> 2] |= 0x80 << ((i % 4) << 3);
    if (i > 55) {
      md5cycle(state, tail);
      for (i = 0; i < 16; i++) tail[i] = 0;
    }
    tail[14] = n * 8;
    md5cycle(state, tail);
    return state;
  }

  function md5blk(s) {
    var md5blks = [], i;
    for (i = 0; i < 64; i += 4) {
      md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i + 1) << 8) + (s.charCodeAt(i + 2) << 16) + (s.charCodeAt(i + 3) << 24);
    }
    return md5blks;
  }

  var hex_chr = '0123456789abcdef'.split('');
  function rhex(n) {
    var s = '', j = 0;
    for (; j < 4; j++) s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F];
    return s;
  }

  var output = md51(unescape(encodeURIComponent(str)));
  return rhex(output[0]) + rhex(output[1]) + rhex(output[2]) + rhex(output[3]);
}

// ==========================================
// TOOL 15: PEMBERSIH TEKS COPY-PASTE (PDF TO WORD)
// ==========================================
function cleanTextAction(mode) {
  const input = document.getElementById('input-clean-text').value;
  const output = document.getElementById('output-clean-text');
  if (!input) {
    output.value = '';
    return;
  }

  let text = input;

  if (mode === 'join-lines' || mode === 'all') {
    // Replace single line breaks with spaces, preserving double line breaks (paragraphs)
    text = text.replace(/(?<!\n)\n(?!\n)/g, ' ');
  }

  if (mode === 'fix-hyphens' || mode === 'all') {
    // Merge hyphenated words across line breaks or spaces (e.g. kon- figurasi -> konfigurasi)
    text = text.replace(/(\b\w+)-\s+(\w+\b)/g, '$1$2');
  }

  if (mode === 'all') {
    // Clean multiple consecutive spaces into single space
    text = text.replace(/[ \t]+/g, ' ');
    // Clean spaces before punctuation
    text = text.replace(/\s+([.,;:!?])/g, '$1');
  }

  output.value = text.trim();
}

function copyCleanedText() {
  const output = document.getElementById('output-clean-text');
  if (!output.value) return;
  navigator.clipboard.writeText(output.value).then(() => {
    alert('Teks bersih berhasil disalin ke clipboard!');
  });
}

// ==========================================
// TOOL 16: OCR GAMBAR KE TEKS
// ==========================================
let currentOcrText = '';

async function handleOcrUpload(files) {
  const file = files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    currentOcrText = '';
    document.getElementById('output-ocr-text').value = '';
    document.getElementById('result-ocr-box').classList.add('hidden');
    alert('OCR ini hanya gambar (JPG/PNG/WebP), bukan PDF. Untuk PDF scan, ubah halaman menjadi gambar terlebih dahulu.');
    return;
  }

  const progressBox = document.getElementById('ocr-progress-box');
  const progressBar = document.getElementById('ocr-bar');
  const statusText = document.getElementById('ocr-status-text');
  const percentText = document.getElementById('ocr-percent-text');
  const resultBox = document.getElementById('result-ocr-box');
  const outputArea = document.getElementById('output-ocr-text');

  progressBox.classList.remove('hidden');
  resultBox.classList.add('hidden');

  try {
    if (typeof Tesseract === 'undefined') {
      throw new Error('Modul OCR sedang dimuat, coba sesaat lagi.');
    }

    const worker = await Tesseract.createWorker('ind+eng', 1, {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round((m.progress || 0) * 100);
          progressBar.style.width = pct + '%';
          percentText.textContent = pct + '%';
          statusText.textContent = 'Membaca karakter teks (' + pct + '%)...';
        } else {
          statusText.textContent = m.status || 'Memproses berkas...';
        }
      }
    });

    const ret = await worker.recognize(file);
    currentOcrText = ret.data.text.trim();
    outputArea.value = currentOcrText;

    await worker.terminate();

    progressBox.classList.add('hidden');
    resultBox.classList.remove('hidden');
    lucide.createIcons();
  } catch (err) {
    alert('Gagal membaca teks gambar: ' + err.message);
    progressBox.classList.add('hidden');
  }
}

function copyOcrText() {
  if (!currentOcrText) return;
  navigator.clipboard.writeText(currentOcrText).then(() => {
    alert('Hasil OCR berhasil disalin ke clipboard!');
  });
}

function downloadOcrTxt() {
  if (!currentOcrText) return;
  const blob = new Blob([currentOcrText], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ocr-hasil-${Date.now()}.txt`;
  a.click();
}

// ==========================================
// TOOL 17: KALKULATOR MANA LEBIH MURAH?
// ==========================================
function compareUnitPrice() {
  const pA = parseFloat(document.getElementById('up-price-a').value) || 0;
  const vA = parseFloat(document.getElementById('up-vol-a').value) || 0;
  const uA = document.getElementById('up-unit-a').value;

  const pB = parseFloat(document.getElementById('up-price-b').value) || 0;
  const vB = parseFloat(document.getElementById('up-vol-b').value) || 0;
  const uB = document.getElementById('up-unit-b').value;

  const costAEl = document.getElementById('up-cost-a');
  const costBEl = document.getElementById('up-cost-b');
  const titleEl = document.getElementById('up-verdict-title');
  const descEl = document.getElementById('up-verdict-desc');
  const boxEl = document.getElementById('up-verdict-box');

  if (pA <= 0 || vA <= 0 || pB <= 0 || vB <= 0) {
    costAEl.textContent = 'Harga per unit: -';
    costBEl.textContent = 'Harga per unit: -';
    titleEl.textContent = 'Masukkan harga dan ukuran kedua produk di atas.';
    descEl.textContent = 'Kalkulator otomatis menghitung perbandingan nilai hematnya.';
    boxEl.className = 'p-4 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-1';
    return;
  }

  const dimension = unit => ['ml', 'l'].includes(unit) ? 'volume' : ['gr', 'kg'].includes(unit) ? 'mass' : 'count';
  if (dimension(uA) !== dimension(uB)) {
    costAEl.textContent = costBEl.textContent = 'Harga per unit: -';
    titleEl.textContent = 'Satuan tidak sejenis — tidak dapat dibandingkan.';
    descEl.textContent = 'Gunakan volume dengan volume, berat dengan berat, atau pcs dengan pcs.';
    boxEl.className = 'p-4 rounded-xl bg-slate-950 border border-slate-800 text-center space-y-1';
    return;
  }
  // Normalize to base unit (ml or gram or pcs)
  const normA = (uA === 'l' || uA === 'kg') ? vA * 1000 : vA;
  const normB = (uB === 'l' || uB === 'kg') ? vB * 1000 : vB;

  const unitCostA = pA / normA;
  const unitCostB = pB / normB;

  const unitLabel = (uA === 'ml' || uA === 'l') ? 'ml' : ((uA === 'gr' || uA === 'kg') ? 'gram' : 'pcs');

  costAEl.innerHTML = `Harga: <strong class="text-white">Rp ${(unitCostA * 100).toFixed(1)}</strong> / 100${unitLabel}`;
  costBEl.innerHTML = `Harga: <strong class="text-white">Rp ${(unitCostB * 100).toFixed(1)}</strong> / 100${unitLabel}`;

  if (Math.abs(unitCostA - unitCostB) < 0.0001) {
    titleEl.textContent = '🤝 Keduanya Sama Murahnya!';
    descEl.textContent = 'Nilai harga per satuan ukuran kedua produk bernilai persis sama.';
    boxEl.className = 'p-4 rounded-xl bg-slate-900 border border-slate-700 text-center space-y-1';
  } else if (unitCostA < unitCostB) {
    const savingPct = Math.round(((unitCostB - unitCostA) / unitCostB) * 100);
    titleEl.innerHTML = `<span class="text-brand-400 font-extrabold text-base">🎉 PRODUK A JAUH LEBIH HEMAT!</span>`;
    descEl.textContent = `Produk A menghemat pengeluaran sekitar ${savingPct}% dibanding Produk B.`;
    boxEl.className = 'p-4 rounded-xl bg-brand-950/40 border border-brand-500/50 text-center space-y-1';
  } else {
    const savingPct = Math.round(((unitCostA - unitCostB) / unitCostA) * 100);
    titleEl.innerHTML = `<span class="text-teal-400 font-extrabold text-base">🎉 PRODUK B JAUH LEBIH HEMAT!</span>`;
    descEl.textContent = `Produk B menghemat pengeluaran sekitar ${savingPct}% dibanding Produk A.`;
    boxEl.className = 'p-4 rounded-xl bg-teal-950/40 border border-teal-500/50 text-center space-y-1';
  }
}

// ==========================================
// TOOL 18: PENCARI BARANG TERMURAH DI OLSHOP
// ==========================================
function getOlshopUrl(marketplace, keyword, cheapest) {
  const q = encodeURIComponent(keyword.trim());
  if (marketplace === 'shopee') {
    return cheapest 
      ? `https://shopee.co.id/search?keyword=${q}&sortBy=price&order=asc` 
      : `https://shopee.co.id/search?keyword=${q}`;
  } else if (marketplace === 'tokopedia') {
    return cheapest 
      ? `https://www.tokopedia.com/search?q=${q}&ob=3` 
      : `https://www.tokopedia.com/search?q=${q}`;
  } else if (marketplace === 'blibli') {
    // Public listing route; arbitrary keyword coverage and sorting are not guaranteed.
    const slug = keyword.trim().replace(/\s+/g, '-');
    return `https://www.blibli.com/jual/${encodeURIComponent(slug)}`;
  } else if (marketplace === 'lazada') {
    return cheapest 
      ? `https://www.lazada.co.id/catalog/?q=${q}&sort=priceasc` 
      : `https://www.lazada.co.id/catalog/?q=${q}`;
  }
  return '#';
}

function openOlshopSearch(marketplace) {
  const keyword = document.getElementById('olshop-keyword').value.trim();
  if (!keyword) {
    alert('Ketik nama barang yang mau dicari terlebih dahulu.');
    return;
  }
  const cheapest = document.getElementById('olshop-sort-cheapest').checked;
  const url = getOlshopUrl(marketplace, keyword, cheapest);
  window.open(url, '_blank');
}

function openAllOlshopTabs() {
  const keyword = document.getElementById('olshop-keyword').value.trim();
  if (!keyword) {
    alert('Ketik nama barang yang mau dicari terlebih dahulu.');
    return;
  }
  const cheapest = document.getElementById('olshop-sort-cheapest').checked;
  ['tokopedia', 'shopee', 'blibli', 'lazada'].forEach(mp => {
    window.open(getOlshopUrl(mp, keyword, cheapest), '_blank');
  });
}
