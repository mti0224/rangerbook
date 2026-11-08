const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture}=require('./team-analysis-fixture.cjs');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/js/team-analysis.js'),'utf8');
const labels=JSON.parse(fs.readFileSync(path.join(root,'assets/locales/ui.json')));

for(const prefix of ['/','/rangerbook/']) test('star distribution renders native evolution badges at '+prefix,async()=>{
  const {units,catalogs}=fixture();
  Object.assign(catalogs.rangers[0],{starGrade:8,evolution:'ULTRA'});
  Object.assign(catalogs.rangers[1],{starGrade:8,evolution:'HYPER'});
  Object.assign(catalogs.rangers[2],{starGrade:8,evolution:'NORMAL'});
  const errors=[];
  const node=()=>({innerHTML:'',setAttribute(){},querySelector(){return node();},
    querySelectorAll(){return [];},addEventListener(){}});
  const host=node();
  const window={addEventListener(){},RangerbookI18n:{locale:'zh-Hant',
    format:(key,args)=>args.reduce((s,value,i)=>s.replace('%N'+(i+1),value),labels['zh-Hant'][key]||key),
    t:key=>labels['zh-Hant'][key]||key},RangerbookV2:{render:()=>'',data:async key=>({
      rangers:{rangers:catalogs.rangers},equipment:{equipment:catalogs.equipment},
      abilities:{abilities:catalogs.abilities},'equipment-effects':{effects:catalogs.effects}
    })[key]},RangerbookTeamAnalysisModel:require('../assets/js/team-analysis-model.js'),
    RangerbookTeamOverviewModel:require('../assets/js/team-analysis-overview-model.js')};
  const iconDocument={currentScript:{src:"https://example.test"+prefix+"assets/js/ranger-unit-icons.js"}};
  vm.runInNewContext(fs.readFileSync(path.join(root,"assets/js/ranger-unit-icons.js"),"utf8"),{window,URL,document:iconDocument});
  vm.runInNewContext(source,{window,URL,requestAnimationFrame(){},
    console:{error:(...args)=>errors.push(args)},document:{getElementById:()=>host,
      currentScript:{src:'https://example.test'+prefix+'assets/js/team-analysis.js?v=stars1'}}});
  await window.RangerbookTeamAnalysis.setUnits(units);
  assert.deepEqual(errors,[]);
  const badges=[...host.innerHTML.matchAll(/<img class="ta-dist-stars" src="([^"]+)" alt="([^"]+)"/g)];
  assert.equal(badges.length,5,'four Ranger star categories and one equipment category');
  for(const [file,label] of [['com_level02_star08.png','8星終極進化'],
    ['com_level04_star08.png','8星超進化'],['com_level01_star08.png','8星'],
    ['com_level01_star09.png','9星'],['com_level01_star07.png','7星']]) {
    assert.ok(badges.some(([,src,alt])=>src==='https://example.test'+prefix+'assets/star_layer/'+file&&alt===label),file+' '+label);
    assert.ok(fs.existsSync(path.join(root,'assets/star_layer',file)));
  }
  assert.ok(host.innerHTML.includes('role="progressbar"'));
  assert.ok(host.innerHTML.includes('18 / 18 · 100%'),'equipment counts and percentages remain');
});

test('authored locale overlay preserves the corrected evolution labels',()=>{
  for(const file of ['assets/locales/personal-analysis-overrides.json','deploy/aws/v2/locales/ui.json']) {
    const rows=JSON.parse(fs.readFileSync(path.join(root,file)));
    assert.equal(rows.find(x=>x.key==='UI:analysis.overview.hyper8').zh_TW,'8星超進化');
    assert.equal(rows.find(x=>x.key==='UI:analysis.overview.ultra8').zh_TW,'8星終極進化');
  }
});
