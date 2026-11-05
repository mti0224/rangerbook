(async()=>{
  'use strict';const W=window.RangerbookWiki,$=id=>document.getElementById(id);
  const slug=new URLSearchParams(location.search).get('article');
  const message=$('wikiMessage');
  try{
    if(slug){$('wikiIndex').hidden=true;const value=await W.api('/public/wiki/articles/'+encodeURIComponent(slug));$('wikiArticle').hidden=false;$('wikiTitle').textContent=value.title;$('wikiSummary').textContent=value.summary;$('wikiCategory').textContent=value.category||'遊戲機制';$('wikiUpdated').textContent='更新時間：'+W.date(value.updated_at);document.title=value.title+'｜遊戲機制｜LINE Rangers Database';W.render($('wikiBody'),value.document,{toc:$('wikiToc')});}
    else{
      const {items}=await W.api('/public/wiki/articles');const categories=[...new Set(items.map(x=>x.category).filter(Boolean))];for(const value of categories){const option=W.node('option','',value);option.value=value;$('wikiFilter').append(option);}
      const draw=()=>{const q=$('wikiSearch').value.trim().toLocaleLowerCase(),category=$('wikiFilter').value;const filtered=items.filter(x=>(!category||x.category===category)&&(!q||(x.title+' '+x.summary).toLocaleLowerCase().includes(q)));$('wikiCount').textContent=`${filtered.length} 篇文章`;$('wikiList').replaceChildren();for(const item of filtered){const link=W.node('a','wiki-question');link.setAttribute('data-i18n-ignore','');link.href='?article='+encodeURIComponent(item.slug);const line=W.node('div','wiki-question-top');line.append(W.node('span','wiki-category',item.category||'遊戲機制'),W.node('time','wiki-muted',W.date(item.updated_at)));link.append(line,W.node('h2','',item.title),W.node('p','wiki-muted',item.summary||'點擊閱讀文章'),W.node('span','wiki-read-link','閱讀文章 →'));$('wikiList').append(link);}if(!filtered.length)$('wikiList').append(W.node('div','wiki-empty',items.length?'沒有符合的文章，請試試其他關鍵字。':'目前尚無已發布文章。'));};
      $('wikiSearch').oninput=draw;$('wikiFilter').onchange=draw;draw();
    }
    message.hidden=true;
  }catch(error){message.textContent=error.status===404?'文章尚未發布或已下架。':`載入失敗：${error.message}`;const retry=W.node('button','','重新載入');retry.type='button';retry.onclick=()=>location.reload();message.append(retry);}
  try{await RangerbookAuth.ready();if(RangerbookAuth.isAdmin())$('wikiManageLink').hidden=false;}catch{/* Public reading does not require a membership session. */}
})();
