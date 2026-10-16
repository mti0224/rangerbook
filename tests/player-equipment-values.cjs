/* Real V2 catalogs with synthetic players; no production login or game requests. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
const base = 'https://equipment-test.invalid';
const keys = ['pvpteam', 'team1', 'team2', 'team3', 'team4', 'team5', 'guildwar'];
const equipment = (code, attr4No, attr4Value, attr4Unit) => ({itemCode:code, attr4No, attr4Value, attr4Unit, attr4ValueGrade:9, currentAdvancedEnchant:5});
const unit = {unitCode:'u1535e-brown', level:240, equipMap:{
  WEAPON:equipment('eq_2403_wpn_08',110006,395,'PERCENT'),
  ARMOR:equipment('eq_2404_amr_28',110017,-18,'PERCENT'),
  ACC:equipment('eq_acc_evt_037',110015,30,'FLAT')
}};
const legacy = {...unit, equipMap:{WEAPON:{itemCode:'eq_2403_wpn_08',attr4No:110006}}};
const teams = Object.fromEntries(keys.map(key => [key,[unit,legacy]]));
const metadata = {generatedAtUtc:'2026-10-16T14:00:00Z',league:'LEGEND',rankingCount:1};
const fixtures = {
  'leaderboard.json':{metadata,players:[{rank:1,detailKey:'qa',displayName:'QA Player',score:100}]},
  'player_teams.json':{metadata,players:[{rank:1,detailKey:'qa',teams}]},
  'guildwar_ranking.json':{metadata,guilds:[{rank:1,uid:'qa-guild',guildName:'QA Guild',curMemberCount:1,maxMemberCount:50,score:100,tier:'LEGEND'}]},
  'guildwar_data_LEGEND.json':{metadata,guilds:[{rank:1,uid:'qa-guild',guildName:'QA Guild',members:[{displayName:'QA Member',level:300,guildwar:[unit,legacy]}]}]}
};

(async () => {
  for (const locale of ['zh-Hant','en','th','jp']) {
  const browser = await chromium.launch({headless:true, executablePath:process.env.QA_CHROME || undefined,
    args:process.env.QA_CHROME ? ['--no-sandbox','--single-process','--no-zygote','--disable-gpu','--disable-software-rasterizer'] : []});
  try {
      const context = await browser.newContext({viewport:{width:1100,height:900}});
      await context.addInitScript(l => localStorage.setItem('rangerbook-language',l), locale);
      await context.route(base+'/**', r => {
        let filename = decodeURIComponent(new URL(r.request().url()).pathname);
        if (filename.endsWith('/')) filename += 'index.html';
        const file = path.join(root,filename);
        const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
        return r.fulfill({status:fs.existsSync(file)?200:404,contentType:types[path.extname(file)]||'application/octet-stream',body:fs.existsSync(file)?fs.readFileSync(file):''});
      });
      await context.route('**/www.googletagmanager.com/**',r=>r.abort());
      await context.route('**/rangers.lerico.net/**',r=>r.abort());
      await context.route('**/rangerbook-auth.warmycat.com/**',r=>{
        const pathname=new URL(r.request().url()).pathname;
        const payload=pathname.includes('player-search')?{items:[{uid:'qa',name:'QA Player'}],count:1}
          :pathname.includes('player-team-query')?{teams}
          :{logged_in:true,role:'super_admin',account:'qa-admin'};
        return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)});
      });
      await context.route('**/pvp-data.warmycat.com/**',r=>{
        let filename=new URL(r.request().url()).pathname.split('/').pop();
        filename=filename.replace(/_(?:MASTER_1|GOLD_3)\.json$/,'.json');
        const fixture=fixtures[filename];
        return r.fulfill({status:fixture?200:404,contentType:'application/json',body:JSON.stringify(fixture||{})});
      });
      const page=await context.newPage(), errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.setDefaultTimeout(15000);
      async function go(url) {
        await page.goto(base+url,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>!!window.RangerbookI18n);
        await page.evaluate(()=>window.RangerbookI18n.ready);
      }
      async function check(detail, buttons) {
        await buttons.first().click();
        for (const [slot,value] of [['WEAPON','395%'],['ARMOR','-18%'],['ACC','30']]) {
          const item=detail.locator(`[data-slot="${slot}"]`);
          await item.click();
          const effect=item.locator('.pvp-player-equipment-effect');
          await effect.waitFor();
          assert.ok((await effect.innerText()).endsWith(value), `${locale} ${slot}: ${await effect.innerText()}`);
          if(slot==='ACC')assert.ok(!(await effect.innerText()).endsWith('30%'));
          const label=await page.evaluate(()=>window.RangerbookI18n.t('gear.highLevelOptions'));
          assert.ok((await effect.innerText()).startsWith(label));
        }
        await buttons.nth(1).click();
        const old=detail.locator('[data-slot="WEAPON"]');await old.click();
        assert.ok((await old.locator('.pvp-player-equipment-effect').innerText()).includes(await page.evaluate(()=>window.RangerbookI18n.t('gear.playerValuePending'))));
        assert.equal(await detail.locator('[data-slot="ARMOR"]').getAttribute('data-effect'),'');
      }
      await go('/pvp/search/');
      await page.locator('#pvpPlayerSearchInput').fill('QA');
      await page.locator('.pvp-search-suggestion').first().click();
      for (const key of keys) {
        await page.locator('#pvpPlayerSearchTeamSelect').selectOption(key);
        await check(page.locator('#pvpPlayerSearchUnitDetail'),page.locator('#pvpPlayerSearchTeamGrid .pvp-player-unit-button'));
      }
      for (const league of ['LEGEND','MASTER_1','GOLD_3']) {
        await go('/pvp/leaderboard/?league='+league);
        await page.locator('.pvp-player-row').first().click();
        for (const key of keys.filter(k=>k!=='guildwar')) {
          await page.locator('#pvpPlayerTeamSelect').selectOption(key);
          await check(page.locator('#pvpPlayerUnitDetail'),page.locator('#pvpPlayerTeamGrid .pvp-player-unit-button'));
        }
      }
      await go('/guildwar/ranking/');
      await page.locator('.guildwar-rank-row').first().click();
      await page.locator('.guildwar-member-team-button').first().click();
      await check(page.locator('#guildwarPlayerUnitDetail'),page.locator('#guildwarPlayerTeamGrid .pvp-player-unit-button'));
      await page.setViewportSize({width:390,height:844});
      await page.locator('#guildwarPlayerTeamGrid .pvp-player-unit-button').first().click();
      const item=page.locator('#guildwarPlayerUnitDetail [data-slot="WEAPON"]');await item.click();
      const bounds=await item.locator('.pvp-player-equipment-effect').evaluate(x=>({width:x.clientWidth,scroll:x.scrollWidth}));
      assert.ok(bounds.width>=bounds.scroll-1,'Mobile effect must wrap');
      assert.deepEqual(errors,[]);
      console.log('EQUIPMENT_VALUES_OK',locale,'search:7 teams / PvP:3 leagues × 6 teams / guild / 3 slots / legacy / mobile');
  } finally {await browser.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
