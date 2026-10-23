const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
(async()=>{
 let failLogout=false;
 const requests=[],events=[];
 const user={logged_in:true,account:'test',role:'admin',must_change_password:true};
 const window={dispatchEvent:event=>events.push(event)};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/js/admin-auth.js'),'utf8'),{
  window,Headers,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  console:{warn(){}},fetch:async(url,options)=>{
   requests.push({url,options});
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
 assert.ok(events.length>=3);
 console.log('SECURITY_AUTH_OK temporary-password roles, credentialed no-store requests and truthful logout state');
})().catch(error=>{console.error(error);process.exitCode=1;});
