const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const PDFLib=require(process.env.PDF_LIB_PATH||'pdf-lib');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
(async()=>{
 const root=process.cwd(), out=process.env.OUTPUT_DIR; fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(f,(e,b)=>{if(e){res.writeHead(404).end();return}res.setHeader('Content-Type',/\.(js|mjs)$/.test(f)?'text/javascript':'text/html');res.end(b)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,fail=0;
 try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 const pdf=await PDFLib.PDFDocument.create(),pg=pdf.addPage([600,800]);pg.drawText('DIGITAL TABLE HEADING',{x:50,y:740,size:18});[['NAME','AMOUNT'],['ALPHA','100'],['BETA','200']].forEach((row,i)=>row.forEach((text,j)=>pg.drawText(text,{x:50+j*250,y:650-i*28,size:16})));const data=Buffer.from(await pdf.save());
 for(const kind of ['textarea','cell']){let page;try{
 page=await browser.newPage({acceptDownloads:true});page.setDefaultTimeout(45000);
 await page.addInitScript(()=>{const add=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(type,fn,opts){if(this.id==='download'&&type==='click'){const original=fn;fn=function(...args){window.exportDone=Promise.resolve(original.apply(this,args));return window.exportDone}}return add.call(this,type,fn,opts)};const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.downloadClicks=(window.downloadClicks||0)+1;return click.call(this)}});
 await page.goto(`http://127.0.0.1:${server.address().port}/pdf-ke-word.html`);await page.locator('#file').setInputFiles({name:'fixture.pdf',mimeType:'application/pdf',buffer:data});await page.locator('#start').click();await page.waitForFunction(()=>!document.querySelector('#download').disabled||document.querySelector('#status').textContent.startsWith('Gagal'));assert.equal(await page.locator('#download').isEnabled(),true,await page.locator('#status').textContent());assert.ok(await page.locator('#preview textarea').count());assert.ok(await page.locator('#preview table input').count());
 await page.evaluate(()=>{const orig=docx.Packer.toBlob;window.entered=new Promise(r=>window.enter=r);window.release=new Promise(r=>window.resume=r);docx.Packer.toBlob=async function(...a){const blob=await orig.apply(this,a);window.enter();await window.release;return blob}});
 let downloads=[];page.on('download',d=>downloads.push(d));await page.locator('#download').click();await page.evaluate(()=>window.entered);
 const literal=kind==='textarea'?'EDIT TEXT <&> "literal"':'EDIT CELL <&> "literal"';await page.locator(kind==='textarea'?'#preview textarea':'#preview table input').first().fill(literal);
 await page.evaluate(async()=>{window.resume();await window.exportDone});const clicks=await page.evaluate(()=>window.downloadClicks||0);console.log(kind,'stale anchor clicks',clicks,'status',await page.locator('#status').textContent());assert.equal(clicks,0,'stale snapshot must not download');assert.equal(downloads.length,0);
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#download').click()]);await download.saveAs(path.join(out,kind+'.docx'));assert.equal(await download.failure(),null);console.log('PASS',kind,'subsequent real DOCX',literal);
 }catch(e){fail++;console.error('FAIL',kind,e.stack)}finally{if(page)await page.close()}}
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}if(fail)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
