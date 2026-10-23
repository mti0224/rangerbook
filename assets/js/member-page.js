(() => {
  'use strict';
  const auth=window.RangerbookAuth, $=id=>document.getElementById(id);
  if($('adminPersonalPanel')){
    auth.ready().then(user=>{
      $('adminPersonalPanel').hidden=!user.logged_in;$('memberGate').hidden=user.logged_in;
      if(user.logged_in)window.RangerbookPersonalTeams?.refresh();
    });return;
  }
  const {t,format,clock,left,notify,message,post,run,factorMode}=window.RangerbookMemberUI;
  const root=location.pathname.startsWith('/rangerbook/')?'/rangerbook/':'/';
  const setupPage=document.body.dataset.memberPage==='two-factor';
  let status={},features={},user={},proofUntil=0,retryUntil=0,wasValid=false,needsProofRefresh=false;
  const say=(key,error=false)=>notify($('memberState'),t(key),error?'error':'');
  function renderProof(){
    const valid=left(proofUntil)>0, wait=left(retryUntil);
    if(wasValid&&!valid){say('proofExpired',true);clearSetup();}
    wasValid=valid;
    const form=$('memberReauthForm');
    form.elements.password.disabled=valid||window.RangerbookMemberUI.busy();
    form.querySelector('button').disabled=valid||wait>0||window.RangerbookMemberUI.busy();
    $('memberProofStatus').textContent=valid?format('reauthValid',clock(left(proofUntil))):wait?format('retryCountdown',clock(wait)):t('reauthNext');
    if($('memberSettings'))$('memberSettings').disabled=!valid||needsProofRefresh||window.RangerbookMemberUI.busy();
    if($('memberGoogleStart'))$('memberGoogleStart').disabled=!features.google;
    if($('memberSetup'))$('memberSetup').disabled=!valid||needsProofRefresh||window.RangerbookMemberUI.busy();
    if($('memberEnableForm'))$('memberEnableForm').querySelector('button').disabled=!valid||needsProofRefresh||window.RangerbookMemberUI.busy();
  }
  function clearSetup(){
    $('memberQr')?.removeAttribute('src');if($('memberManualKey'))$('memberManualKey').textContent='';
    if($('memberSetupPanel'))$('memberSetupPanel').hidden=true;
  }
  function clearSecrets(){
    clearSetup();if($('memberRecovery'))$('memberRecovery').textContent='';
    if($('memberRecoveryPanel'))$('memberRecoveryPanel').hidden=true;
    document.querySelectorAll('input[type=password],input[autocomplete=one-time-code]').forEach(x=>x.value='');
  }
  async function refresh(){
    user=await auth.refresh();
    const permitted=user.logged_in||user.setup_required||user.must_change_password;
    $('memberLoginGate').hidden=Boolean(permitted);$('memberSecurityArea').hidden=!permitted;
    if(!permitted){clearSecrets();proofUntil=0;say('loginRequired',true);return;}
    if(user.setup_required&&!setupPage){location.replace(root+'two-factor/');return;}
    status=await auth.api('/auth/security');
    proofUntil=Date.now()+Number(status.reauth_valid_for||0)*1000;
    retryUntil=Date.now()+Number(status.reauth_retry_after||0)*1000;
    needsProofRefresh=false;
    if(setupPage){
      $('memberSetupCard').hidden=status.totp_enabled;
      if(!status.totp_enabled)say('setupGuide');
    }else{
      $('memberGoogleStatus').textContent=status.google_email||t(features.google?'unbound':'unconfigured');
      $('memberGoogleStart').dataset.i18n='member.'+(status.google_email?'replaceGoogle':'bindGoogle');
      $('memberGoogleStart').textContent=t(status.google_email?'replaceGoogle':'bindGoogle');
      $('memberGoogleUnlink').hidden=!status.google_email;
      $('memberGoogleNext').textContent=t(features.google?'googleGuide':'unconfigured');
      $('memberSetup').hidden=status.totp_enabled;
      $('memberDisable').hidden=!status.totp_enabled||status.totp_required;
      $('memberCodes').hidden=!status.totp_enabled;
      $('memberFactorStatus').textContent=t(status.totp_enabled?'enabled':'disabled')+(status.totp_required?' '+t('mandatory2fa'):'');
      $('memberPassword').hidden=!user.logged_in&&!user.must_change_password;
    }
    renderProof();
  }
  function codes(payload){
    if(payload.recovery_codes){$('memberRecovery').textContent=payload.recovery_codes.join('\n');$('memberRecoveryPanel').hidden=false;$('memberRecoveryPanel').scrollIntoView({block:'center'});}
  }
  let resolveDialog=null;
  function confirmAction(key,warning){
    const dialog=$('memberConfirmDialog'), form=$('memberConfirmForm');
    form.reset();$('memberDialogTitle').textContent=t(key);$('memberDialogMessage').textContent=t(warning);
    $('memberDialogFactor').hidden=!status.totp_enabled;form.elements.code.required=status.totp_enabled;
    // Reset a previous recovery mode before opening again.
    form.elements.code.dataset.recovery='true';factorMode(form,$('memberDialogRecovery'));
    dialog.showModal();
    return new Promise(resolve=>{resolveDialog=resolve;});
  }
  const closeDialog=value=>{if(!resolveDialog)return;const resolve=resolveDialog;resolveDialog=null;$('memberConfirmDialog').close();$('memberConfirmForm').reset();resolve(value);};
  $('memberConfirmForm')?.addEventListener('submit',e=>{e.preventDefault();closeDialog({code:e.currentTarget.elements.code.value.trim()});});
  $('memberDialogCancel')?.addEventListener('click',()=>closeDialog(null));
  $('memberConfirmDialog')?.addEventListener('cancel',e=>{e.preventDefault();closeDialog(null);});
  $('memberDialogRecovery')?.addEventListener('click',e=>factorMode($('memberConfirmForm'),e.currentTarget));
  $('memberReauthForm').addEventListener('submit',run(async e=>{
    const form=e.currentTarget;
    try{await post('/auth/reauth',{password:form.elements.password.value});await refresh();}
    catch(error){if(error.status===429)retryUntil=Date.now()+(error.retryAfter||900)*1000;throw error;}
    finally{form.reset();}
  },'reauthDone'));
  $('memberSetup')?.addEventListener('click',run(async()=>{
    if(!setupPage){location.assign(root+'two-factor/');return;}
    const payload=await post('/auth/2fa/setup');$('memberQr').src=payload.qr;$('memberManualKey').textContent=payload.manual_key;$('memberSetupPanel').hidden=false;
  },setupPage?'scan':null));
  $('memberEnableForm')?.addEventListener('submit',run(async e=>{
    try{const payload=await post('/auth/2fa/enable',{code:e.currentTarget.elements.code.value.trim()});clearSecrets();await refresh();codes(payload);say('factorEnabled');}
    finally{e.currentTarget.reset();}
  },'factorEnabled'));
  $('memberCancelSetup')?.addEventListener('click',run(async()=>{
    await post('/auth/2fa/cancel');clearSecrets();if(!user.logged_in)await auth.logout();location.assign(root+(user.logged_in?'account/':'login/'));
  }));
  // Confirmation dialogs are opened before running the request so their controls remain usable.
  const guarded=(id,title,warning,operation,success)=>{
    $(id)?.addEventListener('click',async e=>{
      if(e.currentTarget.disabled)return;
      const target=e.currentTarget,payload=await confirmAction(title,warning);if(!payload)return;
      await run(()=>operation(payload),success)({currentTarget:target,preventDefault(){}});
    });
  };
  guarded('memberGoogleStart','google','googleConsent',async payload=>{
    const result=await post('/auth/google/start',payload);const url=new URL(result.url);
    if(url.origin!=='https://accounts.google.com')throw new Error(t('unavailable'));
    clearSecrets();location.assign(url.href);
  });
  guarded('memberGoogleUnlink','unbindGoogle','unlinkConfirm',async payload=>{await post('/auth/google/unlink',payload);await refresh();},'googleUnlinked');
  guarded('memberDisable','disable','disableConfirm',async payload=>{
    await post('/auth/2fa/disable',payload);clearSecrets();await refresh();say('disabledLogin',true);
  });
  guarded('memberCodes','regenerate','codesConfirm',async payload=>codes(await post('/auth/2fa/recovery-codes',payload)),'saveCodes');
  $('memberPasswordForm')?.addEventListener('submit',run(async e=>{
    const form=e.currentTarget;
    if(form.elements.new_password.value!==form.elements.confirm.value)throw new Error(t('passwordMismatch'));
    try{await post('/auth/change-password',{current_password:form.elements.current_password.value,new_password:form.elements.new_password.value});proofUntil=0;await refresh();}
    finally{form.reset();}
  },'passwordChanged'));
  $('memberCopyCodes')?.addEventListener('click',run(async()=>{await navigator.clipboard.writeText($('memberRecovery').textContent);},'copied'));
  $('memberDownloadCodes')?.addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([$ ('memberRecovery').textContent+'\n'],{type:'text/plain'}));
    const a=document.createElement('a');a.href=url;a.download='rangerbook-recovery-codes.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('memberHideCodes')?.addEventListener('click',clearSecrets);
  window.addEventListener('member:idle',renderProof);
  window.addEventListener('member:proof-expired',()=>{proofUntil=0;renderProof();});
  setInterval(renderProof,1000);
  window.addEventListener('pagehide',()=>{clearSecrets();proofUntil=0;needsProofRefresh=true;});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){needsProofRefresh=true;renderProof();}
    else refresh().catch(error=>{notify($('memberState'),error.message,'error');needsProofRefresh=true;renderProof();});
  });
  window.addEventListener('pageshow',e=>{if(e.persisted)refresh().catch(()=>{proofUntil=0;renderProof();});});
  (async()=>{
    await auth.ready();await window.RangerbookI18n?.ready;
    features=await auth.api('/auth/features');await refresh();
    if(location.hash.startsWith('#google=')){
      const linked=location.hash==='#google=ok'&&Boolean(status.google_email);say(linked?'bound':'googleFailed',!linked);
      notify(message($('memberGoogleStart')),t(linked?'bound':'googleFailed'),linked?'success':'error');history.replaceState(null,'',location.pathname);
    }
  })().catch(error=>notify($('memberState'),error.message,'error'));
})();
