const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const records = read('res/v2/rangers.json').rangers;
const snapshot = read('assets/data/ranger-evolution.json');
const ids = new Set(records.map(row => row.rangerCode));
for (const edge of snapshot.edges) {
  assert.ok(ids.has(edge.from) && ids.has(edge.to));
  assert.notEqual(edge.from, edge.to);
}
assert.equal(snapshot.edges.length, new Set(snapshot.edges.map(e=>e.from+'|'+e.to)).size);
async function fixture(rows, edges, fail=false, embedded=false) {
  if(!embedded)rows=rows.map(({evolutionTargets,...row})=>row);
  const window = {RangerbookV2:{data:async()=>({rangers:rows}),render:key=>key,locale:'en'}};
  const fetch = async () => {if(fail)throw new Error('offline');return {json:async()=>({edges})};};
  vm.runInNewContext(fs.readFileSync(path.join(root,'assets/js/ranger-evolution.js'),'utf8'),{
    window,fetch,location:{pathname:'/rangerbook/ranger/ranger/'},console:{error:()=>{}}
  });
  await window.RangerbookEvolution.ready();
  return window.RangerbookEvolution;
}
(async()=>{
  const model = await fixture(records,snapshot.edges);
  const chain = Array.from(model.stages('u1626u-cony'),row=>row.rangerCode);
  assert.deepEqual(chain,['u1626e-cony','u1626u-cony','u1626h-cony','u1627e-cony']);
  assert.equal(model.stages('u003u-bella').length,5);
  const rendered = model.render({ranger_id:'u1626u-cony'});
  assert.equal((rendered.match(/aria-current="page"/g)||[]).length,1);
  assert.ok(rendered.includes('/rangerbook/ranger/ranger/?detail=u1627e-cony'));
  assert.ok(!/ranger-evolution-(targets|grade|current|note)/.test(rendered), 'only character cards should be rendered');
  assert.ok(!chain.includes('u1628e-cony'),'same-name Rangers must never be inferred');
  // Embedded official relationships override the older rollout snapshot.
  const embedded = await fixture(records.map(row=>({...row,evolutionTargets:[]})),snapshot.edges,true,true);
  assert.equal(embedded.stages('u1626u-cony').length,1);
  assert.equal((embedded.render({ranger_id:'u1626u-cony'}).match(/data-evolution-id=/g)||[]).length,1);
  // Official cycles must not hang the viewer, and missing targets cannot make broken links.
  const cyclic = await fixture(records,[{from:chain[0],to:chain[1]},{from:chain[1],to:chain[0]},{from:chain[0],to:'missing'}]);
  assert.equal(cyclic.stages(chain[0]).length,2);
  const unavailable = await fixture(records,[],true);
  assert.ok(unavailable.render({ranger_id:chain[0]}).includes('進化階段資料暫時無法載入。'));
  console.log(`EVOLUTION_OK ${ids.size} Rangers, ${snapshot.edges.length} official edges`);
})().catch(error=>{console.error(error);process.exitCode=1;});
