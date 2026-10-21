const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const load=n=>JSON.parse(fs.readFileSync(path.join(root,'res/v2',n+'.json'),'utf8'));
(async()=>{
 for(const locale of ['zh-Hant','en','th','jp']) {
  const requested=[];
  const win={fetch:async url=>{
   requested.push(url);const p=new URL(url,'https://test.invalid').pathname;
   assert.ok(p.startsWith('/res/v2/') || ['/assets/locales/personal-analysis-overrides.json','/assets/locales/sitewide-overrides.json'].includes(p),'Unsupported V2 adapter request: '+p);
   return new Response(fs.readFileSync(path.join(root,p),'utf8'),{headers:{'Content-Type':'application/json'}});
  }};
  const ctx={window:win,location:{pathname:'/ranger/ranger/',origin:'https://test.invalid',href:'https://test.invalid/ranger/ranger/'},
   localStorage:{getItem:()=>locale},Response,URL,console};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/js/v2-data.js'),'utf8'),ctx);
  await win.RangerbookV2.ready;
  for(const name of win.RangerbookV2.routes) {
   const response=await win.fetch('https://test.invalid/res/'+encodeURIComponent(name));
   assert.equal(response.status,200,name+' '+locale);assert.equal(response.headers.get('X-Rangerbook-Source'),'v2');
   const result=await response.json();assert.ok(result);
   if(name==='Rangers_data.json') {
    assert.equal(result.length,2306);assert.equal(result[0]['體力'],1776);
    const source=load('rangers').rangers;
    for(let i=0;i<source.length;i++)assert.equal(Object.values(result[i]).filter(v=>v && Array.isArray(v['技能組'])).reduce((n,v)=>n+v['技能組'].length,0),
      source[i].skillSet.reduce((n,s)=>n+s.effects.length,0),'all child effects '+source[i].rangerCode);
   }
   if(name==='裝備資料庫.json') {
    assert.equal(result.length,951);assert.ok(result.find(x=>x['Spec+']['特殊效果']));
    const conditions={STR:'力量型Ranger',AGI:'敏捷型Ranger',INT:'智慧型Ranger',FIRE:'火屬性Ranger',WATER:'水屬性Ranger',TREE:'木屬性Ranger',LIGHT:'光屬性Ranger',DARK:'暗屬性Ranger'};
    const kinds={ACC:'飾品',ARMOR:'防具',WEAPON:'武器'};
    for(const source of load('equipment').equipment) {
     const adapted=result.find(x=>x.id===source.equipCode);
     assert.equal(adapted['裝備種類'],kinds[source.equipType],'canonical equipment category '+source.equipCode);
     if(source.highLevelOptions)assert.equal(adapted['高級效果']['觸發條件'],conditions[source.highLevelOptions.targetCondition.value],'role/element equipment target '+source.equipCode);
    }
   }
   if(name==='projectile_data.json') {assert.equal(result.unitCount,3140);assert.equal(result.units['g001-ssonya'].normal.start.x,270);}
   if(name==='困難關卡生產線.json') {assert.equal(Object.keys(result).length,240);assert.equal(result['困難關卡1關']['敵人生產線']['遊戲開始後0秒'][0]['詳細資訊']['體力'],116301155);}
   if(name==='迷宮關卡生產線.json') {assert.equal(Object.keys(result).length,40);assert.equal(Object.keys(result['1-1']).length,6);}
  }
  const words=await (await win.fetch('https://test.invalid/assets/locales/ui.json')).json();
  assert.ok(words[locale]);
  assert.ok(requested.every(x=>x.includes('/res/v2/') || ['personal-analysis-overrides.json','sitewide-overrides.json'].some(name=>x.includes('/assets/locales/'+name))));
  const overrides=JSON.parse(fs.readFileSync(path.join(root,'assets/locales/personal-analysis-overrides.json'),'utf8'));
  const description=overrides.find(x=>x.key==='UI:analysis.help.elementBody');
  assert.equal(words[locale]['analysis.help.elementBody'],description[locale==='zh-Hant'?'zh_TW':locale],
    'authored single-hit guide should win over older published V2 UI');
  console.log('V2_ADAPTER_OK '+locale+' '+win.RangerbookV2.routes.length+' view contracts');
 }
})().catch(e=>{console.error(e);process.exitCode=1;});

