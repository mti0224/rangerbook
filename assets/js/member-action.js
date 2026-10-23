(() => {
  'use strict';
  const params=new URLSearchParams(window.__RB_ACTION||'');delete window.__RB_ACTION;
  let token=params.get('reset')||params.get('verify');params.delete('reset');params.delete('verify');
  const $=id=>document.getElementById(id),auth=window.RangerbookAuth;
  const t=key=>window.RangerbookI18n?.t('member.'+key,key)||key;
  const show=(value,error=false)=>{const el=$('memberActionStatus');el.textContent=value;el.className='admin-message '+(error?'error':'success');el.setAttribute('aria-live','polite');};
  const post=(path,body)=>auth.api(path,{method:'POST',body:JSON.stringify(body)});
  let busy=false;
  const cooldowns=new Map();
  const run=fn=>async e=>{
    e.preventDefault();const target=e.currentTarget,b=e.submitter||(target.tagName==='FORM'?target.querySelector('button'):target);
    if(busy||b.disabled||cooldowns.has(b))return;
    busy=true;b.disabled=true;target.setAttribute('aria-busy','true');show(t('processing'));
    try{await fn(e);}catch(error){
      show(error.message,true);
      if(error.status===429)cooldowns.set(b,Date.now()+(error.retryAfter||900)*1000);
      if(error.payload?.detail==='member.invalidLink'){
        token=null;$('memberResetForm').reset();$('memberResetForm').hidden=true;$('memberVerifyEmail').hidden=true;
        $('memberResendForm').hidden=kind!=='verify';$('memberForgotForm').hidden=kind==='verify';
      }
    }finally{busy=false;b.disabled=cooldowns.has(b);target.removeAttribute('aria-busy');}
  };
  setInterval(()=>{for(const [button,until] of cooldowns){
    const seconds=Math.max(0,Math.ceil((until-Date.now())/1000));
    if(seconds)show(window.RangerbookI18n.format('member.retryCountdown',[Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')]),true);
    else{cooldowns.delete(button);button.disabled=false;show(t('retryReady'));}
  }},1000);
  // Inline bootstrap keeps the key only long enough to select the form.
  const kind=window.__RB_ACTION_KIND;delete window.__RB_ACTION_KIND;
  $('memberForgotForm').hidden=Boolean(token);
  $('memberResendForm').hidden=Boolean(token);
  $('memberResetForm').hidden=!token||kind==='verify';
  $('memberVerifyEmail').hidden=!token||kind!=='verify';
  $('memberForgotForm').addEventListener('submit',run(async e=>{const form=e.currentTarget;await post('/auth/password/forgot',{identifier:form.elements.identifier.value});form.reset();show(t('checkEmail'));}));
  $('memberResendForm').addEventListener('submit',run(async e=>{await post('/auth/email/resend',{identifier:e.currentTarget.elements.identifier.value});show(t('checkEmail'));}));
  $('memberResetForm').addEventListener('submit',run(async e=>{
    const f=e.currentTarget;if(f.elements.password.value!==f.elements.confirm.value){show(t('passwordMismatch'));return;}
    await post('/auth/password/reset',{token,password:f.elements.password.value});token=null;f.reset();f.hidden=true;show(t('resetDone'));
  }));
  $('memberVerifyEmail').addEventListener('click',run(async()=>{await post('/auth/email/verify',{token});token=null;$('memberVerifyEmail').hidden=true;show(t('verified'));}));
  window.addEventListener('hashchange',()=>{if(location.hash)location.reload();});
  window.addEventListener('pagehide',()=>{token=null;$('memberResetForm').reset();});
})();
