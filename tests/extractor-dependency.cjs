// Run from any directory: node tests/extractor-dependency.cjs
// Requires Playwright and its Chromium (or CHROME_PATH); the real PDF.js CDN needs network access.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function fixturePdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (let n = 1; n <= 3; n++) {
    const stream = `BT /F1 20 Tf 40 700 Td (SOURCE PAGE ${n}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + (n - 1) * 2} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

(async () => {
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
    fs.readFile(file, (err, data) => { if (err) { res.writeHead(404).end(); return; } res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); res.end(data); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const page = await browser.newPage({ acceptDownloads: true });
    const dialogs = [];
    page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    const route = '**/pdfjs-dist@6.4.299/build/pdf.min.mjs';
    await page.route(route, request => request.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
    await page.locator('[onclick="switchView(\'tool-extract-pdf\')"]').click();
    const input = page.locator('#input-extract-pdf');
    const file = { name: 'source.pdf', mimeType: 'application/pdf', buffer: fixturePdf() };
    await input.setInputFiles(file);
    await page.waitForFunction(() => document.querySelector('#extract-pdf-progress-box').classList.contains('hidden'));
    assert.match(dialogs.at(-1), /PDF\.js.*(?:tidak|gagal).*muat ulang/i);
    assert.doesNotMatch(dialogs.at(-1), /pdfjsLib is not defined/);
    assert(await page.locator('#result-extract-pdf').evaluate(e => e.classList.contains('hidden')));
    await page.unroute(route);
    await page.reload({ waitUntil: 'load' });
    await page.locator('[onclick="switchView(\'tool-extract-pdf\')"]').click();
    await page.waitForFunction(() => !!window.pdfjsLib, { timeout: 30000 });
    await input.setInputFiles(file);
    await page.waitForFunction(() => !document.querySelector('#result-extract-pdf').classList.contains('hidden'));
    const preview = await page.locator('#output-extracted-text').inputValue();
    let previous = -1;
    for (const n of [1, 2, 3]) { const next = preview.indexOf(`SOURCE PAGE ${n}`); assert(next > previous); previous = next; }
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Download \(.TXT\)/ }).click()]);
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    assert.equal(Buffer.concat(chunks).toString('utf8'), preview);
    await page.evaluate(() => { window.pdfjsLib = undefined; });
    await input.setInputFiles([]);
    const oldDialogs = dialogs.length;
    await input.setInputFiles(file);
    await page.waitForFunction(() => document.querySelector('#extract-pdf-progress-box').classList.contains('hidden'));
    assert.equal(dialogs.length, oldDialogs + 1);
    assert.match(dialogs.at(-1), /PDF\.js.*(?:tidak|gagal).*muat ulang/i);
    assert.equal(await page.locator('#output-extracted-text').inputValue(), '');
    assert(await page.locator('#result-extract-pdf').evaluate(e => e.classList.contains('hidden')));
    const clicks = await page.evaluate(() => { let count = 0; const old = HTMLAnchorElement.prototype.click; try { HTMLAnchorElement.prototype.click = () => count++; downloadExtractedTxt(); downloadExtractedDoc(); return count; } finally { HTMLAnchorElement.prototype.click = old; } });
    assert.equal(clicks, 0);
    console.log('PASS missing dependency, CDN reload, three-page actual TXT, stale output/download');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(err => { console.error(err); process.exitCode = 1; });
