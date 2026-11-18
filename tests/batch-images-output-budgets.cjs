'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=process.cwd(),out=process.env.OUTPUT_DIR;assert.ok(out);fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');res.end(b)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});const p=await browser.newPage({acceptDownloads:true});let downloads=0;p.on('download',()=>downloads++);
  await p.goto(`http://127.0.0.1:${server.address().port}/batch-gambar.html`);
  await p.evaluate(async()=>{
   const c=document.createElement('canvas');c.width=8;c.height=6;const ctx=c.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,8,6);
   window.fixture=new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer());
   const decode=window.createImageBitmap;window.decodes=0;window.createImageBitmap=(...args)=>{window.decodes++;return decode(...args)};
   const click=HTMLAnchorElement.prototype.click;window.anchors=0;HTMLAnchorElement.prototype.click=function(){if(this.download)window.anchors++;return click.call(this)};
   const toBlob=HTMLCanvasElement.prototype.toBlob;window.outputSizes=[];
   // Real canvas encoding, padded valid PNG bytes with exact actual Blob.size.
   // Not a full-size rasterization or low-memory test.
   HTMLCanvasElement.prototype.toBlob=function(callback,...args){return toBlob.call(this,async blob=>{if(!blob)return callback(blob);const size=window.outputSizes.shift();if(size===undefined)return callback(blob);const data=new Uint8Array(size);data.set(new Uint8Array(await blob.arrayBuffer()));callback(new Blob([data],{type:blob.type}))},...args)};
  });
  async function run(inputSizes,outputSizes=[],declared=null){return p.evaluate(async({inputSizes,outputSizes,declared})=>{
   window.decodes=0;window.anchors=0;window.outputSizes=[...outputSizes];const dt=new DataTransfer();
   for(const size of inputSizes){const bytes=new Uint8Array(size);if(size)bytes.set(window.fixture);const f=new File([bytes],'red.png',{type:'image/png'});if(declared!==null)Object.defineProperty(f,'size',{value:declared});dt.items.add(f)}
   document.getElementById('files').files=dt.files;document.getElementById('files').dispatchEvent(new Event('change'));await document.getElementById('start').onclick();
   return {status:document.getElementById('status').textContent,decodes:window.decodes,anchors:window.anchors,startDisabled:document.getElementById('start').disabled,cancelDisabled:document.getElementById('cancel').disabled};
  },{inputSizes,outputSizes,declared})}
  const MiB=1024*1024,results=[];
  async function reject(label,args,message,decodes){const before=downloads,r=await run(...args);assert.match(r.status,message,label);assert.equal(r.decodes,decodes,label);assert.equal(r.anchors,0,label);assert.equal(downloads,before,label);assert.equal(r.startDisabled,false);assert.equal(r.cancelDisabled,true);results.push({label,...r});console.log('PASS',label)}
  async function accept(label,args,file,decodes){const next=p.waitForEvent('download');const r=await run(...args);assert.match(r.status,/Selesai/,label);assert.equal(r.decodes,decodes);assert.equal(r.anchors,1);await(await next).saveAs(path.join(out,file));results.push({label,...r});console.log('PASS',label)}
  await reject('empty actual buffer with positive declared size',[[0],[],100],/Ukuran data tidak valid/,0);
  await accept('actual input exactly 10 MiB',[[10*MiB],[],100],'input-exact.zip',1);
  await reject('actual input 10 MiB plus one',[[10*MiB+1],[],100],/Ukuran data tidak valid/,0);
  await accept('encoded aggregate exactly 32 MiB',[[1000,1000],[16*MiB,16*MiB]],'encoded-exact.zip',2);
  await reject('encoded aggregate 32 MiB plus one',[[1000,1000],[16*MiB,16*MiB+1]],/Hasil melebihi 32 MiB/,2);
  await reject('single encoded image 32 MiB plus one',[[1000],[32*MiB+1]],/Hasil melebihi 32 MiB/,1);
  await accept('ordinary encoding recovery after rejection',[[1000]],'recovery.zip',1);
  // ZIP 40 MiB is unreachable through current 32 MiB UI encoded budget with
  // <=20 short ASCII names. Exercise the real packer directly, not UI capacity.
  const zipDownload=p.waitForEvent('download');
  const zipResult=await p.evaluate(async()=>{
   const name='payload.bin',max=40*1024*1024,overhead=22+76+2*new TextEncoder().encode(name).length;
   const exact=zip([{name,bytes:new Uint8Array(max-overhead)}]);let error='';try{zip([{name,bytes:new Uint8Array(max-overhead+1)}])}catch(e){error=e.message}
   const a=document.createElement('a');a.download='zip-exact.zip';a.href=URL.createObjectURL(exact);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
   return {size:exact.size,error,overhead};
  });
  await(await zipDownload).saveAs(path.join(out,'zip-exact.zip'));
  assert.equal(zipResult.size,40*MiB);assert.equal(zipResult.error,'ZIP melebihi 40 MiB');results.push({label:'direct ZIP exact/one-over',...zipResult});console.log('PASS direct real ZIP exact 40 MiB and one-over overhead accounting');
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
  const body=await p.locator('body').innerText();assert.match(body,/hasil encoding maksimum 32 MiB/i,'UI must disclose encoded output budget');assert.match(body,/ZIP maksimum 40 MiB termasuk header/i,'UI must disclose ZIP overhead budget');
  assert.match(body,/encoding dan pengemasan tetap dapat gagal/);assert.match(body,/tidak menjamin perangkat tidak kehabisan memori/);
  console.log('PASS output budget disclosure and limitations');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
