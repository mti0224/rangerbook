(() => {
  'use strict';
  const auth=window.RangerbookAuth, $=id=>document.getElementById(id);
  const t=key=>window.RangerbookI18n?.t('member.'+key,key)||key;
  const format=(key,value)=>window.RangerbookI18n.format('member.'+key,[value]);
  let features={}, status={}, busy=false, proofUntil=0, proofRetryUntil=0;
  const cooldowns=new Map();
  const say=(value,error=false)=>{const el=$('memberState')||$('memberGate');if(el){el.textContent=value;el.classList.toggle('error',error);}};
  const messageFor=element=>{
    const card=element?.closest('.admin-card');if(!card)return $('memberState')||$('memberGate');
    let el=card.querySelector('.member-operation-status');
    if(!el){el=document.createElement('p');el.className='admin-message member-operation-status';el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.setAttribute('aria-atomic','true');card.append(el);}
    return el;
  };
  const notify=(el,text,type='')=>{if(el){el.textContent=text;el.classList.toggle('error',type==='error');el.classList.toggle('success',type==='success');}};
  const remaining=until=>Math.max(0,Math.ceil((until-Date.now())/1000));
  const clock=seconds=>Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
  function proofState(){
    const form=$('memberReauthForm');if(!form)return;
    let el=$('memberProofStatus');
    if(!el){el=document.createElement('p');el.id='memberProofStatus';el.className='member-proof-status';form.before(el);}
    const valid=remaining(proofUntil),wait=remaining(proofRetryUntil);
    el.textContent=valid?format('reauthValid',clock(valid)):wait?format('retryCountdown',clock(wait)):t('reauthNext');
    el.classList.toggle('success',valid>0);
    form.querySelector('button[type=submit]').disabled=busy||valid>0||wait>0;
    form.elements.code.closest('label').hidden=!status.totp_enabled;
    form.elements.code.required=Boolean(status.totp_enabled);
    if($('memberGoogleNext'))$('memberGoogleNext').textContent=t(!features.google?'unconfigured':valid?'googleReady':'googleNext');
  }
  function tick(){
    for(const [button,entry] of cooldowns){
      const seconds=remaining(entry.until);
      if(seconds){button.disabled=true;notify(entry.message,format('retryCountdown',clock(seconds)),'error');}
      else{cooldowns.delete(button);button.disabled=busy;notify(entry.message,t('retryReady'));}
    }
    proofState();
  }
  setInterval(tick,1000);
  const api=(path,body)=>auth.api(path,{method:'POST',...(body?{body:JSON.stringify(body)}:{})});
  const clearSecrets=()=>{
    $('memberQr')?.removeAttribute('src');if($('memberManualKey'))$('memberManualKey').textContent='';
    if($('memberRecovery'))$('memberRecovery').textContent='';
    if($('memberRecoveryPanel'))$('memberRecoveryPanel').hidden=true;
    if($('memberSetupPanel'))$('memberSetupPanel').hidden=true;
    document.querySelectorAll('input[type=password],input[autocomplete=one-time-code]').forEach(x=>x.value='');
  };
  async function refresh(){
    const user=await auth.refresh();
    if($('adminPersonalPanel')){
      $('adminPersonalPanel').hidden=!user.logged_in;
      $('memberGate').hidden=user.logged_in;
      if(user.logged_in)window.RangerbookPersonalTeams?.refresh();
      return;
    }
    const pending=user.setup_required||user.mfa_required||user.must_change_password;
    $('memberSecurityArea').hidden=!(user.logged_in||pending);
    say(t(user.setup_required?'setupRequired':user.mfa_required?'mfaRequired':user.logged_in?'signedIn':'loginRequired'));
    if(!user.logged_in&&!pending){clearSecrets();return;}
    status=await auth.api('/auth/security');
    proofUntil=Date.now()+Number(status.reauth_valid_for||0)*1000;
    proofRetryUntil=Date.now()+Number(status.reauth_retry_after||0)*1000;
    proofState();
    $('memberFactorStatus').textContent=t(status.totp_enabled?'enabled':'disabled')+(status.totp_required?' '+t('mandatory2fa'):'');
    $('memberVerifyForm').hidden=!user.mfa_required;
    $('memberSetup').hidden=status.totp_enabled||user.mfa_required;
    $('memberCodes').hidden=!user.logged_in||!status.totp_enabled;
    $('memberDisable').hidden=!user.logged_in||!status.totp_enabled||status.totp_required;
    $('memberGoogle').hidden=!user.logged_in;
    $('memberGoogleStart').disabled=!features.google;
    $('memberGoogleStatus').textContent=status.google_email||t(features.google?'unbound':'unconfigured');
    let googleNext=$('memberGoogleNext');
    if(!googleNext){googleNext=document.createElement('p');googleNext.id='memberGoogleNext';$('memberGoogleStatus').after(googleNext);}
    googleNext.textContent=t(remaining(proofUntil)?'googleReady':'googleNext');
    $('memberGoogleUnlink').hidden=!status.google_email;
    $('memberPassword').hidden=!user.logged_in&&!user.must_change_password;
    $('memberApplication').hidden=!user.logged_in||user.role!=='user';
    if($('adminPasswordCard'))$('adminPasswordCard').hidden=false;
  }
  const run=(fn,success,pending='processing')=>async event=>{
    event?.preventDefault();if(busy)return;
    const target=event?.currentTarget;
    const button=event?.submitter||(target?.tagName==='FORM'?target.querySelector('button[type=submit],button'):target);
    if(cooldowns.has(button)||button?.disabled)return;
    const message=messageFor(target),buttons=[...document.querySelectorAll('#memberSecurityArea button,#memberLogout')];
    const disabled=buttons.map(el=>[el,el.disabled]);busy=true;
    buttons.forEach(el=>el.disabled=true);target?.setAttribute('aria-busy','true');notify(message,t(pending));
    try{const result=await fn(event);if(result===false)notify(message,'');else if(success){notify(message,t(success),'success');if(message?.closest('[hidden]'))say(t(success));}}
    catch(error){
      notify(message,error.message||t('unavailable'),'error');
      if(error.status===429){const seconds=error.retryAfter||900;cooldowns.set(button,{until:Date.now()+seconds*1000,message});if(target?.id==='memberReauthForm')proofRetryUntil=Date.now()+seconds*1000;}
    }finally{busy=false;target?.removeAttribute('aria-busy');disabled.forEach(([el,value])=>el.disabled=value);tick();}
  };
  const codes=payload=>{if(payload.recovery_codes){$('memberRecovery').textContent=payload.recovery_codes.join('\n');$('memberRecoveryPanel').hidden=false;}};
  $('memberReauthForm')?.addEventListener('submit',run(async e=>{
    const form=e.currentTarget;try{await api('/auth/reauth',{password:form.elements.password.value,code:form.elements.code.value});await refresh();}finally{form.reset();}
  },'reauthDone'));
  $('memberVerifyForm')?.addEventListener('submit',run(async e=>{const form=e.currentTarget;try{await api('/auth/2fa/verify',{code:form.elements.code.value});await refresh();}finally{form.reset();}},'loginComplete'));
  $('memberSetup')?.addEventListener('click',run(async()=>{
    const payload=await api('/auth/2fa/setup');$('memberQr').src=payload.qr;$('memberManualKey').textContent=payload.manual_key;$('memberSetupPanel').hidden=false;
  },'scan'));
  $('memberEnableForm')?.addEventListener('submit',run(async e=>{
    const payload=await api('/auth/2fa/enable',{code:e.currentTarget.elements.code.value});clearSecrets();codes(payload);await refresh();
  },'factorEnabled'));
  $('memberCodes')?.addEventListener('click',run(async()=>codes(await api('/auth/2fa/recovery-codes')),'saveCodes'));
  $('memberHideCodes')?.addEventListener('click',clearSecrets);
  $('memberDisable')?.addEventListener('click',run(async()=>{if(!confirm(t('disableConfirm')))return false;await api('/auth/2fa/disable');clearSecrets();await refresh();},'factorDisabled'));
  $('memberGoogleStart')?.addEventListener('click',run(async()=>{
    const payload=await api('/auth/google/start');const url=new URL(payload.url);
    if(url.origin!=='https://accounts.google.com')throw new Error(t('unavailable'));
    clearSecrets();location.assign(url.href);
  },'googleRedirect','googleRedirect'));
  $('memberGoogleUnlink')?.addEventListener('click',run(async()=>{if(!confirm(t('unlinkConfirm')))return false;await api('/auth/google/unlink');await refresh();},'googleUnlinked'));
  $('memberApply')?.addEventListener('click',run(async()=>{await api('/member/admin-application');},'applied'));
  $('memberLogout')?.addEventListener('click',run(async()=>{await auth.logout();clearSecrets();await refresh();}));
  window.addEventListener('pagehide',clearSecrets);
  auth.ready().then(async()=>{
    await window.RangerbookI18n?.ready;
    features=await auth.api('/auth/features');
    await refresh();
    if(location.hash.startsWith('#google=')){
      const linked=location.hash==='#google=ok'&&Boolean(status.google_email);
      const message=t(linked?'bound':'googleFailed');say(message,!linked);notify(messageFor($('memberGoogleStart')),message,linked?'success':'error');
      $('memberGoogle')?.scrollIntoView({block:'center'});history.replaceState(null,'',location.pathname);
    }
  }).catch(error=>say(error.message,true));
})();
