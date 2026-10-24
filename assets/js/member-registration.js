(() => {
  const auth=window.RangerbookAuth, mount=document.getElementById('memberCaptcha');
  if(!auth||!mount)return;
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
