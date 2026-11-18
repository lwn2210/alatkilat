// Real browser file handoffs, not an in-memory workflow implementation.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const PDFLib = require(process.env.PDF_LIB_PATH || 'pdf-lib');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

(async () => {
  const root = process.cwd();
  const out = path.resolve(process.env.OUTPUT_DIR || '.artifacts/rich-chain');
  fs.mkdirSync(out, { recursive: true });
  const requests = [];
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (error, bytes) => {
      if (error) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', /\.(js|mjs)$/.test(file) ? 'text/javascript' : 'text/html');
      res.end(bytes);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
    const page = await browser.newPage({ acceptDownloads: true });
    page.setDefaultTimeout(45000);
    page.on('request', req => requests.push({ url: req.url(), method: req.method(), body: req.postData() !== null }));
    const base = `http://127.0.0.1:${server.address().port}/`;
    // Browser-generated synthetic scans: raster text/table, no PDF text layer.
    const fixtures = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200; canvas.height = 1600;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1200, 1600);
      ctx.fillStyle = 'black'; ctx.font = 'bold 52px Arial';
      ctx.fillText('SELAMAT PAGI INDONESIA', 70, 170);
      ctx.fillText('HELLO WORLD DOCUMENT', 70, 260);
      ctx.font = '44px Arial';
      [['NAMA', 'JUMLAH'], ['ALPHA', '100'], ['BETA', '200']].forEach((row, i) => {
        ctx.fillText(row[0], 90, 480 + i * 100);
        ctx.fillText(row[1], 720, 480 + i * 100);
      });
      ctx.lineWidth = 3;
      [400, 510, 610, 710].forEach(y => { ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(1110, y); ctx.stroke(); });
      [60, 650, 1110].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 400); ctx.lineTo(x, 710); ctx.stroke(); });
      const scan = canvas.toDataURL('image/png').split(',')[1];
      canvas.width = 120; canvas.height = 80;
      const c = canvas.getContext('2d');
      c.fillStyle = '#e02020'; c.fillRect(0, 0, 60, 80);
      c.fillStyle = '#2040e0'; c.fillRect(60, 0, 60, 80);
      return { scan, illustration: canvas.toDataURL('image/png').split(',')[1] };
    });
    const scanPath = path.join(out, 'scan-table.png');
    fs.writeFileSync(scanPath, Buffer.from(fixtures.scan, 'base64'));
    const digital = await PDFLib.PDFDocument.create();
    const dp = digital.addPage([600, 800]);
    dp.drawText('DIGITAL TABLE ILLUSTRATION', { x: 50, y: 740, size: 18 });
    [['NAME', 'AMOUNT'], ['ALPHA', '100'], ['BETA', '200']].forEach((row, i) => {
      dp.drawText(row[0], { x: 50, y: 650 - i * 28, size: 16 });
      dp.drawText(row[1], { x: 300, y: 650 - i * 28, size: 16 });
    });
    const image = await digital.embedPng(Buffer.from(fixtures.illustration, 'base64'));
    dp.drawImage(image, { x: 50, y: 340, width: 180, height: 120 });
    const digitalPath = path.join(out, 'digital-table-image.pdf');
    fs.writeFileSync(digitalPath, await digital.save());

    async function saveDownload(button, name) {
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
      const target = path.join(out, name);
      await download.saveAs(target);
      assert.equal(await download.failure(), null);
      return target;
    }
    await page.goto(base + 'lamaran.html');
    await page.waitForFunction(() => window.PDFLib);
    await page.locator('#lamaran-files').setInputFiles([digitalPath, scanPath]);
    await page.waitForFunction(() => !document.querySelector('#lamaran-merge').disabled);
    const mergedPath = await saveDownload('#lamaran-merge', 'lamaran.pdf');
    const merged = await PDFLib.PDFDocument.load(fs.readFileSync(mergedPath));
    assert.equal(merged.getPageCount(), 2);
    await page.goto(base + 'editor-pdf.html');
    await page.waitForFunction(() => window.PDFLib);
    await page.locator('#file').setInputFiles(mergedPath);
    await page.locator('#pages li').first().waitFor();
    await page.getByRole('button', { name: 'Turunkan halaman asal 1' }).click();
    await page.getByRole('button', { name: 'Putar halaman asal 1' }).click();
    const editedPath = await saveDownload('#download', 'editor.pdf');
    const edited = await PDFLib.PDFDocument.load(fs.readFileSync(editedPath));
    assert.deepEqual(edited.getPages().map(p => p.getRotation().angle), [0, 90]);

    async function convert(input, prefix, force) {
      await page.goto(base + 'pdf-ke-word.html');
      await page.locator('#file').setInputFiles(input);
      await page.locator('#language').selectOption('ind+eng');
      if (force) await page.locator('#mode').selectOption('force');
      await page.locator('#start').click();
      await page.waitForFunction(() => !document.querySelector('#download').disabled || document.querySelector('#status').textContent.startsWith('Gagal'), null, { timeout: 180000 });
      assert.equal(await page.locator('#download').isEnabled(), true, await page.locator('#status').textContent());
      const values = await page.locator('#preview section').evaluateAll(sections => sections.map(section => ({
        text: [...section.querySelectorAll('textarea')].map(x => x.value).join('\n'),
        rows: [...section.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('input')].map(x => x.value))
      })));
      const summary = await page.locator('#summary').textContent();
      fs.writeFileSync(path.join(out, prefix + '-preview.json'), JSON.stringify({ values, summary }, null, 2));
      return values;
    }
    const mixed = await convert(editedPath, 'mixed', false);
    assert.equal(mixed.length, 2);
    assert.match(mixed[0].text, /SELAMAT PAGI INDONESIA[\s\S]*HELLO WORLD DOCUMENT/i);
    // Preserve OCR omissions as evidence; scan-table acceptance is visual fallback,
    // never editable cells or guaranteed transcription of ruled table contents.
    console.log('OBSERVED scan-table OCR:', JSON.stringify(mixed[0].text));
    assert.match(await page.locator('main').textContent(), /OCR dapat melewatkan teks, terutama pada tabel bergaris/);
    assert.deepEqual(mixed[0].rows, [], 'scan table must not be sold as editable cells');
    assert.deepEqual(mixed[1].rows, [['NAME', 'AMOUNT'], ['ALPHA', '100'], ['BETA', '200']]);
    assert.match(mixed[1].text, /DIGITAL TABLE ILLUSTRATION/);
    const summary = await page.locator('#summary').textContent();
    assert.match(summary, /Halaman 1: [1-9]\d* operasi gambar PDF; 0 kandidat tabel digital\. OCR: tabel scan tidak dikenali sebagai sel/);
    assert.match(summary, /Halaman 2: [1-9]\d* operasi gambar PDF; 1 kandidat tabel digital/);
    await page.locator('#preview section').nth(1).locator('input').nth(2).fill('ALPHA EDIT <&>');
    await saveDownload('#download', 'mixed-chain.docx');
    console.log('PASS mixed chain: actual Lamaran PDF+PNG -> Editor reorder/rotate -> real ind+eng OCR, editable digital table/image-paint counts -> DOCX');

    // Overlay text gives an otherwise scanned PDF a text layer. Force OCR is an
    // explicit user choice; automatic mode is not claimed to classify all scans.
    await page.goto(base + 'editor-pdf.html');
    await page.waitForFunction(() => window.PDFLib);
    await page.locator('#file').setInputFiles(mergedPath);
    await page.locator('#pages li').first().waitFor();
    await page.getByRole('button', { name: 'Hapus halaman asal 1', exact: true }).click();
    await page.locator('#watermark').fill('DRAFT');
    const overlayPath = await saveDownload('#download', 'scan-overlay.pdf');
    const forced = await convert(overlayPath, 'forced', true);
    assert.equal(forced.length, 1);
    assert.match(forced[0].text, /SELAMAT PAGI INDONESIA[\s\S]*HELLO WORLD DOCUMENT/i);
    console.log('OBSERVED forced scan-table OCR:', JSON.stringify(forced[0].text));
    assert.deepEqual(forced[0].rows, []);
    await saveDownload('#download', 'forced-chain.docx');
    assert(requests.some(r => /ind\.traineddata/.test(r.url)), 'actual Indonesian model request missing');
    assert(requests.some(r => /eng\.traineddata/.test(r.url)), 'actual English model request missing');
    assert(requests.every(r => r.method === 'GET' && !r.body), 'unexpected non-GET/body request in this observed browser run');
    console.log('PASS scan overlay chain: actual Editor delete/watermark -> explicitly forced real bilingual OCR -> DOCX; observed requests GET-only');
  } finally {
    fs.writeFileSync(path.join(out, 'requests.json'), JSON.stringify(requests, null, 2));
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
