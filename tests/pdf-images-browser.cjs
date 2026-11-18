const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const PDFLib=require(process.env.PDF_LIB_PATH||'pdf-lib');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
(async()=>{
 const root=process.cwd(),out=process.env.OUTPUT_DIR;fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(f,(e,b)=>{if(e){res.writeHead(404).end();return}res.setHeader('Content-Type',/\.(js|mjs)$/.test(f)?'text/javascript':'text/html');res.end(b)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 const pdf=await PDFLib.PDFDocument.create();
 for(const [i,color] of [[0,PDFLib.rgb(1,0,0)],[1,PDFLib.rgb(0,1,0)],[2,PDFLib.rgb(0,0,1)]]){const p=pdf.addPage([240,160]);p.drawRectangle({x:0,y:0,width:240,height:160,color});p.drawText('PAGE '+(i+1),{x:10,y:130,size:15});if(i===2)p.setRotation(PDFLib.degrees(90));}
 const data=Buffer.from(await pdf.save());fs.writeFileSync(path.join(out,'fixture.pdf'),data);
 const page=await browser.newPage({acceptDownloads:true});page.setDefaultTimeout(45000);
 await page.addInitScript(()=>{const add=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(type,fn,opts){if(this.id==='start'&&type==='click'){const orig=fn;fn=function(...args){window.jobDone=Promise.resolve(orig.apply(this,args));return window.jobDone}}return add.call(this,type,fn,opts)};const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.downloadClicks=(window.downloadClicks||0)+1;return click.call(this)}});
 const response=await page.goto(`http://127.0.0.1:${server.address().port}/pdf-ke-gambar.html`);assert.equal(response.status(),200,'PDF image conversion page must exist');
 for(const format of ['png','jpeg']){
 await page.locator('#file').setInputFiles({name:'<img onerror=alert(1)> ../../test.pdf',mimeType:'application/pdf',buffer:data});
 await page.locator('#pages').fill('3,1');await page.locator('#format').selectOption(format);
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#start').click()]);assert.equal(await download.failure(),null);const zipPath=path.join(out,format+'.zip');await download.saveAs(zipPath);
 const zip=fs.readFileSync(zipPath),entries=[];let pos=0;
 while(zip.readUInt32LE(pos)===0x04034b50){assert.equal(zip.readUInt16LE(pos+8),0,'stored ZIP');const length=zip.readUInt32LE(pos+18),n=zip.readUInt16LE(pos+26),extra=zip.readUInt16LE(pos+28),name=zip.subarray(pos+30,pos+30+n).toString('utf8'),begin=pos+30+n+extra;entries.push({name,bytes:zip.subarray(begin,begin+length)});pos=begin+length;}
 assert.deepEqual(entries.map(e=>e.name),[`halaman-003.${format==='png'?'png':'jpg'}`,`halaman-001.${format==='png'?'png':'jpg'}`]);
 for(const [i,e] of entries.entries()){
 fs.writeFileSync(path.join(out,e.name),e.bytes);
 const result=await page.evaluate(async({bytes,mime})=>{const bitmap=await createImageBitmap(new Blob([new Uint8Array(bytes)],{type:mime}));const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);return {width:bitmap.width,height:bitmap.height,pixel:[...ctx.getImageData(c.width/2,c.height/2,1,1).data]};},{bytes:[...e.bytes],mime:format==='png'?'image/png':'image/jpeg'});
 assert.deepEqual([result.width,result.height],i===0?[160,240]:[240,160]);const expected=i===0?[0,0,255]:[255,0,0];expected.forEach((v,j)=>assert.ok(Math.abs(result.pixel[j]-v)<=8,JSON.stringify(result)));assert.equal(result.pixel[3],255);
 }
 assert.equal(await page.locator('#filename img').count(),0);assert.match(await page.locator('#status').textContent(),/Selesai/);console.log('PASS real UI download ZIP, names/order/dimensions/rotation/colors',format);
 }
 for(const selection of ['','0','2-1','4','1,1','a','1,']){
 const before=await page.evaluate(()=>window.downloadClicks||0);await page.locator('#pages').fill(selection);await page.locator('#start').click();await page.evaluate(()=>window.jobDone);assert.match(await page.locator('#status').textContent(),/Gagal/);assert.equal(await page.evaluate(()=>window.downloadClicks||0),before);}
 console.log('PASS invalid selections reject without download');
 for(const [name,buffer] of [['empty.pdf',Buffer.alloc(0)],['corrupt.pdf',Buffer.from('not a PDF')],['encrypted.pdf',fs.readFileSync(path.join(root,'test-encrypted.pdf'))]]){await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer});await page.locator('#pages').fill('1');await page.locator('#start').click();await page.evaluate(()=>window.jobDone);assert.match(await page.locator('#status').textContent(),/Gagal/);}console.log('PASS empty/corrupt/encrypted reject');
 await page.locator('#file').setInputFiles({name:'race.pdf',mimeType:'application/pdf',buffer:data});await page.locator('#pages').fill('1');
 await page.evaluate(()=>{const orig=HTMLCanvasElement.prototype.toBlob;window.entered=new Promise(r=>window.enter=r);window.held=new Promise(r=>window.resume=r);HTMLCanvasElement.prototype.toBlob=function(callback,...args){return orig.call(this,async blob=>{window.enter();await window.held;callback(blob)},...args)};window.restoreEncode=()=>HTMLCanvasElement.prototype.toBlob=orig});
 const beforeRace=await page.evaluate(()=>window.downloadClicks||0);await page.locator('#start').click();await page.evaluate(()=>window.entered);await page.locator('#pages').fill('2');await page.evaluate(async()=>{window.resume();await window.jobDone;window.restoreEncode()});assert.equal(await page.evaluate(()=>window.downloadClicks||0),beforeRace);assert.match(await page.locator('#status').textContent(),/Pilihan berubah/);console.log('PASS settings change after real toBlob suppresses obsolete download');
 const [recovery]=await Promise.all([page.waitForEvent('download'),page.locator('#start').click()]);await recovery.saveAs(path.join(out,'recovery.zip'));await page.evaluate(()=>window.jobDone);console.log('PASS actual recovery ZIP');
 for(const [name,count,width,height,selection] of [['page-budget',1,2001,2000,'1'],['total-budget',8,2000,2000,'1-8'],['selection-budget',31,10,10,'1-31'],['document-budget',101,10,10,'1']]){const p=await PDFLib.PDFDocument.create();for(let i=0;i<count;i++)p.addPage([width,height]);await page.locator('#file').setInputFiles({name:name+'.pdf',mimeType:'application/pdf',buffer:Buffer.from(await p.save())});await page.locator('#pages').fill(selection);await page.evaluate(()=>{window.canvasCount=0;const orig=document.createElement.bind(document);window.restoreCreate=()=>document.createElement=orig;document.createElement=function(tag,...args){if(tag.toLowerCase()==='canvas')window.canvasCount++;return orig(tag,...args)}});const before=await page.evaluate(()=>window.downloadClicks||0);await page.locator('#start').click();await page.evaluate(()=>window.jobDone);assert.match(await page.locator('#status').textContent(),/Gagal/);assert.equal(await page.evaluate(()=>window.downloadClicks||0),before);assert.equal(await page.evaluate(()=>window.canvasCount),0,'budget rejected before canvas creation');await page.evaluate(()=>window.restoreCreate());console.log('PASS real PDF budget before canvas',name);}
 await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);assert.equal(await page.locator('a[href="pdf-ke-gambar.html"]').count(),1,'catalog card');await page.goto(`http://127.0.0.1:${server.address().port}/pdf-ke-gambar.html`);
 await page.route('https://cdn.jsdelivr.net/**',route=>route.abort());await page.reload();await page.locator('#file').setInputFiles({name:'valid.pdf',mimeType:'application/pdf',buffer:data});await page.locator('#start').click();await page.evaluate(()=>window.jobDone);assert.match(await page.locator('#status').textContent(),/Gagal/);await page.unroute('https://cdn.jsdelivr.net/**');console.log('PASS CDN failure visible');
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);console.log('PASS mobile viewport no horizontal overflow');
 fs.writeFileSync(path.join(out,'browser-observations.json'),JSON.stringify({tls:'normal',formats:['png','jpeg'],pages:[3,1],real_pdfjs:true},null,2));
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
