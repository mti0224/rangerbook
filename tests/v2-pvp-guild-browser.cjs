/* Synthetic public statistics; real V2 entity catalogs. No real account login. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.AUDIT_BASE_URL||'http://127.0.0.1:4187';
const metadata={generatedAtUtc:'2026-10-12T14:04:22Z',league:'LEGEND',rankingCount:2,sampleCount:2,guildCount:2};
const fixtures={
 'usage.json':{metadata,rangers:[{rank:1,rangerId:'u1535e-brown',name:'Obsolete fixture name',star:'9星',type:'力量型',element:'光',playerCount:2,appearanceCount:2,usageRate:100,equipmentUsage:{WEAPON:[{code:'eq_2507_wpn_08',count:2,rate:100}],ARMOR:[],ACC:[]},awakeningUsage:[{code:'aab601_clone2',count:2,rate:100}],talentUsage:[],equipmentCombinationUsage:[]}]},
 'leaderboard.json':{metadata,players:[{rank:1,detailKey:'qa-player',displayName:'QA Player',score:100,level:300}]},
 'player_teams.json':{metadata,players:[{rank:1,detailKey:'qa-player',teams:{pvpteam:[{unitCode:'u1535e-brown',level:240}]}}]},
 'guildwar_ranking.json':{metadata,guilds:[{rank:1,uid:'qa-a',guildName:'QA Guild A',score:100,curMemberCount:1,maxMemberCount:50,tier:'LEGEND'},{rank:2,uid:'qa-b',guildName:'QA Guild B',score:99,curMemberCount:1,maxMemberCount:50,tier:'LEGEND'}]},
 'guildwar_usage_index_LEGEND.json':{metadata,rangers:[{rank:1,unitCode:'u1550e-moon',playerCount:2,appearanceCount:2,guildCount:2,usageRate:100}]},
 'guildwar_data_LEGEND.json':{metadata,guilds:[{rank:2,uid:'qa-a',guildName:'QA Guild A',members:[{displayName:'QA Member A',level:300,guildwar:[{unitCode:'u1550e-moon',level:240}]}]},{rank:1,uid:'qa-b',guildName:'QA Guild B',members:[{displayName:'QA Member B',level:299,guildwar:[{unitCode:'u1550e-moon',level:240}]}]}]}
};
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  for(const locale of ['zh-Hant','en','th','jp']) {
   const context=await browser.newContext({viewport:{width:1200,height:900}});
   await context.addInitScript(l=>localStorage.setItem('rangerbook-language',l),locale);
   let role='user';
   await context.route('**/rangerbook-auth.warmycat.com/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({logged_in:role==='admin',role,account:role==='admin'?'qa-admin':null})}));
   await context.route('**/www.googletagmanager.com/**',r=>r.abort());
   await context.route('**/pvp-data.warmycat.com/**',r=>{
    const fixture=fixtures[new URL(r.request().url()).pathname.split('/').pop()];
    return r.fulfill({status:fixture?200:404,contentType:'application/json',body:JSON.stringify(fixture||{})});
   });
   const page=await context.newPage(),errors=[],legacy=[];
   page.setDefaultTimeout(60000);page.setDefaultNavigationTimeout(60000);
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{const u=new URL(r.url());if(u.origin===new URL(base).origin&&u.pathname.includes('/res/')&&!u.pathname.includes('/res/v2/'))legacy.push(u.pathname)});
   await page.goto(base+'/pvp/usage/',{waitUntil:'domcontentloaded'});
   const usage=page.locator('#pvpUsageBody [data-ranger-id="u1535e-brown"]');await usage.waitFor();
   const expected=await page.evaluate(()=>window.RangerbookV2.render('UNIT:u1535e-brown_nm',window.RangerbookV2.locale));
   await page.waitForFunction(n=>document.querySelector('#pvpUsageBody .pvp-ranger-name')?.textContent.trim()===n,expected);
   await usage.click();await page.locator('#pvpUsageModal:not([hidden]) .pvp-equipment-card').first().waitFor();
   assert.ok(!/NaN|Infinity|%(?:N\d*|d)/.test(await page.locator('#pvpUsageModalContent').innerText()));
   await page.goto(base+'/pvp/leaderboard/',{waitUntil:'domcontentloaded'});
   await page.locator('.pvp-player-row').first().click();
   await page.locator('#pvpPlayerTeamGrid .pvp-player-unit-button').first().waitFor();
   assert.ok((await page.locator('#pvpPlayerTeamGrid').innerText()).includes(expected));
   role='admin';
   await page.goto(base+'/guildwar/usage/',{waitUntil:'domcontentloaded'});
   await page.locator('#guildUsageBody [data-ranger-id="u1550e-moon"]').click();
   await page.locator('#guildUsageModalTitle').waitFor();
   assert.ok(!/NaN|Infinity|%(?:N\d*|d)/.test(await page.locator('#guildUsageModalContent').innerText()));
   role='user';
   await page.goto(base+'/guildwar/ranking/',{waitUntil:'domcontentloaded'});
   await page.locator('.guildwar-rank-row').first().click();
   await page.locator('.guildwar-member-name').first().waitFor();
   assert.equal(await page.locator('.guildwar-member-name').first().innerText(),'QA Member A','Guild identity must survive independent rank changes');
   assert.equal(await page.locator('.guildwar-member-team-button').count(),0,'Guests cannot view administrator-only teams');
   assert.deepEqual(legacy,[]);assert.deepEqual(errors,[]);
   console.log('V2_PVP_GUILD_OK '+locale+' usage/equipment/player team/guild identity/guest gate');
   await context.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
