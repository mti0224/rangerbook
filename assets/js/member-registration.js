(() => {
  const auth=window.RangerbookAuth, mount=document.getElementById('memberCaptcha');
  if(!auth||!mount)return;
  const form=document.getElementById('adminRegisterForm'), input=form.elements.account;
  const status=document.getElementById('memberAccountStatus');
  const {t,notify}=window.RangerbookMemberUI;
  let revision=0, timer, checked='', pending=null, feedback='';
  const show=(key,type='')=>{feedback=key;notify(status,key?t(key):'',type);};
  const name=()=>input.value.trim();
  const taken=account=>{
    if(name()!==account)return;
    checked='';input.setCustomValidity(t('accountTaken'));
    input.setAttribute('aria-invalid','true');show('accountTaken','error');
  };
  async function check(force=false){
    const account=name();
    if(!/^[A-Za-z0-9_.-]{3,32}$/.test(account))return null;
    if(!force&&checked===account)return account;
    if(pending?.account===account)return pending.promise;
    const version=revision;
    show('accountChecking');
    const promise=(async()=>{
      try{
        const data=await auth.api('/auth/account/availability',{method:'POST',body:JSON.stringify({account})});
        if(version!==revision||name()!==account)return null;
        if(data.available===false){taken(account);return null;}
        if(data.available!==true)throw new Error(t('networkError'));
        checked=account;input.setCustomValidity('');input.removeAttribute('aria-invalid');show('accountAvailable','success');
        return account;
      }catch(error){
        if(version===revision&&name()===account)show(error.status===429?'rateLimited':'accountCheckFailed','error');
        throw error;
      }finally{if(pending?.promise===promise)pending=null;}
    })();
    pending={account,promise};return promise;
  }
  input.addEventListener('input',()=>{
    revision++;clearTimeout(timer);checked='';pending=null;input.setCustomValidity('');input.removeAttribute('aria-invalid');show('');
    timer=setTimeout(()=>check().catch(()=>{}),700);
  });
  input.addEventListener('blur',()=>{clearTimeout(timer);check().catch(()=>{});});
  window.RangerbookAccountName={taken,ensure:async()=>{
    clearTimeout(timer);
    const account=await check(true);
    if(!account){input.focus();input.reportValidity();}
    return account;
  }};
  window.addEventListener('rangerbook:locale-ready',()=>{
    if(feedback)show(feedback,input.validationMessage?'error':checked?'success':'');
    if(input.validity.customError)input.setCustomValidity(t('accountTaken'));
  });
  let widget=null, captcha='', features={};
  window.RangerbookCaptcha={token:()=>captcha,reset:()=>{captcha='';if(widget!==null)window.turnstile?.reset(widget);}};
  auth.api('/auth/features').then(data=>{
    features=data;
    const submit=document.querySelector('#adminRegisterForm button[type=submit]');
    if(submit)submit.disabled=!features.registration;
    if(!features.registration){mount.textContent=window.RangerbookI18n?.t('member.unconfigured','此功能尚未完成設定。');return;}
    window.rbTurnstileReady=()=>{widget=window.turnstile.render(mount,{sitekey:features.turnstile_site_key,action:'register',callback:token=>{captcha=token;},'expired-callback':()=>{captcha='';},'error-callback':()=>{captcha='';}});};
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=rbTurnstileReady&render=explicit';script.async=true;document.head.append(script);
  }).catch(()=>{document.querySelector('#adminRegisterForm button[type=submit]').disabled=true;});
})();
