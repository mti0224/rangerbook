(() => {
  'use strict';
  const {$,auth,t,notify,post,run,cooldown,clearCooldown,factorMode}=window.RangerbookMemberUI;
  const root=location.pathname.startsWith('/rangerbook/')?'/rangerbook/':'/';
  const showPasswordLogin=()=>{
    const factor=$('memberLoginFactor'),form=$('memberLoginFactorForm');
    if(!factor || !$('memberLoginCard'))return;
    const wasPending=!factor.hidden;
    if(wasPending){
      $('memberLoginForm').reset();form.reset();
      form.elements.code.dataset.recovery='true';factorMode(form,$('memberUseRecovery'));
      clearCooldown(form.querySelector('button[type=submit]'));
    }
    factor.hidden=true;$('memberLoginCard').hidden=false;
    if(wasPending)$('memberLoginForm').elements.account.focus();
  };
  const routeUser=user=>{
    if(user.setup_required){location.assign(root+'two-factor/');return;}
    if(user.mfa_required){$('memberLoginCard').hidden=true;$('memberLoginFactor').hidden=false;notify($('memberState'),'');$('memberLoginFactorForm').elements.code.focus();return;}
    if(user.must_change_password){location.assign(root+'account/');return;}
    if(user.logged_in){location.assign(root);return;}
    showPasswordLogin();
  };
  $('memberLoginForm')?.addEventListener('submit',run(async e=>{
    const form=e.currentTarget;
    try{const user=await auth.login(form.elements.account.value.trim(),form.elements.password.value);routeUser(user);}finally{form.elements.password.value='';}
  },null,$('memberState')));
  $('memberLoginFactorForm')?.addEventListener('submit',run(async e=>{
    const form=e.currentTarget;
    try{await post('/auth/2fa/verify',{code:form.elements.code.value.trim()});routeUser(await auth.refresh());}
    catch(error){
      if(error.status===401&&error.payload?.detail==='member.loginRequired'){
        routeUser(await auth.refresh());throw new Error(t('loginExpired'));
      }
      throw error;
    }finally{form.elements.code.value='';}
  },null,$('memberState')));
  $('memberCancelLogin')?.addEventListener('click',run(async()=>{
    await auth.logout();showPasswordLogin();return false;
  },null,$('memberState')));
  window.addEventListener('rangerbook:auth-changed',event=>{
    const user=event.detail;
    if($('memberLoginForm')&&!user?.logged_in&&!user?.mfa_required&&!user?.setup_required&&!user?.must_change_password)showPasswordLogin();
  });
  $('memberUseRecovery')?.addEventListener('click',e=>factorMode($('memberLoginFactorForm'),e.currentTarget));
  let account='';
  $('adminRegisterForm')?.addEventListener('submit',run(async e=>{
    const form=e.currentTarget;
    if(form.elements.password.value!==form.elements.confirm.value)throw new Error(t('passwordMismatch'));
    const captcha=window.RangerbookCaptcha?.token();if(!captcha)throw new Error(t('captchaFailed'));
    account=form.elements.account.value.trim();
    try{
      await auth.register(account,form.elements.password.value,form.elements.email.value.trim(),captcha);
      form.reset();form.hidden=true;$('memberRegistrationSent').hidden=false;
      notify($('memberState'),t('registrationSent'),'success');
      cooldown($('memberRegistrationResend'),60,$('memberResendStatus'));
    }finally{form.elements.password.value='';form.elements.confirm.value='';window.RangerbookCaptcha?.reset();}
  },null,$('memberState')));
  $('memberRegistrationResend')?.addEventListener('click',run(async()=>{
    await post('/auth/email/resend',{identifier:account,locale:window.RangerbookI18n?.locale||'zh-Hant'});cooldown($('memberRegistrationResend'),60,$('memberResendStatus'));
  },'checkEmail',$('memberState')));
  auth.ready().then(async user=>{await window.RangerbookI18n?.ready;if($('memberLoginForm'))routeUser(user);});
  window.addEventListener('pagehide',()=>document.querySelectorAll('input[type=password],input[autocomplete=one-time-code]').forEach(x=>x.value=''));
  window.addEventListener('pageshow',e=>{if(e.persisted)auth.refresh().then(routeUser);});
})();
