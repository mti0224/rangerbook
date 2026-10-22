/* V2 must preserve the category and per-effect chance contracts used by filters
 * and by Ranger detail, comparison and ranking views. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const source=read('res/v2/rangers.json').rangers;
const custom=new Map(read('res/v2/locales/custom.json').map(row=>[row.key,row]));
const normalize=value=>value.replace(/%(?:N\d*|d\d*|s|n)/g,'N').replace(/\\+n/g,'\n');
const category=(ref,lang)=>normalize(custom.get(ref.templateKey)[lang]);
(async()=>{
 for(const locale of ['zh_TW','en','th','jp']) {
  const window={fetch:async input=>{
   const url=new URL(input,'https://talents.invalid');
   return new Response(fs.readFileSync(path.join(root,url.pathname)),{headers:{'Content-Type':'application/json'}});
  }};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/js/v2-data.js'),'utf8'),{
   window,location:new URL('https://talents.invalid/ranger/ranger/'),localStorage:{getItem:()=>locale},URL,Response,console
  });
  const rows=await window.RangerbookV2.rangerPageRows();
  const conditions=new Set(),effects=new Set();let checked=0,differentChance=0;
  for(let i=0;i<source.length;i++) {
   const raw=source[i].talents?.major;if(!raw)continue;
   const main=rows[i]['才能']['主要才能'];checked++;
   const condition=category(raw.activationConditionKey,'zh_TW');conditions.add(condition);
   assert.equal(main['條件搜尋分類'],condition,source[i].rangerCode);
   assert.equal(window.RangerbookV2.translateText(condition),category(raw.activationConditionKey,locale));
   assert.equal(main['觸發機率'],raw.activationChancePercent+'%');
   assert.equal(main['增益效果'].length,raw.effects.length);
   raw.effects.forEach((effect,index)=>{
    const adapted=main['增益效果'][index],label=category(effect.localizedEffect,'zh_TW');effects.add(label);
    assert.equal(adapted['效果搜尋分類'],label);
    assert.equal(adapted['效果'],window.RangerbookV2.render(effect.localizedEffect,'zh_TW'));
    assert.equal(adapted['觸發機率'],effect.activationChancePercent+'%');
    assert.equal(window.RangerbookV2.translateText(label),category(effect.localizedEffect,locale));
    if(raw.activationChancePercent!==effect.activationChancePercent)differentChance++;
   });
  }
  assert.equal(checked,288);assert.equal(conditions.size,12);assert.equal(effects.size,16);
  assert.ok(differentChance>0,'Per-effect chance must not be replaced by the main activation chance');
  // Scoped detail bundles must adapt to the same contract as the full list.
  const detailWindow={fetch:window.fetch};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/js/v2-data.js'),'utf8'),{
   window:detailWindow,location:new URL('https://talents.invalid/ranger/ranger/?detail=u1174e-cony'),
   localStorage:{getItem:()=>locale},URL,Response,console
  });
  const detail=(await detailWindow.RangerbookV2.rangerPageRows())[0];
  assert.equal(JSON.stringify(detail['才能']),JSON.stringify(rows.find(row=>row.ranger_id==='u1174e-cony')['才能']));
  console.log('TALENT_ADAPTER_OK',locale,checked+' talents, 12 condition / 16 effect categories, scoped detail, distinct effect chances');
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
