/* Shared feedback and cooldowns. Secrets are never persisted in browser storage. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), auth=window.RangerbookAuth;
  const t=key=>window.RangerbookI18n?.t('member.'+key,key)||key;
  const format=(key,value)=>window.RangerbookI18n?.format('member.'+key,[value])||value;
  const clock=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
  const left=until=>Math.max(0,Math.ceil((until-Date.now())/1000));
  const cooldowns=new Map(),feedbackOwner=new WeakMap();
  let busy=false;
  const notify=(el,value,type='')=>{if(!el)return;el.textContent=value;el.classList.add('admin-message');el.classList.toggle('error',type==='error');el.classList.toggle('success',type==='success');el.setAttribute('role','status');el.setAttribute('aria-live','polite');};
  const message=target=>{
    const card=target?.closest('.member-setting,.admin-card');
    if(!card)return $('memberState')||$('memberActionStatus');
    let el=card.querySelector('.member-operation-status');
    if(!el){el=document.createElement('p');el.className='member-operation-status';card.append(el);}
    return el;
  };
  function tick(){
    for(const [button,entry] of cooldowns){
      const seconds=left(entry.until);
      button.disabled=busy||seconds>0;
      const ownsFeedback=entry.el&&feedbackOwner.get(entry.el)===button;
      if(seconds){if(ownsFeedback)notify(entry.el,format('retryCountdown',clock(seconds)));}
      else{cooldowns.delete(button);if(ownsFeedback)notify(entry.el,t('retryReady'));}
    }
  }
  const cooldown=(button,seconds,el)=>{if(el)feedbackOwner.set(el,button);cooldowns.set(button,{until:Date.now()+seconds*1000,el});tick();};
  setInterval(tick,1000);
  const clearCooldown=button=>{
    cooldowns.delete(button);
    if(busy)window.addEventListener('member:idle',()=>{button.disabled=false;},{once:true});
    else button.disabled=false;
  };
  const post=(path,body={})=>auth.api(path,{method:'POST',body:JSON.stringify(body)});
  const run=(fn,success,el)=>async e=>{
    e?.preventDefault();
    const target=e?.currentTarget, button=e?.submitter||(target?.tagName==='FORM'?target.querySelector('button[type=submit]'):target);
    if(busy||button?.disabled||cooldowns.has(button))return;
    const output=el||message(target), controls=[...document.querySelectorAll('button')].map(x=>[x,x.disabled]);
    if(output)feedbackOwner.set(output,button);
    busy=true;controls.forEach(([x])=>x.disabled=true);target?.setAttribute('aria-busy','true');notify(output,t('processing'));
    try{const result=await fn(e);if(result===false)notify(output,'');else if(success)notify(output,t(success),'success');}
    catch(error){
      notify(output,error.message||t('networkError'),'error');
      if(error.status===429&&button)cooldown(button,error.retryAfter||900,output);
      if(error.status===401&&error.payload?.detail==='member.loginRequired'&&location.pathname.includes('/account/')){
        $('memberLoginGate').hidden=false;
      }
      if(error.payload?.detail==='member.reauthRequired')window.dispatchEvent(new Event('member:proof-expired'));
    }finally{
      busy=false;controls.forEach(([x,disabled])=>x.disabled=disabled);target?.removeAttribute('aria-busy');tick();window.dispatchEvent(new Event('member:idle'));
    }
  };
  function factorMode(form,button){
    const input=form.elements.code,recovery=input.dataset.recovery!=='true';
    input.dataset.recovery=String(recovery);input.value='';input.inputMode=recovery?'text':'numeric';input.maxLength=recovery?64:6;
    input.minLength=recovery?1:6;input.pattern=recovery?'[A-Za-z0-9-]+':'[0-9]{6}';
    input.previousElementSibling.dataset.i18n='member.'+(recovery?'recoveryCode':'totpCode');
    input.previousElementSibling.textContent=t(recovery?'recoveryCode':'totpCode');
    button.dataset.i18n='member.'+(recovery?'useTotp':'useRecovery');button.textContent=t(recovery?'useTotp':'useRecovery');input.focus();
  }
  window.RangerbookMemberUI={$,auth,t,format,clock,left,notify,message,post,run,cooldown,clearCooldown,factorMode,busy:()=>busy};
})();
