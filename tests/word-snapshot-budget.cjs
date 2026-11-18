// Real PDF.js parsing; synthetic viewport/render/canvas seam avoids large allocations.
// This does not prove full-size rasterization, device canvas limits or low-memory safety.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const PDFLib=require(process.env.PDF_LIB_PATH||'pdf-lib');
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const realURL='https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.min.mjs';
(async()=>{
 const root=process.cwd(),out=process.env.OUTPUT_DIR;assert.ok(out);fs.mkdirSync(out,{recursive:true});
 const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(f,(e,b)=>{if(e){res.writeHead(404).end();return}res.setHeader('Content-Type',/\.(js|mjs)$/.test(f)?'text/javascript':'text/html');res.end(b)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser,failures=0;
 try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 const cases=[['one-over',2600001,1,1,false],['rounded-over',2000.01,1300,1,false],['zero',0,1300,1,false],['negative',-1,1300,1,false],['nonfinite',NaN,1300,1,false],['unsafe',Number.MAX_SAFE_INTEGER+1,1,1,false],['exact-page',2000,1300,1,true],['exact-total',1250,2000,12,true],['over-total',1250,2000,13,false]];
 for(const [name,width,height,count,accepted] of cases){const context=await browser.newContext(),p=await context.newPage();p.setDefaultTimeout(60000);
 try{
 const d=await PDFLib.PDFDocument.create();for(let i=0;i<count;i++)d.addPage([600,800]).drawText('DIGITAL SNAPSHOT PAGE '+i,{x:50,y:700,size:16});const bytes=Buffer.from(await d.save());
 await context.route(/\/pdfjs-dist@6\.4\.299\/build\/pdf\.min\.mjs$/,r=>r.fulfill({status:200,contentType:'text/javascript',body:`
 import * as real from '${realURL}?snapshot-budget-real=1';export * from '${realURL}?snapshot-budget-real=1';
 export function getDocument(...args){const task=real.getDocument(...args);return new Proxy(task,{get(t,k){if(k==='promise')return t.promise.then(pdf=>new Proxy(pdf,{get(d,key){if(key==='getPage')return async n=>{const pg=await d.getPage(n);window.observed.parsed++;let views=0;return new Proxy(pg,{get(page,field){if(field==='getViewport')return options=>{views++;return views===2?{width:${width},height:${height}}:page.getViewport(options)};if(field==='render')return ()=>{window.observed.rendered++;return {promise:Promise.resolve(),cancel(){}}};const v=Reflect.get(page,field,page);return typeof v==='function'?v.bind(page):v}})};const v=Reflect.get(d,key,d);return typeof v==='function'?v.bind(d):v}}));const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v}})}
 `}));
 await p.goto(`http://127.0.0.1:${server.address().port}/pdf-ke-word.html`);
 await p.evaluate(()=>{window.observed={parsed:0,rendered:0,allocations:[],canvases:[]};const create=document.createElement.bind(document);document.createElement=(tag,...args)=>{const el=create(tag,...args);if(tag==='canvas'){let w=0,h=0;window.observed.canvases.push(el);Object.defineProperties(el,{width:{get:()=>w,set:v=>{w=v;if(v)window.observed.allocations.push(['w',v])}},height:{get:()=>h,set:v=>{h=v;if(v)window.observed.allocations.push(['h',v])}}});el.getContext=()=>({});el.toBlob=cb=>cb(new Blob(['boundary-seam-only'],{type:'image/png'}))}return el}});
 await p.locator('#file').setInputFiles({name:name+'.pdf',mimeType:'application/pdf',buffer:bytes});await p.locator('#start').click();
 await p.waitForFunction(()=>!document.querySelector('#start').disabled && (!document.querySelector('#download').disabled||document.querySelector('#status').textContent.startsWith('Gagal')));
 const result=await p.evaluate(()=>({...window.observed,canvases:window.observed.canvases.map(c=>[c.width,c.height]),status:document.querySelector('#status').textContent,ready:!document.querySelector('#download').disabled}));
 fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(result,null,2));
 assert.equal(result.parsed,count,'real parser reached each requested page');
 const completed=accepted?count:name==='over-total'?12:0;
 assert.equal(result.allocations.length,completed*2,'reject before nonzero canvas dimension assignments');assert.equal(result.rendered,completed,'rejected page must not render');assert.equal(result.ready,accepted);
 if(!accepted)assert.match(result.status,/Ukuran halaman tidak valid|Halaman terlalu besar untuk salinan visual|30 megapiksel/);
 assert.ok(result.canvases.every(([w,h])=>w===0&&h===0),'all settled seam canvases released');console.log('PASS',name,JSON.stringify(result));
 }catch(e){failures++;console.error('FAIL',name,e.stack)}finally{await context.close()}}
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r))}console.log('RESULT snapshot budget failures',failures,'TLS NORMAL; parser real, viewport/render/canvas seam');process.exitCode=failures?1:0;
})().catch(e=>{console.error(e);process.exitCode=1});
