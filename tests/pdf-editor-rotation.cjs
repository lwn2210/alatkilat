const assert = require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const PDFLib=require(process.env.PDF_LIB_PATH);
(async()=>{
 const {transformPdf}=await import(pathToFileURL(require('node:path').resolve('pdf-editor-core.mjs')));
 const input=await PDFLib.PDFDocument.create(); input.addPage([200,300]); const bytes=await input.save();
 const calls=[]; const original=PDFLib.PDFPage.prototype.drawText;
 PDFLib.PDFPage.prototype.drawText=function(t,o){calls.push({t,...o});return original.call(this,t,o)};
 try {
  for(const rotation of [0,90,180,270]) {
   calls.length=0; const out=await transformPdf(PDFLib,bytes,[{index:0,rotation}],{numbers:true,watermark:'DRAFT'});
   const doc=await PDFLib.PDFDocument.load(out); assert.equal(doc.getPage(0).getRotation().angle,rotation);
   const n=calls.find(c=>c.t==='1'), w=calls.find(c=>c.t==='DRAFT');
   const visual=({x,y})=>rotation===0?[x,y]:rotation===90?[y,200-x]:rotation===180?[200-x,300-y]:[300-y,x];
   const [nx,ny]=visual(n), [wx,wy]=visual(w);
   assert.ok(Math.abs(nx-(rotation%180?300:200)/2)<1,`number x rotation ${rotation}: ${nx}`);
   assert.ok(Math.abs(ny-16)<1,`number y rotation ${rotation}: ${ny}`);
   assert.ok(Math.abs(wx-15)<1 && Math.abs(wy-(rotation%180?200:300)/2)<1,`watermark rotation ${rotation}: ${wx},${wy}`);
   assert.equal((n.rotate?.angle||0),rotation); assert.equal((w.rotate?.angle||0),rotation);
  }
  console.log('PASS visual overlay placement all rotations and real output');
 }finally{PDFLib.PDFPage.prototype.drawText=original;}
})().catch(e=>{console.error(e);process.exitCode=1});
