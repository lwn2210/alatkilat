// Real Chrome/PDF.js/Tesseract regression; injected failure after real OCR.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.OUTPUT_DIR;
if (!out) throw Error('Set OUTPUT_DIR to a durable evidence directory');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  let failures = 0;
  try {
    for (const scenario of ['ocr-error', 'snapshot-error', 'settings-cancel']) {
      const context = await browser.newContext({ acceptDownloads: true });
      const p = await context.newPage();
      p.setDefaultTimeout(180000);
      try {
        await p.goto(process.env.BASE_URL || 'http://127.0.0.1:8199/pdf-ke-word.html');
        await p.addScriptTag({ url: 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js' });
        const bytes = await p.evaluate(async scan => {
          const d = await PDFLib.PDFDocument.create(), pg = d.addPage([600, 800]);
          if (scan) {
            const c = document.createElement('canvas'); c.width = 1200; c.height = 1600;
            const x = c.getContext('2d'); x.fillStyle = 'white'; x.fillRect(0, 0, 1200, 1600);
            x.fillStyle = 'black'; x.font = 'bold 60px Arial';
            x.fillText('SELAMAT PAGI INDONESIA', 60, 200); x.fillText('HELLO WORLD', 60, 300);
            const im = await d.embedPng(c.toDataURL()); pg.drawImage(im, { x: 0, y: 0, width: 600, height: 800 });
          } else pg.drawText('DIGITAL CLEANUP CHECK', { x: 40, y: 700, size: 24 });
          return Array.from(await d.save());
        }, scenario !== 'snapshot-error');
        fs.writeFileSync(path.join(out, scenario + '.pdf'), Buffer.from(bytes));
        await p.evaluate(scenario => {
          window.cleanupCanvases = []; window.cleanupRecognized = ''; window.cleanupEntered = false; window.cleanupFinished = false;
          const create = document.createElement.bind(document);
          document.createElement = (tag, ...args) => {
            const el = create(tag, ...args);
            if (tag.toLowerCase() === 'canvas') {
              window.cleanupCanvases.push(el);
              if (scenario === 'snapshot-error') el.toBlob = cb => cb(null);
            }
            return el;
          };
          if (scenario !== 'snapshot-error') {
            const original = Tesseract.createWorker.bind(Tesseract);
            Tesseract.createWorker = async (...args) => {
              const worker = await original(...args), recognize = worker.recognize.bind(worker);
              worker.recognize = async (...a) => {
                const result = await recognize(...a);
                window.cleanupRecognized = result.data.text;
                if (scenario === 'settings-cancel') {
                  window.cleanupEntered = true;
                  await new Promise(r => window.cleanupResume = r);
                  window.cleanupFinished = true;
                  return result;
                }
                throw Error('INJECTED_AFTER_REAL_OCR');
              };
              return worker;
            };
          }
        }, scenario);
        await p.locator('#file').setInputFiles({ name: scenario + '.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
        await p.locator('#language').selectOption('ind+eng');
        await p.locator('#start').click();
        if (scenario === 'settings-cancel') {
          await p.waitForFunction(() => window.cleanupEntered);
          await p.locator('#mode').selectOption('force');
          await p.evaluate(() => window.cleanupResume());
          await p.waitForFunction(() => window.cleanupFinished);
          await p.waitForTimeout(300);
          assert.match(await p.locator('#status').textContent(), /Pengaturan berubah/);
        } else {
          await p.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Gagal'));
          assert.match(await p.locator('#status').textContent(), scenario === 'ocr-error' ? /INJECTED_AFTER_REAL_OCR/ : /Gagal menyimpan gambar/);
        }
        const evidence = await p.evaluate(() => ({ recognized: window.cleanupRecognized, canvases: window.cleanupCanvases.map(c => ({ width: c.width, height: c.height })), status: document.querySelector('#status').textContent }));
        fs.writeFileSync(path.join(out, scenario + '.json'), JSON.stringify(evidence, null, 2));
        if (scenario !== 'snapshot-error') { assert.match(evidence.recognized, /SELAMAT PAGI INDONESIA/i); assert.match(evidence.recognized, /HELLO WORLD/i); }
        assert.ok(evidence.canvases.length > 0, 'exercised actual canvas allocation');
        assert.deepEqual(evidence.canvases.filter(c => c.width || c.height), [], 'all application canvas backing stores released');
        assert.equal(await p.locator('#download').isDisabled(), true);
        assert.equal(await p.locator('#preview section').count(), 0);
        console.log('PASS', scenario, JSON.stringify(evidence));
        // Recovery must produce a real downloadable DOCX, not only an error UI.
        await p.goto(process.env.BASE_URL || 'http://127.0.0.1:8199/pdf-ke-word.html');
        await p.locator('#file').setInputFiles({ name: 'recovery.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
        await p.locator('#start').click();
        await p.waitForFunction(() => !document.querySelector('#download').disabled);
        const [download] = await Promise.all([p.waitForEvent('download'), p.locator('#download').click()]);
        await download.saveAs(path.join(out, scenario + '-recovery.docx'));
        console.log('PASS', scenario, 'recovery DOCX downloaded');
      } catch (e) { failures++; console.error('FAIL', scenario, e.stack); }
      finally { await context.close(); }
    }
  } finally { await browser.close(); }
  console.log('RESULT cleanup failures', failures, 'TLS NORMAL');
  process.exitCode = failures ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
