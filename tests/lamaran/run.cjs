/* Bounded portable acceptance: 1=failed assertion, 2=blocked infrastructure. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const out=process.env.LAMARAN_ARTIFACTS?path.resolve(process.env.LAMARAN_ARTIFACTS):path.join(root,'.artifacts',new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
if(fs.existsSync(path.join(out,'run.json')))throw new Error('Refusing to overwrite immutable run');
const report=(status,detail)=>fs.writeFileSync(path.join(out,'run.json'),JSON.stringify({status,detail,artifacts:out},null,2));
try{require.resolve('playwright')}catch(e){report('blocked','Install dev dependencies: npm install; npx playwright install chromium');console.error(e.message);process.exit(2)}
const server=http.createServer((req,res)=>{let file;try{file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400).end();return}
 if(file===root)file=path.join(root,'index.html');
 if(!file.startsWith(root+path.sep)||file.includes(path.sep+'.git')||file.includes(path.sep+'node_modules')){res.writeHead(403).end();return}
 if(file===root+path.sep||file===root)file=path.join(root,'index.html');
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return}const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json'})[ext]||'application/octet-stream');res.end(data)});
});
server.listen(0,'127.0.0.1',()=>{
 const env={...process.env,LAMARAN_ARTIFACTS:out,LAMARAN_BASE_URL:`http://127.0.0.1:${server.address().port}/`};
 const suite=process.env.LAMARAN_SUITE||(process.argv.includes('--budgets')?'budgets':'acceptance');
 env.LAMARAN_SUITE=suite;
 const ids=suite==='budgets'?['B01-header-predecode','B02-pdf-pages','B03-total-pixels','B05-accounting-integration','B04-ux']:['T01','T02','T03','T04','T05','T06-pdf','T06-png','T06-jpeg','T07','T08','T09','T10',...['name','limit','reorder','remove','upload'].map(x=>'T11-'+x),'T12','T13','T14','T15','T16-320','T16-390','T17','E01','E02','T18','T19'];
 let expected;
 try {
   if(!['acceptance','budgets'].includes(suite))throw new Error('Unknown suite');
   const filter=process.env.LAMARAN_FILTER?new RegExp(process.env.LAMARAN_FILTER):null;
   const selected=ids.filter(id=>!filter||filter.test(id));
   if(!selected.length||selected.every(id=>id==='T01'))throw new Error('Filter selects no acceptance assertions');
   expected=ids.filter(id=>selected.includes(id)||(suite==='acceptance'&&id==='T01'));
 } catch(e){report('blocked',e.message);server.close();process.exitCode=2;return}
 const script=suite==='budgets'?'budgets.cjs':'acceptance.cjs';
 const child=spawn(process.execPath,[path.join(__dirname,script)],{env,stdio:['ignore','pipe','pipe']});
 const log=fs.createWriteStream(path.join(out,'execution.log'),{flags:'wx'});
 for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{log.write(b);process.stdout.write(b)});
 let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL')},Number(process.env.LAMARAN_TIMEOUT_MS||240000));
 child.on('error',e=>{clearTimeout(timer);report('blocked',e.message);log.end();server.close();process.exitCode=2});
 child.on('exit',(code,signal)=>{clearTimeout(timer);let status=timedOut||code===2||signal?'blocked':code===0?'pass':'fail',evidenceError;
   if(status==='pass')try{const r=JSON.parse(fs.readFileSync(path.join(out,'results.json')));const actual=r.results.map(x=>x.id);if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Missing/unexpected test IDs');if(r.results.some(x=>x.status!=='pass')||r.pageErrors?.length)throw new Error('Results contain failures');}catch(e){evidenceError=e.message;status='fail'}
   report(status,{exitCode:code,signal,timedOut,expected,evidenceError});log.end();server.close();process.exitCode=status==='pass'?0:status==='fail'?1:2});
});
