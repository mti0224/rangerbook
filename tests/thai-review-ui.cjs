// API-routing fixtures run without SW; real controlled networking is tested in pwa-browser.cjs.
/* Reproduce the Thai review with real V2 records and synthetic PvP players. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4173';
const root = path.join(__dirname, '..');
const rows = JSON.parse(fs.readFileSync(path.join(root, 'res/v2/locales/ui.json')));
const get = (key, locale) => rows.find(r => r.key === 'UI:' + key)[locale === 'zh-Hant' ? 'zh_TW' : locale];
const fill = (key, locale, ...args) => get(key, locale).replace(/%N(\d+)/g, (_, n) => args[Number(n) - 1]);
const metadata = {generatedAtUtc:'2026-10-13T00:00:00Z', league:'LEGEND', rankingCount:1};
const unit = {unitCode:'u1535e-brown', level:180, leonardPoint:29, talentGrade:1};
const fixtures = {
  'leaderboard.json':{metadata, players:[{rank:1, detailKey:'qa', displayName:'QA Player', availableName:true, score:3702}]},
  'player_teams.json':{metadata, players:[{rank:1, detailKey:'qa', teams:{pvpteam:[unit], team1:[{...unit, level:240, leonardPoint:0}]}}]}
};
(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.QA_CHROME, args:process.env.QA_CHROME ? ["--single-process", "--no-zygote"] : []});
  try {
    for (const locale of ['th', 'en', 'jp', 'zh-Hant']) {
      const context = await browser.newContext({serviceWorkers:"block",viewport:{width:1140, height:900}});
      await context.addInitScript(l => localStorage.setItem('rangerbook-language', l), locale);
      if (process.env.QA_LOCAL_FILES) await context.route(base + '/**', r => {
        let name = decodeURIComponent(new URL(r.request().url()).pathname);
        if (name.endsWith('/')) name += 'index.html';
        const file = path.join(root, name);
        const types = {'.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2'};
        return r.fulfill({status:fs.existsSync(file) ? 200 : 404, contentType:types[path.extname(file)] || 'application/octet-stream', body:fs.existsSync(file) ? fs.readFileSync(file) : ''});
      });
      await context.route('**/www.googletagmanager.com/**', r => r.abort());
      await context.route('**/rangerbook-auth.warmycat.com/**', r => r.fulfill({status:401, contentType:'application/json', body:'{}'}));
      await context.route('**/pvp-data.warmycat.com/**', r => {
        const body = fixtures[new URL(r.request().url()).pathname.split('/').pop()];
        return r.fulfill({status:body ? 200 : 404, contentType:'application/json', body:JSON.stringify(body || {})});
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      async function go(url) {
        await page.goto(base + url, {waitUntil:'domcontentloaded'});
        await page.waitForFunction(() => !!window.RangerbookI18n);
        await page.evaluate(() => window.RangerbookI18n.ready);
      }
      await go('/ranger/ranger/');
      await page.locator('.ranger-card').first().waitFor();
      await page.locator('#rangerAdvancedToggleBtn').click();
      for (const [id, key] of Object.entries({skillEffectFilter:'filter.allSkillEffects', abilityEffectFilter:'filter.allAbilities', talentConditionFilter:'filter.allTalentConditions', talentEffectFilter:'filter.allTalentEffects'})) {
        const option = page.locator('#' + id + ' option').first();
        await assertText(option, get(key, locale));
        assert.equal(await option.getAttribute('value'), '');
      }
      // Nonempty option values stay canonical and still filter the real records.
      await page.locator('#abilityEffectFilter').selectOption({index:1});
      assert.ok(await page.locator('.ranger-card').count() > 0);
      await go('/ranger/ranger/?detail=u1626u-cony');
      await page.locator('.ranger-level-range').waitFor();
      await assertText(page.locator('.ranger-detail-back-link'), get('action.backToRangers', locale));
      await assertText(page.locator('.ranger-level-label'), get('copy.level.2', locale) + '1/240');
      await assertText(page.locator('[data-i18n="stats.respawn"]'), get('stats.respawn', locale));
      const desktopLabel = await page.locator('[data-i18n="stats.respawn"]').evaluate(x => ({width:x.clientWidth, scroll:x.scrollWidth}));
      assert.ok(desktopLabel.width >= desktopLabel.scroll - 1, 'Production label must fit the desktop card');
      await assertText(page.locator('#rangerModalContent .detail-section').nth(3).locator('.empty-state'), get('empty.awakenedAbilities', locale));
      await page.locator('#rangerLevelRange').fill('180');
      await assertText(page.locator('.ranger-level-output'), '180/240');
      await page.setViewportSize({width:390,height:844});
      const label = await page.locator('[data-i18n="stats.respawn"]').evaluate(x => ({height:x.clientHeight, scroll:x.scrollHeight, width:x.clientWidth, scrollWidth:x.scrollWidth}));
      assert.ok(label.height >= label.scroll - 1 && label.width >= label.scrollWidth - 1, 'Thai production label must fit by wrapping');
      await page.setViewportSize({width:1140,height:900});
      await go('/pvp/leaderboard/');
      await page.locator('.pvp-player-row').first().click();
      const header = page.locator('.pvp-player-team-header');
      const rankText = (await header.locator(':scope > p').textContent() || '').trim();
      const expectedRankText = fill('dynamic.pvpRankScore', locale, 1, '3,702');
      if (rankText !== expectedRankText) console.error('RANK_TRANSLATION_MISMATCH', JSON.stringify({locale, rankText, expectedRankText}));
      await assertText(header.locator(':scope > p'), expectedRankText);
      assert.equal(await header.getAttribute('data-player-rank'), '1');
      await page.locator('#pvpPlayerTeamGrid .pvp-player-unit-button').first().click();
      const levelText = (await page.locator('.pvp-player-unit-detail-head > div > span').first().textContent() || '').trim();
      const expectedLevelText = fill('dynamic.rangerLevel', locale, 180);
      console.log('RANGER_LEVEL_DIAG', JSON.stringify({locale, levelText, expectedLevelText,
        lookup: await page.evaluate(() => ({locale:window.RangerbookI18n?.locale, v2Locale:window.RangerbookV2?.locale,
          v2:window.RangerbookV2?.translateText('等級：Lv. 180')}))}));
      await assertText(page.locator('.pvp-player-unit-detail-head > div > span').first(), expectedLevelText);
      await assertText(page.locator('.pvp-player-leonard-line'), fill('dynamic.leonardPoints', locale, 29));
      assert.equal(await page.locator('.pvp-player-name-with-talent').count(), 1);
      await page.locator('#pvpPlayerTeamSelect').selectOption('team1');
      await page.locator('#pvpPlayerTeamGrid .pvp-player-unit-button').first().click();
      await assertText(page.locator('.pvp-player-leonard-line'), fill('dynamic.leonardPoints', locale, 0));
      assert.deepEqual(errors, []);
      console.log('THAI_REVIEW_OK', locale, 'filters/detail/slider/mobile/PvP/team switch/zero points');
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exitCode = 1;});
async function assertText(locator, expected) {
  await locator.waitFor({state:'attached'});
  await locator.page().waitForFunction(({selector, expected}) => {
    return [...document.querySelectorAll(selector)].some(x => x.textContent.trim() === expected);
  }, {selector:await locator.evaluate(x => {
    if (!x.id) x.id = 'qa-' + Math.random().toString(36).slice(2);
    return '#' + x.id;
  }), expected});
  assert.equal((await locator.textContent()).trim(), expected);
}
