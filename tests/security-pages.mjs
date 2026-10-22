import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, access, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {packagePages,isPublicFile} from '../scripts/package-pages.mjs';

const root=await mkdtemp(path.join(tmpdir(),'rb-pages-security-'));
try {
 const publicFiles=['index.html','CNAME','.nojekyll','sw.js','pwa-data.json','assets/js/admin-password.js',
   'assets/pwa/icon-192.png','res/v2/rangers.json','res/裝備資料庫.json','v2/preview.js','admin/index.html','account/index.html','personal-teams/index.html','account-action/index.html'];
 const privateFiles=['backend/rangerbook_auth/app.py','backend/rangerbook_auth/rangerbook_auth.db',
   'backend/rangerbook_auth/.env','membership/service.py','membership/mail_worker.py','membership/source-manifest.json','deploy/aws/pvp_config.json','docs/report.md','tests/test.cjs',
   'res/resource_asset_manifest.json','assets/data/credentials.json','res/player_lookup_cache.json','res/private.db','assets/key.pem',
   'assets/.env','assets/js/bundle.js.map','v2/test-preview.cjs','.git/config'];
 for(const name of [...publicFiles,...privateFiles]) {
  const target=path.join(root,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,name);
 }
 const report=await packagePages(root);assert.equal(report.files,publicFiles.length);
 for(const name of publicFiles)assert.equal(await readFile(path.join(root,'_site',name),'utf8'),name);
 for(const name of privateFiles)await assert.rejects(access(path.join(root,'_site',name)));
 for(const name of ['../secrets.json','assets/../secret.json','/index.html'])assert.equal(isPublicFile(name),false);
 await symlink(path.join(root,'backend/rangerbook_auth/.env'),path.join(root,'assets/leak.json'));
 await assert.rejects(packagePages(root),/symbolic link/);
 console.log('SECURITY_PAGES_OK public files preserved; backend, secrets, databases, source maps and symlinks excluded');
} finally {await rm(root,{recursive:true,force:true});}
