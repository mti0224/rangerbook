(() => {
  'use strict';
  const auth=window.RangerbookAuth, $=id=>document.getElementById(id);
  const t=key=>window.RangerbookI18n?.t('member.'+key,key)||key;
  let features={}, status={};
  const say=(value,error=false)=>{const el=$('memberState')||$('memberGate');if(el){el.textContent=value;el.classList.toggle('error',error);}};
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
    $('memberFactorStatus').textContent=t(status.totp_required?'mandatory2fa':status.totp_enabled?'enabled':'disabled');
    $('memberVerifyForm').hidden=!user.mfa_required;
    $('memberSetup').hidden=status.totp_enabled||user.mfa_required;
    $('memberCodes').hidden=!user.logged_in||!status.totp_enabled;
    $('memberDisable').hidden=!user.logged_in||!status.totp_enabled||status.totp_required;
    $('memberGoogle').hidden=!user.logged_in;
    $('memberGoogleStart').disabled=!features.google;
    $('memberGoogleStatus').textContent=status.google_email||t(features.google?'unbound':'unconfigured');
    $('memberGoogleUnlink').hidden=!status.google_email;
    $('memberPassword').hidden=!user.logged_in&&!user.must_change_password;
    $('memberApplication').hidden=!user.logged_in||user.role!=='user';
    if($('adminPasswordCard'))$('adminPasswordCard').hidden=false;
  }
  const run=fn=>async event=>{
    event?.preventDefault();const button=event?.submitter||event?.currentTarget;if(button?.tagName==='BUTTON')button.disabled=true;
    try{await fn(event);}catch(error){say(error.message,true);}finally{if(button?.tagName==='BUTTON')button.disabled=false;}
  };
  const codes=payload=>{if(payload.recovery_codes){$('memberRecovery').textContent=payload.recovery_codes.join('\n');$('memberRecoveryPanel').hidden=false;}};
  $('memberReauthForm')?.addEventListener('submit',run(async e=>{
    const form=e.currentTarget;try{await api('/auth/reauth',{password:form.elements.password.value,code:form.elements.code.value});say(t('reauthDone'));}finally{form.reset();}
  }));
  $('memberVerifyForm')?.addEventListener('submit',run(async e=>{const form=e.currentTarget;try{await api('/auth/2fa/verify',{code:form.elements.code.value});await refresh();}finally{form.reset();}}));
  $('memberSetup')?.addEventListener('click',run(async()=>{
    const payload=await api('/auth/2fa/setup');$('memberQr').src=payload.qr;$('memberManualKey').textContent=payload.manual_key;$('memberSetupPanel').hidden=false;
  }));
  $('memberEnableForm')?.addEventListener('submit',run(async e=>{
    const payload=await api('/auth/2fa/enable',{code:e.currentTarget.elements.code.value});clearSecrets();codes(payload);await refresh();
  }));
  $('memberCodes')?.addEventListener('click',run(async()=>codes(await api('/auth/2fa/recovery-codes'))));
  $('memberHideCodes')?.addEventListener('click',clearSecrets);
  $('memberDisable')?.addEventListener('click',run(async()=>{if(!confirm(t('disableConfirm')))return;await api('/auth/2fa/disable');clearSecrets();await refresh();}));
  $('memberGoogleStart')?.addEventListener('click',run(async()=>{
    const payload=await api('/auth/google/start');const url=new URL(payload.url);
    if(url.origin!=='https://accounts.google.com')throw new Error(t('unavailable'));
    clearSecrets();location.assign(url.href);
  }));
  $('memberGoogleUnlink')?.addEventListener('click',run(async()=>{if(!confirm(t('unlinkConfirm')))return;await api('/auth/google/unlink');await refresh();}));
  $('memberApply')?.addEventListener('click',run(async()=>{await api('/member/admin-application');say(t('applied'));}));
  $('memberLogout')?.addEventListener('click',run(async()=>{await auth.logout();clearSecrets();await refresh();}));
  window.addEventListener('pagehide',clearSecrets);
  auth.ready().then(async()=>{
    await window.RangerbookI18n?.ready;
    features=await auth.api('/auth/features');
    await refresh();
    if(location.hash.startsWith('#google=')){say(t(location.hash==='#google=ok'?'bound':'googleFailed'));history.replaceState(null,'',location.pathname);}
  }).catch(error=>say(error.message,true));
})();
