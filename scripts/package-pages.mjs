/* Publish web files only; backend code and operational files stay out of Pages. */
import {mkdir, readdir, copyFile, rm, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const directories=new Set(['ability','about','admin','adventEnemy','assets','endless','eventStageEnemy',
  'gear','guildwar','hsEnemy','infEnemy','labyrinth','mainstage','pvp','ranger','res','settings','sponsor','update','v2']);
const rootFiles=new Set(['.nojekyll','CNAME','404.html','index.html','offline.html','manifest.webmanifest',
  'pwa-data.json','sw.js','robots.txt','sitemap.xml','favicon.ico']);
const extensions=new Set(['.html','.css','.js','.mjs','.json','.png','.jpg','.jpeg','.gif','.svg','.webp',
  '.avif','.ico','.woff','.woff2','.ttf','.otf','.wasm','.mp4','.webm','.mp3','.wav','.ogg','.txt','.xml','.webmanifest']);

export function isPublicFile(name) {
  const parts=name.split('/');
  if(parts.some(part=>part==='..' || !part))return false;
  if(parts.length===1)return rootFiles.has(name);
  if(!directories.has(parts[0]) || parts.some(part=>part.startsWith('.')))return false;
  if(/(?:^|\/)(?:player_lookup_cache|pvp_config|credentials|secrets|sessions|rangerbook_auth)(?:[._-]|$)/i.test(name))return false;
  return extensions.has(path.posix.extname(name).toLowerCase());
}

export async function packagePages(root,output=path.join(root,'_site')) {
  root=path.resolve(root);output=path.resolve(output);
  if(output!==path.join(root,'_site'))throw new Error('Pages output must be the dedicated _site directory');
  await rm(output,{recursive:true,force:true});
  await mkdir(output,{recursive:true});
  let files=0,bytes=0;
  async function visit(dir='') {
    for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})) {
      const name=path.posix.join(dir,entry.name);
      if(entry.isSymbolicLink())throw new Error('Refusing symbolic link in Pages input: '+name);
      if(entry.isDirectory()) {
        if(!entry.name.startsWith('.') && (dir || directories.has(entry.name)))await visit(name);
      } else if(entry.isFile() && isPublicFile(name)) {
        const target=path.join(output,name);
        await mkdir(path.dirname(target),{recursive:true});
        await copyFile(path.join(root,name),target);
        files++;bytes+=(await stat(target)).size;
      }
    }
  }
  await visit();
  return {files,bytes};
}

if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const root=fileURLToPath(new URL('../',import.meta.url));
  console.log('Public Pages artifact',await packagePages(root));
}
