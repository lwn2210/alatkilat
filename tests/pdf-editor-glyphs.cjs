// Real UI downloads; compare uncropped glyph ink with the effective page bounds.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const PDFLib = require(process.env.PDF_LIB_PATH || 'pdf-lib');
(async () => {
  const root = process.cwd(), out = path.resolve(process.env.OUTPUT_DIR || '.artifacts/editor-glyphs');
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, bytes) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.setHeader('Content-Type', /\.(mjs|js)$/.test(file) ? 'text/javascript' : 'text/html'); res.end(bytes);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const results = [];
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/editor-pdf.html`);
    await page.waitForFunction(() => window.PDFLib);
    await page.evaluate(async () => {
      window.pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.min.mjs');
      window.pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.min.mjs';
    });
    const matrices = process.env.SMOKE ? [[20, 40, 0, 0]] :
      [[20, 40], [40, 20], [8, 12]].flatMap(([w, h]) => [0, 90, 180, 270].flatMap(base => [0, 90, 180, 270].map(added => [w, h, base, added])));
    for (const [w, h, base, added] of matrices) {
      for (const mode of ['number', 'watermark', 'long-watermark', 'glyphs']) {
        const name = `${w}x${h}-base${base}-add${added}-${mode}`;
        const source = await PDFLib.PDFDocument.create(), sourcePage = source.addPage([w, h]);
        sourcePage.setRotation(PDFLib.degrees(base));
        await page.locator('#file').setInputFiles({ name: name + '.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await source.save()) });
        await page.locator('#pages li').first().waitFor();
        const help = await page.locator('#editor').innerText();
        assert.ok(help.includes('orientasi hasil') && help.includes('sangat kecil') && help.includes('tumpang tindih'), 'UI must explain final orientation and tiny-page overlay limitations');
        for (let angle = 0; angle < added; angle += 90) await page.getByRole('button', { name: 'Putar halaman asal 1', exact: true }).click();
        await page.locator('#numbers').setChecked(mode === 'number');
        const expected = mode === 'number' ? '1' : mode === 'watermark' ? 'DRAFT' : mode === 'glyphs' ? 'Ágjpqy' : 'W'.repeat(80);
        await page.locator('#watermark').fill(mode === 'number' ? '' : expected);
        const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download').click()]);
        const file = path.join(out, name + '.pdf'); await download.saveAs(file);
        const originalBytes = fs.readFileSync(file);
        const expanded = await PDFLib.PDFDocument.load(originalBytes), p = expanded.getPage(0), pad = 10;
        assert.equal(p.getRotation().angle, (base + added) % 360, `${name}: incorrect final rotation`);
        // Expanding both boxes reveals ink otherwise hidden outside the original page.
        p.setMediaBox(-pad, -pad, w + 2 * pad, h + 2 * pad);
        p.setCropBox(-pad, -pad, w + 2 * pad, h + 2 * pad);
        const expandedBytes = await expanded.save();
        fs.writeFileSync(path.join(out, name + '-expanded.pdf'), expandedBytes);
        const observed = await page.evaluate(async ({ original, expanded, pad, scale }) => {
          const render = async data => {
            const task = window.pdfjs.getDocument({ data: new Uint8Array(data), isEvalSupported: false });
            try {
              const pdf = await task.promise, p = await pdf.getPage(1), viewport = p.getViewport({ scale });
              const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
              const context = canvas.getContext('2d', { willReadFrequently: true });
              await p.render({ canvasContext: context, viewport }).promise;
              const text = (await p.getTextContent()).items.map(item => item.str).join('');
              const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
              const ink = [];
              for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
                const i = (y * canvas.width + x) * 4;
                if (Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) < 245) ink.push([x, y]);
              }
              const png = canvas.toDataURL('image/png').split(',')[1];
              const result = { width: canvas.width, height: canvas.height, text, ink, png };
              canvas.width = canvas.height = 0; return result;
            } finally { await task.destroy(); }
          };
          const a = await render(original), b = await render(expanded), inset = pad * scale;
          const outside = b.ink.filter(([x, y]) => x < inset - 1 || y < inset - 1 || x >= inset + a.width + 1 || y >= inset + a.height + 1);
          const originalMask = new Set(a.ink.map(([x, y]) => `${x},${y}`));
          const lostInk = b.ink.filter(([x, y]) => !originalMask.has(`${x - inset},${y - inset}`));
          return { width: a.width, height: a.height, originalText: a.text, expandedText: b.text, originalInk: a.ink.length, expandedInk: b.ink.length, outsideCount: outside.length, lostInkCount: lostInk.length, outsideSample: outside.slice(0, 8), originalPng: a.png, expandedPng: b.png };
        }, { original: [...originalBytes], expanded: [...expandedBytes], pad, scale: mode === 'long-watermark' ? 64 : 8 });
        fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(observed.originalPng, 'base64'));
        fs.writeFileSync(path.join(out, name + '-expanded.png'), Buffer.from(observed.expandedPng, 'base64'));
        delete observed.originalPng; delete observed.expandedPng;
        results.push({ name, ...observed });
        fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
        assert.equal(observed.expandedText, expected, `${name}: full text missing even when uncropped`);
        assert.equal(observed.originalText, expected, `${name}: text clipped`);
        assert.ok(observed.originalInk > 0 && observed.expandedInk > 0, `${name}: no visible ink`);
        assert.equal(observed.outsideCount, 0, `${name}: glyph ink outside page ${JSON.stringify(observed)}`);
        assert.equal(observed.lostInkCount, 0, `${name}: uncropped ink missing from original render`);
        console.log('PASS full-glyph pixels and text ' + name);
      }
    }
    console.log(`PASS ${results.length} real downloads; uncropped render at 8x (long watermark 64x); one-pixel antialias tolerance`);
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
