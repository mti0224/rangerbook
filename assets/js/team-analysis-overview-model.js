/* Level-aware team overview shared by PvP search and private teams. */
(() => {
  'use strict';
  const ROLES=['INT','AGI','STR'], ELEMENTS=['FIRE','WATER','TREE','LIGHT','DARK'],SLOTS=['WEAPON','ARMOR','ACC'];
  const KEY=s=>'EQUIP:GEAR_FILTER_'+s+'_nm';
  const num=x=>x!==null&&x!==undefined&&x!==''&&typeof x!=='boolean'&&Number.isFinite(Number(x))?Number(x):null;
  const mean=a=>a.length&&a.every(Number.isFinite)?a.reduce((sum,n)=>sum+n,0)/a.length:null;
  const id=x=>typeof x==='string'?x:x?.itemCode||x?.equipItemCode||x?.code;
  const talentCount=x=>num(x?.talentGrade);
  const bucket=(value,items)=>items.map(key=>({key,count:value.filter(x=>x===key).length}))
    .filter(x=>x.count).map(x=>({...x,ratio:x.count/value.length}));
  const star=r=>!r?'unknown':r.starGrade===8&&r.evolution==='ULTRA'?'ultra8':
    r.starGrade===8&&r.evolution==='HYPER'?'hyper8':String(r.starGrade??'unknown');
  function limits(r){
    const n=num(r.starGrade);if(!n||n<1||n>9)return null;
    const base=n<=5?n*10+10:n<=8?60+(n-5)*20:160;
    const evolved=r.evolution==='ULTRA'||r.evolution==='HYPER';
    const regular=base+(evolved?20:0);return {regular,max:regular+(evolved?100:20),evolved};
  }
  function levelStat(r,u,base,key){
    const current=num(u.level),conf=limits(r),origin=num(base);
    if(current===null||!conf||current<1||current>conf.max||origin===null)return null;
    const growth=num(r.rankUpStatIncrease?.[key])??0;
    const maxGrowth=num(r.rankUpStatIncreaseMax?.[key])??growth;
    return origin+Math.min(current-1,conf.regular-1)*growth+Math.max(0,current-conf.regular)*maxGrowth;
  }
  const respawnNormal=[0,.2,.3,.4,.5];
  const respawnEvolved=[0,.01,.02,.03,.05,.07,.09,.12,.15,.18,.20,.22,.24,.26,.28,.3,.33,.36,.4,.45,.5];
  function respawnAtLevel(r,u){
    const base=num(r.stats?.respawnSeconds),current=num(u.level),conf=limits(r);
    if(base===null||current===null||!conf||current<1||current>conf.max)return null;
    const stages=current<=conf.regular?0:Math.min(conf.evolved?20:4,Math.ceil((current-conf.regular)/5));
    return Math.max(1.3,base*(1-(conf.evolved?respawnEvolved:respawnNormal)[stages]));
  }
  function create(catalogs){
    const rangerByCode=new Map((catalogs.rangers||[]).map(r=>[r.rangerCode,r]));
    const gearByCode=new Map((catalogs.equipment||[]).map(g=>[g.equipCode,g]));
    const effects=new Map((catalogs.effects||[]).map(e=>[String(e.attributeId),e.optionKey]));
    function item(u,slot){
      const actual=(u.equipMap||u.equipment||{})[slot];
      return {actual,definition:gearByCode.get(id(actual))};
    }
    function condition(u,slot,r){
      const {actual,definition}=item(u,slot);
      if(!actual||!definition||definition.starGrade<=6||!definition.highLevelOptions||!actual.attr4No)return 'none';
      const c=actual.attr4Condition;
      if(c?.kind==='always')return 'always';
      if(c?.kind==='rangerType'&&[...ROLES,...ELEMENTS].includes(c.value))return c.value;
      return 'unknown';
    }
    function bonuses(u,r){
      const sums=Object.create(null),missing=new Set();
      const tracked=['ALL_ATK_MUL','GATK_MUL','SATK_MUL','HP_MUL','ATK_RNGE_MUL',
        'SKLRE_PROB_MUL','SKLAVD_PROB_MUL','CLN_SKLAVD_PROB_MUL',
        'SUMMON_ENGY_MUL','PRD_SPE_MUL','SKL_ATK_INVALID_MUL','SKL_PENETRATE_MUL'];
      const add=(code,value)=>{
        if(!tracked.includes(code))return;
        if(value===null)missing.add(code);
        else sums[code]=(sums[code]||0)+value;
      };
      const effectCode=key=>String(key||'').replace(/^EQUIP:GEAR_FILTER_/,'').replace(/_nm$/,'');
      for(const slot of SLOTS){
        const {actual,definition}=item(u,slot);
        if(!actual)continue;
        if(!definition){tracked.forEach(k=>missing.add(k));continue;}
        const options=actual.normalOptions;
        if(!Array.isArray(options)||options.length!==definition.normalOptions.length){
          for(const option of definition.normalOptions||[])add(effectCode(option.optionKey),null);
        }else{
          for(const option of options)add(effectCode(option.optionKey),num(option.value));
        }
        const selected=actual.attr4OptionKey||effects.get(String(actual.attr4No));
        if(!selected||!actual.attr4No||definition.starGrade<=6||!definition.highLevelOptions)continue;
        const allowed=[definition.highLevelOptions.defaultOption,...(definition.highLevelOptions.switchOptions||[])]
          .some(x=>x?.optionKey===selected);
        const c=actual.attr4Condition;
        const eligible=c?.kind==='always'||(c?.kind==='rangerType'&&
          (c.value===r.roleType||c.value===r.elementType));
        if(!allowed||!eligible)continue;
        add(effectCode(selected),actual.attr4Unit==='PERCENT'?num(actual.attr4Value):null);
      }
      (r.talents?.enhancements||[]).forEach((effect,i)=>{
        if(num(u.talentGrade)===null)return;
        if(Number(u.talentGrade)<i+2)return;
        add(effect.effectCode,num(effect.value)===null?null:num(effect.value)*(effect.unit==='PERCENT_FACTOR'?100:1));
      });
      const get=k=>missing.has(k)?null:sums[k]||0;
      return {get};
    }
    function member(u){
      const r=rangerByCode.get(u.unitCode);
      if(!r)return {unit:u,ranger:null,stats:null};
      const bonus=bonuses(u,r),read=code=>bonus.get(code);
      const relative=(value,codes)=>{
        if(value===null)return null;
        const vals=codes.map(read);return vals.some(x=>x===null)?null:value*(1+vals.reduce((a,b)=>a+b,0)/100);
      };
      const basePhys=levelStat(r,u,r.stats?.attack?.physical,'attackIncreaseAmount');
      const baseMagic=levelStat(r,u,r.stats?.attack?.magical,'specialAttackDelta');
      const physical=relative(basePhys,['ALL_ATK_MUL','GATK_MUL']);
      const magical=relative(baseMagic,['ALL_ATK_MUL','SATK_MUL']);
      const attack=physical===null||magical===null?null:physical+magical;
      const hp=relative(levelStat(r,u,r.stats?.hp,'hpIncreaseAmount'),['HP_MUL']);
      const range=relative(num(r.stats?.attackRange),['ATK_RNGE_MUL']);
      const resistance=num(r.stats?.skillResistancePercent);
      const evade=num(r.stats?.skillDodgeChancePercent);
      const percent=(value,k)=>value===null||read(k)===null?null:value+read(k);
      const mineralBase=num(r.stats?.mineralCost);
      const mineralReduction=read('SUMMON_ENGY_MUL');
      const mineral=mineralBase===null||mineralReduction===null?null:
        Math.max(0,mineralBase*(1+mineralReduction/100));
      const respawnBase=respawnAtLevel(r,u);
      const respawnReduce=read('PRD_SPE_MUL');
      const respawn=respawnBase===null||respawnReduce===null?null:
        Math.max(1.3,respawnBase*(1+respawnReduce/100));
      return {unit:u,ranger:r,stats:{
        attack,hp,range,
        resistance:percent(resistance,'SKLRE_PROB_MUL'),
        evade:percent(evade,'SKLAVD_PROB_MUL'),
        surehit:read('CLN_SKLAVD_PROB_MUL'),
        invalid:read('SKL_ATK_INVALID_MUL'),
        penetration:read('SKL_PENETRATE_MUL'),
        mineral,respawn
      }};
    }
    function summarize(units){
      const members=(units||[]).map(member);
      const present=members.filter(x=>x.ranger);
      const equip=members.flatMap(m=>SLOTS.map(slot=>({...item(m.unit,slot),unit:m.unit,
        category:m.ranger?condition(m.unit,slot,m.ranger):'unknown'})).filter(x=>x.actual));
      const numericSort=(values,keys)=>bucket(values,keys);
      const labels=Array.from(new Set(present.map(m=>star(m.ranger))));
      const gearLabels=Array.from(new Set(equip.map(m=>String(m.definition?.starGrade??'unknown'))));
      const advKeys=['none','always',...ROLES,...ELEMENTS,'unknown'];
      const distribution={
        star:numericSort(present.map(m=>star(m.ranger)),labels),
        role:numericSort(present.map(m=>m.ranger.roleType),ROLES),
        element:numericSort(present.map(m=>m.ranger.elementType),ELEMENTS.concat(['NONE'])),
        talent:numericSort(present.map(m=>String(talentCount(m.unit)??'unknown')),['0','1','2','3','4','unknown']),
        gearStar:numericSort(equip.map(x=>String(x.definition?.starGrade??'unknown')),gearLabels),
        condition:numericSort(equip.map(x=>x.category),advKeys)
      };
      const overall={mineral:mean(members.map(m=>m.stats?.mineral??null)),
        respawn:mean(members.map(m=>m.stats?.respawn??null))};
      const role={};
      for(const type of ROLES){
        const values=present.filter(m=>m.ranger.roleType===type);
        const fields=['attack','hp','range','resistance','evade','surehit','invalid','penetration','mineral','respawn'];
        role[type]={count:values.length,stats:Object.fromEntries(fields.map(field=>
          [field,mean(values.map(m=>m.stats[field]))]))};
      }
      return {distribution,overall,roles:role,membersCount:members.length};
    }
    return {summarize,member};
  }
  const api={create,levelStat,respawnAtLevel,limits};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else window.RangerbookTeamOverviewModel=api;
})();