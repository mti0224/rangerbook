(() => {
  'use strict';
  const params=new URLSearchParams(window.__RB_ACTION||'');delete window.__RB_ACTION;
  let token=params.get('reset')||params.get('verify');
  const kind=params.has('verify')?'verify':'reset';
  const {$,t,notify,post,run,cooldown}=window.RangerbookMemberUI;
  const output=$('memberActionStatus')||$('memberState');
  const setTitle=(key,intro)=>{const h=document.querySelector('.member-banner h1'),p=document.querySelector('.member-banner p');h.dataset.i18n='member.'+key;h.textContent=t(key);p.dataset.i18n='member.'+intro;p.textContent=t(intro);};
  const invalid=()=>{
    token=null;$('memberResetForm').hidden=true;$('memberVerifyEmail').hidden=true;
    $('memberActionAgain').hidden=kind==='verify';$('memberVerifyResend').hidden=kind!=='verify';
    notify(output,t('invalidLink'),'error');
  };
  let rescue=null;
  const sendRescue=async()=>{
    await post('/auth/password/forgot',rescue);$('memberMailSent').hidden=false;$('memberForgotConfirm').hidden=true;
    notify(output,t('resetSent'),'success');cooldown($('memberForgotResend'),60,$('memberResendStatus'));
  };
  const requestRescue=run(async e=>{
    const f=e.currentTarget;rescue={identifier:f.elements.identifier.value.trim(),source:f.elements.source.value};
    await sendRescue();
  },null,output);
  $('memberForgotForm')?.addEventListener('submit',e=>{
    // Enter follows the visible resend action after success, including its cooldown.
    if(!$('memberMailSent').hidden){e.preventDefault();$('memberForgotResend').click();return;}
    requestRescue(e);
  });
  $('memberForgotResend')?.addEventListener('click',run(async()=>{const form=$('memberForgotForm');if(!form.reportValidity())return false;rescue={identifier:form.elements.identifier.value.trim(),source:form.elements.source.value};await sendRescue();},null,output));
  $('memberResendForm')?.addEventListener('submit',run(async e=>{
    await post('/auth/email/resend',{identifier:e.currentTarget.elements.identifier.value.trim()});
    cooldown(e.submitter||e.currentTarget.querySelector('button'),60,output);
  },'checkEmail',output));
  $('memberResetForm')?.addEventListener('submit',run(async e=>{
    const f=e.currentTarget;
    if(f.elements.password.value!==f.elements.confirm.value)throw new Error(t('passwordMismatch'));
    try{
      await post('/auth/password/reset',{token,password:f.elements.password.value});token=null;f.reset();f.hidden=true;
      setTitle('resetSuccess','resetSuccessIntro');$('memberActionLogin').hidden=false;$('memberActionAgain').hidden=true;
      notify(output,t('resetDone'),'success');
    }catch(error){if(error.payload?.detail==='member.invalidLink')invalid();throw error;}
    finally{f.elements.password.value='';f.elements.confirm.value='';}
  },null,output));
  const verify=async()=>{
    try{
      await post('/auth/email/verify',{token});token=null;$('memberVerifyEmail').hidden=true;
      $('memberActionAgain').hidden=true;$('memberActionLogin').hidden=false;
      setTitle('emailSuccess','emailSuccessIntro');notify(output,t('verified'),'success');
    }catch(error){if(error.payload?.detail==='member.invalidLink')invalid();throw error;}
  };
  $('memberVerifyEmail')?.addEventListener('click',run(verify,null,output));
  (async()=>{
    await window.RangerbookI18n?.ready;
    if(!$('memberResetForm'))return;
    $('memberActionLogin').hidden=true;$('memberActionAgain').hidden=true;
    if(!token){invalid();return;}
    notify(output,t('processing'));
    if(kind==='verify'){
      setTitle('verifyEmail','verifyEmailIntro');
      try{await verify();}catch(error){notify(output,error.message,'error');if(token)$('memberVerifyEmail').hidden=false;}
    }else{
      try{await post('/auth/password/reset/check',{token});$('memberResetForm').hidden=false;notify(output,'');}
      catch(error){if(error.payload?.detail==='member.invalidLink')invalid();else{notify(output,error.message,'error');$('memberActionAgain').hidden=false;}}
    }
  })();
  window.addEventListener('hashchange',()=>{if(location.hash)location.reload();});
  window.addEventListener('pagehide',()=>{token=null;$('memberResetForm')?.reset();});
  window.addEventListener('pageshow',e=>{if(e.persisted&&$('memberResetForm'))invalid();});
})();
