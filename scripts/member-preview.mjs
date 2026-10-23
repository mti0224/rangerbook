/* Local visual review only. No live API, mail, OAuth, credentials or service worker. */
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {isPublicFile} from './package-pages.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.MEMBER_PREVIEW_PORT||4175);
let current={logged_in:false,role:'user'},factor=false,email=null,proofUntil=0;
const bootstrap=`window.RB_PRIVATE_PAGE=true;window.gtag=function(){};window.RANGERBOOK_AUTH_API_BASE=location.origin;
document.addEventListener('DOMContentLoaded',()=>{const n=document.createElement('p');n.textContent='介面示範預覽 · Synthetic data only · 不會寄信或連線正式 API。請勿輸入真實密碼。示範帳號 demo / demo2fa / admin / super，密碼任意，驗證碼 123456。';n.style.cssText='padding:12px;margin:0;background:#fff0b3;color:#352700;position:relative;z-index:100;font:14px/1.6 sans-serif';document.body.prepend(n);});`;
function json(res,value,status=200){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-src 'self'; form-action 'self'; base-uri 'self'");
  try{
    const url=new URL(req.url,'http://127.0.0.1:'+port);
    let body='';for await(const chunk of req){body+=chunk;if(body.length>16384)return json(res,{},413);}
    const data=body?JSON.parse(body):{};
    if(url.pathname==='/__preview/bootstrap.js'){res.setHeader('Content-Type','application/javascript');return res.end(bootstrap);}
    if(url.pathname==='/__preview/captcha.js'){res.setHeader('Content-Type','application/javascript');return res.end('window.turnstile={render:(el,options)=>{options.callback("preview-only");return 1},reset:()=>{}};window.rbTurnstileReady();');}
    if(url.pathname==='/__preview/google'){
      if(url.searchParams.has('complete')){email='demo-google@example.test';res.writeHead(303,{Location:'/account/#google=ok'});return res.end();}
      res.setHeader('Content-Type','text/html');return res.end('<h1>Google OAuth 示範</h1><p>這是本機替身，真實 Google 授權仍需人工驗證。</p><a href="?complete=1">模擬成功綁定</a> <a href="/account/#google=failed">模擬取消</a>');
    }
    if(url.pathname.startsWith('/auth/')){
      const name=url.pathname;
      if(name==='/auth/features')return json(res,{members_v2:true,google:true,registration:true,member_navigation:true,turnstile_site_key:'preview-only'});
      if(name==='/auth/me')return json(res,current);
      if(name==='/auth/login'){
        const role=['admin','super'].includes(data.account)?(data.account==='super'?'super_admin':'admin'):'user';
        factor=data.account==='demo2fa'||role==='super_admin';
        current={logged_in:!factor,account:data.account,role:factor?'user':role,mfa_required:factor,previewRole:role};proofUntil=0;
        return json(res,current);
      }
      if(name==='/auth/logout'){current={logged_in:false,role:'user'};return json(res,{ok:true});}
      if(name==='/auth/2fa/verify'){
        if(data.code!=='123456'&&data.code!=='PREVIEW-RECOVERY')return json(res,{detail:'member.badProof'},401);
        current.logged_in=true;current.mfa_required=false;current.role=current.previewRole||'user';return json(res,{ok:true});
      }
      if(name==='/auth/security')return json(res,{totp_enabled:factor,totp_required:current.role==='super_admin',google_email:email,reauth_valid_for:Math.max(0,Math.ceil((proofUntil-Date.now())/1000))});
      if(name==='/auth/reauth'){proofUntil=Date.now()+600000;return json(res,{ok:true,reauth_valid_for:600});}
      if(name==='/auth/google/start')return json(res,{url:'http://127.0.0.1:'+port+'/__preview/google'});
      if(name==='/auth/google/unlink'){email=null;return json(res,{ok:true});}
      if(name==='/auth/2fa/setup')return json(res,{manual_key:'JBSWY3DPEHPK3PXP',qr:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="white"/><text x="35" y="115" fill="black">PREVIEW ONLY</text><text x="35" y="140" fill="black">Code: 123456</text></svg>')});
      if(name==='/auth/2fa/enable'){if(data.code!=='123456')return json(res,{detail:'member.badProof'},400);factor=true;return json(res,{ok:true,recovery_codes:['PREVIEW-RECOVERY','SYNTHETIC-CODE']});}
      if(name==='/auth/2fa/recovery-codes')return json(res,{recovery_codes:['PREVIEW-RECOVERY','SYNTHETIC-CODE']});
      if(name==='/auth/2fa/disable'){factor=false;current={logged_in:false,role:'user'};return json(res,{ok:true});}
      if(name==='/auth/password/reset/check'&&data.token==='expired')return json(res,{detail:'member.invalidLink'},400);
      return json(res,{ok:true,message_key:'member.checkEmail'});
    }
    if(url.pathname.startsWith('/member/'))return json(res,{bound:false,items:[]});
    if(url.pathname.startsWith('/admin/')&&url.pathname!=='/admin/'&&!url.pathname.endsWith('.html'))return json(res,{items:[]});
    let name=decodeURIComponent(url.pathname).replace(/^\//,'');if(!name||name.endsWith('/'))name+='index.html';
    if(!isPublicFile(name))return json(res,{},404);
    if(['assets/js/pwa-head.js','assets/js/pwa.js','assets/js/visitor-region.js'].includes(name)){res.setHeader('Content-Type','application/javascript');return res.end('/* Disabled for isolated preview. */');}
    if(name==='sw.js'){res.setHeader('Content-Type','application/javascript');return res.end(await readFile(path.join(root,'assets/pwa/disabled-worker.js')));}
    let bytes=await readFile(path.join(root,name));
    const ext=path.extname(name),types={'.html':'text/html','.js':'application/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml'};
    res.setHeader('Content-Type',types[ext]||'application/octet-stream');
    if(ext==='.html')bytes=bytes.toString().replace(/<head(?:\s[^>]*)?>/i,'$&<script src="/__preview/bootstrap.js"></script>');
    if(ext==='.js')bytes=bytes.toString().replaceAll('https://rangerbook-auth.warmycat.com','http://127.0.0.1:'+port).replace('https://challenges.cloudflare.com/turnstile/v0/api.js?onload=rbTurnstileReady&render=explicit','/__preview/captcha.js').replace("url.origin!=='https://accounts.google.com'","url.origin!==location.origin");
    res.end(bytes);
  }catch{json(res,{detail:'Preview route unavailable'},404);}
});
server.listen(port,'127.0.0.1',()=>console.log('Synthetic member UI preview: http://127.0.0.1:'+port+'/login/'));
