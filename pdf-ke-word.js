const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['file','mode','language','start','cancel','reset','status','progress','preview','download'].map(x => [x,$(x)]));
const PDF_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.min.mjs';
const WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/build/pdf.worker.min.mjs';
let generation = 0, editRevision = 0, active = null, outputName = '', pageImages = [];
ui.preview.addEventListener('input', e=>{if(e.target.matches('textarea, table input')) editRevision++;});
function status(text){ ui.status.textContent = text; }
function clearOutput(){ui.preview.replaceChildren();ui.download.disabled=true;outputName='';pageImages=[];ui.progress.value=0;const s=$('summary');if(s)s.textContent='';}
function stop(){ generation++; const job=active; active=null; if(job){if(job.cancelInit)job.cancelInit(); if(job.render) job.render.cancel(); if(job.task) job.task.destroy().catch(()=>{}); if(job.worker) job.worker.terminate().catch(()=>{});} ui.cancel.disabled=true; ui.start.disabled=false; }
async function initializeOcrWorker(job,language,options,token){
 let timer,abandoned=false;
 const pending=Tesseract.createWorker(language,1,options);
 pending.then(worker=>{if(abandoned)worker.terminate().catch(()=>{});},()=>{});
 try{
  const worker=await Promise.race([pending,new Promise((_,reject)=>{
   job.cancelInit=()=>{abandoned=true;reject(new DOMException('Dibatalkan','AbortError'));};
   timer=setTimeout(()=>{abandoned=true;reject(Error('Model OCR gagal dimuat atau waktu koneksi habis'));},15000);
  })]);
  if(token!==generation){await worker.terminate();check(token);}
  return worker;
 }finally{clearTimeout(timer);delete job.cancelInit;}
}
function check(token){if(token!==generation) throw new DOMException('Dibatalkan','AbortError');}
ui.file.addEventListener('change',()=>{stop();clearOutput();status('Berkas dipilih. Tekan Proses PDF.');});
for(const control of [ui.mode,ui.language])control.addEventListener('change',()=>{stop();clearOutput();status('Pengaturan berubah. Tekan Proses PDF untuk memperbarui hasil.');});
ui.reset.addEventListener('click',()=>{stop();clearOutput();ui.file.value='';status('Pilih berkas untuk memulai.');});
ui.cancel.addEventListener('click',()=>{stop();clearOutput();status('Proses dibatalkan.');});
ui.start.addEventListener('click', async()=>{
 stop();clearOutput();const token=generation;const file=ui.file.files[0];const mode=ui.mode.value, language=ui.language.value;
 if(!file || !file.size || file.size>20*1024*1024){status('Pilih PDF tidak kosong, maksimal 20 MB.');return;}
 const job={}; active=job;ui.start.disabled=true;ui.cancel.disabled=false;
 try{
  status('Memuat pustaka PDF…');const pdfjs=await import(PDF_URL);check(token);pdfjs.GlobalWorkerOptions.workerSrc=WORKER_URL;
  const data=await file.arrayBuffer();check(token);job.task=pdfjs.getDocument({data,isEvalSupported:false});
  const pdf=await job.task.promise;check(token);if(pdf.numPages>50)throw Error('PDF melebihi batas 50 halaman.');
  const pages=[]; job.images=[]; let pixelTotal=0; const summaries=[];
  for(let i=1;i<=pdf.numPages;i++){
   check(token);status(`Memproses halaman ${i} dari ${pdf.numPages}…`);const page=await pdf.getPage(i);
   try { check(token);
   const content=await page.getTextContent();check(token);const ops=await page.getOperatorList();check(token);const imageOps=new Set([pdfjs.OPS.paintImageXObject,pdfjs.OPS.paintInlineImageXObject,pdfjs.OPS.paintImageMaskXObject,pdfjs.OPS.paintImageXObjectRepeat,pdfjs.OPS.paintImageMaskXObjectRepeat,pdfjs.OPS.paintInlineImageXObjectGroup,pdfjs.OPS.paintImageMaskXObjectGroup].filter(x=>x!==undefined));const imageCount=ops.fnArray.filter(x=>imageOps.has(x)).length;let ocrUsed=false;let text=content.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('').trim();
   if(mode==='force'||!text){
   ocrUsed=true;
    if(!window.Tesseract)throw Error('Pustaka OCR gagal dimuat. Periksa koneksi dan muat ulang.');
    const base=page.getViewport({scale:1});let scale=Math.min(2,Math.sqrt(16000000/(base.width*base.height)));if(!Number.isFinite(scale)||scale<=0)throw Error('Ukuran halaman tidak valid.');const view=page.getViewport({scale});
    const width=Math.ceil(view.width),height=Math.ceil(view.height);if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0)throw Error('Ukuran halaman tidak valid.');if(width*height>16500000)throw Error('Halaman terlalu besar untuk OCR.');
    if(!job.worker){status('Mengunduh dan menyiapkan model OCR…');job.worker=await initializeOcrWorker(job,language,{logger:m=>{if(token===generation && m.status==='recognizing text')status(`OCR halaman ${i} dari ${pdf.numPages}: ${Math.round(m.progress*100)}%`);}},token);}
    const canvas=document.createElement('canvas');
    try {canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('Canvas tidak tersedia.');job.render=page.render({canvasContext:ctx,viewport:view});await job.render.promise;job.render=null;check(token);const result=await job.worker.recognize(canvas);check(token);text=result.data.text.trim();}
    finally {canvas.width=canvas.height=0;}
   }
   // Retain a bounded rendered copy so images and uncertain table structure remain visible.
   const vp0=page.getViewport({scale:1}), s=Math.min(1.2,Math.sqrt(2500000/(vp0.width*vp0.height)));const vp=page.getViewport({scale:s});
   const snapshotWidth=Math.ceil(vp.width),snapshotHeight=Math.ceil(vp.height),snapshotPixels=snapshotWidth*snapshotHeight;
   if(!Number.isSafeInteger(snapshotWidth)||!Number.isSafeInteger(snapshotHeight)||snapshotWidth<=0||snapshotHeight<=0||!Number.isSafeInteger(snapshotPixels))throw Error('Ukuran halaman tidak valid.');
   // 2.5MP target permits rounding, but never allocate beyond this 2.6MP ceiling.
   if(snapshotPixels>2600000)throw Error('Halaman terlalu besar untuk salinan visual.');
   if(pixelTotal+snapshotPixels>30000000)throw Error('Total ukuran render melampaui batas 30 megapiksel; bagi PDF menjadi bagian lebih kecil.');
   pixelTotal+=snapshotPixels;
   const snapshot=document.createElement('canvas');
   try {snapshot.width=snapshotWidth;snapshot.height=snapshotHeight;
   job.render=page.render({canvasContext:snapshot.getContext('2d',{alpha:false}),viewport:vp});await job.render.promise;job.render=null;check(token);const png=await new Promise(resolve=>snapshot.toBlob(resolve,'image/png'));check(token);if(!png)throw Error('Gagal menyimpan gambar halaman.');job.images.push({bytes:new Uint8Array(await png.arrayBuffer()),width:snapshot.width,height:snapshot.height});check(token);}
   finally {snapshot.width=snapshot.height=0;}
   const blocks=ocrUsed?[{type:'text',text}]:detectTables(content.items);const tables=blocks.filter(b=>b.type==='table').length;
   summaries.push(`Halaman ${i}: ${imageCount} operasi gambar PDF; ${tables} kandidat tabel digital. ${ocrUsed?'OCR: tabel scan tidak dikenali sebagai sel. ':''}Tata letak tidak pasti; periksa salinan visual.`);
   pages.push(blocks);ui.progress.value=i/pdf.numPages*100;
   } finally {page.cleanup();}
  }
  check(token);pageImages=job.images;$('summary').textContent=summaries.join('\n');pages.forEach((blocks,i)=>{const section=document.createElement('section');section.dataset.page=String(i);const heading=document.createElement('h2');heading.textContent=`Halaman ${i+1}`;section.append(heading);for(const block of blocks){if(block.type==='table'){const label=document.createElement('p');label.textContent='Kandidat tabel — periksa dan edit sel:';section.append(label);const table=document.createElement('table');table.dataset.block='table';for(const row of block.rows){const tr=document.createElement('tr');for(const cell of row){const td=document.createElement('td'),input=document.createElement('input');input.value=cell;td.append(input);tr.append(td);}table.append(tr);}section.append(table);}else{const area=document.createElement('textarea');area.dataset.block='text';area.value=block.text;area.style.minHeight='4em';section.append(area);}}ui.preview.append(section);});outputName=file.name.replace(/\.pdf$/i,'').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100)||'dokumen';ui.download.disabled=false;status('Selesai. Periksa dan edit teks sebelum mengunduh.');
 }catch(e){if(token===generation){clearOutput();const msg=e.name==='PasswordException'?'PDF terkunci atau terenkripsi; buka kuncinya terlebih dahulu.':e.message||'Kesalahan tidak diketahui';status(`Gagal memproses PDF: ${msg}. Pastikan PDF valid dan koneksi pustaka tersedia.`);}}
 finally{if(job.worker) await job.worker.terminate().catch(()=>{});if(job.task) await job.task.destroy().catch(()=>{});if(token===generation){active=null;ui.start.disabled=false;ui.cancel.disabled=true;}}
});
ui.download.addEventListener('click',async()=>{
 if(!outputName)return;const token=generation, revision=editRevision;
 try{if(!window.docx)throw Error('Pustaka DOCX gagal dimuat. Periksa koneksi dan muat ulang.');ui.download.disabled=true;const sections=[...ui.preview.querySelectorAll('section')];const clean=s=>s.replace(/[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu,'');
 const children=[];sections.forEach((section,i)=>{if(i)children.push(new docx.Paragraph({children:[new docx.PageBreak()]}));for(const block of section.querySelectorAll('[data-block]')){if(block.dataset.block==='table'){children.push(new docx.Table({rows:[...block.querySelectorAll('tr')].map(row=>new docx.TableRow({children:[...row.querySelectorAll('input')].map(cell=>new docx.TableCell({children:[new docx.Paragraph(clean(cell.value))]}))}))}));}else for(const line of clean(block.value).split(/\r?\n/))children.push(new docx.Paragraph({children:[new docx.TextRun(line)]}));}const image=pageImages[i];if(image){const ratio=Math.min(580/image.width,700/image.height,1);children.push(new docx.Paragraph({children:[new docx.TextRun('Salinan visual halaman asli (gambar dan tabel):')]}));children.push(new docx.Paragraph({children:[new docx.ImageRun({data:image.bytes,transformation:{width:Math.max(1,Math.round(image.width*ratio)),height:Math.max(1,Math.round(image.height*ratio))}})]}));}});
 const blob=await docx.Packer.toBlob(new docx.Document({sections:[{children}]}));check(token);if(revision!==editRevision){status('Pratinjau berubah saat DOCX dibuat. Unduh lagi untuk menyertakan perubahan.');return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=outputName+'.docx';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);status('DOCX siap diunduh.');
 }catch(e){if(token===generation)status('Gagal membuat DOCX: '+e.message);}finally{if(token===generation)ui.download.disabled=false;}
});
