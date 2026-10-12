(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const dataRoot = "../res/v2/";
  const localeFiles = ["official", "custom", "ui"];
  const labels = {
    "rangers":"v2.rangers", "equipment":"v2.equipment",
    "abilities":"v2.abilities", "stages/extreme":"v2.extreme",
    "stages/endless":"v2.endless","stages/hard":"copy.hard.stages",
    "stages/labyrinth":"copy.labyrinth.stages",
    "enemies/hard":"copy.hard.stage.enemies","enemies/extreme":"copy.extreme.mode.enemies",
    "enemies/endless":"copy.endless.tower.enemies","enemies/event":"home.event.desc",
    "enemies/advent":"home.advent.desc","enemies/labyrinth":"copy.labyrinth.enemies",
    "labyrinth-artifacts":"copy.labyrinth.artifacts","projectiles":"v2.projectiles",
    "resources":"v2.resources","ranger-index":"v2.rangerIndex",
    "equipment-name-index":"v2.equipmentIndex","equipment-effects":"v2.equipmentEffects"
  };
  const state = {locale:"zh_TW",dataset:"rangers",catalog:new Map(),dataCache:new Map(),
                 rows:[],version:0,missing:0};
  const escapeHtml = value => String(value === null || value === undefined ? "" : value)
    .replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const num = value => typeof value === "number" ? value.toLocaleString("en-US",{maximumFractionDigits:3}) : String(value ?? "");
  function local(key) {
    const row=state.catalog.get(key);
    if (!row) return {text:key || "-",missing:!!key};
    let value=row[state.locale];
    if (typeof value === "string" && value.trim()) return {text:value,missing:false};
    value=row.en || row.zh_TW || row.key;
    return {text:value,missing:true};
  }
  function localized(key) {
    const value=local(key);
    if (value.missing) state.missing++;
    const hint=value.missing ? (' title="'+escapeHtml(key+": missing "+state.locale)+'" class="missing"') : "";
    return "<span"+hint+">"+escapeHtml(value.text)+"</span>";
  }
  function resolveArg(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object" && !Array.isArray(value)) {
      if (typeof value.min==="number" && typeof value.max==="number")
        return value.min===value.max?num(value.min):num(value.min)+" ~ "+num(value.max);
      if (typeof value.key === "string") return renderText(value).text;
      if ("templateKey" in value || "parts" in value) return renderText(value).text;
    }
    return num(value);
  }
  function fill(source,values) {
    let sequential=0;
    return source.replace(/%(?:N[0-9]+|d[0-9]+|N|d|s|n)/g, token => {
      const index=/^%[Nd][0-9]+$/.test(token) ? Number(token.slice(2))-1 : sequential++;
      if (index<0 || index>=values.length || values[index]===null || values[index]===undefined) return token;
      return resolveArg(values[index]);
    });
  }
  function renderText(node) {
    if (node === null || node === undefined || node === "") return {text:"",missing:false};
    if (typeof node === "string") return /^(CUSTOM|UI|UNIT|SKILL|ABILITY|EQUIP|V2):/.test(node)?
      local(node):{text:node,missing:false};
    if (typeof node === "object" && typeof node.key === "string") {
      const result=local(node.key);
      if (!node.bindings) return result;
      let missing=result.missing;
      const text=result.text.replace(/\{\$(\d+[pf])\}/g,(token,code)=>{
        const value=node.bindings["$"+code];
        if (!value || value.min===null || value.max===null ||
            value.min===undefined || value.max===undefined) {missing=true;return token;}
        const range=value.min===value.max?num(value.min):num(value.min)+" ~ "+num(value.max);
        return range+(code.endsWith("p")?"%":"");
      }).replace(/<#(?:[0-9a-f]+)>|<->/gi,"");
      return {text,missing};
    }
    if (typeof node === "object" && Array.isArray(node.parts)) {
      const parts=node.parts.map(renderText);
      return {text:parts.map(x=>x.text).join(""),missing:parts.some(x=>x.missing)};
    }
    if (typeof node === "object" && typeof node.templateKey === "string") {
      const template=local(node.templateKey);
      const args=node.args || [];
      const nestedMissing=args.some(v=>v && typeof v==="object" && renderText(v).missing);
      const text=fill(template.text,args);
      const unresolved=/%(?:N[0-9]*|d[0-9]*|s|n)/.test(text);
      return {text,missing:template.missing || nestedMissing || unresolved};
    }
    return {text:String(node),missing:false};
  }
  function showText(node) {
    const value=renderText(node);
    if (value.missing) state.missing++;
    return "<span"+(value.missing?' class="missing" title="'+escapeHtml("Missing "+state.locale)+'"':"")+">"
      +escapeHtml(value.text || "-")+"</span>";
  }
  function ui(k,fallback) {
    const result=local("UI:"+k);
    return result.text==="UI:"+k ? fallback : result.text;
  }
  function setUi() {
    document.documentElement.lang=state.locale==="zh_TW"?"zh-Hant":state.locale==="jp"?"ja":state.locale;
    document.title=ui("v2.title","V2 Preview")+" | LINE Rangers Database";
    for (const [id,key,fallback] of [
      ["title","v2.title","V2 多語系資料預覽"],["subtitle","v2.subtitle",""],
      ["localeLabel","v2.language","顯示語言"],["datasetLabel","v2.dataset","資料類型"],
      ["searchLabel","v2.search","搜尋代碼或名稱"],["notice","v2.notice",""],
      ["backLink","v2.back","返回資料站"],["footer","v2.footer",""]]) {
      if ($(id)) $(id).textContent=(id==="backLink"?"← ":"")+ui(key,fallback);
    }
    for (const option of $("dataset").options)
      option.textContent=ui(labels[option.value],option.value);
  }
  function valueLine(label,content) {
    if (!content) return "";
    return '<div><strong>'+escapeHtml(label)+":</strong> "+content+"</div>";
  }
  function detailRecord(x) {
    const data=state.dataset;
    if (data==="rangers" || data.startsWith("enemies/")) {
      const v=x.stats || {};
      const skills=(x.skillSet || x.skills || []).map(sk => {
        const effects=(sk.effects||[]).map(ef => showText("CUSTOM:"+ef.effectCode)+
          (ef.magnitude? " · "+escapeHtml(JSON.stringify(ef.magnitude)):"")+
          (ef.duration? " · "+escapeHtml(JSON.stringify(ef.duration)):"")).join("<hr>");
        return valueLine(sk.skillCode || "",showText(sk.nameKey)+" · "+showText(sk.descriptionKey)+"<p>"+effects+"</p>");
      }).join("");
      return valueLine(ui("v2.stats","數據"),escapeHtml(JSON.stringify(v)))+
        valueLine(ui("v2.skills","技能"),skills)+
        valueLine(ui("v2.effects","效果"),escapeHtml((x.abilityCodes||[]).join(", ")));
    }
    if (data==="equipment") {
      const opts=(x.normalOptions||[]).map(e=> valueLine("",showText(e.optionKey)+" "+escapeHtml(JSON.stringify(e.range)))).join("");
      const advanced=(x.highLevelOptions?.switchOptions||[]).map(e=>valueLine("",showText(e.optionKey)+" "+escapeHtml(JSON.stringify(e.range)))).join("");
      const skills=(x.skillPlus||[]).map(e=>valueLine("",showText("CUSTOM:"+e.effectCode)+" "+escapeHtml(JSON.stringify(e.range)))).join("");
      const sp=x.specPlus;
      let spec="";
      if (sp) spec=showText(sp.nameKey)+ "<div>"+(sp.specialOptions||[]).map(s=>
        valueLine("",showText(s.descriptionBindings ?
          {key:s.descriptionKey,bindings:s.descriptionBindings}:s.descriptionKey))+
        (s.conditionKeys||[]).map(c=>valueLine("",showText(c))).join("")
      ).join("</div><div>")+"</div>";
      return valueLine(ui("v2.effects","效果"),opts+advanced+skills)+valueLine(ui("v2.specPlus","Spec+"),spec);
    }
    if (data==="abilities") {
      return (x.triggerEffects||[]).map(e=>
        valueLine("",showText(e.effectKey))+
        valueLine("",showText(e.conditionKey))+
        valueLine("",showText(e.additionalConditionKey))
      ).join("");
    }
    if (data==="labyrinth-artifacts") {
      return showText({templateKey:x.effect.effectKey,args:x.effect.effectArgs})+
        valueLine(ui("v2.stats","數據"),escapeHtml(JSON.stringify(x.pointsByTarget)));
    }
    if (data==="projectiles" || data==="resources" || data==="equipment-effects") {
      return valueLine(ui("v2.stats","數據"),escapeHtml(JSON.stringify(
        x.attackChannels || x.movement || x)));
    }
    const gimmicks=x.gimmicks || [...(x.passiveGimmicks || []),...(x.activeGimmicks || [])];
    return gimmicks.map(g=>
      valueLine("",showText(g.nameKey)+showText(
          g.descriptionArgs ? {templateKey:g.descriptionKey,args:g.descriptionArgs}:g.descriptionKey))
    ).join("");
  }
  function idFor(x) {return x.rangerCode || x.equipCode || x.abilityCode || x.enemyCode ||
    x.stageId || x.unitCode || x.artifactCode || x.assetGroup || String(x.attributeId ?? ""); }
  function nameFor(x) {return x.nameKey || x.optionKey || x.stageId || "";}
  function card(x) {
    const id=idFor(x);
    const name=showText(nameFor(x));
    const details=detailRecord(x);
    const subtitle=x.descriptionKey ? showText(x.descriptionKey) : "";
    return '<article class="card"><div class="id">'+escapeHtml(id)+'</div><h2>'+name+'</h2>'
      +(subtitle?'<div class="summary">'+subtitle+'</div>':"")
      +'<details><summary>'+escapeHtml(ui("v2.effects","詳細資料"))+'</summary><div class="detail">'+
      (details || "-")+'</div></details></article>';
  }
  function filteredRows() {
    const query=$("search").value.trim().toLowerCase();
    if (!query) return state.rows;
    return state.rows.filter(x=>{
      const name=nameFor(x);
      const nameText=typeof name==="string"?local(name).text:"";
      return (idFor(x)+" "+nameText+" "+JSON.stringify(x.tags||{})).toLowerCase().includes(query);
    });
  }
  function render() {
    state.missing=0;
    const rows=filteredRows();
    const display=rows.slice(0,40);
    $("cards").innerHTML=display.length?display.map(card).join(""):'<p>'+escapeHtml(ui("v2.noResults","找不到符合的資料。"))+'</p>';
    $("status").textContent=ui("v2.showing","顯示筆數")+": "+display.length+" / "+rows.length+
      (state.missing?" · "+ui("v2.fallback","語言備援")+": "+state.missing:"");
  }
  async function load() {
    const sequence=++state.version;
    $("cards").innerHTML="";
    $("status").textContent=ui("v2.loading","資料載入中…");
    const dataset=state.dataset;
    try {
      let data=state.dataCache.get(dataset);
      if (!data) {
        const response=await fetch(dataRoot+dataset+".json");
        if (!response.ok) throw new Error("HTTP "+response.status);
        data=await response.json();
        state.dataCache.set(dataset,data);
      }
      if (sequence!==state.version) return;
      const kind=dataset.startsWith("stages/")?"stages":dataset.startsWith("enemies/")?"enemies":
        ({"ranger-index":"rangers","equipment-name-index":"equipment","equipment-effects":"effects",
          "labyrinth-artifacts":"artifacts","resources":"assets","projectiles":"units"}[dataset] || dataset);
      state.rows=Array.isArray(data[kind])?data[kind]:
        (kind==="units" && data.units && typeof data.units==="object")?Object.values(data.units):[];
      render();
    } catch (error) {
      if (sequence!==state.version) return;
      $("status").textContent=String(error);
    }
  }
  async function start() {
    const results=await Promise.all(localeFiles.map(async kind=>{
      const response=await fetch(dataRoot+"locales/"+kind+".json");
      if (!response.ok) throw new Error("Locale "+kind+" HTTP "+response.status);
      return response.json();
    }));
    for (const rows of results) for (const row of rows) state.catalog.set(row.key,row);
    setUi();
    await load();
  }
  $("locale").addEventListener("change",event=>{
    state.locale=event.target.value;
    setUi();
    render();
  });
  $("dataset").addEventListener("change",event=>{
    state.dataset=event.target.value;
    $("search").value="";
    return load();
  });
  $("search").addEventListener("input",render);
  window.RangerbookV2LocalePreview={fill,renderText,local};
  window.RangerbookV2LocalePreview.ready=start().catch(error=>{$("status").textContent=String(error);});
})();
