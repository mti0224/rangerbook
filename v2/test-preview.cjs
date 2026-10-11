"use strict";
const fs=require("fs");
const path=require("path");
const vm=require("vm");
const assert=require("assert");

(async()=>{
 const project=path.resolve(__dirname,"..");
 const elements={};
 const handlers={};
 for (const name of ["locale","dataset","search","status","cards","title","subtitle","localeLabel","datasetLabel","searchLabel","notice","backLink"]){
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
 await new Promise(resolve=>setTimeout(resolve,110));
 assert(fetched.includes("../res/v2/locales/custom.json"));
 assert(fetched.includes("../res/v2/rangers.json"));
 assert(elements.cards.innerHTML.includes("card"));
 assert(elements.status.textContent.includes("2306"));
 assert.strictEqual(context.window.RangerbookV2LocalePreview.fill("%N1 → %N2",[20,40]),"20 → 40");
 handlers["locale:change"]({target:{value:"en"}});
 assert(elements.title.textContent.includes("Multilingual"));
 const en=context.window.RangerbookV2LocalePreview.renderText({
   templateKey:"CUSTOM:V2_ENDLESS_MINERAL_REGEN_REDUCTION",args:[60]
 });
 assert.strictEqual(en.text,"Mineral regeneration speed -60%");
 elements.dataset.value="equipment";
 await handlers["dataset:change"]({target:{value:"equipment"}});
 await new Promise(resolve=>setTimeout(resolve,35));
 assert(elements.status.textContent.includes("951"));
 assert(elements.cards.innerHTML.includes("eq_"));
 elements.dataset.value="stages/extreme";
 await handlers["dataset:change"]({target:{value:"stages/extreme"}});
 await new Promise(resolve=>setTimeout(resolve,35));
 assert(elements.status.textContent.includes("48"));
 assert(elements.cards.innerHTML.includes("extreme-"));
 console.log("PASS preview fetch, localization, numeric template, gear and stage records");
})().catch(e=>{console.error(e);process.exit(1);});
