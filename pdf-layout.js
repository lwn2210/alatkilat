// Conservative alignment heuristic: contiguous rows, 2–6 consistently aligned columns.
function detectTables(items) {
 const lines=[];
 for(const item of items) {
  if(!item.str || !item.str.trim() || !item.transform) continue;
  const x=item.transform[4], y=item.transform[5];
  if(!Number.isFinite(x)||!Number.isFinite(y)) continue;
  let line=lines.find(l=>Math.abs(l.y-y)<3);
  if(!line){line={y,items:[]};lines.push(line);}
  line.items.push({x,text:item.str.trim(),width:item.width||0});
 }
 lines.sort((a,b)=>b.y-a.y);
 for(const line of lines){
  line.items.sort((a,b)=>a.x-b.x);
  const cells=[];
  for(const part of line.items){const prev=cells[cells.length-1];if(prev && part.x-(prev.x+prev.width)<18){prev.text+=' '+part.text;prev.width=Math.max(prev.width,part.x+part.width-prev.x);}else cells.push({...part});}
  line.cells=cells;
 }
 const blocks=[];
 for(let i=0;i<lines.length;){
  const first=lines[i], cols=first.cells.length;let end=i+1;
  if(cols>=2&&cols<=6) while(end<lines.length && lines[end-1].y-lines[end].y<=40 && lines[end].cells.length===cols && lines[end].cells.every((c,j)=>Math.abs(c.x-first.cells[j].x)<=8)) end++;
  if(end-i>=3){blocks.push({type:'table',rows:lines.slice(i,end).map(l=>l.cells.map(c=>c.text))});i=end;}
  else {blocks.push({type:'text',text:first.cells.map(c=>c.text).join(' ')});i++;}
 }
 return blocks;
}
if(typeof module!=='undefined') module.exports={detectTables};
