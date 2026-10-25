/* Exercise the real build with isolated inputs: only public app/data changes release. */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rangerbook-release-'));
const write=(name,value)=>{const file=path.join(temp,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
const build=()=>{
 execFileSync(process.execPath,[path.join(temp,'scripts/build-pwa.mjs')],{stdio:'pipe'});
 return fs.readFileSync(path.join(temp,'sw.js'),'utf8');
};
const release=worker=>JSON.parse(worker.match(/const RELEASE = (.*);/)[1]);
try {
 for(const name of ['scripts/build-pwa.mjs','scripts/build-fast-data.mjs','scripts/package-pages.mjs','scripts/format-res-json.py','assets/pwa/service-worker.js'])write(name,fs.readFileSync(path.join(root,name)));
 for(const [name,value] of Object.entries({'rangers':{rangers:[]},'abilities':{abilities:[]},'locales/official':[],'projectiles':{units:{}}}))write('res/v2/'+name+'.json',JSON.stringify(value));
 write('index.html','<main>Rangerbook</main>');
 write('assets/css/style.css','body {color: black}');
 write('assets/js/app.js','window.feature=1;');
 write('res/v2/resources.json','{"updatedAt":"2026-10-25T00:00:00Z","resourceTimestamp":"123"}');
 write('res/v2/manifest.json','{"sourceFingerprint":"compiler-a"}');
 write('res/v2/translation-audit.json','{"audit":"first"}');
 const baseline=build(),base=release(baseline);
 assert.equal(build(),baseline,'An unchanged rebuild must not prompt for an update');
 write('maintenance/report.html','<p>Internal report</p>');
 write('records/run.json','{"timestamp":123}');
 write('tests/fixture.html','<p>Test fixture</p>');
 write('docs/report.md','Maintenance notes');
 assert.equal(build(),baseline,'Non-published records and tests must not change either release');
 write('res/v2/resources.json','{"updatedAt":"2026-10-25T00:10:00Z","resourceTimestamp":"123"}');
 write('res/v2/manifest.json','{"sourceFingerprint":"compiler-b"}');
 write('res/v2/translation-audit.json','{"audit":"second"}');
 assert.equal(build(),baseline,'Polling times, provenance and audits must not create game updates');
 for(const [name,body] of [['index.html','<main>New layout</main>'],['assets/css/style.css','body {color: green}'],['assets/js/app.js','window.feature=2;']]) {
  const before=fs.readFileSync(path.join(temp,name));write(name,body);
  const changed=release(build());assert.notEqual(changed.appVersion,base.appVersion,name);
  assert.equal(changed.dataVersion,base.dataVersion,'UI changes must not change the game-data version');
  write(name,before);
 }
 write('res/v2/abilities.json','{"abilities":[],"releaseFixture":"updated"}');
 const data=release(build());assert.notEqual(data.dataVersion,base.dataVersion);
 assert.equal(data.appVersion,base.appVersion,'A game-data-only release keeps the application version');
 console.log('PWA_RELEASE_OK unchanged rebuild/unpublished records/polling metadata/layout/style/function/data-only changes');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
