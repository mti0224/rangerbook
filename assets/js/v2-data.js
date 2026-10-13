/* V2 is authoritative. Adapt its typed records to existing page view contracts.
 * Chinese property names/category values are internal legacy identifiers only.
 * No V1 generated JSON is fetched or used by this adapter. */
(() => {
  "use strict";
  if (window.RangerbookV2) return;
  const root = location.pathname.startsWith("/rangerbook/") ? "/rangerbook/" : "/";
  const nativeFetch = window.fetch.bind(window);
  const language = {"zh-Hant":"zh_TW",zh_TW:"zh_TW",en:"en",th:"th",jp:"jp",ja:"jp"};
  let saved; try {saved=localStorage.getItem("rangerbook-language");} catch (_) {}
  if (!language[saved] && typeof document!=="undefined")
    saved=document.cookie.split("; ").find(x=>x.startsWith("rangerbook-language="))?.split("=")[1];
  let locale = language[saved] || language[window.RangerbookVisitor?.locale] || "zh_TW";
  const localeReady = window.RangerbookVisitor
    ? window.RangerbookVisitor.ready.then(value => { locale = language[value] || "en"; })
    : Promise.resolve();
  const cache = new Map(), catalog = new Map(), phrases = new Map(), ambiguous = new Set(), priorities = new Map();
  const normalized = s => String(s || "").replace(/\\+n/g," ").replace(/\s+/g," ").trim();
  const types = {STR:"力量型",AGI:"敏捷型",INT:"智慧型"};
  const elements = {NONE:"無",FIRE:"火",WATER:"水",TREE:"木",LIGHT:"光",DARK:"暗"};
  const speeds = {VERYFAST:"非常快",FAST:"快",NORMAL:"普通",SLOW:"慢",VERYSLOW:"非常慢"};
  const number = n => String(Math.round(Number(n)*1000)/1000);
  function pair(source, target, priority=0) {
    source=normalized(source);target=normalized(target);
    if (!source || !target || source===target) return;
    const current=priorities.get(source) ?? -1;
    if (priority < current || (priority === current && ambiguous.has(source))) return;
    if (priority > current) {ambiguous.delete(source);phrases.set(source,target);priorities.set(source,priority);}
    else if (phrases.has(source) && phrases.get(source)!==target) {phrases.delete(source);ambiguous.add(source);}
    else {phrases.set(source,target);priorities.set(source,priority);}
  }
  function arg(x, lang) {
    if (x && typeof x==="object") {
      if (typeof x.min==="number" && typeof x.max==="number")
        return x.min===x.max?number(x.min):number(x.min)+" ~ "+number(x.max);
      return render(x,lang);
    }
    return x===null || x===undefined?"":typeof x==="number"?number(x):String(x);
  }
  function fill(text,args,lang) {
    let slot=0;
    return text.replace(/%(?:N\d*|d\d*|s|n)/g, token => {
      const i=/^%[Nd]\d+$/.test(token)?Number(token.slice(2))-1:slot++;
      if (i<0 || i>=args.length || args[i]===undefined || args[i]===null)
        throw new Error("Unbound V2 template argument "+token);
      return arg(args[i],lang);
    });
  }
  function render(ref,lang="zh_TW") {
    if (ref===null || ref===undefined) return "";
    if (typeof ref==="string") {
      const row=catalog.get(ref);
      if (!row) {
        if (/^(?:CUSTOM|UI):/.test(ref)) throw new Error("Missing authored V2 key: "+ref);
        return /^(?:UNIT|SKILL|ABILITY|EQUIP):/.test(ref)?ref.slice(ref.indexOf(":")+1):ref;
      }
      // Missing official source text is an accepted source gap; retain an ID.
      const value=row[lang]?.trim()?row[lang]:row.en || row.zh_TW || ref.slice(ref.indexOf(":")+1);
      return value.replace(/\\+n/g,"\n");
    }
    if (ref.parts) return ref.parts.map(p=>render(p,lang)).join("");
    if (ref.templateKey) return fill(render(ref.templateKey,lang),ref.args || [],lang);
    if (ref.key) {
      return render(ref.key,lang).replace(/\{\$(\d+[pf])\}/g,(token,code)=>{
        const v=ref.bindings?.["$"+code];
        if (!v || v.min===null || v.max===null || v.min===undefined || v.max===undefined)
          throw new Error("Missing native V2 binding "+token);
        return arg(v,lang)+(code.endsWith("p")?"%":"");
      }).replace(/<#(?:[0-9a-f]+)>|<->/gi,"");
    }
    throw new Error("Unknown V2 text reference");
  }
  function text(ref) {
    const zh=render(ref,"zh_TW");pair(zh,render(ref,locale),2);return zh;
  }
  const catalogPromises=Object.fromEntries(["official","custom","ui"].map(name=>[name,(async()=>{
    const r=await nativeFetch(root+"res/v2/locales/"+name+".json?v=20261013-v2.5");
    if (!r.ok) throw new Error("V2 catalog unavailable: "+name);
    const rows=await r.json();
    await localeReady;
    if (!Array.isArray(rows)) throw new Error("Invalid V2 catalog: "+name);
    for (const row of rows) {
      if (catalog.has(row.key)) throw new Error("Duplicate V2 key: "+row.key);
      catalog.set(row.key,row);pair(row.zh_TW,row[locale],/^EQUIP:GEAR_ATTR_.*_nm$/.test(row.key)?4:/^ABILITY:.*_nm$/.test(row.key)?3:0);
    }
  })()]));
  const authoredReady=Promise.all([catalogPromises.custom,catalogPromises.ui]);
  const catalogsReady=Promise.all(Object.values(catalogPromises));
  // Report rejected bootstrap without silently switching to V1.
  catalogsReady.catch(e=>console.error("V2 language catalogs failed",e));
  async function data(name) {
    if (!cache.has(name)) cache.set(name,(async()=>{
      await catalogsReady;
      const r=await nativeFetch(root+"res/v2/"+name+".json");
      if (!r.ok) throw new Error("V2 dataset unavailable: "+name);
      const d=await r.json();
      if (d.schemaVersion!==2) throw new Error("Invalid V2 schema: "+name);
      return d;
    })());
    return cache.get(name);
  }
  const percent = n => number(n)+"%";
  const seconds = n => number(n)+"秒";
  const points = n => number(n)+"點";
  function range(v) {
    if (!v) return "-";
    const suffix=v.unit==="PERCENT"?"%":v.unit==="SECOND"?"秒":"";
    return number(v.min)+suffix+(v.min===v.max?"":" ~ "+number(v.max)+suffix);
  }
  function formula(v) {
    const op={ADD:"+",SUBTRACT:"-",MULTIPLY:"*"}[v.operator];
    if (!op) throw new Error("Unknown V2 formula operator");
    return text({templateKey:"UI:dynamic.levelFormula."+v.operator,args:[v.amount]})+(v.unit==="SECOND"?"秒":"");
  }
  function magnitude(v) {
    if (!v) return "-";
    switch(v.kind) {
      case "statPercent": return text({templateKey:"UI:dynamic.statPercent."+v.stat+"."+v.operator,args:[v.percent]});
      case "percent": return (v.direction==="DECREASE"?"-":"+")+percent(v.value);
      case "levelFormula": return formula(v);
      case "summonLevel": return text({templateKey:"UI:dynamic.level",args:[v.level]});
      case "points": return points(v.value);
      case "flat": return (v.direction==="DECREASE"?"-":v.direction==="INCREASE"?"+":"")+number(v.value);
      case "gradeValue": return number(v.value);
      default: throw new Error("Unknown V2 magnitude: "+v.kind);
    }
  }
  function effectMagnitude(e) {
    if (e.effectTrigger && e.targetLimit?.kind === "limited")
      return text({templateKey:"UI:skill.chanceAndLimit",args:[e.effectTrigger.percent,e.targetLimit.maxTargets]});
    if (e.magnitude?.kind === "summonLevel" && e.targetLimit)
      return text({templateKey:e.targetLimit.kind === "unlimited" ? "UI:skill.summonUnlimited" : "UI:skill.summonLimited",
        args:e.targetLimit.kind === "unlimited" ? [e.magnitude.level] : [e.targetLimit.maxTargets,e.magnitude.level]});
    return magnitude(e.magnitude);
  }
  function skill(s) {
    const trigger=s.trigger.type==="SELF"?"自身":s.trigger.type==="SEARCH"?"前方敵人":
      s.trigger.type==="RSEARCH"?"後方敵人（倍率:"+number(s.trigger.searchRatio)+"倍）":s.trigger.type;
    return {"技能名稱":text(s.nameKey)||s.skillCode,"技能敘述":text(s.descriptionKey),
      "發動機率":percent(s.activationRate),"觸發基準":trigger,"技能冷卻時間":seconds(s.cooldownSeconds),icon:s.icon,
      "技能組":s.effects.map(e=>({"效果":text("CUSTOM:"+e.effectCode),"係數":effectMagnitude(e),
        "有效時間":!e.duration?"-":e.duration.kind==="levelFormula"?formula(e.duration):seconds(e.duration.seconds),
        "範圍":points(e.rangePoints),"適用於活動關卡":e.availableIn.events?"是":"否",
        "適用於守護神":e.availableIn.guardian?"是":"否",
        ...(e.effectTrigger?{"發動機率":percent(e.effectTrigger.percent)}:{}),
        ...(e.targetLimit?{"對象上限":e.targetLimit.kind==="unlimited"?"無限制":number(e.targetLimit.maxTargets)+"隻"}:{}),
        effectCode:e.effectCode}))};
  }
  const statMap={hp:"體力",mineralCost:"生產礦物費用",attackRange:"攻擊範圍",splashRange:"濺射範圍",
    physicalAttack:"物理攻擊力",magicalAttack:"魔法攻擊力",physicalDefense:"物理防禦力",magicalDefense:"魔法防禦力",
    attackRangePoints:"攻擊範圍",splashRangePoints:"濺射範圍",criticalChancePercent:"爆擊機率",
    criticalDamagePercent:"爆擊傷害",dodgeChancePercent:"閃避機率",skillDodgeChancePercent:"技能閃避機率",
    skillResistancePercent:"技能抗性",hitChancePercent:"命中率",skillHitChancePercent:"技能命中率"};
  function stats(s) {
    const out={};
    for (const [k,label] of Object.entries(statMap)) if(s[k]!==undefined) out[label]=k.endsWith("Percent")?percent(s[k]):s[k];
    if(s.attack) {out["物理攻擊力"]=s.attack.physical;out["魔法攻擊力"]=s.attack.magical;}
    if(s.defense) {out["物理防禦力"]=s.defense.physical;out["魔法防禦力"]=s.defense.magical;}
    if(s.respawnSeconds!==undefined) out["Ranger再生產時間"]=seconds(s.respawnSeconds);
    if(s.attackSpeed) out["攻擊速度"]=(speeds[s.attackSpeed.rating]||s.attackSpeed.rating)+"("+number(s.attackSpeed.secondsPerAttack)+"秒/下)";
    if(s.moveSpeed) out["移動速度"]=(speeds[s.moveSpeed.rating]||s.moveSpeed.rating)+"("+number(s.moveSpeed.pointsPerSecond)+"點/秒)";
    return out;
  }
  async function abilityMap() {
    const rows=(await data("abilities")).abilities;
    return Object.fromEntries(rows.map(a=>{
      const out={icon:a.icon,"名稱":text(a.nameKey),"敘述":text(a.descriptionKey),
        __v2:{nameKey:a.nameKey,descriptionKey:a.descriptionKey},
        "覺醒能力":a.tags.awakening?"是":"否","一般敵人能力":a.tags.enemy?"是":"否",
        "迷宮敵人能力":a.tags.labyrinthEnemy?"是":"否","隊伍能力":a.tags.team?"是":"否"};
      a.triggerEffects.forEach((e,i)=>{
        out["觸發效果"+(i?i+1:"")]={"機率":percent(e.chancePercent),"發動時機":text(e.triggerPhaseKey),
          "場合":text(e.battleModeKey),"條件":text(e.conditionKey),"效果":text(e.effectKey),
          ...(e.additionalConditionKey?{"條件2":text(e.additionalConditionKey)}:{})};
      });return [a.abilityCode,out];
    }));
  }
  function talent(t) {
    if (!t) return "無";
    const out={};
    if(t.major) {const m=t.major;
      out["主要才能"]={"敘述":text(m.descriptionKey),"觸發機率":percent(m.activationChancePercent),
        "條件":text(m.activationConditionKey),"增益效果":m.effects.map(x=>text(x.localizedEffect))};
      (m.additionalConditions||[]).forEach((x,i)=>out["主要才能"]["條件"+(i+2)]=text(x.text || x.textKey || x));
    }
    out["強化才能"]=(t.enhancements||[]).map(x=>text(x.localizedEffect));
    return out;
  }
  function stars(x) {return (x.evolution==="HYPER"?"超進化":x.evolution==="ULTRA"?"究極進化":"")+x.starGrade+"星";}
  function localizedRangerTags(x) {
    const starKey=x.evolution==="HYPER"?"hyper":x.evolution==="ULTRA"?"ultra":"stars";
    const element=x.elementType==="TREE"?"wood":x.elementType.toLowerCase();
    return [render({templateKey:"UI:dynamic."+starKey,args:[x.starGrade]},locale),
      render("UI:tag."+x.roleType.toLowerCase(),locale),
      render("UI:"+(x.elementType==="NONE"?"copy.none":"tag."+element),locale)];
  }
  async function actors(name) {
    const d=await data(name), aa=await abilityMap(), enemy=name.startsWith("enemies/");
    return (d.rangers||d.enemies).map(x=>{
      const out={...(enemy?{enemy_id:x.enemyCode}:{ranger_id:x.rangerCode,"Ranger名稱":text(x.nameKey),
        "角色敘述":text(x.descriptionKey),"登場時間":x.releaseDate||"","Ranger星數":stars(x)}),
        "類型":types[x.roleType]||x.roleType,"屬性":elements[x.elementType]||x.elementType,
        ...stats(x.stats),"技能1":"無","技能2":"無","覺醒能力":"無",
        "才能":talent(x.talents),"nft角色":x.tags?.nft?"是":"否","降臨關卡角色":x.tags?.advent?"是":"否"};
      (x.skillSet||x.skills||[]).forEach((s,i)=>out["技能"+(i+1)]=skill(s));
      (x.abilityCodes||[]).forEach((code,i)=>{
        out["能力"+(i+1)]=aa[code]?.["名稱"]||code;out["abilityCode"+(i?i+1:"")]=code;
      });
      if(x.awakeningAbilities?.length) out["覺醒能力"]=x.awakeningAbilities.map(a=>({
        "能力":aa[a.abilityCode]?.["名稱"]||text(a.nameKey)||a.abilityCode,abilityCode:a.abilityCode,icon:a.icon}));
      Object.assign(out,x.rankUpStatIncrease||{});
      for (const [k,v] of Object.entries(x.rankUpStatIncreaseMax||{})) out[k+"Max"]=v;
      out.__v2={code:x.rangerCode||x.enemyCode,roleType:x.roleType,elementType:x.elementType};return out;
    });
  }
  async function equipment() {
    return (await data("equipment")).equipment.map(x=>{
      const out={id:x.equipCode,"裝備名稱":text(x.nameKey),"裝備星級":x.starGrade,
        "裝備種類":text("CUSTOM:EQUIP_TYPE_"+x.equipType),
        "基本效果":Object.fromEntries(x.normalOptions.map(e=>[text(e.optionKey),range(e.range)])),"高級效果":{},"Skill+":[],"Spec+":{}};
      const a=x.highLevelOptions;
      if(a) out["高級效果"]={"觸發條件":text("CUSTOM:EQUIP_RANGER_TYPE_"+a.targetCondition.value),"預設效果":text(a.defaultOption.optionKey),
        "預設效果係數":range(a.defaultOption.range),"可切換的效果":Object.fromEntries(a.switchOptions.map(e=>
          [text(e.optionKey),{"係數":range(e.range),"每次升級增加":range({min:e.upgradeStep,max:e.upgradeStep,unit:e.range.unit})}]))};
      out["Skill+"]=x.skillPlus.map(e=>({"技能效果":text("CUSTOM:"+e.effectCode),
        "係數":e.dimension==="MAGNITUDE"?range(e.range):"-","有效時間":e.dimension==="DURATION"?range(e.range):"-",
        "每次升級係數增加":e.dimension==="MAGNITUDE"?range({min:e.upgradeStep,max:e.upgradeStep,unit:e.range.unit}):"-",
        "每次升級時間增加":e.dimension==="DURATION"?seconds(e.upgradeStep):"-"}));
      if(x.specPlus) {
        const sp=x.specPlus, special={};
        sp.specialOptions.forEach((s,i)=>{
          const ref=s.descriptionBindings?{key:s.descriptionKey,bindings:s.descriptionBindings}:s.descriptionKey;
          special["敘述"]=(special["敘述"]?special["敘述"]+"\n":"")+text(ref);
          special["觸發機率"]=range(s.triggerChance);
          s.conditionKeys.forEach((c,j)=>special["條件"+(i?""+(i+1)+""+(j+1):j?j+1:"")]=text(c));
          const e=s.effect;
          special["觸發效果"+(i?i+1:"")]={"觸發機率":range(e.chance),"每次升級觸發機率增加":percent(e.chanceUpgrade),
            "效果":text(e.nameKey),"係數":range(e.magnitudeRange),"每次升級係數增加":range({min:e.magnitudeUpgrade,max:e.magnitudeUpgrade,unit:e.magnitudeRange.unit}),
            "時間":range(e.durationRange),"每次升級時間增加":seconds(e.durationUpgradeSeconds)};
        });
        out["Spec+"]={"名稱":text(sp.nameKey),"基本效果":Object.fromEntries(sp.basicOptions.map(e=>
          [text(e.optionKey),{"係數":range(e.valueRange),"每次升級增加":range({min:e.upgradeStep,max:e.upgradeStep,unit:e.valueRange.unit})}])),"特殊效果":special};
      }return out;
    });
  }
  function spawn(u) {return {"敵人id":u.unitCode,"初登場時間":u.initialDelaySeconds===null?"-":seconds(u.initialDelaySeconds),
    "再生產間距":u.repeatInterval?range({min:u.repeatInterval.minSeconds,max:u.repeatInterval.maxSeconds,unit:"SECOND"}):"-",
    "生產上限":u.maxUnits===null?"-":number(u.maxUnits)+"隻","詳細資訊":stats(u.combatStats)};}
  function when(w) {
    switch(w.kind) {
      case "AFTER_START": case "STAGE_START": return "遊戲開始後"+number(w.seconds||0)+"秒";
      case "ALLY_FRONTLINE_OVER": return "我方前線位置超過"+number(w.percent)+"%";
      case "BATTLE_TIME_OVER": return "戰鬥時間超過"+number(w.seconds)+"秒";
      case "BOSS": return "BOSS";
      case "BOSS_HP_BELOW": return "BOSS血量低於"+number(w.percent)+"%";
      case "ENEMY_TOWER_HP_BELOW": return "敵方塔城血量低於"+number(w.percent)+"%";
      default: throw new Error("Unknown V2 wave condition "+w.kind);
    }
  }
  async function stages(mode) {
    const out={};
    for(const x of (await data("stages/"+mode)).stages) {
      const e=x.environment, v={};
      const map={unitExp:"角色EXP",playerExp:"玩家EXP",coins:"金幣",towerHp:"塔城體力",allyTowerHp:"我方塔城體力",enemyTowerHp:"敵方塔城體力",cageHp:"牢籠體力"};
      for(const [k,label] of Object.entries(map)) if(e[k]!==undefined)v[label]=e[k];
      if(e.mapLengthPoints!==undefined)v["地圖長度"]=points(e.mapLengthPoints);
      if(e.featherCost!==undefined)v["羽毛消耗量"]=e.featherCost+"根";
      if(e.rescueTarget!==undefined)v["拯救數量"]=e.rescueTarget+"隻";
      v["時間限制"]=e.timeLimitSeconds?seconds(e.timeLimitSeconds):"無";
      if(x.battleTypeKey)v[mode==="endless"?"樓層類型":"關卡類型"]=text(x.battleTypeKey);
      v["敵人生產線"]=mode==="endless"?x.spawnWaves.flatMap(w=>w.units.map(spawn)):
        Object.fromEntries(x.spawnWaves.map(w=>[when(w.when),w.units.map(spawn)]));
      if(mode==="extreme") {
        for(const [from,to] of [["passiveGimmicks","被動機關"],["activeGimmicks","主動機關"]])
          v[to]=x[from].map(g=>({"資料名稱":g.gimmickCode,"名稱":text(g.nameKey),
            "定義":text(g.descriptionArgs?{templateKey:g.descriptionKey,args:g.descriptionArgs}:g.descriptionKey)}));
        v["主動機關首次發動"]=seconds(x.activeGimmickTiming.initialDelaySeconds);
        v["主動機關冷卻時間"]=seconds(x.activeGimmickTiming.cooldownSeconds);
      }
      (x.gimmicks||[]).forEach((g,i)=>{v["機關"+(i+1)]=text({templateKey:g.descriptionKey,args:g.descriptionArgs||[]});v["機關"+(i+1)+"_icon"]=g.icon;});
      if(mode==="labyrinth") {out[x.tile] ||= {};out[x.tile]["等級"+x.difficulty]=v;}
      else out[(mode==="hard"?"困難關卡":mode==="extreme"?"極限關卡":"第")+(x.stageNumber||x.stageId.match(/\d+$/)[0])+(mode==="endless"?"層":"關")]=v;
    }return out;
  }
  async function artifacts() {
    return Object.fromEntries((await data("labyrinth-artifacts")).artifacts.map(x=>[text(x.nameKey)+"["+x.grade+"]",{
      "分類":x.effect.direction==="INCREASE"?"增益":"減益","效果":text({templateKey:x.effect.effectKey,args:x.effect.effectArgs}),
      "分數":Object.fromEntries(Object.entries(x.pointsByTarget).map(([k,v])=>[types[k]||(elements[k]+"屬性"),v])),icon_path:x.iconPath}]));
  }
  async function projectiles() {
    const raw=(await data("projectiles")).units;
    const rows=Array.isArray(raw)?raw:Object.values(raw);
    return {schemaVersion:3,source:"V2",unitCount:rows.length,units:Object.fromEntries(rows.map(x=>{
      const v=x.visual,m=x.movement,out={unitCode:x.unitCode,resourceCode:v.resourceCode,guardianResourceCode:v.guardianResourceCode,
        useEnemySideResource:v.useEnemySprite?1:0,render:{flightYn:v.flying?1:0,sizeRatio:v.scale,shadowCenter:v.shadowCenter,faceCenter:v.faceCenter},
        movement:{movingSpeed:m.speedPointsPerSecond},hitTiming:{attackDelay:m.attackDelayFrames,normalHitPointRate:m.hitTimingPercent.normal,
          skill1HitPointRate:m.hitTimingPercent.skill1,skill2HitPointRate:m.hitTimingPercent.skill2},bullet:x.projectile,sounds:{},effects:{baseAttackEffectCode:x.effects?.normal,specialAttackEffectCode:x.effects?.special,skillEffectColor1:x.effects?.color1,skillEffectColor2:x.effects?.color2}};
      for(const [k,c] of Object.entries(x.attackChannels)) {const t=c.trajectory;
        out[k]={skillCode:c.skillCode,animationPart:c.animationPart,attackType:c.attackStyle,attackRange:c.rangePoints,attackScope:c.scopePoints,
          target:c.target,start:t.startPosition,secondStart:t.alternateStartPosition,end:t.endPosition,angle:t.angles,moveSpeed:t.speed,
          motion:{type:t.style,enabled:t.enabled,rotation:t.rotation,loopNormal:t.repeat}};
        out.sounds[k]={preparation:c.soundAssets.preparation,attack:c.soundAssets.firing,underAttack:c.soundAssets.impact};
      }return [x.unitCode,out];
    }))};
  }
  const routes={"Rangers_data.json":()=>actors("rangers"),"能力.json":abilityMap,"裝備資料庫.json":equipment,
    "困難關卡生產線.json":()=>stages("hard"),"極限關卡生產線.json":()=>stages("extreme"),
    "無限之塔敵人生產線.json":()=>stages("endless"),"迷宮關卡生產線.json":()=>stages("labyrinth"),
    "迷宮遺物.json":artifacts,"projectile_data.json":projectiles,
    "Ranger_index.json":async()=>(await data("ranger-index")).rangers.map(x=>({
      id:x.rangerCode,name:text(x.nameKey),localizedName:render(x.nameKey,locale),
      nameAliases:[...new Set(["zh_TW","en","th","jp"].map(lang=>render(x.nameKey,lang)))],
      localizedTags:localizedRangerTags(x),
      star:stars(x),type:types[x.roleType],element:elements[x.elementType]
    })),
    "id_dict.json":async()=>Object.fromEntries((await equipment()).map(x=>[x["裝備名稱"],x.id])),
    "effect_dict.json":async()=>(await data("equipment-effects")).effects.map(x=>({attrNo:x.attributeId,"效果名稱":text(x.optionKey)}))};
  for(const [old,mode] of Object.entries({hsEnemy:"hard",extremeEnemy:"extreme",infEnemy:"endless",eventStageEnemy:"event",adventEnemy:"advent",labyrinthEnemy:"labyrinth"}))
    routes[old+"_data.json"]=()=>actors("enemies/"+mode);
  function legacyLocale(lang) {
    const out={locale:lang,official:{UNIT:{},SKILL:{},ABILITY:{},EQUIP:{}},custom:{}};
    for(const [key,row] of catalog) {const at=key.indexOf(":"),kind=key.slice(0,at),id=key.slice(at+1),value=render(key,language[lang]||"zh_TW");
      if(out.official[kind])out.official[kind][id]=value;else if(kind==="CUSTOM")out.custom[id]=value;
    }return out;
  }
  const viewCache=new Map();
  window.fetch=async(input,options)=>{
    let url;try{url=new URL(typeof input==="string" || input instanceof URL?String(input):input.url,location.href);}catch(_){return nativeFetch(input,options);}
    if(url.origin!==location.origin)return nativeFetch(input,options);
    const path=decodeURIComponent(url.pathname),name=path.split("/").pop();
    let build;
    if(/\/res\//.test(path) && routes[name])build=routes[name];
    else if(path.endsWith("/assets/locales/ui.json"))build=()=>Object.fromEntries(["zh-Hant","en","th","jp"].map(l=>[l,Object.fromEntries([...catalog.values()].filter(x=>x.key.startsWith("UI:")).map(x=>[x.key.slice(3),x[language[l]]]))]));
    else if(path.endsWith("/assets/locales/game-custom.json"))build=()=>[...catalog.values()].filter(x=>/^(CUSTOM|UI):/.test(x.key)).map(x=>({...x,key:x.key.replace(/^CUSTOM:/,"")}));
    else if(/\/res\/i18n\//.test(path))build=()=>legacyLocale(name.replace(/\.json$/,""));
    if(!build)return nativeFetch(input,options);
    try {
      await (path.includes("/assets/locales/") ? authoredReady : catalogsReady);
      if(!viewCache.has(path))viewCache.set(path,Promise.resolve().then(build));
      return new Response(JSON.stringify(await viewCache.get(path)),{status:200,headers:{"Content-Type":"application/json","X-Rangerbook-Source":"v2"}});
    }catch(e){viewCache.delete(path);console.error("V2 view failed",path,e);return new Response(JSON.stringify({error:"V2 unavailable"}),{status:503,headers:{"Content-Type":"application/json"}});}
  };
  window.RangerbookV2={ready:catalogsReady,get locale(){return locale;},data,render,text,catalog,
    translateText:s=>phrases.get(normalized(s))||s,source:"v2",routes:Object.keys(routes)};
})();
