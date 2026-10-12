/* Focused reproduction of user-reported multilingual regressions, with real V2 game records.
 * Public PvP/admin response fixtures are deterministic and never use real credentials. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const base=process.env.AUDIT_BASE_URL||'http://127.0.0.1:4187';
const read=n=>JSON.parse(fs.readFileSync(path.join(__dirname,'../res/v2/'+n+'.json')));
const rows=read('locales/ui'),ui=(key,lang)=>rows.find(x=>x.key==='UI:'+key)[lang==='zh-Hant'?'zh_TW':lang];
const actors=read('rangers').rangers;
const enemies=read('enemies/hard').enemies;
const enemy=enemies.find(x=>x.skills?.length);
const talent=actors.find(x=>x.talents?.major&&x.talents.enhancements.length);
const metadata={generatedAtUtc:'2026-10-12T14:04:22Z',league:'LEGEND',rankingCount:1,sampleCount:1};
const fixture={metadata,rangers:[{rank:1,rangerId:'u1535e-brown',playerCount:2,appearanceCount:2,usageRate:100,
 equipmentUsage:{WEAPON:[{code:'eq_2507_wpn_08',count:2,rate:100}],ARMOR:[],ACC:[]},
 awakeningUsage:[{code:'aab601_clone2',count:2,rate:100}],talentUsage:[{code:'0',count:1,rate:50},{code:'4',count:1,rate:50}],
 equipmentCombinationUsage:[{WEAPON:'eq_2507_wpn_08',ARMOR:'__NONE__',ACC:'__NONE__',count:2,rate:100}]}]};
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const locale of (process.env.V2_QA_LOCALES||'zh-Hant,en,th,jp').split(',')){
   console.log('REPORTED_START '+locale);
   const ctx=await browser.newContext({viewport:{width:1250,height:900}});
   await ctx.addInitScript(l=>localStorage.setItem('rangerbook-language',l),locale);
   await ctx.route('**/www.googletagmanager.com/**',r=>r.abort());
   await ctx.route('**/rangerbook-auth.warmycat.com/**',r=>{
    const p=new URL(r.request().url()).pathname;
    const body=p==='/auth/me'?{logged_in:true,role:'admin',account:'qa_admin',admin_application_status:'approved'}:
     p==='/admin/resource-updates'?{items:[{count:12,items:[{path:'qa.db'}],detectedAt:'2026-10-12T00:00:00Z'}]}:{items:[]};
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   await ctx.route('**/pvp-data.warmycat.com/**',r=>{
    const n=new URL(r.request().url()).pathname.split('/').pop();
    const body=n==='guildwar_ranking.json'?{metadata,guilds:[{rank:2,guildName:'QA Guild',curMemberCount:20,maxMemberCount:50}]}:n.startsWith('guildwar_data_')?{metadata,guilds:[{guildName:'QA Guild',members:[{displayName:'QA Member',level:100}]}]}:fixture;
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   const p=await ctx.newPage();p.setDefaultTimeout(60000);p.setDefaultNavigationTimeout(60000);
   const errors=[],legacy=[];p.on('pageerror',e=>{errors.push(e.message);console.log("PAGEERROR",e.message)});p.on('request',r=>{const u=new URL(r.url());if(u.origin===new URL(base).origin&&u.pathname.includes('/res/')&&!u.pathname.includes('/res/v2/'))legacy.push(u.pathname)});
   async function go(url){await p.goto(base+url,{waitUntil:'domcontentloaded'});await p.waitForFunction(()=>!!window.RangerbookI18n);await p.evaluate(()=>window.RangerbookI18n.ready);}
   await go('/hsEnemy/');await p.locator('.enemy-card').first().waitFor();
   await p.locator('#enemySearchInput').fill(enemy.enemyCode);
   await p.locator('[data-enemy-id="'+enemy.enemyCode+'"]').first().click();
   const table=p.locator('#enemyModalContent .enemy-skill-meta-table').first();await table.waitFor();
   assert.equal(await table.locator('tbody td').nth(0).innerText(),enemy.skills[0].activationRate+'%');
   assert.ok((await table.locator('tbody td').nth(1).innerText()).includes(String(enemy.skills[0].cooldownSeconds)));
   assert.equal(await table.locator('th').first().innerText(),ui('table.activationRate',locale));
   await go('/mainstage/extreme/stage/?stage=hs1');await p.locator('#extremeGimmickBlock .extreme-gimmick-item').first().waitFor();
   assert.ok(await p.locator('#hsStageConditions .hs-condition-section .endless-stage-table tbody tr').count()>0);
   await go('/pvp/usage/');await p.locator('#pvpUsageBody [data-ranger-id="u1535e-brown"]').click();
   await p.locator('[data-equipment-combination-ranking] .pvp-combo-row').waitFor();
   await p.waitForFunction(expected=>[...document.querySelectorAll('.pvp-option-title')].some(x=>x.textContent===expected),ui('dynamic.talentLocked',locale));
   const uses=ui('dynamic.uses',locale).replace('%N1','2');
   await p.waitForFunction(expected=>[...document.querySelectorAll('.pvp-option-stats span')].some(x=>x.textContent.trim()===expected),uses);
   for(const o of await p.locator('#pvpLeagueSelect option').all()){
    const value=await o.getAttribute('value'),text=await o.innerText();
    assert.equal(text,value==='LEGEND'?ui('copy.legend',locale):ui('league.'+value,locale));
   }
   await go('/guildwar/ranking/');await p.locator('.guildwar-rank-row').first().click();
   const header=ui('dynamic.guildMembers',locale).replace('%N1','2').replace('%N2','20').replace('%N3','50');
   await p.waitForFunction(expected=>document.querySelector('.guildwar-member-header p')?.textContent===expected,header);
   for(const [code,key] of [['LEGEND','copy.legend'],['MASTER','copy.master'],['DIAMOND','copy.diamond']])assert.equal(await p.locator('#guildRankingTier option[value="'+code+'"]').innerText(),ui(key,locale));
   await go('/ability/');await p.locator('#conditionFilter option[value="屬性為暗"]').waitFor({state:'attached'});
   const dark=await p.locator('#conditionFilter option[value="屬性為暗"]').innerText();
   if(locale!=="zh-Hant")assert.notEqual(dark,'屬性為暗');
   await go('/admin/');await p.locator('#adminResourcesTab').click();
   await p.waitForFunction(expected=>document.querySelector('#adminResourceUpdatesList')?.textContent.includes(expected),ui('dynamic.files',locale).replace('%N1','12'));
   await go('/ranger/ranger/?detail='+talent.rangerCode);
   await p.locator('#rangerModalContent .ranger-talent-list').first().waitFor();
   const talentTitles=await p.locator('#rangerModalContent .ranger-talent-card h4').allTextContents();
   console.log('TALENT_TITLES',locale,talentTitles);
   const expected=await p.evaluate(()=>[window.RangerbookI18n.uiText('主要才能'),window.RangerbookI18n.uiText('強化才能')]);
   assert.ok(talentTitles[0].includes(expected[0]));assert.ok(talentTitles[1].includes(expected[1]));
   // Five requested effect kinds use canonical semantics. THROW_ALLY is '-' in V1 too.
   const coeff=await p.evaluate(async()=>{
    const data=await(await fetch('/res/Rangers_data.json')).json();const found={};
    for(const r of data)for(const s of [r['技能1'],r['技能2']])if(s&&s['技能組'])for(const e of s['技能組'])if(['SKILLEFF_SUMMON_ENEMY','SKILLEFF_SKILL_RESET','SKILLEFF_BUBBLE','SKILLEFF_FEAR','SKILLEFF_THROW_ALLY'].includes(e.effectCode))found[e.effectCode]=window.RangerbookI18n.uiText(e['係數']);return found;
   });
   for(const [code,value] of Object.entries(coeff))if(code==='SKILLEFF_THROW_ALLY')assert.equal(value,'-');else assert.ok(value!=='-'&&/[0-9]/.test(value),code+' '+value);
   assert.equal(Object.keys(coeff).length,5);
   await go('/gear/');await p.locator('.gear-card').first().click();
   await p.waitForFunction(expected=>document.querySelector('.gear-detail-link')?.textContent===expected,ui('action.viewDetails',locale));
   const rareEffects=[['eq_2301_wpn_07','GEAR_ATTR_DOUBLE_SKL_PROB_MUL_nm'],['eq_2202_amr_06','GEAR_ATTR_MIR_PHY_MUL_nm'],['eq_2206_acc_06','GEAR_ATTR_MIR_MAG_MUL_nm'],['eq_2609_wpn_09','GEAR_ATTR_DOUBLE_ATK_PROB_MUL_nm'],['eq_2604_amr_08','GEAR_ATTR_FIX_SKLAVD_PROB_MUL_nm'],['eq_test_acc_998','GEAR_ATTR_FIX_AVD_PROB_MUL_nm']];
   for(const [id,key] of rareEffects){
    await go('/gear/?detail='+id);await p.locator('.gear-detail-content:not([hidden])').waitFor();
    const expected=await p.evaluate(key=>window.RangerbookV2.render('EQUIP:'+key,window.RangerbookV2.locale).replace(/\\+n/g,' ').replace(/\s+/g,' ').trim(),key);
    await p.waitForFunction(expected=>document.getElementById('gearModalContent')?.textContent.replace(/\s+/g,' ').includes(expected),expected);
   }
   await go('/ranger/ranger/?detail=u1430e-moon');await p.locator('#rangerModalContent .ranger-ability-card').first().waitFor();
   const freeze=await p.evaluate(()=>window.RangerbookV2.render('ABILITY:aab233_antifreeze_nm',window.RangerbookV2.locale).replace(/\s+/g,' ').trim());
   await p.waitForFunction(expected=>document.getElementById('rangerModalContent')?.textContent.replace(/\s+/g,' ').includes(expected),freeze);
   await go('/mainstage/extreme/enemy/');await p.locator('#enemySearchInput').fill('u92002-ro-515');await p.locator('[data-enemy-id="u92002-ro-515"]').first().click();
   const mineral=await p.evaluate(()=>window.RangerbookV2.render('ABILITY:ab232_antiminadd_nm',window.RangerbookV2.locale).replace(/\s+/g,' ').trim());
   await p.waitForFunction(expected=>document.getElementById('enemyModalContent')?.textContent.replace(/\s+/g,' ').includes(expected),mineral);
   await go('/gear/?detail=eq_2610_amr_29');await p.locator('.gear-similar-card').first().waitFor();
   const starLabels=await p.locator('.gear-similar-tags').allTextContents();console.log('STARS',locale,starLabels.slice(0,6));
   assert.ok(starLabels.length>0);if(locale!=='zh-Hant')assert.ok(starLabels.every(x=>!/[星]/.test(x)||locale==='jp'));
   // Official resistance labels must survive layout-only variants.
   const resistance=await p.evaluate(async()=>{await window.RangerbookV2.ready;return ['抵抗：敵方暫停出動','抵抗：增加礦物成本'].map(x=>window.RangerbookI18n.uiText(x));});
   if(locale!=='zh-Hant')assert.ok(resistance.every(x=>!x.startsWith('抵抗：')));
   await go('/sponsor/');const sep=await p.locator('.sponsor-article a').evaluate(el=>({before:el.previousSibling.nodeValue,after:el.nextSibling.nodeValue}));
   assert.ok(/\s$/.test(sep.before)&&/^\s/.test(sep.after));
   await go('/settings/');await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
   await p.reload({waitUntil:'domcontentloaded'});await p.evaluate(()=>window.RangerbookI18n.ready);
   assert.equal(await p.locator('input[name="language"]:checked').inputValue(),locale);
   assert.ok(!await p.locator('html').getAttribute('data-rb-localizing'));
   assert.deepEqual(legacy,[]);assert.deepEqual(errors,[]);console.log('REPORTED_OK '+locale);
   await ctx.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
