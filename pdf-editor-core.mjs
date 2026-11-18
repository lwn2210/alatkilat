export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PAGES = 100;
export async function loadPdf(lib, bytes) {
  if (!lib?.PDFDocument) throw new Error('Pustaka PDF gagal dimuat. Periksa koneksi lalu muat ulang halaman.');
  if (!bytes.byteLength || bytes.byteLength > MAX_BYTES) throw new Error('Ukuran PDF harus lebih dari 0 dan maksimal 20 MB.');
  let pdf;
  try { pdf = await lib.PDFDocument.load(bytes); }
  catch (e) { throw new Error(/encrypt/i.test(String(e)) ? 'PDF terenkripsi tidak didukung. Buka proteksinya terlebih dahulu.' : 'PDF tidak valid atau rusak.'); }
  if (!pdf.getPageCount() || pdf.getPageCount() > MAX_PAGES) throw new Error('PDF harus memiliki 1–100 halaman.');
  return pdf;
}
export async function transformPdf(lib, bytes, pages, { numbers = false, watermark = '' } = {}) {
  const source = await loadPdf(lib, bytes);
  if (!pages.length || pages.length > MAX_PAGES || pages.some(p => !Number.isInteger(p.index) || p.index < 0 || p.index >= source.getPageCount() || ![0,90,180,270].includes(p.rotation))) throw new Error('Pilihan halaman tidak valid.');
  if (watermark.length > 80 || /[^\x20-\x7e\xa0-\xff]/.test(watermark)) throw new Error('Watermark maksimal 80 karakter Latin; emoji dan karakter khusus tidak didukung.');
  const output = await lib.PDFDocument.create();
  const copies = await output.copyPages(source, pages.map(p => p.index));
  const font = numbers || watermark ? await output.embedFont(lib.StandardFonts.Helvetica) : null;
  copies.forEach((page, i) => {
    const rotation = ((page.getRotation().angle + pages[i].rotation) % 360 + 360) % 360;
    page.setRotation(lib.degrees(rotation));
    // Viewers display the CropBox clipped to the MediaBox (or MediaBox if disjoint).
    const crop = page.getCropBox(), media = page.getMediaBox();
    const left = Math.max(crop.x, media.x), bottom = Math.max(crop.y, media.y);
    const right = Math.min(crop.x + crop.width, media.x + media.width);
    const top = Math.min(crop.y + crop.height, media.y + media.height);
    const visible = right > left && top > bottom ? {x: left, y: bottom, width: right - left, height: top - bottom} : media;
    const { x: originX, y: originY, width, height } = visible;
    const visualWidth = rotation % 180 ? height : width;
    const visualHeight = rotation % 180 ? width : height;
    const point = (x, y) => {
      const local = rotation === 90 ? {x: width - y, y: x} : rotation === 180 ? {x: width - x, y: height - y} : rotation === 270 ? {x: y, y: height - x} : {x, y};
      return {x: originX + local.x, y: originY + local.y};
    };
    if (watermark) {
      const margin = Math.min(15, visualWidth * 0.25);
      const size = Math.min(30, (visualWidth - margin * 2) / font.widthOfTextAtSize(watermark, 1), visualHeight * 0.5);
      page.drawText(watermark, {...point(margin, visualHeight / 2), rotate: lib.degrees(rotation), size, font, opacity: 0.3, color: lib.rgb(0.3,0.3,0.3)});
    }
    if (numbers) {
      const text = String(i + 1);
      const size = Math.min(11, visualWidth * 0.8 / font.widthOfTextAtSize(text, 1), visualHeight * 0.5);
      const x = Math.min(visualWidth / 2, visualWidth - font.widthOfTextAtSize(text, size));
      page.drawText(text, {...point(x, Math.min(16, visualHeight * 0.3)), rotate: lib.degrees(rotation), size, font, color: lib.rgb(0.2,0.2,0.2)});
    }
    output.addPage(page);
  });
  return output.save();
}
