const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const elements=new Map(),context=vm.createContext({document:{getElementById(id){if(!elements.has(id))elements.set(id,{addEventListener(){}});return elements.get(id)}},TextEncoder,Blob});
vm.runInContext(fs.readFileSync('batch-gambar.js','utf8'),context);
function jpeg(big,n){const t=Buffer.alloc(26);t.write(big?'MM':'II',0);if(big){t.writeUInt16BE(42,2);t.writeUInt32BE(8,4);t.writeUInt16BE(1,8);t.writeUInt16BE(274,10);t.writeUInt16BE(3,12);t.writeUInt32BE(1,14);t.writeUInt16BE(n,18)}else{t.writeUInt16LE(42,2);t.writeUInt32LE(8,4);t.writeUInt16LE(1,8);t.writeUInt16LE(274,10);t.writeUInt16LE(3,12);t.writeUInt32LE(1,14);t.writeUInt16LE(n,18)}const payload=Buffer.concat([Buffer.from('Exif\0\0'),t]),h=Buffer.from([255,216,255,225,0,payload.length+2]);return Buffer.concat([h,payload,Buffer.from([255,217])])}
for(const be of [false,true]){
 for(let n=1;n<=8;n++)assert.equal(context.jpegOrientation(jpeg(be,n)),n);
 for(const n of [0,9,65535])assert.equal(context.jpegOrientation(jpeg(be,n)),1);
 const valid=jpeg(be,6);
 for(let end=0;end<valid.length-2;end++)assert.equal(context.jpegOrientation(valid.subarray(0,end)),1,'truncated segment');
 for(const [offset,width,value] of [[14,4,0xffffffff],[14,4,0],[20,2,65535],[24,4,2]]){
  const b=Buffer.from(valid);const method=`writeUInt${width*8}${be?'BE':'LE'}`;b[method](value,offset);assert.equal(context.jpegOrientation(b),1,'invalid offset/count/type count');
 }
}
for(const bytes of [Buffer.alloc(0),Buffer.from([137,80,78,71]),Buffer.from([255,216,255,225,0,1]),Buffer.from([255,216,0,0,0,0])])assert.equal(context.jpegOrientation(bytes),1);
console.log('PASS bounded EXIF parser valid LE/BE orientations, invalid values, truncated metadata and IFD offset/count guards; synthetic metadata unit scope only');
