const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const engine = require('../assets/js/ranger-animation-projectile-engine.js');
const timing = require('../assets/js/ranger-animation-hit-effect-timing.js');

function viewer() {
  const document = {currentScript:{src:'https://local/assets/js/ranger-animation-viewer.js'},
    querySelector:()=>true, getElementById:()=>null, addEventListener:()=>{}, readyState:'loading'};
  const window = {location:{pathname:'/'},addEventListener:()=>{}};
  let source = fs.readFileSync(require.resolve('../assets/js/ranger-animation-viewer.js'),'utf8');
  // Test the actual playback and export path, without exposing internals publicly.
  source = source.replace('  window.RangerAnimationExport = {', `
    window.testApi = {state, CLIPS, nativeStartPoint, buildTrack, prepareNativeClips,
      resolveProjectileGeometry, referenceLayout, projectileRotation, drawSegment, playbackPlanForTrack};
    window.RangerAnimationExport = {`);
  source = source.replace('    const animation = part?.animations?.[animName];\n    if (!part || !animation?.frames?.length) return false;',
    '    context.calls.push({part:part.id, animName, frame:frameIndexValue, x:originX, y:originY, rotation:rotationDegrees}); return true;');
  vm.runInNewContext(source,{window,document,URL,MutationObserver:class{observe(){}},fetch:()=>{},console});
  return window.testApi;
}
function anim(n) { return {frame_count:n,frames:Array.from({length:n},()=>[])}; }
function meta(type='WEAPON', extra={}) {
  return {parts:{body:{id:'body',anim_rate:20,canvas:{w:100,h:100},animations:{
    idle:anim(20),attack_ready:anim(4),attack:anim(4),attack_all:anim(8),
    attack_a:anim(4),attack_b:anim(4),walk:anim(8)}},
    bul:{id:'bul',anim_rate:20,animations:{normal:anim(2),normal_a:anim(2),normal_b:anim(2),finish:anim(4)}}},
    projectileData:{coordinateScale:0.5,hitTiming:{normalHitPointRate:0},normal:{
      attackType:type,attackRange:384,start:{x:40,y:80},secondStart:{x:120,y:60},end:{x:50,y:20},
      moveSpeed:6,motion:{type:type==='WEAPONC'?'CURVE':'LINEAR',enabled:true},...extra}}};
}
function plain(x) {return JSON.parse(JSON.stringify(x));}

