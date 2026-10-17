/* End-to-end GIF acceptance. Needs Playwright and Python Pillow.
   NODE_PATH=... QA_CHROME=/path/to/chrome node tests/ranger-animation-gif.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'ranger-gif-'));
const ui = JSON.parse(fs.readFileSync(path.join(root, 'deploy/aws/v2/locales/ui.json')));
const png = color => execFileSync('python', ['-c', `from PIL import Image;import sys;Image.new('RGBA',(80,80),${color}).save(sys.stdout.buffer,format='PNG')`]);
const images = {'body.png': png('(255,0,0,255)'), 'bullet.png': png('(0,0,255,255)'), 'target.png': png('(0,255,0,255)')};
function part(png, names) {
  return {png, canvas:{w:80,h:80}, anim_rate:30,
    images:[{name:'sprite',m:[1,0,0,1,0,0]}],sprites:{sprite:{rect:[0,0,80,80]}},
    animations:Object.fromEntries(names.map(name=>[name,{frame_count:30,frames:Array.from({length:30},(_,i)=>[[0,0,[1,0,0,1,i%2*20,-80],[255,255,255,255]]])}]))};
}
const body=part('body.png',['idle','walk','knockback','attack_all','attack_ready','attack','s_attack_all','s_attack_ready','s_attack','s2_attack_all','s2_attack_ready','s2_attack']);
body.animations.attack_ready.frame_count=6;
const projectile={attackType:'WEAPON',start:{x:80,y:60},end:{x:0,y:0},moveSpeed:24,motion:{enabled:true,rotation:'FIXED'}};
const meta={parts:{body,bul:part('bullet.png',['normal','finish']),bul2:part('bullet.png',['normal','finish']),bul3:part('bullet.png',['normal','finish'])},projectileData:{coordinateScale:0.5,normal:projectile,skill1:projectile,skill2:projectile}};
const target={parts:{body:part('target.png',['idle'])}};
const fixture=`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/assets/css/ranger-animation-viewer.css"></head><body>
<div id="rangerModalContent"><img class="ranger-detail-image" src="/res/u-fixture/u-fixture-thum.png"><div class="ranger-stat"><span>攻擊範圍</span><strong>384</strong></div></div>
<script src="/assets/js/ranger-animation-viewer.js" defer></script><script src="/assets/js/ranger-animation-target.js" defer></script></body></html>`;
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://local').pathname;
 if(pathname==='/fixture') {res.setHeader('Content-Type','text/html');return res.end(fixture)}
 const file=path.join(root,pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end()}
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'})[path.extname(file)]||'application/octet-stream');
 res.end(fs.readFileSync(file));
});
function inspect(file) {
 return JSON.parse(execFileSync('python',['-c',`from PIL import Image
import json,sys
im=Image.open(sys.argv[1]); colors=set(); duration=0; alpha=False; edges=False
for i in range(im.n_frames):
 im.seek(i); duration+=im.info.get('duration',0); f=im.convert('RGBA'); colors.update(getattr(f,'get_flattened_data',f.getdata)());alpha=alpha or f.getpixel((0,0))[3]==0
 box=f.getbbox()
 if box and (box[0]==0 or box[1]==0 or box[2]==im.width or box[3]==im.height):edges=True
print(json.dumps(dict(size=im.size,frames=im.n_frames,duration=duration,loop=im.info.get('loop'),red=any(r>200 and g<30 and b<30 and a for r,g,b,a in colors),blue=any(b>200 and r<30 and g<30 and a for r,g,b,a in colors),green=any(g>200 and r<30 and b<30 and a for r,g,b,a in colors),magenta=any(r>200 and b>200 and g<30 and a for r,g,b,a in colors),transparent=alpha,edges=edges)))`,file],{encoding:'utf8'}));
}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME||undefined,args:process.env.QA_CHROME?['--no-sandbox','--single-process','--no-zygote','--disable-gpu','--disable-software-rasterizer']:[]});
 try {
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:390,height:844}});
  let role='admin',loggedIn=true;
  await context.route('https://rangerbook-auth.warmycat.com/**',r=>r.fulfill({json:{logged_in:loggedIn,role}}));
  await context.route('https://res.warmycat.com/**',r=>{
   const url=new URL(r.request().url());
   if(url.pathname.endsWith('index.json')) return r.fulfill({json:{units:{'u-fixture':{meta:'u-fixture.json'},'u1276sk-cony':{meta:'u1276sk-cony.json'}}}});
   if(url.pathname.endsWith('u-fixture.json')) return r.fulfill({json:meta});
   if(url.pathname.endsWith('.json')) return r.fulfill({json:target});
   return r.fulfill({contentType:'image/png',body:images[path.basename(url.pathname)]||images['body.png']});
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/fixture');
  const button=page.locator('.ranger-animation-gif-download');
  await button.waitFor({state:'visible'});
  assert.equal(await button.innerText(),'下載 GIF');
  let saved=0;
  const save=async(name)=>{
   const wait=page.waitForEvent('download',{timeout:60000});await button.click();
   const download=await wait;assert.equal(download.suggestedFilename(),`u-fixture_${name}.gif`);
   const file=path.join(out,`${saved++}-${name}.gif`);await download.saveAs(file);
   await page.waitForFunction(()=>!document.querySelector('.ranger-animation-gif-download').disabled);
   return {file,info:inspect(file)};
  };
  const idle=await save('idle');assert.equal(idle.info.frames,30);assert.ok(idle.info.red && !idle.info.blue && idle.info.transparent && !idle.info.edges);assert.equal(idle.info.duration,1000);assert.equal(idle.info.loop,0);
  // Real target layer remains visible in preview, but is absent from export.
  await page.selectOption('.ranger-animation-target-select','u1276sk-cony');
  await page.waitForFunction(()=>window.RangerAnimationTargetBridge.get(document.querySelector('.ranger-animation-section'))?.contentHeight>0);
  await page.evaluate(()=>{
   const overlay=document.createElement('canvas');overlay.className='ranger-animation-hit-effect-canvas';
   const c=overlay.getContext('2d');c.fillStyle='#ff00ff';c.fillRect(0,0,20,20);
   document.querySelector('.ranger-animation-canvas-stack').appendChild(overlay);
  });
  await page.selectOption('.ranger-animation-select','attack');
  const attack=await save('attack');assert.ok(attack.info.red&&attack.info.blue&&!attack.info.green&&!attack.info.magenta&&attack.info.transparent&&!attack.info.edges);assert.ok(attack.info.size[0]>600,'Projectile travels outside the 640 px preview and is retained');
  await page.screenshot({path:path.join(out,'mobile-controls.png'),fullPage:true});
  // Export framing and bytes do not depend on the preview's pan or zoom.
  await page.locator('.ranger-animation-zoom').fill('2.5');
  await page.locator('.ranger-animation-canvas').scrollIntoViewIfNeeded();
  const box=await page.locator('.ranger-animation-canvas').boundingBox();
  await page.mouse.move(box.x+100,box.y+70);await page.mouse.down();
  await page.mouse.move(box.x+20,box.y+120);await page.mouse.up();
  const again=await save('attack');assert.deepEqual(fs.readFileSync(again.file),fs.readFileSync(attack.file));
  for(const clip of ['move','knockback','skill1','skill2','full']) {await page.selectOption('.ranger-animation-select',clip);const {info}=await save(clip);assert.ok(info.red && info.transparent && !info.green && !info.edges);if(clip==='full')assert.ok(info.duration>5000)}
  // Logout, user and guest modes never expose the control, even with the legacy flag.
  for(const user of [{loggedIn:true,role:'user'},{loggedIn:false,role:'super_admin'}]) {
   role=user.role;loggedIn=user.loggedIn;
   await page.evaluate(async()=>{localStorage.setItem('rangerbook-admin-mode','true');await RangerbookAuth.refresh()});
   assert.equal(await button.isVisible(),false);
  }
  role='super_admin';loggedIn=true;await page.evaluate(()=>RangerbookAuth.refresh());await button.waitFor({state:'visible'});
  await button.click();await page.locator('.ranger-animation-gif-cancel').click();await page.waitForFunction(()=>!document.querySelector('.ranger-animation-gif-download').disabled);
  assert.match(await page.locator('[role=status]').innerText(),/取消/);
  // Readback failure (e.g. CORS) is recoverable, and must never download a partial GIF.
  await page.evaluate(()=>{window.originalReadback=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=function(){throw new DOMException('Tainted canvas','SecurityError')}});
  await button.click();await page.waitForFunction(()=>!document.querySelector('.ranger-animation-gif-download').disabled);
  assert.match(await page.locator('[role=status]').innerText(),/失敗/);
  await page.evaluate(()=>{CanvasRenderingContext2D.prototype.getImageData=window.originalReadback});
  // Exercise a moving opaque black sprite followed by a completely empty frame.
  const blackBytes=await page.evaluate(async()=>{
   const worker=new Worker('/assets/js/ranger-animation-gif-worker.js',{type:'module'});
   const send=data=>new Promise((resolve,reject)=>{worker.onmessage=e=>e.data.type==='error'?reject(new Error(e.data.message)):resolve(e.data);worker.onerror=reject;worker.postMessage(data)});
   await send({type:'start'});
   for(let f=0;f<3;f++) {const rgba=new Uint8Array(4*4*4);if(f<2)rgba[(5+f)*4+3]=255;await send({type:'frame',width:4,height:4,buffer:rgba.buffer,delay:100})}
   const result=await send({type:'finish'});worker.terminate();return Array.from(new Uint8Array(result.buffer));
  });
  const blackFile=path.join(out,'black-and-empty.gif');fs.writeFileSync(blackFile,Buffer.from(blackBytes));
  execFileSync('python',['-c',`from PIL import Image
import sys
im=Image.open(sys.argv[1]);assert im.n_frames==3
for i in range(3):
 im.seek(i);f=im.convert('RGBA');visible=[p for p in getattr(f,'get_flattened_data',f.getdata)() if p[3]]
 assert len(visible)==(1 if i<2 else 0), (i,visible)
 if visible:assert visible[0]==(0,0,0,255)
`,blackFile]);
  for(const locale of ['zh_TW','en','th','jp']) for(const suffix of ['download','cancel','hint','preparing','encoding','done','cancelled','tooLong','error']) assert.ok(ui.find(x=>x.key==='UI:animation.gif.'+suffix)?.[locale]);
  assert.deepEqual(errors,[]);
  console.log('GIF_ACCEPTANCE_OK',JSON.stringify({idle:idle.info,attack:attack.info,artifacts:out}));
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
