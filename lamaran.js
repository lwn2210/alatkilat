/* Local-only document workflow. Reuse the site's pinned PDF-lib; no file network requests. */
(() => {
  'use strict';
  const input = document.getElementById('lamaran-files');
  const list = document.getElementById('lamaran-list');
  const button = document.getElementById('lamaran-merge');
  const status = document.getElementById('lamaran-status');
  const progress = document.getElementById('lamaran-progress');
  let generation = 0;
  let selected = [];
  let exportRevision = 0;
  const outputName = document.getElementById('lamaran-name');
  const safeName = value => {
    let stem = value.normalize('NFKC').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>:"/\\|?*]/g, '-').trim().replace(/\.pdf$/i, '').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 100).trim();
    if (!stem) stem = 'berkas-lamaran';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = `berkas-${stem}`;
    return `${stem}.pdf`;
  };
  const limitInput = document.getElementById('lamaran-limit');
  const limitError = document.getElementById('lamaran-limit-error');
  const limitBytes = () => {
    const value = limitInput.value.trim();
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) ? Number(value) : NaN;
    const bytes = number * 1000;
    if (!Number.isFinite(number) || number <= 0 || !Number.isFinite(bytes) || bytes <= 0) return null;
    // Compare integer output bytes against the exact decimal threshold, not binary floating point.
    const [mantissa, exponent = '0'] = value.toLowerCase().split('e');
    const [whole, fraction = ''] = mantissa.split('.');
    const digits = BigInt((whole || '0') + fraction);
    const shift = Number(exponent) + 3 - fraction.length;
    const usable = Number(shift >= 0 ? digits * 10n ** BigInt(shift) : digits / 10n ** BigInt(-shift));
    return usable >= 1 ? usable : null;
  };
  const validateLimit = () => {
    const valid = limitBytes() !== null;
    limitInput.setAttribute('aria-invalid', String(!valid));
    limitError.hidden = valid;
    limitError.textContent = valid ? '' : 'Batas ukuran harus angka positif dan finite (terbatas), minimal 0.001 KB (1 byte); gunakan titik untuk desimal.';
    return valid;
  };
  const updateSettings = () => {
    ++exportRevision;
    progress.value = 0;
    const valid = validateLimit();
    button.disabled = !selected.length || !valid;
    status.textContent = !valid ? limitError.textContent : selected.length ? 'Pengaturan berubah. Gabungkan ulang untuk mengunduh hasil terbaru.' : 'Belum ada berkas dipilih.';
  };
  outputName.addEventListener('input', updateSettings);
  limitInput.addEventListener('input', updateSettings);

  const renderList = () => {
    list.replaceChildren();
    selected.forEach((item, index) => {
      const row = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = `${item.name} — ${item.pages} halaman`;
      row.append(name);
      const actions = document.createElement('div');
      actions.className = 'file-actions';
      for (const [label, delta] of [['Naikkan', -1], ['Turunkan', 1], ['Hapus', 0]]) {
        const control = document.createElement('button');
        control.type = 'button';
        control.textContent = label;
        control.setAttribute('aria-label', `${label} berkas ${index + 1}`);
        control.disabled = delta !== 0 && (index + delta < 0 || index + delta >= selected.length);
        control.addEventListener('click', () => {
          ++generation; // An edit also retires any in-flight export.
          if (delta) [selected[index], selected[index + delta]] = [selected[index + delta], selected[index]];
          else selected.splice(index, 1);
          renderList();
          progress.value = 0;
          button.disabled = !selected.length || !validateLimit();
          status.textContent = selected.length ? 'Daftar berubah. Gabungkan ulang untuk mengunduh hasil terbaru.' : 'Belum ada berkas dipilih.';
          const next = delta ? index + delta : Math.min(index, selected.length - 1);
          const target = next >= 0 ? list.children[next].querySelector(`button[aria-label^="${label}"]:not(:disabled)`) || list.children[next].querySelector('button:not(:disabled)') : input;
          target?.focus();
        });
        actions.append(control);
      }
      row.append(actions);
      list.append(row);
    });
  };

  input.addEventListener('change', async () => {
    const token = ++generation;
    const files = Array.from(input.files || []);
    selected = [];
    list.replaceChildren();
    button.disabled = true;
    progress.value = 0;
    if (!files.length) {
      status.textContent = 'Belum ada berkas dipilih.';
      return;
    }
    if (!window.PDFLib?.PDFDocument) {
      status.textContent = 'Pustaka PDF belum tersedia. Periksa koneksi internet lalu muat ulang halaman.';
      return;
    }
    if (files.length > 30 || files.reduce((sum, f) => sum + f.size, 0) > 40 * 1024 * 1024) {
      status.textContent = 'Pilihan terlalu besar. Maksimal 30 berkas dan total 40 MiB per pilihan.';
      return;
    }
    const staged = [];
    let totalPages = 0;
    let totalPixels = 0;
    let currentName = '';
    try {
      const budget = LamaranResources.newBudget(files.reduce((sum, f) => sum + f.size, 0));
      for (const file of files) {
        if (token !== generation) return;
        currentName = file.name;
        status.textContent = `Memeriksa ${staged.length + 1}/${files.length}: ${file.name}`;
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (token !== generation) return;
        // Detect content, not just a forgeable extension or MIME label.
        const isPdf = bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';
        const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
        const isJpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        if (isPdf) {
          const doc = await PDFLib.PDFDocument.load(bytes);
          if (token !== generation) return;
          const pages = doc.getPageCount();
          if (!pages || totalPages + pages > 100) throw new Error('Maksimal total 100 halaman per pilihan');
          const objects = doc.context.enumerateIndirectObjects();
          const streamBytes = objects.reduce((sum, [, obj]) => sum + (obj.contents?.byteLength || 0), 0);
          budget.pdf(pages, objects.length, streamBytes);
          totalPages += pages;
          staged.push({ name: file.name, type: 'pdf', doc, pages });
        } else if (isPng || isJpg) {
          // Reject unknown/malformed/oversized headers before browser decode.
          const header = LamaranResources.imageHeader(bytes, isPng ? 'png' : 'jpeg');
          if (totalPixels + header.pixels > 30000000) throw new Error('Maksimal total 30 megapiksel per pilihan');
          if (totalPages + 1 > 100) throw new Error('Maksimal total 100 halaman per pilihan');
          budget.image(header.pixels);
          totalPixels += header.pixels;
          totalPages++;
          const bitmap = await createImageBitmap(new Blob([bytes], { type: isPng ? 'image/png' : 'image/jpeg' }));
          let imageBytes = bytes;
          try {
            if (token !== generation) return;
            const pixels = bitmap.width * bitmap.height;
            if (pixels !== header.pixels || pixels > 25000000) throw new Error('Dimensi decode tidak cocok dengan header');
            if (isJpg) {
              // Decode EXIF rotation/mirroring once; PDF-lib embeds raw JPEG without orientation.
              const canvas = document.createElement('canvas');
              canvas.width = bitmap.width;
              canvas.height = bitmap.height;
              try {
                canvas.getContext('2d').drawImage(bitmap, 0, 0);
                const normalized = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                if (!normalized) throw new Error('Gagal menormalkan gambar');
                if (token !== generation) return;
                budget.normalized(normalized.size);
                imageBytes = new Uint8Array(await normalized.arrayBuffer());
                if (token !== generation) return;
              } finally {
                canvas.width = canvas.height = 0;
              }
            }
          } finally {
            bitmap.close();
          }
          const validation = await PDFLib.PDFDocument.create();
          await validation.embedPng(imageBytes);
          staged.push({ name: file.name, type: 'png', bytes: imageBytes, pages: 1 });
        } else {
          throw new Error('Format tidak didukung');
        }
        if (token !== generation) return;
        progress.value = staged.length / files.length;
      }
      if (token !== generation) return;
      selected = staged;
      renderList();
      status.textContent = `${selected.length} berkas siap digabung. Periksa urutan daftar sebelum mengunduh.`;
      button.disabled = !validateLimit();
    } catch (error) {
      if (token !== generation) return;
      selected = [];
      list.replaceChildren();
      button.disabled = true;
      progress.value = 0;
      const reason = /^(Maksimal total|Anggaran sumber daya|Gambar melebihi|Header gambar|Dimensi decode)/.test(error.message) ? ` ${error.message}.` : '';
      status.textContent = `Tidak dapat membaca ${currentName}.${reason} Pilih PDF yang tidak terkunci atau gambar PNG/JPEG yang valid (maksimal 25 megapiksel). Seluruh pilihan ditolak; pilih ulang berkas.`;
    }
  });

  button.addEventListener('click', async () => {
    if (button.disabled || !selected.length || !validateLimit()) return;
    const token = generation;
    const revision = exportRevision;
    const threshold = limitBytes();
    const filename = safeName(outputName.value);
    const current = () => token === generation && revision === exportRevision;
    const snapshot = selected.slice();
    button.disabled = true;
    progress.value = 0;
    try {
      if (!window.PDFLib?.PDFDocument) throw new Error('Dependency unavailable');
      const merged = await PDFLib.PDFDocument.create();
      for (let i = 0; i < snapshot.length; i++) {
        if (!current()) return;
        const item = snapshot[i];
        status.textContent = `Menggabungkan ${i + 1}/${snapshot.length}: ${item.name}`;
        if (item.type === 'pdf') {
          const pages = await merged.copyPages(item.doc, item.doc.getPageIndices());
          pages.forEach(page => merged.addPage(page));
        } else {
          const image = item.type === 'png' ? await merged.embedPng(item.bytes) : await merged.embedJpg(item.bytes);
          const page = merged.addPage([595.28, 841.89]);
          const dims = image.scaleToFit(547.28, 793.89);
          page.drawImage(image, { x: (595.28 - dims.width) / 2, y: (841.89 - dims.height) / 2, width: dims.width, height: dims.height });
        }
        if (!current()) return;
        progress.value = (i + 1) / snapshot.length;
      }
      const bytes = await merged.save();
      if (!current()) return;
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      // Delay revocation so Chrome can consume the download URL.
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      const comparison = blob.size <= threshold ? 'Dalam batas yang kamu masukkan' : 'Melebihi batas yang kamu masukkan';
      status.textContent = `PDF dibuat: ${merged.getPageCount()} halaman, ${blob.size} byte (${(blob.size / 1024).toFixed(2)} KiB). ${comparison}: ${threshold} byte. Nama unduhan: ${filename}. Periksa isi hasil unduhan; ukuran bukan jaminan penerimaan institusi.`;
    } catch {
      if (!current()) return;
      progress.value = 0;
      status.textContent = 'Gagal membuat PDF. Pastikan pustaka PDF termuat, pilih ulang berkas yang valid, atau kurangi jumlah/ukuran berkas.';
    } finally {
      if (current()) button.disabled = selected.length === 0 || !validateLimit();
    }
  });
})();