test('database launch point is preserved even when it is far outside visible artwork',()=>{
  const v=viewer(), m=meta();m.projectileData.normal.start={x:900,y:700};
  assert.deepEqual(plain(v.nativeStartPoint(m,v.CLIPS[3],m.projectileData.normal,m.parts.body)),{x:450,y:350,source:'database'});
});
test('zero hit rate targets the target base; it does not force a horizontal flight',()=>{
  const v=viewer(), m=meta();m.actorProjectileGround={attacks:{normal:{partName:'bul',motionType:'LINEAR',travelBottom:999}}};
  const p=v.buildTrack(m,'attack').segments[0].projectile, l=v.referenceLayout(384);
  const g=v.resolveProjectileGeometry(p,m.parts.body,l,l.sceneScale);
  assert.equal(g.endX,l.targetX);assert.equal(g.endY,l.targetBaseY);
  assert.notEqual(g.startY,g.endY);
});
test('outbound ignores EndOffset, RETURN uses it relative to launch with equal leg durations',()=>{
  const v=viewer(),m=meta('RETURN',{motion:{type:'RETURN',enabled:true}});
  const p=v.buildTrack(m,'attack').segments[0].projectile,l=v.referenceLayout(384);
  const g=v.resolveProjectileGeometry(p,m.parts.body,l,l.sceneScale);
  assert.equal(g.endX,l.targetX);
  assert.equal(g.returnEndX,g.startX+25*l.sceneScale);
  assert.equal(g.returnEndY,g.startY-10*l.sceneScale);
  assert.equal(g.returnDuration,g.flightDuration);
  assert.equal(p.lifetime,2*g.flightDuration);
});
test('DOUBLE is rendered by the normal viewer without an opt-in overlay',()=>{
  const v=viewer(),m=meta('DOUBLE');const p=v.buildTrack(m,'attack').segments[0].projectile;
  assert.ok(p.second);assert.equal(p.second.spawnTime-p.spawnTime,4/20);
  assert.deepEqual(plain(p.second.start),{x:60,y:30,source:'database'});
  v.state.activeClip='attack';const plan=v.playbackPlanForTrack(v.buildTrack(m,'attack'));
  assert.equal(plan.impactEvents.length,2);
  assert.equal(timing.resolveImpactSchedule(plan,null).impacts.length,2);
});
test('melee, LASER and ACTION never invent a travelling bul part',()=>{
  const v=viewer();
  for (const type of ['PUNCH','LASER','ACTION']) {
    const m=meta(type,{motion:{type:type==='PUNCH'?'DIRECT':'SPECIAL'}});
    assert.equal(v.buildTrack(m,'attack').segments[0].projectile,null);
  }
});
test('native attack dispatch takes precedence over stale website motion annotations',()=>{
  const v=viewer(),m=meta('WEAPON',{motion:{type:'LINEAR',enabled:false,loopNormal:false}});
  const p=v.buildTrack(m,'attack').segments[0].projectile;
  assert.equal(p.renderMode,'LINEAR');assert.equal(p.loopNormal,true);
});
test('zero speed cannot fabricate a flight, impact, or infinite preview loop',()=>{
  const v=viewer(),m=meta('WEAPON',{moveSpeed:0});const track=v.buildTrack(m,'attack');
  assert.equal(track.segments[0].projectile.impactOffset,Infinity);
  assert.ok(Number.isFinite(track.duration));
  v.state.activeClip='attack';assert.equal(timing.resolveImpactSchedule(v.playbackPlanForTrack(track),null),null);
});
test('after the body attack completes it returns to idle while its projectile remains alive',async()=>{
  const v=viewer(),m=meta();const seg=v.buildTrack(m,'attack').segments[0],l=v.referenceLayout(384);
  const context={calls:[]};await v.drawSegment(context,context,m,seg,0.5,l,l.sceneScale);
  assert.equal(context.calls[0].animName,'idle');assert.equal(context.calls[0].frame,1);
  assert.ok(context.calls.some(x=>x.part==='bul'));
});
test('normal without finish disappears on arrival, including GIF rendering',async()=>{
  const v=viewer(),m=meta();delete m.parts.bul.animations.finish;
  const seg=v.buildTrack(m,'attack').segments[0],l=v.referenceLayout(384),context={calls:[]};
  await v.drawSegment(context,context,m,seg,seg.projectile.spawnTime+seg.projectile.lifetime+0.05,l,l.sceneScale);
  assert.deepEqual(context.calls.map(x=>x.part),['body']);
});
test('curved RotateTo uses the short arc while straight projectiles stay unrotated',()=>{
  const v=viewer(),p={motionType:'CURVE',config:{angle:{start:350,end:10}}};
  assert.equal(v.projectileRotation(p,0.5),360);
  assert.equal(v.projectileRotation({...p,motionType:'LINEAR'},0.5),0);
  const simulation=engine.createProjectileSimulation({attackType:'WEAPONC',duration:1,startAngle:350,endAngle:10});
  assert.equal(simulation.rotationAt(0.5),360);
});
test('RETURN does not play a finish section at turnaround',()=>{
  const simulation=engine.createProjectileSimulation({attackType:'RETURN',duration:1,returnDuration:1,finishDuration:2});
  assert.equal(simulation.projectiles[0].finishStartTime,null);
  assert.ok(!simulation.events.some(x=>x.type==='projectile-finish-start'));
});
test('older metadata composes all DOUBLE/ACTION body labels',()=>{
  const v=viewer(),m=meta();delete m.parts.body.animations.attack_all;
  Object.assign(m.parts.body.animations,{s_action_attack_1:anim(3),s_action_attack_2:anim(4),s_action_attack_3:anim(5)});
  v.prepareNativeClips(m);
  assert.equal(m.parts.body.animations.attack_all.frame_count,12);
  assert.equal(m.parts.body.animations.s_action_attack_all.frame_count,12);
});

test('curved finish retains its node rotation at impact',async()=>{
  const v=viewer(),m=meta('WEAPONC',{angle:{start:10,end:70}});
  const seg=v.buildTrack(m,'attack').segments[0],l=v.referenceLayout(384),context={calls:[]};
  await v.drawSegment(context,context,m,seg,seg.projectile.spawnTime+seg.projectile.impactOffset+0.05,l,l.sceneScale);
  const finish=context.calls.find(x=>x.part==='bul');
  assert.equal(finish.animName,'finish');assert.equal(finish.rotation,70);
});
