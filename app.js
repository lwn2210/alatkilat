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
function filterCategory(cat) {
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
    if (cat === 'all' || card.dataset.cat === cat) {
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
      if (!q || text.includes(q)) {
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
      }
    });
  });
}

// Global Drag & Drop Helper
function setupDragAndDrop() {
  bindDrop('drop-compress-img', 'input-compress-img', handleCompressImageUpload);
  bindDrop('drop-pasfoto', 'input-pasfoto', handlePasfotoUpload);
  bindDrop('drop-merge-pdf', 'input-merge-pdf', handleMergePdfUpload);
  bindDrop('drop-img-pdf', 'input-img-pdf', handleImgToPdfUpload);
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

  const img = new Image();
  const reader = new FileReader();

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
      a.download = `pasfoto-${ratio}-${currentBgColor === '#d32f2f' ? 'merah' : 'biru'}.jpg`;
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
        <span class="truncate">${file.name}</span>
        <span class="text-[10px] text-slate-500">(${formatBytes(file.size)})</span>
      </div>
      <button onclick="removeMergeFile(${idx})" class="text-rose-400 hover:text-rose-300 px-2">Hapus</button>
    `;
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
        <span class="truncate">${file.name}</span>
      </div>
      <button onclick="removeImgToPdfFile(${idx})" class="text-rose-400 hover:text-rose-300 px-2">Hapus</button>
    `;
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
      } else {
        embeddedImg = await pdfDoc.embedJpg(buffer);
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

  let rate = 0;

  if (kategori === 'A') {
    if (bruto <= 5400000) rate = 0;
    else if (bruto <= 5650000) rate = 0.0025;
    else if (bruto <= 5950000) rate = 0.005;
    else if (bruto <= 6300000) rate = 0.0075;
    else if (bruto <= 6750000) rate = 0.01;
    else if (bruto <= 7500000) rate = 0.0125;
    else if (bruto <= 8550000) rate = 0.015;
    else if (bruto <= 9650000) rate = 0.0175;
    else if (bruto <= 10050000) rate = 0.02;
    else if (bruto <= 10350000) rate = 0.0225;
    else if (bruto <= 10700000) rate = 0.025;
    else if (bruto <= 12500000) rate = 0.03;
    else if (bruto <= 13750000) rate = 0.04;
    else if (bruto <= 15100000) rate = 0.05;
    else if (bruto <= 16950000) rate = 0.06;
    else if (bruto <= 19750000) rate = 0.07;
    else rate = 0.09;
  } else if (kategori === 'B') {
    if (bruto <= 6200000) rate = 0;
    else if (bruto <= 6500000) rate = 0.0025;
    else if (bruto <= 6850000) rate = 0.005;
    else if (bruto <= 7300000) rate = 0.0075;
    else if (bruto <= 9200000) rate = 0.01;
    else if (bruto <= 10750000) rate = 0.015;
    else if (bruto <= 12550000) rate = 0.02;
    else if (bruto <= 14300000) rate = 0.03;
    else if (bruto <= 16000000) rate = 0.04;
    else rate = 0.06;
  } else { // Kategori C
    if (bruto <= 6600000) rate = 0;
    else if (bruto <= 6950000) rate = 0.0025;
    else if (bruto <= 7350000) rate = 0.005;
    else if (bruto <= 7800000) rate = 0.0075;
    else if (bruto <= 8850000) rate = 0.01;
    else if (bruto <= 9800000) rate = 0.0125;
    else if (bruto <= 10950000) rate = 0.015;
    else if (bruto <= 12300000) rate = 0.02;
    else rate = 0.04;
  }

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

  box.innerHTML = '';
  qrInstance = new QRCode(box, {
    text: text,
    width: 200,
    height: 200,
    colorDark: '#0f172a',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });

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
  const paragraphs = text.trim() ? text.split(/\n+/).length : 0;

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
