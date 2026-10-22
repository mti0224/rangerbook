(() => {
  'use strict';
  const params=new URLSearchParams(window.__RB_ACTION||'');delete window.__RB_ACTION;
  let token=params.get('reset')||params.get('verify');params.delete('reset');params.delete('verify');
  const $=id=>document.getElementById(id),auth=window.RangerbookAuth;
  const t=key=>window.RangerbookI18n?.t('member.'+key,key)||key;
  const show=value=>{$('memberActionStatus').textContent=value;};
  const post=(path,body)=>auth.api(path,{method:'POST',body:JSON.stringify(body)});
  const run=fn=>async e=>{e.preventDefault();const b=e.submitter||e.currentTarget;b.disabled=true;try{await fn(e);}catch(error){show(error.message);}finally{b.disabled=false;}};
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
