/* Shared, allowlisted reader for versioned wiki blocks. */
(() => {
  'use strict';
  const base=String(window.RANGERBOOK_AUTH_API_BASE||'https://rangerbook-auth.warmycat.com').replace(/\/+$/,'');
  const root=new URL('../../',document.currentScript.src);
  const node=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=value;return n;};
  const safeLink=value=>{try{const u=new URL(value,location.href);return ['http:','https:'].includes(u.protocol)?u.href:'#';}catch{return '#';}};
  function rich(value){
    const source=document.createElement('template');source.innerHTML=String(value||'');
    const allowed=new Set(['B','STRONG','I','EM','S','STRIKE','DEL','U','BR','A','CODE','MARK']);
    function clean(parent){const out=document.createDocumentFragment();for(const child of parent.childNodes){if(child.nodeType===3){out.append(document.createTextNode(child.textContent));continue;}if(child.nodeType!==1)continue;const contents=clean(child);if(!allowed.has(child.tagName)){out.append(contents);continue;}const el=node(child.tagName.toLowerCase());if(child.tagName==='A'){el.href=safeLink(child.getAttribute('href')||'#');el.rel='noopener noreferrer';}el.append(contents);out.append(el);}return out;}
    return clean(source.content);
  }
  function formula(target,value){
    target.replaceChildren();
    try{if(!window.katex)throw Error('公式顯示元件尚未載入');katex.render(String(value||''),target,{displayMode:true,throwOnError:true,trust:false,strict:'warn',maxExpand:1000,maxSize:20});target.classList.remove('wiki-formula-error');}
    catch(error){target.classList.add('wiki-formula-error');target.textContent=value?`公式格式錯誤：${String(error.message).slice(0,220)}`:'輸入 LaTeX 後會在這裡預覽公式。';}
  }
  function render(target,doc,{privateImages=false,toc=null}={}){
    target.replaceChildren();if(toc)toc.replaceChildren();let heading=0;
    for(const block of doc?.blocks||[]){const d=block.data||{};let el;
      if(['header','subheader'].includes(block.type)){el=node(block.type==='header'?'h2':'h3');el.append(rich(d.text));el.id='section-'+(++heading);if(toc){const link=node('a',block.type==='subheader'?'wiki-toc-sub':'',el.textContent);link.href='#'+el.id;toc.append(link);}}
      else if(block.type==='paragraph'){el=node('p');el.append(rich(d.text));}
      else if(block.type==='latex'){el=node('div','wiki-formula');formula(el,d.formula);}
      else if(block.type==='code'){el=node('div','wiki-code');const bar=node('div','wiki-code-bar');bar.append(node('span','',d.language||'plaintext'));const copy=node('button','','複製');copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText(d.code||'');copy.textContent='已複製';}catch{copy.textContent='請選取程式碼複製';}};bar.append(copy);const pre=node('pre'),code=node('code','',d.code||'');if(window.hljs&&hljs.getLanguage(d.language)){code.className='language-'+d.language;hljs.highlightElement(code);}pre.append(code);el.append(bar,pre);}
      else if(block.type==='image'&&/^[a-f0-9]{32}$/.test(d.asset_id)){el=node('figure','wiki-image wiki-image-'+(d.width||'full'));const img=node('img');img.src=base+(privateImages?'/admin':'/public')+'/wiki/assets/'+d.asset_id;img.alt=d.alt||'';img.loading='lazy';el.append(img);if(d.caption)el.append(node('figcaption','',d.caption));}
      if(el)target.append(el);
    }
    if(toc&&!heading)toc.append(node('p','','此文章沒有段落目錄。'));
  }
  async function api(path,options={}){
    const headers=new Headers(options.headers||{});if(options.body)headers.set('Content-Type','application/json');
    const response=await fetch(base+path,{...options,headers,credentials:'include',cache:'no-store'});
    let data;try{data=await response.json();}catch{throw Error('無法讀取伺服器回應。');}
    if(!response.ok){const detail=typeof data.detail==='string'?data.detail:'資料格式不正確，請檢查內容。';const messages={'member.loginRequired':'登入已過期，請重新登入後再儲存。','member.adminRequired':'需要管理員權限。','member.mfaRequired':'請先完成兩步驟驗證。','member.passwordRequired':'請先完成密碼更新。'};const error=Error(messages[detail]||detail);error.status=response.status;throw error;}return data;
  }
  const date=value=>value?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'';
  window.RangerbookWiki={base,root,node,rich,render,formula,api,date};
})();
