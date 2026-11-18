'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const root=process.cwd(),out=process.env.OUTPUT_DIR;assert(out);fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');res.end(b)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});const p=await browser.newPage({acceptDownloads:true});p.setDefaultTimeout(15000);
  await p.goto(`http://127.0.0.1:${server.address().port}/batch-gambar.html`);
  const fixtures=await p.evaluate(async()=>{
   async function bytes(c){return [...new Uint8Array(await (await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer())]}
   const c=document.createElement('canvas');c.width=64;c.height=32;const x=c.getContext('2d');x.fillStyle='red';x.fillRect(32,0,32,32);
   const n=document.createElement('canvas');n.width=256;n.height=192;const nx=n.getContext('2d'),img=nx.createImageData(256,192);let state=12345;
   for(let i=0;i<img.data.length;i+=4){for(let k=0;k<3;k++){state=(Math.imul(state,1664525)+1013904223)>>>0;img.data[i+k]=state>>>24}img.data[i+3]=255}nx.putImageData(img,0,0);
   return {transparent:await bytes(c),noise:await bytes(n)};
  });
  // Track the entire real async UI handler; gates below only control encoder failure.
  await p.evaluate(()=>{
   window.completed=null;const button=document.getElementById('start'),original=button.onclick;
   button.onclick=function(...args){window.completed=original.apply(this,args);return window.completed};
   const create=document.createElement.bind(document);window.resources=[];window.bitmaps=[];
   document.createElement=function(tag,...rest){const el=create(tag,...rest);if(tag==='canvas')window.resources.push(el);return el};
   const decode=window.createImageBitmap.bind(window);window.createImageBitmap=async(...args)=>{const b=await decode(...args),close=b.close.bind(b),entry={closed:false};window.bitmaps.push(entry);b.close=()=>{entry.closed=true;return close()};return b};
  });
  let downloads=0;p.on('download',()=>downloads++);
  async function upload(bytes,name='source.png'){await p.locator('#files').setInputFiles({name,mimeType:'image/png',buffer:Buffer.from(bytes)});await p.locator('#max').fill('4096');await p.locator('#prefix').fill('encoding')}
  async function run(name){const [d]=await Promise.all([p.waitForEvent('download'),p.locator('#start').click()]);await p.evaluate(()=>window.completed);await d.saveAs(path.join(out,name+'.zip'));assert.match(await p.locator('#status').textContent(),/Selesai/);await cleanup();}
  async function cleanup(){assert(await p.evaluate(()=>resources.every(c=>c.width===0&&c.height===0)&&bitmaps.every(b=>b.closed)),'settled processing canvas zero and bitmap.close invoked');assert.equal(await p.locator('#start').isDisabled(),false);assert.equal(await p.locator('#cancel').isDisabled(),true)}
  await upload(fixtures.transparent);await p.locator('#format').selectOption('png');await run('transparent-png');console.log('PASS PNG download + settled cleanup; dimensions/transparency require independent artifact verifier');
  await p.locator('#format').selectOption('jpeg');await p.locator('#quality').fill('95');await run('white-jpeg');console.log('PASS JPEG download + settled cleanup; white background requires independent artifact verifier');
  await upload(fixtures.noise);await p.locator('#quality').fill('10');await run('quality-low');await p.locator('#quality').fill('95');await run('quality-high');console.log('PASS actual JPEG low/high quality downloads');
  await upload(fixtures.transparent);await p.locator('#format').selectOption('png');const before=downloads;
  await p.evaluate(()=>{const old=HTMLCanvasElement.prototype.toBlob;window.restoreEncoder=()=>HTMLCanvasElement.prototype.toBlob=old;HTMLCanvasElement.prototype.toBlob=function(cb){queueMicrotask(()=>cb(null))}});
  await p.locator('#start').click();await p.evaluate(()=>window.completed);assert.match(await p.locator('#status').textContent(),/Gagal: Encoding gagal/);assert.equal(downloads,before);await cleanup();console.log('PASS controlled null encoder reports failure, no download, cleanup');
  await p.evaluate(()=>window.restoreEncoder());await run('null-recovery');console.log('PASS real PNG recovery after null encoder seam');
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({downloads,resourceCanvasCount:await p.evaluate(()=>resources.length),closedBitmaps:await p.evaluate(()=>bitmaps.length),scope:'Real encoder/artifacts except controlled null toBlob; cleanup instrumentation does not establish instantaneous memory release.'},null,2));assert.equal(downloads,5);
  assert.equal(await p.evaluate(()=>resources.length),6,'six actual processing canvas allocations');
  assert.equal(await p.evaluate(()=>bitmaps.length),6,'six actual bitmap decodes including failed encoding');
  assert.match(await p.locator('body').textContent(),/Transparansi dipertahankan pada PNG; JPEG memakai latar putih\./,'UI discloses lossy transparency conversion');
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
