/* Deterministic SW lifecycle/cache regression tests; browser tests exercise the real API. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'sw.js'),'utf8');
function harness() {
 const listeners={},stores=new Map(),network=[],notices=[];let offline=false,changed='',windows=[],skipped=0,quota=false;
 const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {
  async match(key){return store.get(typeof key==='string'?key:key.url)?.clone();},
  async put(key,response){if(quota)throw new Error('QuotaExceededError');store.set(typeof key==='string'?key:key.url,response.clone());},
  async delete(key){return store.delete(typeof key==='string'?key:key.url);},
  async keys(){return [...store.keys()].map(url=>new Request(url));}
 };},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}};
 const scope='https://test/rangerbook/';
 const fetch=async(input,options)=>{
  const url=typeof input==='string'?input:input.url;network.push({url,options});if(offline)throw new TypeError('offline');
  const name=new URL(url).pathname.replace('/rangerbook/','');
  const file=path.join(root,name);return new Response(changed===name?'incompatible':fs.existsSync(file)&&fs.statSync(file).isFile()?fs.readFileSync(file):'private-or-unknown',{status:fs.existsSync(file)?200:404});
 };
 const self={registration:{scope},clients:{async matchAll(){return windows;},claim(){throw new Error('Never claim a loading page');}},addEventListener:(name,fn)=>listeners[name]=fn,async skipWaiting(){skipped++;}};
 const ctx=vm.createContext({self,caches,fetch,URL,Request,Response,AbortController,setTimeout,clearTimeout,crypto:webcrypto,console});
 vm.runInContext(source+';globalThis.inspect={RELEASE,CORE,DATA,BOOT,put};',ctx);
 async function event(name,extra={}) {
  const pending=[];let response;
  const e={waitUntil:p=>pending.push(p),respondWith:p=>{response=p;},...extra};listeners[name](e);
  const result=response?await response:undefined;
  for(let i=0;i<pending.length;i++)await pending[i];return result;
 }
 const request=(name,opts={})=>({url:new URL(name,scope).href,method:'GET',headers:new Headers(),mode:'cors',...opts});
 const get=(name,opts)=>event('fetch',{request:request(name,opts)});
 return {event,get,caches,stores,network,ctx,notices,setOffline:v=>offline=v,setChanged:v=>changed=v,setWindows:v=>windows=v,setQuota:v=>quota=v,get skipped(){return skipped;}};
}
(async()=>{
 const h=harness();await h.event('install');assert.equal(h.skipped,0);
 assert.ok(!h.network.some(x=>x.url.includes('/res/v2/')),'Install never downloads game datasets');
 assert.ok(h.network.length<25,'Small offline bootstrap only');
 await h.event('activate');const {CORE,DATA,RELEASE,BOOT}=h.ctx.inspect;
 assert.ok(await h.get('settings/index.html'));assert.ok((await h.get('res/v2/abilities.json')).ok);
 assert.ok((await h.caches.open(DATA)).match('https://test/rangerbook/res/v2/abilities.json'));
 for(const name of ['https://auth.test/auth/me','admin/','auth/me','api/player-team-query','sponsor/','payment/','index.html?session=private'])await h.get(name);
 await h.get('res/v2/abilities.json',{headers:new Headers({Authorization:'Bearer private'})});
 await h.get('res/v2/abilities.json',{method:'POST'});
 for(const cache of h.stores.values())for(const url of cache.keys())assert.ok(!/auth|session|admin|payment|sponsor/.test(url),url);
 assert.ok(h.network.slice(-9).every(x=>x.options?.cache==='no-store'));
 h.setOffline(true);
 assert.ok((await h.get('res/v2/abilities.json')).ok);
 assert.match(await (await h.get('res/v2/rangers.json')).text(),/RANGERBOOK_OFFLINE/);
 const shell=await h.get('settings/',{mode:'navigate'});assert.match(await shell.text(),/pwaSettings/);
 const fallback=await h.get('about/',{mode:'navigate'});assert.match(await fallback.text(),/pwa.offlineTitle/);
 const privateFallback=await h.get('admin/',{mode:'navigate'});assert.match(await privateFallback.text(),/pwa.offlinePrivate/);
 h.setOffline(false);assert.ok((await h.get('res/v2/rangers.json')).ok);
 h.setChanged('res/v2/rangers.json');assert.ok((await h.get('res/v2/rangers.json')).ok,'Valid old release wins over incompatible server data');
 h.setChanged('res/v2/equipment.json');assert.equal((await h.get('res/v2/equipment.json')).status,503,'Uncached mixed release fails closed');
 const cache=await h.caches.open(DATA);await cache.put('https://test/rangerbook/res/v2/abilities.json',new Response('corrupt'));h.setOffline(true);
 assert.equal((await h.get('res/v2/abilities.json')).status,503,'Corrupt cache fails closed');
 h.setOffline(false);h.setChanged('');
 for(const name of ['gear/test/','endless/stage/end1/','mainstage/hard/stage/hs1/','mainstage/extreme/stage/es1/']) {
  assert.equal((await h.get(name,{mode:'navigate'})).status,200);h.setOffline(true);assert.equal((await h.get(name,{mode:'navigate'})).status,200);h.setOffline(false);
 }
 const ranger=await h.get('ranger/ranger/u1633e/',{mode:'navigate'});assert.equal(ranger.status,302);assert.match(ranger.headers.get('location'),/\?detail=u1633e/);
 assert.equal((await h.get('unknown/',{mode:'navigate'})).status,404);
 const replies=[],sender={id:'one'};h.setWindows([{id:'one',url:'https://test/rangerbook/'},{id:'two',url:'https://test/rangerbook/'}]);
 await h.event('message',{data:{type:'RB_ACTIVATE_UPDATE'},source:sender,ports:[{postMessage:x=>replies.push(x)}]});assert.equal(h.skipped,0);assert.equal(replies[0].ok,false);
 h.setWindows([{id:'one',url:'https://test/rangerbook/'}]);await h.event('message',{data:{type:'RB_ACTIVATE_UPDATE'},source:sender,ports:[{postMessage:x=>replies.push(x)}]});assert.equal(h.skipped,1);
 h.setWindows([{id:'one',url:'https://test/rangerbook/',frameType:'top-level'},{id:'embed',url:'https://test/rangerbook/pvp/search/',frameType:'nested'}]);
 await h.event('message',{data:{type:'RB_ACTIVATE_UPDATE'},source:sender,ports:[{postMessage:x=>replies.push(x)}]});assert.equal(h.skipped,2,'Embedded personal viewer is part of the consenting window');
 const old=CORE.replace(/app-.*/, 'app-obsolete');await h.caches.open(old);await h.event('activate');assert.ok(!(await h.caches.keys()).includes(old));
 // Synthetic 1MB records exercise the budget even if production data is smaller.
 for(let i=0;i<40;i++) {const name='res/v2/large-'+i+'.json';RELEASE.data[name]={size:1024*1024,hash:''};await h.ctx.inspect.put(DATA,name,new Response('x'));}
 assert.ok((await (await h.caches.open(DATA)).keys()).length<=32);
 h.setQuota(true);await h.ctx.inspect.put(DATA,'res/v2/rangers.json',new Response('x'));assert.ok(!(await h.caches.keys()).includes(DATA));
 assert.ok(await (await h.caches.open(CORE)).match('https://test/rangerbook/'+BOOT[0]));
 const failure=harness();failure.setChanged('offline.html');await assert.rejects(()=>failure.event('install'));assert.equal(failure.skipped,0);assert.equal((await failure.caches.keys()).length,0);
 let unregistered=0;await h.caches.open('another-app-cache');
 h.ctx.self.registration.unregister=async()=>{unregistered++;};
 vm.runInContext(fs.readFileSync(path.join(root,'assets/pwa/disabled-worker.js'),'utf8'),h.ctx);
 await h.event('activate');assert.equal(unregistered,1);assert.deepEqual(await h.caches.keys(),['another-app-cache'],'Rollback removes only this app scope');
 console.log('PWA_WORKER_OK lifecycle/consent/multi-tab/404 routes/integrity/offline/recovery/private exclusions/32MB budget/quota/cleanup/failed install');
})().catch(e=>{console.error(e);process.exitCode=1;});
