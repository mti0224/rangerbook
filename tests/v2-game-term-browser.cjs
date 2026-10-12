/* Actual localized artifact names, search, modal effects, grade and eight target scores. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),base=process.env.AUDIT_BASE_URL||'http://127.0.0.1:4187';
const rows=JSON.parse(fs.readFileSync(path.join(root,'res/v2/locales/custom.json')));
const uiRows=JSON.parse(fs.readFileSync(path.join(root,'res/v2/locales/ui.json')));
const artifacts=JSON.parse(fs.readFileSync(path.join(root,'res/v2/labyrinth-artifacts.json'))).artifacts;
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const locale of ['zh-Hant','en','jp','th']){
   const context=await browser.newContext();
   await context.addInitScript(l=>localStorage.setItem('rangerbook-language',l),locale);
   await context.route('**/www.googletagmanager.com/**',r=>r.abort());
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/labyrinth/artifact/',{waitUntil:'domcontentloaded'});
   await page.locator('.labyrinth-artifact-card').first().waitFor();
   await page.evaluate(()=>window.RangerbookV2.ready);
   await page.evaluate(()=>window.RangerbookI18n.ready);
   const language=locale==='zh-Hant'?'zh_TW':locale;
   const debuff=locale==='zh-Hant'?'減益':uiRows.find(r=>r.key==='UI:tag.debuffs')[language];
   assert.equal(await page.locator('#artifactCategoryFilter option[value="減益"]').innerText(),debuff);
   await page.locator('#artifactCategoryFilter').selectOption('減益');
   assert.equal(await page.locator('.labyrinth-artifact-card').count(),artifacts.filter(a=>a.effect.direction==='DECREASE').length);
   await page.locator('#artifactCategoryFilter').selectOption('');
   for(const code of ['bf_atkspd','bf_hp','df_atkrge','bf_redmg','df_heal','df_silence']){
    const name=rows.find(r=>r.key==='CUSTOM:LABYRINTH_ARTIFACT_NAME_'+code)[language];
    const source=artifacts.find(a=>a.artifactCode===code);
    await page.locator('#artifactSearchInput').fill(name);
    const card=page.locator('.labyrinth-artifact-card').filter({hasText:name}).first();
    await card.waitFor();await card.click();
    assert.ok((await page.locator('#artifactModalTitle').innerText()).includes(name));
    assert.ok((await page.locator('#artifactModalTitle').innerText()).includes('['+source.grade+']'));
    const values=await page.locator('#artifactModalContent .labyrinth-score-table tbody tr td:last-child').allTextContents();
    assert.deepEqual(values.map(v=>Number(v.replaceAll(',','').trim())).sort((a,b)=>a-b),Object.values(source.pointsByTarget).sort((a,b)=>a-b));
    const effect=await page.locator('#artifactModalContent .preline').innerText();
    assert.ok(effect.includes(String(source.effect.percent)));assert.ok(!/%[Nd]\d*/.test(effect));
    await page.locator('#artifactModalCloseBtn').click();
   }
   assert.deepEqual(errors,[]);console.log('GAME_TERMS_BROWSER_OK '+locale+' localized names/search/grade/effect/all target scores');
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
