const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
const rangers=read('res/v2/rangers.json').rangers,official=read('res/v2/locales/official.json');
const preview=read('res/v2/fast/ranger-list.json');
assert.equal(preview.rangers.length,rangers.length);
const abilityIds=new Set(read('res/v2/abilities.json').abilities.map(a=>a.abilityCode));
const known=new Set(rangers.map(r=>r.rangerCode));
let max=0;
for(const row of rangers) {
  const name='res/v2/fast/ranger/'+row.rangerCode+'.json',bundle=read(name);
  assert.deepEqual(bundle.rangers,[row],'Detail must preserve every field: '+row.rangerCode);
  assert.ok(bundle.abilities.every(a=>abilityIds.has(a.abilityCode)));
  assert.ok(bundle.evolutionRangers.every(r=>known.has(r.rangerCode)));
  for(const code of row.abilityCodes)assert.ok(bundle.abilities.some(a=>a.abilityCode===code));
  max=Math.max(max,fs.statSync(path.join(root,name)).size);
  const p=preview.rangers.find(r=>r.rangerCode===row.rangerCode);
  assert.equal(p.stats.hp,row.stats.hp);assert.deepEqual(p.stats.attack,row.stats.attack);
}
assert.ok(max<40000,'No individual detail should download a full database');
for(const locale of ['zh_TW','en','th','jp']) {
  const rows=read('res/v2/fast/locales/'+locale+'.json');
  assert.equal(rows.length,official.length);
  for(let i=0;i<rows.length;i++)for(const lang of ['zh_TW','en',locale])assert.equal(rows[i][lang],official[i][lang]);
  for(let i=0;i<rows.length;i++)if(/^UNIT:.*_nm$/.test(rows[i].key))assert.deepEqual(rows[i],official[i],'All multilingual name aliases remain searchable');
}
console.log(`FAST_DATA_OK ${rangers.length} faithful details; max ${max} bytes; four locales; preview stats`);
