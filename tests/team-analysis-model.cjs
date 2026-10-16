const assert=require('node:assert/strict');
const {create,conditionMatches}=require('../assets/js/team-analysis-model.js');
const {fixture,key}=require('./team-analysis-fixture.cjs');
const {units,catalogs}=fixture();
const run=(u=units,c=catalogs)=>create(c).analyze(u);
const result=run();
const expected={
 WEAPON:{FIRE:[1,2],WATER:[2,2],TREE:[1,1],LIGHT:[1,1],DARK:[0,0],INT:[1,2],AGI:[2,2],STR:[2,2]},
 ARMOR:{FIRE:[2,2],WATER:[2,2],TREE:[1,1],LIGHT:[1,1],DARK:[0,0],INT:[2,2],AGI:[2,2],STR:[2,2]},
 ACC:{FIRE:[1,2],WATER:[2,2],TREE:[1,1],LIGHT:[1,1],DARK:[0,0],INT:[2,2],AGI:[2,2],STR:[1,2]},
 surehit:{INT:[2,2],AGI:[2,2],STR:[1,2]},element:{FIRE:[1,1],WATER:[1,1],TREE:[0,1],LIGHT:[0,1],DARK:[0,0]}
};
for(const [tab,expectedRows] of Object.entries(expected)) {
 const rows=result.tabs[tab];
 for(const row of rows) {
  assert.deepEqual([row.numerator,row.denominator],expectedRows[row.category],tab+' '+row.category);
  assert.equal(row.ratio,row.denominator?row.numerator/row.denominator:null);
  assert.equal(row.entries.filter(e=>e.ok).length,row.numerator);
  assert.equal(row.entries.length,row.denominator);
 }
 for(let i=1;i<rows.length;i++) {
  assert.ok((rows[i-1].ratio??-1)>=(rows[i].ratio??-1));
  if(rows[i-1].ratio===rows[i].ratio) assert.ok(rows[i-1].order<rows[i].order);
 }
}
assert.equal(result.tabs.WEAPON.find(r=>r.category==='FIRE').entries[0].reason,'condition');
assert.equal(result.tabs.ACC.find(r=>r.category==='FIRE').entries[1].reason,'condition');
assert.equal(result.radar[4].average,4,'skill hit 80% is NOT surehit');
assert.equal(result.radar[5].average,125); assert.equal(result.radar[5].count,4);
const clone=x=>structuredClone(x);
// Unlocked talent stage, per-Ranger 100% cap, zero in denominator, unclamped mineral average.
const c=clone(catalogs),u=clone(units.slice(0,2));
c.rangers[0].stats.skillDodgeChancePercent=95;
c.rangers[0].talents={enhancements:[{effectCode:'SKLAVD_PROB_MUL',value:.2,unit:'PERCENT_FACTOR'}]};
u[0].talentGrade=2;
u[0].equipMap.ARMOR.normalOptions.find(o=>o.optionKey===key('SUMMON_ENGY_MUL')).value=-83;
u[0].equipMap.ACC.normalOptions.find(o=>o.optionKey===key('SUMMON_ENGY_MUL')).value=0;
let radar=run(u,c).radar;
assert.equal(radar[0].average,55); // A capped at 100; B has 10, not excluded.
assert.equal(radar[2].average,(101+38)/2); // A 83+18, B 10+10+18.
const solo=run([u[0]],c).radar;assert.equal(solo[2].average,101);assert.equal(solo[2].normalized,1);
u[0].talentGrade=1;assert.equal(run([u[0]],c).radar[0].average,100);
c.rangers[0].stats.skillDodgeChancePercent=0;
u[0].equipMap.ARMOR.normalOptions.find(o=>o.optionKey===key('SKLAVD_PROB_MUL')).value=0;
u[0].equipMap.ACC.normalOptions.find(o=>o.optionKey===key('SKLAVD_PROB_MUL')).value=0;
assert.equal(run(u,c).radar[0].average,5,'zero-valued Ranger remains in mean');
// 6 stars cannot trigger even with misleading attr4 fields; basic effects remain effective.
const low=clone(catalogs);low.equipment.find(g=>g.equipCode==='A-a').starGrade=6;
let r=run([units[0]],low);assert.equal(r.tabs.ARMOR.find(r=>r.category==='FIRE').numerator,0);
assert.equal(r.tabs.ARMOR.find(r=>r.category==='FIRE').entries[0].reason,'lowStar');
assert.equal(r.radar[0].average,20);assert.equal(r.radar[5].average,0);
const none=clone(units[0]);delete none.equipMap.ARMOR;
assert.equal(run([none]).tabs.ARMOR.find(r=>r.category==='FIRE').entries[0].reason,'unequipped');
const noHigh=clone(catalogs);noHigh.equipment.find(g=>g.equipCode==='A-a').highLevelOptions=null;
assert.equal(run([units[0]],noHigh).tabs.ARMOR.find(r=>r.category==='FIRE').entries[0].reason,'noAdvanced');
const fly=clone(catalogs);fly.rangers[0].abilityCodes=['fixture-flight'];
r=run(units,fly);assert.equal(r.tabs.surehit.find(r=>r.category==='INT').denominator,1);
assert.equal(r.tabs.WEAPON.find(r=>r.category==='INT').denominator,2);
assert.deepEqual([r.tabs.element.find(r=>r.category==='FIRE').numerator,r.tabs.element.find(r=>r.category==='FIRE').denominator],[0,0]);
assert.equal(r.radar[4].count,5);
assert.equal(r.radar[5].count,3);
assert.equal(r.radar[5].average,250/3);
assert.ok(r.tabs.surehit.every(row=>row.entries.every(e=>e.unit.unitCode!=='A')));
assert.ok(r.tabs.element.every(row=>row.entries.every(e=>e.unit.unitCode!=='A')));
// Exclude actual values as well as denominators, including awakened FLIGHT.
const flyingUnits=clone(units);
flyingUnits[0].equipMap.WEAPON.normalOptions.find(o=>o.optionKey===key('CLN_SKLAVD_PROB_MUL')).value=20;
for(const source of ['native','awakened']) {
 const flightCatalog=clone(catalogs),flightUnits=clone(flyingUnits);
 if(source==='native') flightCatalog.rangers[0].abilityCodes=['fixture-flight'];
 else flightUnits[0].awakeAbilityCode='fixture-flight';
 const actual=run(flightUnits,flightCatalog);
 assert.equal(actual.radar[4].average,4,source+' flight surehit value is excluded');
 assert.equal(actual.radar[5].average,250/3,source+' flight element value is excluded');
 const counts=rows=>rows.map(({category,numerator,denominator,ratio,entries})=>({category,numerator,denominator,ratio,entries:entries.map(({index,ok,reason})=>({index,ok,reason}))}));
 for(const tab of ['WEAPON','ARMOR','ACC']) assert.deepEqual(counts(actual.tabs[tab]),counts(result.tabs[tab]),source+' does not exclude slot analysis');
 for(const id of ['evade','resistance','mineral','respawn']) assert.deepEqual(actual.radar.find(m=>m.id===id),result.radar.find(m=>m.id===id));
 const onlyFlyer=run([flightUnits[0]],flightCatalog);
 for(const metric of onlyFlyer.radar.filter(m=>['surehit','element'].includes(m.id))) {
  assert.equal(metric.average,null); assert.equal(metric.count,0); assert.equal(metric.pending,false);
 }
 for(const tab of ['surehit','element']) assert.ok(onlyFlyer.tabs[tab].every(row=>row.denominator===0&&row.numerator===0&&row.ratio===null&&row.entries.length===0));
}
assert.equal(run([units[2]]).radar[5].average,null);
assert.ok(run([]).radar.every(m=>m.average===null&&!m.pending));
assert.ok(Object.values(run([]).tabs).flat().every(r=>r.ratio===null&&r.denominator===0));
assert.equal(conditionMatches({kind:'unknown',value:'FIRE'},catalogs.rangers[0]),null);
const legacy=clone(units[0]);delete legacy.equipMap.ARMOR.normalOptions;
assert.equal(run([legacy]).radar[0].average,null,'missing actual value never becomes a max roll');
const both=clone(units[0]);both.equipMap.ACC.attr4Condition={kind:'rangerType',value:'FIRE'};
both.equipMap.ACC.attr4OptionKey=key('EATK_MUL');both.equipMap.ACC.attr4Value=250;
const bothCatalog=clone(catalogs);bothCatalog.equipment.find(e=>e.equipCode==='A-c').highLevelOptions.switchOptions.push({optionKey:key('EATK_MUL')});
r=run([both],bothCatalog);assert.equal(r.radar[5].average,500);assert.equal(r.radar[5].normalized,1);assert.equal(r.tabs.element.find(r=>r.category==='FIRE').numerator,1);
const fewer=clone(catalogs),fewerUnit=clone(units[0]);
fewer.equipment.find(g=>g.equipCode==='A-a').starGrade=5;
fewer.equipment.find(g=>g.equipCode==='A-a').normalOptions=fewer.equipment.find(g=>g.equipCode==='A-a').normalOptions.slice(0,2);
fewerUnit.equipMap.ARMOR.normalOptions=fewerUnit.equipMap.ARMOR.normalOptions.slice(0,2);
assert.equal(run([fewerUnit],fewer).radar[1].average,20,'lower-star gear with two basic effects is included');
console.log('TEAM_ANALYSIS_MODEL_OK: all A–F counts, sort order, membership, radar and edge cases');
