const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
(async()=>{
 let failLogout=false,wireUnauthorized=false;
 const requests=[],events=[];
 const user={logged_in:true,account:'test',role:'admin',must_change_password:true};
 const window={dispatchEvent:event=>events.push(event)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/js/admin-auth.js'),'utf8'),{
  window,Headers,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  console:{warn(){}},fetch:async(url,options)=>{
   requests.push({url,options});
   if(wireUnauthorized)return new Response(JSON.stringify({detail:'member.badProof'}),{status:403,headers:{'Content-Type':'application/json','X-Rangerbook-Auth-Status':'401'}});
   if(url.endsWith('/auth/logout') && failLogout)throw new Error('Simulated offline');
   return new Response(JSON.stringify(url.endsWith('/auth/logout')?{ok:true}:user),{headers:{'Content-Type':'application/json'}});
  }
 });
 const auth=window.RangerbookAuth;
 await auth.ready();assert.equal(auth.getUser().must_change_password,true);assert.equal(auth.isAdmin(),false);
 user.must_change_password=false;await auth.refresh();assert.equal(auth.isAdmin(),true);
 failLogout=true;await assert.rejects(auth.logout(),/Connection failed/);
 assert.equal(auth.getUser().logged_in,true,'A failed server logout must not pretend the session was revoked');
 failLogout=false;await auth.logout();assert.equal(auth.getUser().logged_in,false);
 for(const {options} of requests){assert.equal(options.cache,'no-store');assert.equal(options.credentials,'include');}
 wireUnauthorized=true;
 await assert.rejects(auth.api('/probe'),error=>error.status===403);
 window.RANGERBOOK_STAGE_BASIC_AUTH=true;window.location={origin:'https://rangerbook-test.warmycat.com'};
 // A flag on a different API origin cannot rewrite errors from production.
 await assert.rejects(auth.api('/probe'),error=>error.status===403);
 const stageWindow={location:{origin:'https://rangerbook-test.warmycat.com'},RANGERBOOK_AUTH_API_BASE:'https://rangerbook-test.warmycat.com',RANGERBOOK_STAGE_BASIC_AUTH:true,dispatchEvent(){}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/js/admin-auth.js'),'utf8'),{
   window:stageWindow,Headers,CustomEvent:class{},console,
   fetch:async()=>new Response(JSON.stringify({detail:'member.badProof'}),{status:403,headers:{'Content-Type':'application/json','X-Rangerbook-Auth-Status':'401'}})
 });
 await assert.rejects(stageWindow.RangerbookAuth.api('/probe'),error=>error.status===401&&error.payload.detail==='member.badProof');
 assert.ok(events.length>=3);
 console.log('SECURITY_AUTH_OK temporary-password roles, credentialed no-store requests and truthful logout state');
})().catch(error=>{console.error(error);process.exitCode=1;});
