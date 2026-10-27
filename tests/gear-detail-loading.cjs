"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const path = require("path");

async function main() {
  const root = path.resolve(__dirname, "..");
  const handlers = {};
  const document = {
    addEventListener(type, handler) { handlers[type] = handler; }
  };
  let fetchCalls = 0;
  const data = [{ranger_id:"u1-brown", "Ranger名稱":"熊大", "技能1":{"技能組":[{"效果":"體力恢復 (持續)"}]}}];
  const window = {
    location: {pathname:"/gear/eq_2305_acc_08"},
    RangerbookI18n: {t:(_key,fallback)=>fallback,format:(_key,_args,fallback)=>fallback,uiText:x=>x,lookup:(_x,_k,fallback)=>fallback,
                     unitName:(_x,fallback)=>fallback}
  };
  const context = {
    window,document,console,
    fetch:async(url) => {
      assert(url.endsWith("res/Rangers_data.json"));
      fetchCalls++;
      return {ok:true,json:async()=>data};
    },
    CSS:{escape:x=>x},
    HTMLImageElement:class {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(root,"assets/js/gear-detail.js"),"utf8"),context);
  const gear = {
    id:"eq_2305_acc_08","裝備名稱":"測試裝備","裝備種類":"飾品","裝備星級":7,
    "基本效果":{"體力 (%)":"5%"},"Skill+":[{"技能效果":"體力恢復 (持續)","係數":"6.0%"}]
  };
  let revised = {open:false};
  const element = {
    innerHTML:"",dataset:{},querySelector:()=>revised,
  };
  const result = await window.RangerbookGearDetail.render({
    root:element,gear,id:gear.id,allGear:[],shouldCommit:()=>true,
  });
  assert.strictEqual(result,true);
  assert.strictEqual(fetchCalls,0,"render must not fetch all Rangers");
  assert(element.innerHTML.includes("data-lazy-related-rangers"));
  assert(element.innerHTML.includes("測試裝備"),"gear details should render immediately");
  assert(handlers.toggle,"lazy toggle should be registered");
  const details={open:true,dataset:{},isConnected:true,
    matches:sel=>sel.includes("data-lazy-related-rangers"),outerHTML:""};
  await handlers.toggle({target:details});
  assert.strictEqual(fetchCalls,1,"related Rangers fetched once on expansion");
  assert(details.outerHTML.includes("u1-brown"));
  assert(revised.open,"related Ranger details stays expanded");
  await handlers.toggle({target:details});
  assert.strictEqual(fetchCalls,1,"no repeated fetch");
  console.log("PASS gear details render without Rangers request; related units lazy-load once");
}
main().catch(err=>{console.error(err);process.exit(1)});

