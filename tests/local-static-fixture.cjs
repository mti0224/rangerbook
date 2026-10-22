/* Opt-in local file server replacement for isolated browser runners. */
const fs=require('node:fs'),path=require('node:path');
exports.install=async(page,base)=>{
 if(!process.env.QA_LOCAL_FILES)return;
 const root=path.resolve(__dirname,'..');
 await page.route(base+'/**',route=>{
  let name=decodeURIComponent(new URL(route.request().url()).pathname);if(name.endsWith('/'))name+='index.html';
  const file=path.join(root,name),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
  return route.fulfill({status:fs.existsSync(file)?200:404,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.existsSync(file)?fs.readFileSync(file):''});
 });
};
