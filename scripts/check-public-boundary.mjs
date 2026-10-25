import {readdir} from 'node:fs/promises';
import path from 'node:path';

const blockedRoots=['backend/','ops/','deploy/systemd/','docs/','records/','runbooks/'];
const blockedFiles=new Set(['res/resource_asset_manifest.json','tests/test_popular_pages.py','tests/test_game_binding.py','tests/test_player_equipment_values.py']);
const root=process.cwd();
const violations=[];
async function walk(dir='') {
  for(const item of await readdir(path.join(root,dir),{withFileTypes:true})) {
    if(item.name==='.git' || item.name==='node_modules' || item.name==='_site')continue;
    const name=path.posix.join(dir,item.name);
    if(item.isDirectory()){await walk(name);continue;}
    const privateAws=name.startsWith('deploy/aws/') &&
      !/^deploy\/aws\/v2\/(?:locales|metadata)\/[^/]+\.json$/.test(name);
    if(blockedRoots.some(p=>name.startsWith(p)) || blockedFiles.has(name) || privateAws)violations.push(name);
  }
}
await walk();
if(violations.length)throw new Error('Private maintenance files in public source:\n'+violations.join('\n'));
console.log('PUBLIC_BOUNDARY_OK private maintenance source excluded; authored JSON retained');
