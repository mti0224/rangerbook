const assert=require('node:assert/strict');
const {create,levelStat,respawnAtLevel}=require('../assets/js/team-analysis-overview-model.js');
const K=k=>'EQUIP:GEAR_FILTER_'+k+'_nm';
const r={rangerCode:'test-int',starGrade:9,evolution:'NORMAL',roleType:'INT',
  elementType:'FIRE',stats:{hp:1000,attack:{physical:100,magical:0},mineralCost:1000,
  respawnSeconds:10,attackRange:150,skillResistancePercent:20,skillDodgeChancePercent:10},
  rankUpStatIncrease:{hpIncreaseAmount:100,attackIncreaseAmount:10,specialAttackDelta:0},
  rankUpStatIncreaseMax:{hpIncreaseAmount:200,attackIncreaseAmount:20,specialAttackDelta:0},
  talents:{enhancements:[
    {effectCode:'HP_MUL',value:.25,unit:'PERCENT_FACTOR'},
    {effectCode:'GATK_MUL',value:.30,unit:'PERCENT_FACTOR'},
    {effectCode:'SKLRE_PROB_MUL',value:.15,unit:'PERCENT_FACTOR'}
  ]}
};
const w={equipCode:'w',starGrade:7,equipType:'WEAPON',
  normalOptions:[{optionKey:K('HP_MUL')},{optionKey:K('GATK_MUL')},{optionKey:K('SUMMON_ENGY_MUL')}],
  highLevelOptions:{defaultOption:{optionKey:K('HP_MUL')},switchOptions:[]}};
const a={equipCode:'a',starGrade:6,equipType:'ARMOR',
  normalOptions:[{optionKey:K('PRD_SPE_MUL')},{optionKey:K('SKLRE_PROB_MUL')}],highLevelOptions:null};
const u={unitCode:'test-int',level:10,talentGrade:4,equipMap:{
  WEAPON:{itemCode:'w',attr4No:101,attr4OptionKey:K('HP_MUL'),attr4Condition:{kind:'always'},
    attr4Unit:'PERCENT',attr4Value:15,normalOptions:[
      {optionKey:K('HP_MUL'),value:20},{optionKey:K('GATK_MUL'),value:20},
      {optionKey:K('SUMMON_ENGY_MUL'),value:-10}]},
  ARMOR:{itemCode:'a',normalOptions:[
      {optionKey:K('PRD_SPE_MUL'),value:-20},{optionKey:K('SKLRE_PROB_MUL'),value:5}]}
}};
const model=create({rangers:[r],equipment:[w,a],effects:[]});
const data=model.summarize([u]);
assert.equal(levelStat(r,u,r.stats.hp,'hpIncreaseAmount'),1900);
assert.equal(respawnAtLevel(r,u),10);
assert.equal(data.roles.INT.count,1);
assert.equal(data.roles.AGI.count,0);
assert.equal(data.roles.INT.stats.attack,285); // 190 base * (1 + 20% gear + 30% talent)
assert.equal(data.roles.INT.stats.hp,3040); // 1900 * (1 + 20% basic + 15% advanced + 25% talent)
assert.equal(data.roles.INT.stats.resistance,40); // 20 inherent + 5 equipment + 15 talent
assert.equal(data.roles.INT.stats.evade,10);
assert.equal(data.roles.INT.stats.surehit,0);
assert.equal(data.roles.INT.stats.invalid,0);
assert.equal(data.roles.INT.stats.penetration,0);
assert.equal(data.roles.INT.stats.mineral,900);
assert.equal(data.roles.INT.stats.respawn,8);
assert.equal(data.overall.mineral,900);
assert.equal(data.overall.respawn,8);
assert.deepEqual(data.distribution.role.map(x=>[x.key,x.count]),[['INT',1]]);
assert.deepEqual(data.distribution.gearStar.map(x=>[x.key,x.count]),[['7',1],['6',1]]);
assert.deepEqual(data.distribution.condition.map(x=>[x.key,x.count]),[['none',1],['always',1]]);
assert.equal(data.distribution.star[0].key,'9');
assert.equal(data.distribution.talent[0].key,'4');
const noGear=model.summarize([{unitCode:'test-int',level:10,talentGrade:0}]);
assert.equal(noGear.roles.INT.stats.invalid,0,'zero base when no equipment');
assert.equal(noGear.roles.INT.stats.surehit,0,'surehit starts at zero');
assert.equal(noGear.roles.INT.stats.penetration,0);
assert.equal(noGear.roles.INT.stats.hp,1900);
const unlocked=model.summarize([{...u,talentGrade:1}]);
assert.equal(unlocked.roles.INT.stats.hp,2565); // 1900 * (1 + 20% + 15%)
assert.equal(unlocked.roles.INT.stats.attack,228); // 190 * (1 + 20%)
const missing=structuredClone(u);
missing.equipMap.WEAPON.normalOptions=missing.equipMap.WEAPON.normalOptions.slice(0,2);
assert.equal(model.summarize([missing]).roles.INT.stats.hp,null,'missing actual roll is not replaced by max');
const capped={...u,level:181};
assert.equal(levelStat(r,capped,r.stats.hp,'hpIncreaseAmount'),17100); // 159*100 + 1*200 + 1000
const invalid={...u,level:9999};
assert.equal(model.summarize([invalid]).roles.INT.stats.hp,null,'invalid level is not silently normalized');
console.log('TEAM_OVERVIEW_MODEL_OK distributions additive equipment talent and level-aware averages');