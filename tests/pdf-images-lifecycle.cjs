// Real Chrome/PDF.js parsing; gate return of an acquired preflight page.
// This verifies application cleanup invocation, not memory/instant cancellation.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const L=require(process.env.PDF_LIB_PATH||'pdf-lib');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
(async()=>{
 const root=process.cwd(),out=process.env.OUTPUT_DIR;assert.ok(out,'Set OUTPUT_DIR');fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',/\.(js|mjs)$/.test(file)?'text/javascript':'text/html');res.end(b)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  const doc=await L.PDFDocument.create();const p=doc.addPage([80,60]);p.drawRectangle({x:0,y:0,width:80,height:60,color:L.rgb(1,0,0)});const fixture=Buffer.from(await doc.save());fs.writeFileSync(path.join(out,'fixture.pdf'),fixture);
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});const page=await browser.newPage({acceptDownloads:true});page.setDefaultTimeout(45000);
  await page.addInitScript(()=>{const add=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(type,fn,options){if(this.id==='start'&&type==='click'){const original=fn;fn=function(...args){window.jobDone=Promise.resolve(original.apply(this,args));return window.jobDone}}return add.call(this,type,fn,options)};const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.clicks=(window.clicks||0)+1;return click.call(this)}});
  await page.goto(`http://127.0.0.1:${server.address().port}/pdf-ke-gambar.html`);
  async function upload(name='fixture.pdf'){await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer:fixture});await page.locator('#pages').fill('1')}
  async function arm(){await page.evaluate(async bytes=>{
   const lib=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.min.mjs');lib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.min.mjs';
   const task=lib.getDocument({data:new Uint8Array(bytes),isEvalSupported:false});const probe=await task.promise;const proto=Object.getPrototypeOf(probe);await task.destroy();
   const original=proto.getPage;window.cleanupCalls=0;window.entered=new Promise(r=>window.enter=r);window.held=new Promise(r=>window.release=r);let once=true;
   proto.getPage=async function(...args){const page=await original.apply(this,args);if(once){once=false;const clean=page.cleanup;page.cleanup=function(...a){window.cleanupCalls++;return clean.apply(this,a)};window.enter();await window.held}return page};window.restorePage=()=>{proto.getPage=original};
  },[...fixture])}
  const evidence=[];
  for(const mode of ['cancel','replacement']){
   await upload();await arm();const clicks=await page.evaluate(()=>window.clicks||0);await page.locator('#start').click();await page.evaluate(()=>window.entered);
   if(mode==='cancel')await page.locator('#cancel').click();else await upload('newer.pdf');
   const status=await page.locator('#status').textContent();await page.evaluate(async()=>{window.release();await window.jobDone;window.restorePage()});
   assert.equal(await page.evaluate(()=>window.clicks||0),clicks,'obsolete job must not download');assert.equal(await page.locator('#status').textContent(),status,'old job must not overwrite current UI');
   const count=await page.evaluate(()=>window.cleanupCalls);evidence.push({mode,cleanupCalls:count,status});fs.writeFileSync(path.join(out,'observations.json'),JSON.stringify(evidence,null,2));assert.equal(count,1,`${mode}: acquired preflight page must be cleaned after invalidation`);console.log('PASS acquired preflight page cleanup',mode);
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#start').click()]);const saved=path.join(out,mode+'-recovery.zip');await download.saveAs(saved);await page.evaluate(()=>window.jobDone);assert.match(await page.locator('#status').textContent(),/Selesai/);
   const zip=fs.readFileSync(saved);assert.equal(zip.readUInt32LE(0),0x04034b50);const length=zip.readUInt32LE(18),nameLength=zip.readUInt16LE(26),extra=zip.readUInt16LE(28);assert.equal(zip.subarray(30,30+nameLength).toString(),'halaman-001.png');const begin=30+nameLength+extra;
   const decoded=await page.evaluate(async bytes=>{const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:'image/png'}));const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);const result={width:bitmap.width,height:bitmap.height,pixel:[...ctx.getImageData(40,30,1,1).data]};bitmap.close();return result},[...zip.subarray(begin,begin+length)]);assert.deepEqual(decoded,{width:80,height:60,pixel:[255,0,0,255]});console.log('PASS actual recovery ZIP decoded red image',mode);
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
