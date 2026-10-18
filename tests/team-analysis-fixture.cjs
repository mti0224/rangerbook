/* User-supplied A–F acceptance example. Values are synthetic, not game estimates. */
const key = code => `EQUIP:GEAR_FILTER_${code}_nm`;
function fixture() {
  const definitions=[],effects=[],units=[],rangers=[];
  const basics={
    total:['ALL_ATK_MUL','CLN_SKLAVD_PROB_MUL','PRD_SPE_MUL'],
    physical:['GATK_MUL','CLN_SKLAVD_PROB_MUL','PRD_SPE_MUL'],
    hp:['HP_MUL','CLN_SKLAVD_PROB_MUL','PRD_SPE_MUL'],
    resist:['SKLRE_PROB_MUL','SUMMON_ENGY_MUL','SKLAVD_PROB_MUL'],
    healthEvade:['HP_MUL','SUMMON_ENGY_MUL','SKLAVD_PROB_MUL'],
    healthResist:['HP_MUL','SUMMON_ENGY_MUL','SKLRE_PROB_MUL'],
    accessory:['SUMMON_ENGY_MUL','SKLAVD_PROB_MUL','SKLRE_PROB_MUL']
  };
  function gear(code,slot,basic,condition,effect='HP_MUL') {
    const attr=1000+effects.length;
    const normalOptions=basics[basic].map(c=>({optionKey:key(c),range:{min:c==='CLN_SKLAVD_PROB_MUL'?4:10,max:10,unit:'PERCENT'}}));
    definitions.push({equipCode:code,starGrade:7,equipType:slot,normalOptions,highLevelOptions:{targetCondition:{kind:'rangerType',value:condition},defaultOption:{optionKey:key(effect)},switchOptions:[{optionKey:key(effect)}]}});
    effects.push({attributeId:attr,optionKey:key(effect)});
    return {itemCode:code,attr4No:attr,attr4OptionKey:key(effect),attr4Condition:{kind:'rangerType',value:condition},attr4Value:effect==='EATK_MUL'?250:effect==='SUMMON_ENGY_MUL'||effect==='PRD_SPE_MUL'?-18:10,attr4Unit:'PERCENT',normalOptions:normalOptions.map(o=>({optionKey:o.optionKey,value:o.optionKey===key('CLN_SKLAVD_PROB_MUL')?4:o.optionKey===key('PRD_SPE_MUL')||o.optionKey===key('SUMMON_ENGY_MUL')?-10:10,unit:'PERCENT'}))};
  }
  const configs=[
    ['A','FIRE','INT','total','TREE','resist','FIRE','EATK_MUL','INT','SUMMON_ENGY_MUL'],
    ['B','LIGHT','AGI','physical','AGI','healthResist','AGI','PRD_SPE_MUL','AGI','SUMMON_ENGY_MUL'],
    ['C','WATER','STR','total','WATER','healthEvade','STR','HP_MUL','WATER','SUMMON_ENGY_MUL'],
    ['D','WATER','INT','total','WATER','healthEvade','INT','SUMMON_ENGY_MUL','WATER','EATK_MUL'],
    ['E','TREE','AGI','total','TREE','healthResist','AGI','PRD_SPE_MUL','AGI','SUMMON_ENGY_MUL'],
    ['F','FIRE','STR','hp','FIRE','healthEvade','STR','SUMMON_ENGY_MUL','WATER','SUMMON_ENGY_MUL']
  ];
  for(const [code,elementType,roleType,w,wt,a,at,ae,ct,ce] of configs) {
    rangers.push({rangerCode:code,nameKey:'UNIT:'+code+'_nm',starGrade:9,roleType,elementType,stats:{skillDodgeChancePercent:0,skillResistancePercent:0,skillHitChancePercent:80},skillSet:[{skillCode:'fixture-single-hit',nameKey:'SKILL:fixture-single-hit_nm',descriptionKey:'SKILL:fixture-single-hit_desc',trigger:{type:'SELF'},activationRate:0,cooldownSeconds:0,effects:[{effectCode:'SKILLEFF_DMG',magnitude:{kind:'flat',value:10},rangePoints:0,availableIn:{events:true,guardian:true}}]}],abilityCodes:[],talents:null});
    units.push({unitCode:code,level:240,talentGrade:0,equipMap:{WEAPON:gear(code+'-w','WEAPON',w,wt),ARMOR:gear(code+'-a','ARMOR',a,at,ae),ACC:gear(code+'-c','ACC','accessory',ct,ce)}});
  }
  return {units,catalogs:{rangers,equipment:definitions,effects,abilities:[{abilityCode:'fixture-flight',triggerEffects:[{aptitudeCode:'FLIGHT'}]}]}};
}
module.exports={fixture,key};
