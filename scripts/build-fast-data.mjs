/* Build small read projections from the authoritative V2 release at packaging time. */
import {readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
export async function buildFastData(root) {
  const read = async name => JSON.parse(await readFile(path.join(root,'res/v2',name+'.json'),'utf8'));
  const [rangers,abilities,official,projectiles] = await Promise.all([read('rangers'),read('abilities'),read('locales/official'),read('projectiles')]);
  const dir=path.join(root,'res/v2/fast');
  await rm(dir,{recursive:true,force:true});
  await mkdir(path.join(dir,'ranger'),{recursive:true});
  await mkdir(path.join(dir,'locales'),{recursive:true});
  const write=(name,value)=>writeFile(path.join(dir,name+'.json'),JSON.stringify(value,null,4)+'\n');
  // Keep all four name aliases for multilingual search; other text needs only
  // Chinese canonical text, English fallback and the selected display language.
  for(const locale of ['zh_TW','en','th','jp']) await write('locales/'+locale,official.map(row=>
    Object.fromEntries(Object.entries(row).filter(([key])=>['key','zh_TW','en',locale].includes(key) || /^UNIT:.*_nm$/.test(row.key)))));
  const byId=new Map(rangers.rangers.map(row=>[row.rangerCode,row]));
  const byAbility=new Map(abilities.abilities.map(row=>[row.abilityCode,row]));
  const byKey=new Map(official.map(row=>[row.key,row]));
  const nameKeys=new Set(rangers.rangers.map(row=>row.nameKey));
  await write('ranger-list',{schemaVersion:2,rangers:rangers.rangers.map(row=>({
    rangerCode:row.rangerCode,nameKey:row.nameKey,starGrade:row.starGrade,evolution:row.evolution,
    roleType:row.roleType,elementType:row.elementType,releaseDate:row.releaseDate,tags:row.tags,
    stats:{hp:row.stats.hp,attack:row.stats.attack,mineralCost:row.stats.mineralCost}
  })),locales:official.filter(row=>nameKeys.has(row.key))});
  const graph=new Map();
  for(const row of byId.values()) for(const target of row.evolutionTargets || []) {
    if(!byId.has(target.rangerCode)) throw new Error('Unknown evolution target '+target.rangerCode);
    for(const [from,to] of [[row.rangerCode,target.rangerCode],[target.rangerCode,row.rangerCode]]) {
      if(!graph.has(from))graph.set(from,new Set());graph.get(from).add(to);
    }
  }
  const references=(value,found=new Set())=>{
    if(typeof value==='string' && /^(UNIT|SKILL|ABILITY|EQUIP):/.test(value))found.add(value);
    else if(value && typeof value==='object')for(const child of Object.values(value))references(child,found);
    return found;
  };
  let total=0,max=0;
  for(const row of byId.values()) {
    const related=new Set([row.rangerCode]),queue=[row.rangerCode];
    for(let i=0;i<queue.length;i++)for(const id of graph.get(queue[i]) || [])if(!related.has(id)){related.add(id);queue.push(id);}
    const evolutionRangers=[...related].map(id=>{
      const r=byId.get(id);return {rangerCode:id,nameKey:r.nameKey,starGrade:r.starGrade,evolution:r.evolution,evolutionTargets:r.evolutionTargets || []};
    });
    const codes=new Set(row.abilityCodes);
    for(const a of row.awakeningAbilities || [])codes.add(a.abilityCode);
    const selectedAbilities=[...codes].map(code=>byAbility.get(code)).filter(Boolean);
    const refs=references([row,selectedAbilities,evolutionRangers]);
    const projectile=projectiles.units[row.rangerCode];
    const bundle={schemaVersion:2,rangers:[row],abilities:selectedAbilities,evolutionRangers,projectiles:projectile?[projectile]:[],
      locales:[...refs].map(key=>byKey.get(key)).filter(Boolean)};
    const bytes=JSON.stringify(bundle,null,4)+'\n';
    total+=Buffer.byteLength(bytes);max=Math.max(max,Buffer.byteLength(bytes));
    await writeFile(path.join(dir,'ranger',row.rangerCode+'.json'),bytes);
  }
  return {rangers:byId.size,totalBytes:total,maxDetailBytes:max};
}
