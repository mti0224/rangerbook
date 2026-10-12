"use strict";
const fs=require("fs");
const path=require("path");
const vm=require("vm");
const assert=require("assert");

(async()=>{
 const project=path.resolve(__dirname,"..");
 const elements={};
 const handlers={};
 for (const name of ["locale","dataset","search","status","cards","title","subtitle","localeLabel","datasetLabel","searchLabel","notice","backLink","footer"]){
   elements[name]={value:name==="locale"?"zh_TW":name==="dataset"?"rangers":"",textContent:"",innerHTML:"",options:[],addEventListener:(event,fn)=>{handlers[name+":"+event]=fn;}};
 }
 elements.dataset.options=["rangers","equipment","abilities","stages/extreme","stages/endless"].map(value=>({value,textContent:""}));
 const document={getElementById:(name)=>elements[name],documentElement:{lang:""}};
 let fetched=[];
 const context={document,window:{},console,
  fetch:async url=>{
   fetched.push(url);
   const file=path.resolve(project,"res/v2",url.replace("../res/v2/",""));
   if (!fs.existsSync(file))return {ok:false,status:404};
   return {ok:true,json:async()=>JSON.parse(fs.readFileSync(file,"utf8"))};
  }
 };
 vm.runInNewContext(fs.readFileSync(path.join(project,"v2/preview.js"),"utf8"),context);
 await context.window.RangerbookV2LocalePreview.ready;
 assert(fetched.includes("../res/v2/locales/custom.json"));
 assert(fetched.includes("../res/v2/rangers.json"));
 assert(elements.cards.innerHTML.includes("card"));
 assert(elements.status.textContent.includes("2306"));
 assert.strictEqual(context.window.RangerbookV2LocalePreview.fill("%N1 → %N2",[20,40]),"20 → 40");
 assert.strictEqual(context.window.RangerbookV2LocalePreview.fill("%d2 / %d1 / %d2",[0,40]),"40 / 0 / 40");
 assert.strictEqual(context.window.RangerbookV2LocalePreview.fill("%N2 / %N1",[0,40]),"40 / 0");
 assert.strictEqual(context.window.RangerbookV2LocalePreview.fill("%N1 / %N2",[0]),"0 / %N2");
 assert.strictEqual(context.window.RangerbookV2LocalePreview.fill("%N0",[9]),"%N0");
 assert.strictEqual(context.window.RangerbookV2LocalePreview.renderText({
   templateKey:"CUSTOM:V2_ENDLESS_MINERAL_REGEN_REDUCTION",args:[]
 }).missing,true);
 const native=context.window.RangerbookV2LocalePreview.renderText({
   key:"EQUIP:SPC_wpn_0001_desc2",bindings:{"$4f":{min:1.5,max:2,unit:"SECOND"}}
 });
 assert(native.text.includes("1.5 ~ 2"));
 assert(!native.text.includes("{$4f}"));
 assert(!native.text.includes("<#"));
 assert.strictEqual(native.missing,false);
 assert.strictEqual(context.window.RangerbookV2LocalePreview.renderText({
   key:"EQUIP:SPC_wpn_0001_desc2",bindings:{}
 }).missing,true);
 assert.strictEqual(context.window.RangerbookV2LocalePreview.renderText({
   templateKey:"CUSTOM:V2_ABILITY_CONDITION_JOIN",
   args:[{parts:[{key:"CUSTOM:ABSENT_TEST_KEY"}]},{key:"CUSTOM:ELEMENT_fire"}]
 }).missing,true);
 handlers["locale:change"]({target:{value:"en"}});
 assert(elements.title.textContent.includes("Multilingual"));
 assert(elements.footer.textContent.includes("Missing translations"));
 const en=context.window.RangerbookV2LocalePreview.renderText({
   templateKey:"CUSTOM:V2_ENDLESS_MINERAL_REGEN_REDUCTION",args:[60]
 });
 assert.strictEqual(en.text,"Mineral regeneration speed -60%");
 elements.dataset.value="equipment";
 await handlers["dataset:change"]({target:{value:"equipment"}});
 assert(elements.status.textContent.includes("951"));
 assert(elements.cards.innerHTML.includes("eq_"));
 elements.dataset.value="stages/extreme";
 await handlers["dataset:change"]({target:{value:"stages/extreme"}});
 assert(elements.status.textContent.includes("48"));
 assert(elements.cards.innerHTML.includes("extreme-"));
 for (const [dataset,count] of Object.entries({
   "ranger-index":2306,"equipment-name-index":951,"equipment-effects":149,
   "labyrinth-artifacts":55,"projectiles":3140,"resources":29,
   "enemies/hard":130,"enemies/extreme":24,"enemies/endless":57,
   "enemies/event":12,"enemies/advent":46,"enemies/labyrinth":24,
   "stages/hard":240,"stages/labyrinth":240,"stages/endless":320
 })){
   await handlers["dataset:change"]({target:{value:dataset}});
   assert(elements.status.textContent.includes(String(count)),dataset);
   assert(elements.cards.innerHTML.includes("card"),dataset);
 }
 for (const locale of ["zh_TW","en","th","jp"]){
   handlers["locale:change"]({target:{value:locale}});
   assert(elements.title.textContent && !elements.title.textContent.startsWith("UI:"),locale);
 }
 assert.strictEqual(document.documentElement.lang,"ja");
 assert.strictEqual(context.window.RangerbookV2LocalePreview.renderText("hard-1").missing,false);
 console.log("PASS all 19 datasets, four languages, native/numbered bindings and explicit fallback");
})().catch(e=>{console.error(e);process.exit(1);});
