const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const PDFLib = require(process.env.PDF_LIB_PATH || 'pdf-lib');
const root = path.resolve('.');
const outputDir = path.resolve(process.env.OUTPUT_DIR || '.artifacts/editor-cropbox');
fs.mkdirSync(outputDir, { recursive: true });
(async () => {
  const server = http.createServer((req, res) => {
    const target = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(target, (error, bytes) => {
      if (error) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', /\.(mjs|js)$/.test(target) ? 'text/javascript' : 'text/html');
      res.end(bytes);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const results = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/editor-pdf.html`);
    await page.waitForFunction(() => !!window.PDFLib);
    await page.evaluate(async () => {
      window.cropboxPdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.min.mjs');
      window.cropboxPdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.min.mjs';
    });
    const boxes = [
      { name: 'crop-positive', media: [0, 0, 300, 400], crop: [40, 60, 160, 220] },
      { name: 'media-shifted', media: [20, 30, 300, 400], crop: [60, 90, 160, 220] },
      { name: 'crop-negative', media: [-80, -70, 300, 400], crop: [-40, -20, 160, 220] },
      { name: 'crop-clipped-media', media: [0, 0, 300, 400], crop: [-40, 60, 200, 220] },
      { name: 'crop-disjoint', media: [0, 0, 300, 400], crop: [500, 600, 160, 220] }
    ];
    const selectedBoxes = process.env.ONLY_CLIPPED ? boxes.filter(box => box.name === 'crop-clipped-media') : boxes;
    for (const box of selectedBoxes) for (const baseRotation of [0, 90, 180, 270]) for (const addedRotation of [0, 90, 180, 270]) {
      const name = `${box.name}-base${baseRotation}-plus${addedRotation}`;
      const source = await PDFLib.PDFDocument.create();
      const inputPage = source.addPage([300, 400]);
      inputPage.setMediaBox(...box.media);
      inputPage.setCropBox(...box.crop);
      inputPage.setRotation(PDFLib.degrees(baseRotation));
      const fixture = Buffer.from(await source.save());
      fs.writeFileSync(path.join(outputDir, `${name}-input.pdf`), fixture);
      await page.locator('#file').setInputFiles({ name: `${name}.pdf`, mimeType: 'application/pdf', buffer: fixture });
      await page.locator('#pages li').first().waitFor();
      for (let turn = 0; turn < addedRotation / 90; turn++) await page.getByRole('button', { name: 'Putar halaman asal 1', exact: true }).click();
      await page.locator('#numbers').check();
      await page.locator('#watermark').fill('DRAFT');
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
      const pdfPath = path.join(outputDir, `${name}.pdf`);
      await download.saveAs(pdfPath);
      const bytes = fs.readFileSync(pdfPath);
      const reopened = await PDFLib.PDFDocument.load(bytes);
      const expectedRotation = (baseRotation + addedRotation) % 360;
      assert.equal(reopened.getPage(0).getRotation().angle, expectedRotation);
      assert.deepEqual(reopened.getPage(0).getCropBox(), { x: box.crop[0], y: box.crop[1], width: box.crop[2], height: box.crop[3] });
      const observed = await page.evaluate(async (bytes) => {
        const task = window.cropboxPdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false });
        const document = await task.promise;
        try {
          const pdfPage = await document.getPage(1);
          const viewport = pdfPage.getViewport({ scale: 1 });
          const text = await pdfPage.getTextContent();
          const positions = text.items.filter(item => item.str.trim()).map(item => ({ text: item.str, point: viewport.convertToViewportPoint(item.transform[4], item.transform[5]) }));
          const canvas = window.document.createElement('canvas');
          canvas.width = viewport.width; canvas.height = viewport.height;
          await pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          const png = canvas.toDataURL('image/png').split(',')[1];
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          let nonwhitePixels = 0;
          for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 245 || pixels[i + 1] < 245 || pixels[i + 2] < 245) nonwhitePixels++;
          canvas.width = canvas.height = 0;
          return { width: viewport.width, height: viewport.height, positions, png, nonwhitePixels };
        } finally { await task.destroy(); }
      }, [...bytes]);
      fs.writeFileSync(path.join(outputDir, `${name}.png`), Buffer.from(observed.png, 'base64'));
      delete observed.png;
      results.push({ name, baseRotation, expectedRotation, ...observed, pdfPath });
      fs.writeFileSync(path.join(outputDir, 'observations.json'), JSON.stringify(results, null, 2));
      const visibleWidth = Math.min(box.media[0] + box.media[2], box.crop[0] + box.crop[2]) - Math.max(box.media[0], box.crop[0]);
      const visibleHeight = Math.min(box.media[1] + box.media[3], box.crop[1] + box.crop[3]) - Math.max(box.media[1], box.crop[1]);
      const effectiveWidth = visibleWidth > 0 && visibleHeight > 0 ? visibleWidth : box.media[2];
      const effectiveHeight = visibleWidth > 0 && visibleHeight > 0 ? visibleHeight : box.media[3];
      const expectedWidth = expectedRotation % 180 ? effectiveHeight : effectiveWidth;
      const expectedHeight = expectedRotation % 180 ? effectiveWidth : effectiveHeight;
      assert.equal(observed.width, expectedWidth);
      assert.equal(observed.height, expectedHeight);
      const number = observed.positions.find(item => item.text === '1');
      const watermark = observed.positions.find(item => item.text === 'DRAFT');
      assert.ok(number, `${name}: page number must remain visible within CropBox; got ${JSON.stringify(observed.positions)}`);
      assert.ok(watermark, `${name}: watermark must remain visible within CropBox`);
      const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 0.1, `${name} ${label}: ${actual} expected ${expected}`);
      near(number.point[0], expectedWidth / 2, 'number horizontal baseline');
      near(number.point[1], expectedHeight - 16, 'number bottom margin');
      near(watermark.point[0], 15, 'watermark left margin');
      near(watermark.point[1], expectedHeight / 2, 'watermark vertical baseline');
      assert.ok(observed.nonwhitePixels > 30, `${name}: actual rendering must contain overlay pixels`);
      console.log('PASS CropBox browser download + PDF.js extraction/render ' + name);
    }
    assert.deepEqual(pageErrors, []);
    assert.equal(results.length, selectedBoxes.length * 16);
    console.log(`PASS ${results.length} CropBox/origin/combined-rotation cases; actual downloaded PDFs and rendered PNGs`);
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
