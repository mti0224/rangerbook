const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');
const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name));
const hash=x=>createHash('sha256').update(x).digest('hex');
const metadata=JSON.parse(read('pwa-data.json'));
const manifest=JSON.parse(read('manifest.webmanifest'));
assert.equal(manifest.name,'LINE Rangers Database');assert.equal(manifest.short_name,'Rangerbook');
assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');
for(const icon of manifest.icons) {
 const bytes=read(icon.src),size=Number(icon.sizes.split('x')[0]);
 assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
}
assert.ok(manifest.icons.some(x=>x.purpose==='maskable'));
function walk(dir='') {return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.name.startsWith('.')||['node_modules','_site'].includes(e.name)?[]:e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const name of walk().filter(x=>x.endsWith('.html'))) {
 const html=read(name).toString();
 assert.ok(html.includes('assets/js/pwa-head.js'),name);
 if(name==='account-action/index.html')assert.ok(html.includes('window.RB_PRIVATE_PAGE=true'),'Token page disables analytics before shared shell');assert.ok(html.includes('viewport-fit=cover'),name);
}
const words=JSON.parse(read('assets/locales/pwa.json'));
for(const lang of ['zh-Hant','en','jp','th']) {
 assert.deepEqual(Object.keys(words[lang]),Object.keys(words.en));assert.ok(Object.values(words[lang]).every(x=>typeof x==='string'&&x.trim()));
}
for(const [name,entry] of Object.entries(metadata.files)) assert.equal(hash(read(name)),entry.hash,name);
assert.equal(hash(JSON.stringify(metadata.files)),metadata.dataVersion);
async function verifier() {
 let calls=[],events=[];
 const native=async input=>{const name=new URL(input,'https://test/').pathname.slice(1);calls.push(name);return new Response(read(name));};
 const ctx={window:{fetch:native,isSecureContext:true,dispatchEvent:e=>events.push(e)},document:{currentScript:{src:'https://test/assets/js/pwa-data.js'}},location:{href:'https://test/'},crypto:webcrypto,URL,Response,CustomEvent:class{constructor(type,init){Object.assign(this,init);}}};
 vm.runInNewContext(read('assets/js/pwa-data.js').toString(),ctx);
 assert.equal(calls.length,0,'No eager release or data download');
 assert.ok((await ctx.window.fetch('https://test/res/v2/abilities.json')).ok);
 await Promise.all([ctx.window.fetch('https://test/res/v2/abilities.json'),ctx.window.fetch('https://test/res/v2/abilities.json')]);
 assert.equal(calls.filter(name=>name==='res/v2/abilities.json').length,1,'Concurrent and repeated verified data reads share one transfer');
 assert.ok(calls.includes('pwa-data.json'));
 const beforeMetadata=calls.length;
 for(const name of ['resources','manifest','translation-audit'])assert.ok((await ctx.window.fetch('https://test/res/v2/'+name+'.json')).ok);
 assert.equal(calls.length,beforeMetadata+3,'Live operational metadata bypasses the pinned game snapshot');
 for(const name of ['resources','manifest','translation-audit'])assert.ok(!metadata.files['res/v2/'+name+'.json'],'Polling metadata must not create game-data releases');
 const bad={...metadata,files:{...metadata.files,'res/v2/rangers.json':{hash:'wrong'}}};
 const fetch=async input=>new Response(new URL(input).pathname==='/pwa-data.json'?JSON.stringify(bad):read(new URL(input).pathname.slice(1)));
 ctx.window.fetch=fetch;vm.runInNewContext(read('assets/js/pwa-data.js').toString(),ctx);
 await assert.rejects(()=>ctx.window.fetch('https://test/res/v2/rangers.json'));
 assert.ok(events.some(e=>e.detail.kind==='data-unavailable'));
}
verifier().then(()=>console.log('PWA_CONTRACT_OK manifest/icons/all HTML entries/four locales/release hashes/first-visit integrity')).catch(e=>{console.error(e);process.exitCode=1;});

