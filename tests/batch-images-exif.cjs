const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=process.cwd(),out=process.env.OUTPUT_DIR;fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');res.end(b)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});const p=await browser.newPage({acceptDownloads:true});p.setDefaultTimeout(15000);
  assert.equal((await p.goto(`http://127.0.0.1:${server.address().port}/batch-gambar.html`)).status(),200);
  // Real JPEG pixels, asymmetric quadrants. APP1 TIFF orientation is metadata, not a decode mock.
  const raw=Buffer.from(await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=80;c.height=40;const x=c.getContext('2d');for(const [color,a,b] of [['red',0,0],['lime',40,0],['blue',0,20],['yellow',40,20]]){x.fillStyle=color;x.fillRect(a,b,40,20)}return [...new Uint8Array(await(await new Promise(r=>c.toBlob(r,'image/jpeg',1))).arrayBuffer())]}));
  function oriented(n,big=false){const payload=big?Buffer.from([69,120,105,102,0,0,77,77,0,42,0,0,0,8,0,1,1,18,0,3,0,0,0,1,0,n,0,0,0,0,0,0]):Buffer.from([69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,n,0,0,0,0,0,0,0]);const head=Buffer.alloc(4);head[0]=255;head[1]=225;head.writeUInt16BE(payload.length+2,2);return Buffer.concat([raw.subarray(0,2),head,payload,raw.subarray(2)])}
  for(let n=1;n<=8;n++)fs.writeFileSync(path.join(out,`source-${n}.jpg`),oriented(n));
  const errors=[];
  for(const big of [false,true])for(const max of [4096,50])for(const format of ['png','jpeg']){
   const tag=`${big?'be':'le'}-${max}-${format}`;
   for(let n=1;n<=8;n++)fs.writeFileSync(path.join(out,`source-${big?'be':'le'}-${n}.jpg`),oriented(n,big));
   await p.locator('#files').setInputFiles(Array.from({length:8},(_,i)=>({name:`orientation-${i+1}.jpg`,mimeType:'image/jpeg',buffer:oriented(i+1,big)})));
   await p.locator('#max').fill(String(max));await p.locator('#format').selectOption(format);await p.locator('#quality').fill('95');await p.locator('#prefix').fill('exif');
   // Await complete actual onclick handler, including failures; no fixed sleep or replacement decoder.
   await p.evaluate(()=>{const h=document.getElementById('start').onclick;document.getElementById('start').onclick=function(e){return window.batchFinished=h.call(this,e)}});
   const downloads=[];const onDownload=d=>downloads.push(d);p.on('download',onDownload);
   await p.locator('#start').click();await p.evaluate(()=>window.batchFinished);
   const status=await p.locator('#status').textContent();
   if(!/Selesai/.test(status)){errors.push(`${format}: ${status}`);p.off('download',onDownload);continue}
   const d=downloads[0]||await p.waitForEvent('download');await d.saveAs(path.join(out,`${tag}.zip`));p.off('download',onDownload);
   console.log('PASS actual EXIF 1-8 browser ZIP',tag,status);
  }
  assert.deepEqual(errors,[],'valid EXIF orientations must convert, including swapped 5-8 dimensions');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
