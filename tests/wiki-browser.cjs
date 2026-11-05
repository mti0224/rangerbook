/* Full wiki workflow against tests/wiki-preview.py. All sessions/content synthetic. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const origin=process.env.WIKI_QA_ORIGIN||'http://127.0.0.1:4186';
const out=process.env.WIKI_QA_OUTPUT||'/tmp';
let activePage;
async function main(){
 const browser=await chromium.launch({headless:true,...(process.env.WIKI_QA_CHROME?{executablePath:process.env.WIKI_QA_CHROME}:{})});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1050}});
 await context.addCookies([{name:'fixture',value:'admin',domain:'127.0.0.1',path:'/'}]);
 await context.addInitScript(()=>localStorage.setItem('rangerbook-language','zh-Hant'));
 const errors=[],external=[];
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort();}return route.continue();});
 const page=await context.newPage();activePage=page;page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());
 await page.goto(origin+'/wiki/manage/');
 await page.locator('#wikiNewArticle').click();
 await page.locator('#wikiNewTitle').fill('測試：傷害如何計算？');
 const slug='qa-damage-'+Date.now();
 await page.locator('#wikiNewSlug').fill(slug);
 await page.locator('#wikiCreateSubmit').click();
 await page.waitForFunction(()=>window.wikiEditor);
 await page.locator('#wikiEditCategory').fill('傷害計算');
 await page.locator('#wikiEditSummary').fill('六種區塊與草稿發布流程的測試文章。');
 await page.locator('[data-wiki-block=header]').click();
 await page.locator('.wiki-block-heading').fill('第一節：計算方式');
 await page.locator('[data-wiki-block=subheader]').click();
 await page.locator('.wiki-block-subheading').fill('公式與範例');
 await page.locator('[data-wiki-block=paragraph]').click();
 const paragraph=page.locator('.wiki-block-text:not(.wiki-block-heading):not(.wiki-block-subheading)').last();
 await paragraph.fill('這是一段遊戲機制說明。');
 await paragraph.press('Control+a');
 await page.locator('.ce-inline-toolbar [data-item-name=bold]').click();
 assert(await paragraph.locator('b,strong').count()>0,'Bold formatting applied');
 await paragraph.click();await paragraph.press('End');
 await page.locator('[data-wiki-block=latex]').click();
 await page.getByLabel('LaTeX 公式',{exact:true}).fill('D = A \\times (1 - \\frac{R}{100})');
 await page.locator('[data-wiki-block=code]').click();
 await page.getByLabel('程式語言',{exact:true}).selectOption('python');
 await page.getByLabel('程式碼',{exact:true}).fill('\n  damage = attack * (1 - resistance / 100)\n');
 await page.locator('[data-wiki-block=image]').click();
 await page.locator('input[type=file]').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAAIklEQVR4nGP8z8CwhYGKgImaho0aOGrgqIGjBo4aOJQMBABCdgHbrOGfiAAAAABJRU5ErkJggg==','base64')});
 await page.getByText('圖片已上傳；發布文章後才會公開。',{exact:true}).waitFor();
 await page.getByLabel('圖片說明',{exact:true}).fill('範例圖片');
 await page.getByLabel('替代文字（說明圖片內容）',{exact:true}).fill('紅色測試圖片');
 await page.locator('#wikiSave').click();
 await page.waitForFunction(()=>document.getElementById('wikiSaveStatus').textContent.startsWith('已儲存'));
 const editURL=page.url(),id=new URL(editURL).searchParams.get('edit');
 const draft=await context.request.get(origin+'/admin/wiki/articles/'+id);
 const value=await draft.json();
 for(const type of ['header','subheader','paragraph','latex','code','image'])assert(value.document.blocks.some(x=>x.type===type),'Saved '+type);
 const imageId=value.document.blocks.find(x=>x.type==='image').data.asset_id;
 assert.equal((await context.request.get(origin+'/public/wiki/assets/'+imageId)).status(),404);
 assert.equal((await context.request.get(origin+'/public/wiki/articles/'+slug)).status(),404);
 await page.locator('#wikiPreviewButton').click();
 await page.locator('#wikiPreview[open] .katex').waitFor();
 assert.equal(await page.locator('#wikiPreviewBody h2').innerText(),'第一節：計算方式');
 await page.locator('#wikiPreview button[aria-label=關閉]').click();
 await page.locator('#wikiPublish').click();
 await page.getByText('已發布，讀者現在可以看到此版本。',{exact:true}).waitFor();
 assert.equal((await context.request.get(origin+'/public/wiki/assets/'+imageId)).status(),200);
 const reader=await context.newPage();await reader.goto(origin+'/wiki/?article='+slug);
 await reader.locator('#wikiBody .katex').waitFor();
 assert.equal(await reader.locator('#wikiTitle').innerText(),'測試：傷害如何計算？');
 assert(await reader.locator('#wikiBody code .hljs-keyword,#wikiBody code .hljs-number').count()>0,'Syntax highlighting');
 assert.equal(await reader.locator('#wikiToc a').count(),2);
 await reader.screenshot({path:out+'/wiki-reader-desktop.png',fullPage:true});
 await page.locator('#wikiEditTitle').fill('只有草稿的新標題');
 await page.waitForFunction(()=>document.getElementById('wikiSaveStatus').textContent.startsWith('已儲存'));
 await reader.reload();assert.equal(await reader.locator('#wikiTitle').innerText(),'測試：傷害如何計算？');
 await page.reload();await page.waitForFunction(()=>window.wikiEditor);assert.equal(await page.locator('#wikiEditTitle').inputValue(),'只有草稿的新標題');
 // Check phone layout, editing and previews in both themes.
 for(const width of [390,768,1440])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:1000});await page.evaluate(t=>{document.documentElement.dataset.theme=t;localStorage.setItem('rangerbook-theme',t);},theme);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Editor fits '+width+' '+theme);
  await reader.setViewportSize({width,height:1000});await reader.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  assert(await reader.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Reader fits '+width+' '+theme);
 }
 await page.screenshot({path:out+'/wiki-editor-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1050});await page.evaluate(()=>document.documentElement.dataset.theme='light');
 await page.screenshot({path:out+'/wiki-editor-desktop.png',fullPage:true});
 // Duplicate and move use the actual Editor.js block APIs via the visible controls.
 await page.locator('.wiki-block-heading').click();const before=await page.locator('#wikiEditor .ce-block').count();
 await page.locator('#wikiDuplicate').click();await page.waitForFunction(n=>document.querySelectorAll('#wikiEditor .ce-block').length===n+1,before);
 await page.locator('.wiki-block-heading').last().click();await page.locator('#wikiMoveDown').click();await page.locator('#wikiSave').click();
 await page.waitForFunction(()=>document.getElementById('wikiSaveStatus').textContent.startsWith('已儲存'));
 // Concurrent editor must stop rather than overwrite a newer draft.
 const other=await context.newPage();await other.goto(editURL);await other.waitForFunction(()=>window.wikiEditor);
 await page.locator('#wikiEditSummary').fill('第一個編輯器更新');await page.locator('#wikiSave').click();await page.waitForFunction(()=>document.getElementById('wikiSaveStatus').textContent.startsWith('已儲存'));
 await other.locator('#wikiEditSummary').fill('過期編輯器更新');await other.locator('#wikiSave').click();await other.locator('#wikiConflict:not([hidden])').waitFor();
 await other.close({runBeforeUnload:false});
 await page.locator('#wikiHistory').click();await page.locator('#wikiRevisions[open]').waitFor();
 assert(await page.locator('.wiki-revision').count()>2);
 await page.locator('#wikiRevisions button[aria-label=關閉]').click();
 await page.locator('#wikiUnpublish').click();await page.getByText('已下架。',{exact:true}).waitFor();
 assert.equal((await context.request.get(origin+'/public/wiki/articles/'+slug)).status(),404);
 assert.equal((await context.request.get(origin+'/public/wiki/assets/'+imageId)).status(),404);
 await context.clearCookies();await reader.goto(origin+'/wiki/manage/');await reader.locator('#wikiAdminAuth').waitFor();
 assert.equal((await context.request.get(origin+'/admin/wiki/articles/'+id)).status(),403);
 assert.deepEqual(errors,[],'No uncaught page errors');
 assert.deepEqual(external,[],'No external requests');
 console.log(JSON.stringify({result:'WIKI_BROWSER_PASS',blocks:6,viewports:[390,768,1440],themes:['light','dark'],publication:true,private_images:true,autosave:true,conflict:true,revisions:true,external_requests:external.length}));
 }catch(error){if(activePage){await activePage.screenshot({path:out+'/wiki-qa-failure.png',fullPage:true}).catch(()=>{});console.log('UI_DIAGNOSTIC',await activePage.locator('main').innerText().catch(()=>''));}throw error;}finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
