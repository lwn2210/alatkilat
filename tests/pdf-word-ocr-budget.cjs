// OCR guard seam tests retain real PDF.js parsing/worker initialization.
// Artificial viewport dimensions avoid allocating 16.5MP; render is gated.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const out = process.env.OUTPUT_DIR;
if (!out) throw Error('Set OUTPUT_DIR to durable evidence directory');
fs.mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL || 'http://127.0.0.1:8199/pdf-ke-word.html';
const pdfURL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.min.mjs';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true });
  let failures = 0;
  try {
    const fixtureContext = await browser.newContext();
    const f = await fixtureContext.newPage();
    await f.goto(base);
    await f.addScriptTag({ url: 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js' });
    const bytes = Buffer.from(await f.evaluate(async () => {
      const d = await PDFLib.PDFDocument.create(), pg = d.addPage([600, 800]);
      const c = document.createElement('canvas'); c.width = 1200; c.height = 1600;
      const x = c.getContext('2d'); x.fillStyle = 'white'; x.fillRect(0, 0, c.width, c.height);
      x.fillStyle = 'black'; x.font = 'bold 60px Arial';
      x.fillText('SELAMAT PAGI INDONESIA', 60, 200); x.fillText('HELLO WORLD', 60, 300);
      const im = await d.embedPng(c.toDataURL()); pg.drawImage(im, { x: 0, y: 0, width: 600, height: 800 });
      return Array.from(await d.save());
    }));
    fs.writeFileSync(path.join(out, 'real-scan-fixture.pdf'), bytes);
    await fixtureContext.close();
    const cases = process.env.ONLY_OVER ? [['one-pixel-over', 16500001, 1, false]] : [
      ['one-pixel-over', 16500001, 1, false],
      ['exact-16_5MP', 5500, 3000, true],
      ['ceil-over', 5500.01, 3000, false],
      ['zero-width', 0, 3000, false, true],
      ['negative-height', 100, -1, false, true],
      ['nonfinite-width', NaN, 3000, false, true],
      ['unsafe-width', Number.MAX_SAFE_INTEGER + 1, 1, false, true]
    ];
    for (const [name, width, height, accepted, invalid] of cases) {
      const context = await browser.newContext();
      const p = await context.newPage(); p.setDefaultTimeout(90000);
      try {
        // Only the second viewport call (OCR output) and render are gated.
        await context.route(/\/pdfjs-dist@6\.4\.299\/build\/pdf\.min\.mjs$/, r => r.fulfill({
          status: 200, contentType: 'text/javascript', body: `
          import * as real from '${pdfURL}?ocr-budget-real=1';
          export * from '${pdfURL}?ocr-budget-real=1';
          export function getDocument(...args) {
            const task = real.getDocument(...args);
            return new Proxy(task, {get(t,k) {
              if(k==='promise') return t.promise.then(pdf => new Proxy(pdf,{get(d,key){
                if(key==='getPage') return async n => {
                  const pg=await d.getPage(n); let views=0;
                  window.budget.parsedPages++;
                  return new Proxy(pg,{get(page,field){
                    if(field==='getViewport') return options => {views++;return views===2?{width:${width},height:${height}}:page.getViewport(options)};
                    if(field==='render') return () => {window.budget.renderCalls++;throw Error('BOUNDARY_RENDER_REACHED')};
                    const v=Reflect.get(page,field,page);return typeof v==='function'?v.bind(page):v;
                  }});
                };
                const v=Reflect.get(d,key,d);return typeof v==='function'?v.bind(d):v;
              }}));
              const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;
            }});
          }`
        }));
        await p.goto(base);
        await p.evaluate(() => {
          window.budget = { parsedPages: 0, workerCalls: 0, renderCalls: 0, resizes: [], canvases: [] };
          const origWorker = Tesseract.createWorker.bind(Tesseract);
          Tesseract.createWorker = (...args) => { window.budget.workerCalls++; return origWorker(...args); };
          const create = document.createElement.bind(document);
          document.createElement = (tag, ...args) => {
            const el = create(tag, ...args);
            if (tag.toLowerCase() === 'canvas') {
              let w = 0, h = 0; window.budget.canvases.push(el);
              Object.defineProperties(el, {
                width: { get: () => w, set: v => { w = v; window.budget.resizes.push([w,h]); } },
                height: { get: () => h, set: v => { h = v; window.budget.resizes.push([w,h]); } }
              });
            }
            return el;
          };
        });
        await p.locator('#file').setInputFiles({ name: name + '.pdf', mimeType: 'application/pdf', buffer: bytes });
        await p.locator('#language').selectOption('ind+eng');
        await p.locator('#start').click();
        await p.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Gagal') && !document.querySelector('#start').disabled);
        const evidence = await p.evaluate(() => ({ ...window.budget, canvases: window.budget.canvases.map(c => [c.width,c.height]), status: document.querySelector('#status').textContent }));
        fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(evidence, null, 2));
        assert.equal(evidence.parsedPages, 1, 'real PDF.js parsed fixture page');
        if (accepted) {
          assert.match(evidence.status, /BOUNDARY_RENDER_REACHED/);
          assert.equal(evidence.workerCalls, 1, 'valid boundary proceeds to real model initialization');
          assert.equal(evidence.renderCalls, 1);
          assert.ok(evidence.resizes.some(([w,h]) => w*h === 16500000));
          assert.deepEqual(evidence.canvases, [[0,0]], 'accepted boundary cleans canvas after gated render failure');
        } else {
          assert.match(evidence.status, invalid ? /Ukuran halaman tidak valid/ : /Halaman terlalu besar untuk OCR/);
          assert.equal(evidence.workerCalls, 0, 'oversize must fail before OCR model initialization');
          assert.deepEqual(evidence.resizes, [], 'oversize must fail before canvas backing-store assignment');
          assert.equal(evidence.renderCalls, 0);
        }
        assert.equal(await p.locator('#download').isDisabled(), true);
        console.log('PASS', name, JSON.stringify(evidence));
      } catch (e) { failures++; console.error('FAIL', name, e.stack); }
      finally { await context.close(); }
    }
    if (!process.env.ONLY_OVER) {
      const context = await browser.newContext({ acceptDownloads: true });
      const p = await context.newPage(); p.setDefaultTimeout(180000);
      try {
        // No route adapters, canvas shims or dependency replacements in recovery.
        await p.goto(base);
        await p.locator('#file').setInputFiles({ name: 'budget-recovery.pdf', mimeType: 'application/pdf', buffer: bytes });
        await p.locator('#language').selectOption('ind+eng');
        await p.locator('#start').click();
        await p.waitForFunction(() => !document.querySelector('#download').disabled || document.querySelector('#status').textContent.startsWith('Gagal'));
        assert.equal(await p.locator('#download').isEnabled(), true, await p.locator('#status').textContent());
        const text = await p.locator('#preview textarea').first().inputValue();
        assert.match(text, /SELAMAT PAGI INDONESIA/i); assert.match(text, /HELLO WORLD/i);
        const [download] = await Promise.all([p.waitForEvent('download'), p.locator('#download').click()]);
        await download.saveAs(path.join(out, 'budget-recovery.docx'));
        fs.writeFileSync(path.join(out, 'recovery.json'), JSON.stringify({ text, filename: download.suggestedFilename(), dependencyOverrides: false, tlsBypass: false }, null, 2));
        console.log('PASS real ind+eng OCR recovery DOCX download', download.suggestedFilename());
      } catch (e) { failures++; console.error('FAIL real OCR recovery', e.stack); }
      finally { await context.close(); }
    }
  } finally { await browser.close(); }
  console.log('RESULT failures', failures, 'TLS NORMAL; boundary dimensions/render gated, recovery real');
  process.exitCode = failures ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
