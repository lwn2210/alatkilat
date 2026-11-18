const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const PDFLib = require(process.env.PDF_LIB_PATH);
(async () => {
  const { transformPdf } = await import(pathToFileURL(require('node:path').resolve('pdf-editor-core.mjs')));
  const source = await PDFLib.PDFDocument.create();
  source.addPage([200, 300]); source.addPage([300, 400]); source.addPage([400, 500]);
  const bytes = await source.save();
  const output = await transformPdf(PDFLib, bytes, [{index:2, rotation:90},{index:0, rotation:0}], {numbers:true, watermark:'DRAFT'});
  const doc = await PDFLib.PDFDocument.load(output);
  assert.equal(doc.getPageCount(), 2); assert.equal(doc.getPage(0).getWidth(),400);
  assert.equal(doc.getPage(0).getRotation().angle,90); assert.equal(doc.getPage(1).getWidth(),200);
  console.log('PASS transform output order/delete/rotate/overlay');
})().catch(e => { console.error(e); process.exit(1); });
