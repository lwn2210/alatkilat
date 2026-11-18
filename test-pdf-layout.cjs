const assert = require('node:assert/strict');
const {detectTables} = require('./pdf-layout.js');
const item=(str,x,y)=>({str,transform:[1,0,0,1,x,y],width:30});
const blocks=detectTables([item('Heading',30,740),item('Name',50,700),item('Amount',250,700),item('Alpha',50,680),item('10',250,680),item('Beta',50,660),item('20',250,660),item('End',30,620)]);
assert.deepEqual(blocks.map(b=>b.type),['text','table','text']);
assert.deepEqual(blocks[1].rows,[['Name','Amount'],['Alpha','10'],['Beta','20']]);
assert.equal(detectTables([item('A',50,700),item('B',250,700),item('C',60,680)])[0].type,'text');
console.log('PASS aligned table and ambiguous fallback');
