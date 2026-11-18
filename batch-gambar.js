'use strict';
const $=id=>document.getElementById(id);let revision=0;
class Obsolete extends Error{}
function valid(n){if(n!==revision)throw new Obsolete()}
function invalidate(){revision++;$('start').disabled=false;$('cancel').disabled=true}
for(const id of ['files','max','format','quality','prefix'])$(id).addEventListener(id==='files'||id==='format'?'change':'input',()=>{invalidate();$('status').textContent='Pilihan berubah.'});
$('cancel').onclick=()=>{invalidate();$('status').textContent='Dibatalkan.'};
function dimensions(b){const v=new DataView(b.buffer,b.byteOffset,b.byteLength);if(b.length>=24&&[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x)&&String.fromCharCode(...b.slice(12,16))==='IHDR')return [v.getUint32(16),v.getUint32(20)];if(b.length>=4&&b[0]===255&&b[1]===216){let i=2;while(i+4<=b.length){if(b[i++]!==255)throw Error('JPEG rusak');while(b[i]===255)i++;const m=b[i++];if(m===217||m===218)break;if(m===1||(m>=208&&m<=215))continue;if(i+2>b.length)break;const len=v.getUint16(i);if(len<2||i+len>b.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(m)){if(len<7)break;return [v.getUint16(i+5),v.getUint16(i+3)]}i+=len}}throw Error('PNG/JPEG rusak atau tidak didukung')}
// Browser image decoding applies JPEG EXIF orientation; only 5–8 swap the
// header dimensions. Read bounded TIFF metadata before retaining decode checks.
function jpegOrientation(bytes){
 if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)return 1;
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let i=2;
 while(i+4<=bytes.length){
  if(bytes[i++]!==255)return 1;while(bytes[i]===255)i++;
  const marker=bytes[i++];if(marker===217||marker===218)return 1;
  if(marker===1||(marker>=208&&marker<=215))continue;
  if(i+2>bytes.length)return 1;const length=v.getUint16(i),end=i+length,start=i+2;
  if(length<2||end>bytes.length)return 1;
  if(marker===225&&length>=16&&[69,120,105,102,0,0].every((x,n)=>bytes[start+n]===x)){
   const t=start+6,le=bytes[t]===73&&bytes[t+1]===73,be=bytes[t]===77&&bytes[t+1]===77;
   if((!le&&!be)||v.getUint16(t+2,le)!==42)return 1;
   const ifd=t+v.getUint32(t+4,le);if(ifd<t+8||ifd+2>end)return 1;
   const count=v.getUint16(ifd,le);if(ifd+2+count*12>end)return 1;
   for(let n=0;n<count;n++){
    const e=ifd+2+n*12;
    if(v.getUint16(e,le)===274&&v.getUint16(e+2,le)===3&&v.getUint32(e+4,le)===1){
     const value=v.getUint16(e+8,le);return value>=1&&value<=8?value:1;
    }
   }
  }
  i=end;
 }
 return 1;
}
function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return(c^0xffffffff)>>>0}
function zip(entries){let offset=0,size=0,local=[],central=[];for(const {name,bytes} of entries){const n=new TextEncoder().encode(name),crc=crc32(bytes),h=new Uint8Array(30+n.length),v=new DataView(h.buffer),d=new Uint8Array(46+n.length),w=new DataView(d.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,bytes.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,n.length,true);h.set(n,30);w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(14,33,true);w.setUint32(16,crc,true);w.setUint32(20,bytes.length,true);w.setUint32(24,bytes.length,true);w.setUint16(28,n.length,true);w.setUint32(42,offset,true);d.set(n,46);local.push(h,bytes);central.push(d);offset+=h.length+bytes.length;size+=d.length}if(offset+size+22>40*1024*1024)throw Error('ZIP melebihi 40 MiB');const e=new Uint8Array(22),v=new DataView(e.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);return new Blob([...local,...central,e],{type:'application/zip'})}
$('start').onclick=async()=>{invalidate();const job=revision,files=[...$('files').files],max=Number($('max').value),quality=Number($('quality').value),format=$('format').value,prefix=$('prefix').value.replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'gambar';$('start').disabled=true;$('cancel').disabled=false;try{if(!files.length||files.length>20)throw Error('Pilih 1–20 gambar');if(!Number.isInteger(max)||max<1||max>4096||!Number.isInteger(quality)||quality<1||quality>100||!['png','jpeg'].includes(format))throw Error('Pengaturan tidak valid');let total=0,actualTotal=0,pixels=0;const prepared=[];for(const f of files){if(!f.size||f.size>10*1024*1024||(total+=f.size)>30*1024*1024)throw Error('Batas ukuran berkas terlampaui');const bytes=new Uint8Array(await f.arrayBuffer());valid(job);if(!bytes.length||bytes.length>10*1024*1024)throw Error('Ukuran data tidak valid');if((actualTotal+=bytes.length)>30*1024*1024)throw Error('Batas ukuran berkas terlampaui');const [w,h]=dimensions(bytes),px=w*h;if(!w||!h||!Number.isSafeInteger(px)||px>16000000||(pixels+=px)>40000000)throw Error('Batas piksel terlampaui');const swapped=jpegOrientation(bytes)>=5;prepared.push({bytes,w:swapped?h:w,h:swapped?w:h})}const entries=[];let encoded=0;for(let i=0;i<prepared.length;i++){valid(job);$('status').textContent=`Memproses ${i+1}/${prepared.length}…`;let bitmap,canvas;try{const item=prepared[i];bitmap=await createImageBitmap(new Blob([item.bytes]));valid(job);if(bitmap.width!==item.w||bitmap.height!==item.h)throw Error('Dimensi hasil decode tidak cocok');const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');if(format==='jpeg'){ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height)}ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(r=>canvas.toBlob(r,'image/'+format,quality/100));valid(job);if(!blob||blob.type!=='image/'+format)throw Error('Encoding gagal');encoded+=blob.size;if(encoded>32*1024*1024)throw Error('Hasil melebihi 32 MiB');const bytes=new Uint8Array(await blob.arrayBuffer());valid(job);entries.push({name:`${prefix}-${String(i+1).padStart(3,'0')}.${format==='jpeg'?'jpg':'png'}`,bytes})}finally{bitmap?.close();if(canvas){canvas.width=0;canvas.height=0}}}valid(job);const url=URL.createObjectURL(zip(entries));try{valid(job);const a=document.createElement('a');a.href=url;a.download='hasil-gambar.zip';a.click();$('status').textContent='Selesai. ZIP diunduh.'}finally{setTimeout(()=>URL.revokeObjectURL(url),1000)}}catch(e){if(job===revision&&!(e instanceof Obsolete))$('status').textContent='Gagal: '+e.message}finally{if(job===revision){$('start').disabled=false;$('cancel').disabled=true}}};
