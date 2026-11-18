'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=process.cwd(),out=process.env.OUTPUT_DIR;
 assert.ok(out,'OUTPUT_DIR required');fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');res.end(b)});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
  const p=await browser.newPage({acceptDownloads:true});let downloads=0;
  p.on('download',()=>downloads++);
  await p.goto(`http://127.0.0.1:${server.address().port}/batch-gambar.html`);
  await p.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=8;canvas.height=6;
   const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,8,6);
   window.fixture=new Uint8Array(await (await new Promise(r=>canvas.toBlob(r,'image/png'))).arrayBuffer());
   const decode=window.createImageBitmap;window.decodeCalls=0;
   window.createImageBitmap=(...args)=>{window.decodeCalls++;return decode(...args)};
   const click=HTMLAnchorElement.prototype.click;window.anchorClicks=0;
   HTMLAnchorElement.prototype.click=function(){if(this.download)window.anchorClicks++;return click.call(this)};
  });
  async function run(sizes,declared,corruptLast=false){
   return p.evaluate(async({sizes,declared,corruptLast})=>{
    window.decodeCalls=0;window.anchorClicks=0;
    const transfer=new DataTransfer();
    sizes.forEach((size,i)=>{const bytes=new Uint8Array(size);bytes.set(window.fixture);if(corruptLast&&i===sizes.length-1)bytes[0]=0;const f=new File([bytes],`fixture-${i}.png`,{type:'image/png'});if(declared!==null)Object.defineProperty(f,'size',{value:declared});transfer.items.add(f)});
    document.getElementById('files').files=transfer.files;
    document.getElementById('files').dispatchEvent(new Event('change'));
    await document.getElementById('start').onclick();
    return {status:document.getElementById('status').textContent,decodes:window.decodeCalls,anchors:window.anchorClicks,cancelDisabled:document.getElementById('cancel').disabled,startDisabled:document.getElementById('start').disabled};
   },{sizes,declared,corruptLast});
  }
  const MiB=1024*1024;
  // Only File.size is overridden. arrayBuffer contains actual zero-padded valid PNGs.
  const rejected=await run([8*MiB,8*MiB,8*MiB,6*MiB+1],100);
  fs.writeFileSync(path.join(out,'aggregate-one-over.json'),JSON.stringify(rejected,null,2));
  assert.match(rejected.status,/Batas ukuran berkas terlampaui/,'actual aggregate 30 MiB + 1 must reject');
  assert.equal(rejected.decodes,0,'reject actual aggregate before any image decode');
  assert.equal(rejected.anchors,0);assert.equal(downloads,0);assert.equal(rejected.cancelDisabled,true);assert.equal(rejected.startDisabled,false);
  console.log('PASS actual aggregate 30 MiB + 1 rejects before decode (File.size seam)');
  const corruptOver=await run([8*MiB,8*MiB,8*MiB,6*MiB+1],100,true);
  assert.match(corruptOver.status,/Batas ukuran berkas terlampaui/,'aggregate guard must precede rejected file header parse');assert.equal(corruptOver.decodes,0);assert.equal(corruptOver.anchors,0);
  console.log('PASS actual aggregate guard precedes corrupt final header parsing');
  const declaredAggregate=await run([1000,1000,1000,1000],8*MiB);
  assert.match(declaredAggregate.status,/Batas ukuran berkas terlampaui/);assert.equal(declaredAggregate.decodes,0);assert.equal(declaredAggregate.anchors,0);
  console.log('PASS declared aggregate oversized inputs reject before decode');
  const perFile=await run([10*MiB+1],100);
  assert.match(perFile.status,/Ukuran data tidak valid/);assert.equal(perFile.decodes,0);assert.equal(perFile.anchors,0);
  console.log('PASS actual per-file 10 MiB + 1 rejects before decode');
  const declared=await run([1000],31*MiB);
  assert.match(declared.status,/Batas ukuran berkas terlampaui/);assert.equal(declared.decodes,0);assert.equal(declared.anchors,0);
  console.log('PASS declared oversized input rejected before decode');
  const download=p.waitForEvent('download');
  const accepted=await run([8*MiB,8*MiB,8*MiB,6*MiB],100);
  assert.match(accepted.status,/Selesai/);assert.equal(accepted.decodes,4);assert.equal(accepted.anchors,1);
  await (await download).saveAs(path.join(out,'exact-30MiB.zip'));
  fs.writeFileSync(path.join(out,'exact-30MiB.json'),JSON.stringify(accepted,null,2));
  console.log('PASS actual aggregate exactly 30 MiB recovered and downloaded real ZIP');
  const next=p.waitForEvent('download');const recovery=await run([1000],null);
  assert.match(recovery.status,/Selesai/);assert.equal(recovery.decodes,1);
  await (await next).saveAs(path.join(out,'small-recovery.zip'));
  console.log('PASS ordinary unmodified File.size PNG recovery download');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
