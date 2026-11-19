const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { spawn } = require('child_process');
const assert = require('assert');
(async () => {
  const server = spawn('python3', ['-m', 'http.server', '19387', '--bind', '127.0.0.1'], {stdio:'ignore'});
  let browser;
  try {
    for (let i=0;i<50;i++) { try { await fetch('http://127.0.0.1:19387/'); break; } catch { await new Promise(r=>setTimeout(r,100)); } }
    browser = await chromium.launch({headless:true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:19387/', {waitUntil:'domcontentloaded'});
    for (const href of ['pdf-ke-gambar.html','lamaran.html','batch-gambar.html']) {
      const card=page.locator(`#tools-grid a[href="${href}"]`);
      assert.equal(await card.count(),1, `missing card ${href}`);
      assert.doesNotMatch(await card.innerText(), /pratinjau lokal/i, `misleading catalog label ${href}`);
    }
    assert.match(await page.locator('a[href="pdf-ke-gambar.html"]').innerText(), /batas dimensi dan memori/i);
    await page.locator('#tool-search').fill('Batch Gambar');
    assert(await page.locator('a[href="batch-gambar.html"]').isVisible());
    await page.locator('#tool-search').fill('');
    await page.getByRole('button',{name:/Foto & Gambar/}).click();
    assert(await page.locator('a[href="batch-gambar.html"]').isVisible());
    assert(!(await page.locator('a[href="lamaran.html"]').isVisible()));
    await page.getByRole('button',{name:/Dokumen & PDF/}).click();
    await page.locator('a[href="lamaran.html"]').click();
    assert.match(page.url(), /\/lamaran\.html$/);
    assert.doesNotMatch(await page.locator('body').innerText(), /pratinjau lokal/i);
    assert.match(await page.locator('body').innerText(), /tahap 1/i);
    console.log('PASS catalog labels, limits, search, categories and navigation');
  } finally { if(browser) await browser.close(); server.kill(); }
})().catch(e=>{console.error(e); process.exitCode=1});
