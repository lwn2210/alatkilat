// Real PDF.js, Chrome and ind+eng Tesseract; gate only worker promise delivery.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.OUTPUT_DIR;
if (!out) throw Error('Set OUTPUT_DIR to durable evidence path');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  let failures = 0;
  try {
    const scenarios = process.env.ONLY_CANCEL ? ['cancel-late'] : ['cancel-late', 'settings-late', 'replacement-late', 'timeout-late', 'init-reject', 'cancel-reject', 'timeout-reject'];
    for (const scenario of scenarios) {
      const context = await browser.newContext({ acceptDownloads: true });
      const p = await context.newPage(); p.setDefaultTimeout(180000);
      const pageErrors = []; p.on('pageerror', e => pageErrors.push(e.message));
      const downloads = []; p.on('download', d => downloads.push(d.suggestedFilename()));
      try {
        await p.goto(process.env.BASE_URL || 'http://127.0.0.1:8199/pdf-ke-word.html');
        await p.addScriptTag({ url: 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js' });
        const bytes = await p.evaluate(async () => {
          const doc = await PDFLib.PDFDocument.create(), page = doc.addPage([600, 800]);
          page.drawText('SELAMAT PAGI INDONESIA', { x: 45, y: 650, size: 28 });
          page.drawText('HELLO WORLD', { x: 45, y: 590, size: 28 });
          return Array.from(await doc.save());
        });
        fs.writeFileSync(path.join(out, scenario + '.pdf'), Buffer.from(bytes));
        await p.evaluate(() => {
          window.lifecycle = { entered: false, timerActive: false, timerCleared: 0, terminated: 0, recognized: 0, calls: 0, downloads: 0 };
          const state = window.lifecycle;
          const set = window.setTimeout.bind(window), clear = window.clearTimeout.bind(window);
          let initTimer;
          window.setTimeout = (fn, delay, ...args) => {
            if (delay !== 15000) return set(fn, delay, ...args);
            state.timerActive = true;
            initTimer = set(() => { state.timerActive = false; fn(...args); }, delay);
            window.fireInitDeadline = () => { clear(initTimer); state.timerActive = false; fn(...args); };
            return initTimer;
          };
          window.clearTimeout = id => {
            if (id === initTimer) { state.timerActive = false; state.timerCleared++; }
            return clear(id);
          };
          const original = Tesseract.createWorker.bind(Tesseract);
          Tesseract.createWorker = async (...args) => {
            state.calls++;
            if (state.calls !== 1) return original(...args);
            const worker = await original(...args);
            const terminate = worker.terminate.bind(worker), recognize = worker.recognize.bind(worker);
            worker.terminate = (...a) => { state.terminated++; return terminate(...a); };
            worker.recognize = (...a) => { state.recognized++; return recognize(...a); };
            state.entered = true;
            await new Promise((resolve, reject) => {
              window.releaseInit = resolve;
              window.rejectInit = async () => { await worker.terminate(); reject(Error('INJECTED_INIT_REJECTION')); };
            });
            return worker;
          };
        });
        await p.locator('#file').setInputFiles({ name: scenario + '.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
        await p.locator('#mode').selectOption('force');
        await p.locator('#language').selectOption('ind+eng');
        await p.locator('#start').click();
        await p.waitForFunction(() => window.lifecycle.entered);
        if (scenario.startsWith('timeout-')) {
          await p.evaluate(() => window.fireInitDeadline());
          await p.waitForFunction(() => document.querySelector('#status').textContent.includes('waktu koneksi habis'));
        } else if (scenario === 'init-reject') {
          await p.evaluate(() => window.rejectInit());
          await p.waitForFunction(() => document.querySelector('#status').textContent.includes('INJECTED_INIT_REJECTION'));
        } else {
          if (scenario.startsWith('cancel-')) await p.locator('#cancel').click();
          if (scenario === 'settings-late') await p.locator('#mode').selectOption('auto');
          if (scenario === 'replacement-late') await p.locator('#file').setInputFiles({ name: 'replacement.pdf', mimeType: 'application/pdf', buffer: Buffer.from(bytes) });
          await p.waitForTimeout(300);
        }
        const before = await p.evaluate(() => ({ ...window.lifecycle, status: document.querySelector('#status').textContent }));
        fs.writeFileSync(path.join(out, scenario + '-before.json'), JSON.stringify(before, null, 2));
        assert.equal(before.timerActive, false, 'cancel/settings/replacement must settle init wait and clear deadline before late worker resolves');
        assert.ok(before.timerCleared > 0, 'initialization timer cleared on settled path');
        assert.equal(await p.locator('#download').isDisabled(), true);
        assert.equal(await p.locator('#preview section').count(), 0);
        if (scenario === 'cancel-reject' || scenario === 'timeout-reject') await p.evaluate(() => window.rejectInit());
        else if (scenario !== 'init-reject') await p.evaluate(() => window.releaseInit());
        await p.waitForFunction(() => window.lifecycle.terminated === 1);
        await p.waitForTimeout(200);
        const after = await p.evaluate(() => ({ ...window.lifecycle, status: document.querySelector('#status').textContent }));
        fs.writeFileSync(path.join(out, scenario + '-after.json'), JSON.stringify(after, null, 2));
        assert.equal(after.terminated, 1, 'late worker is terminated once');
        assert.equal(after.recognized, 0, 'obsolete or failed worker must never recognize');
        assert.equal(after.status, before.status, 'late result must not replace current UI status');
        assert.equal(await p.locator('#download').isDisabled(), true);
        assert.equal(await p.locator('#preview section').count(), 0);
        assert.deepEqual(downloads, [], 'no stale download');
        assert.deepEqual(pageErrors, [], 'no unhandled browser rejection');
        fs.writeFileSync(path.join(out, scenario + '-browser.json'), JSON.stringify({ pageErrors, downloads }, null, 2));
        console.log('PASS', scenario, JSON.stringify({ before, after }));
        // Same-page recovery starts a new real worker; actual ind+eng OCR and DOCX download.
        await p.locator('#mode').selectOption('force');
        await p.locator('#start').click();
        await p.waitForFunction(() => !document.querySelector('#download').disabled);
        const text = await p.locator('#preview textarea').inputValue();
        assert.match(text, /SELAMAT PAGI INDONESIA/i); assert.match(text, /HELLO WORLD/i);
        const [download] = await Promise.all([p.waitForEvent('download'), p.locator('#download').click()]);
        await download.saveAs(path.join(out, scenario + '-recovery.docx'));
        console.log('PASS', scenario, 'same-page real ind+eng OCR and DOCX recovery');
      } catch (e) { failures++; console.error('FAIL', scenario, e.stack); }
      finally { await context.close(); }
    }
  } finally { await browser.close(); }
  console.log('RESULT lifecycle failures', failures, 'TLS NORMAL; pending-delivery/deadline seams, not physical/low-memory coverage');
  process.exitCode = failures ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
