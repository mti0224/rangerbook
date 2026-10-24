/* Build a separate acceptance artifact. Never edits source or production Pages. */
import {cp, mkdir, readFile, readdir, writeFile, access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packagePages} from '../../scripts/package-pages.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const output=path.resolve(process.argv[2] || '');
if(!process.argv[2] || output===root || output.startsWith(root+path.sep))throw new Error('Provide a fresh output directory outside the repository');
try { await access(output); throw new Error('Output already exists'); } catch(error) { if(error.code!=='ENOENT')throw error; }
const origin='https://rangerbook-test.warmycat.com';
await packagePages(root);
await mkdir(output,{recursive:true,mode:0o700});
await cp(path.join(root,'_site'),output,{recursive:true});
let pages=0,scripts=0;
async function visit(dir) {
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const filename=path.join(dir,entry.name);
    if(entry.isSymbolicLink())throw new Error('Symlink rejected');
    if(entry.isDirectory())await visit(filename);
    else if(entry.name.endsWith('.html')) {
      let text=await readFile(filename,'utf8');
      if(!/<head(?:\s[^>]*)?>/i.test(text))throw new Error('Missing HTML head');
      text=text.replace(/<head(?:\s[^>]*)?>/i, match=>match+'\n<meta name="robots" content="noindex,nofollow,noarchive">\n<script src="/assets/js/stage-bootstrap.js"></script>');
      await writeFile(filename,text);pages++;
    } else if(/\.(?:js|mjs)$/.test(entry.name)) {
      const text=await readFile(filename,'utf8');
      await writeFile(filename,text.replaceAll('https://rangerbook-auth.warmycat.com',origin));scripts++;
    }
  }
}
await visit(output);
await writeFile(path.join(output,'assets/js/stage-bootstrap.js'),`window.RANGERBOOK_STAGE_BASIC_AUTH=true;\nwindow.RANGERBOOK_AUTH_API_BASE=${JSON.stringify(origin)};\nwindow.gtag=function(){};\ndocument.addEventListener('DOMContentLoaded',()=>{document.title='[TEST] '+document.title;});\n`);
for(const filename of ['pwa-head.js','pwa.js'])await writeFile(path.join(output,'assets/js',filename),'/* Acceptance environment: PWA installation disabled. */\n');
await cp(path.join(root,'assets/pwa/disabled-worker.js'),path.join(output,'sw.js'));
await writeFile(path.join(output,'robots.txt'),'User-agent: *\nDisallow: /\n');
await writeFile(path.join(output,'CNAME'),'rangerbook-test.warmycat.com\n');
console.log(JSON.stringify({pages,scripts,origin,analytics:false,pwa_installation:false}));
