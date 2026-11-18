const {test}=require('node:test'),assert=require('node:assert/strict');
const resources=require('../../lamaran-resources.js');
test('total accounted resource budget accepts exactly 512 MiB and refuses one more byte atomically',()=>{
 assert.equal(typeof resources.newBudget,'function','Resource accounting must be implemented');
 const b=resources.newBudget(0);b.reserve(512*1024*1024);assert.equal(b.used,512*1024*1024);assert.throws(()=>b.reserve(1),/512 MiB/);assert.equal(b.used,512*1024*1024);
});
test('input, decoded image workspaces, normalized bytes and PDF resources share the same accounting',()=>{
 const b=resources.newBudget(1000);assert.equal(b.used,2000);b.image(100);assert.equal(b.used,3200);b.normalized(1000);assert.equal(b.used,5200);b.pdf(2,3,40);assert.equal(b.used,5200+2*65536+3*1024+40);
 assert.throws(()=>b.reserve(-1));assert.throws(()=>b.reserve(Infinity));
});
