from pathlib import Path

path = Path("assets/js/ranger-animation-hit-effect.js")
source = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    source = source.replace(old, new, 1)


replace_once(
    "let effectMetaPromise=null;let patchScheduled=false;",
    "let effectMetaPromise=null;let effectAnchorPromise=null;let patchScheduled=false;",
    "effect anchor cache",
)

replace_once(
    "return{cycleDuration:track.duration,impactTime:(attackSegment.start||0)+attackSegment.impactTime,hitPointRate:Number.isFinite(attackSegment.projectile?.hitPointRate)?attackSegment.projectile.hitPointRate:normalizedHitPointRate(meta),};",
    "return{cycleDuration:track.duration,impactTime:(attackSegment.start||0)+attackSegment.impactTime,hasProjectile:Boolean(attackSegment.projectile),hitPointRate:Number.isFinite(attackSegment.projectile?.hitPointRate)?attackSegment.projectile.hitPointRate:normalizedHitPointRate(meta),};",
    "playback plan projectile flag",
)

old_draw = "async function drawEffectFrame(context,age,x,y,scale){const meta=await loadEffectMeta();"
new_draw = """async function loadEffectOriginOffset(meta){if(effectAnchorPromise)return effectAnchorPromise;effectAnchorPromise=(async()=>{const animation=meta?.animations?._all;const segment=(meta?.segments||[]).find((item)=>item?.name===HIT_EFFECT_SEGMENT);if(!animation?.frames?.length)return{x:0,y:0};const start=Math.max(0,Math.trunc(finiteNumber(segment?.start,0)));const end=Math.min(animation.frame_count,Math.trunc(finiteNumber(segment?.end,animation.frame_count)));for(let frameIndex=start;frameIndex<end;frameIndex+=1){for(const item of animation.frames[frameIndex]||[]){const[,resourceNumber,objectMatrix,color]=item||[];const alpha=Array.isArray(color)?finiteNumber(color[3],255):255;const imageDefinition=meta.images?.[resourceNumber];if(alpha<=0||!imageDefinition||!Array.isArray(objectMatrix)||!Array.isArray(imageDefinition.m))continue;const image=await loadEffectImage(imageDefinition.name);if(!image)continue;const[m00,m01,m10,m11,m02,m12]=objectMatrix;const[i00,i01,i10,i11,i02,i12]=imageDefinition.m;const centerX=image.width*0.5;const centerY=image.height*0.5;const imageCenterX=i00*centerX+i01*centerY+i02;const imageCenterY=i10*centerX+i11*centerY+i12;return{x:m00*imageCenterX+m01*imageCenterY+m02,y:m10*imageCenterX+m11*imageCenterY+m12};}}return{x:0,y:0};})();return effectAnchorPromise;}async function drawEffectFrame(context,age,x,y,scale){const meta=await loadEffectMeta();"""
replace_once(old_draw, new_draw, "effect origin resolver")

old_position = """if(!state.activeEffect||state.activeEffect.cycleIndex!==impactCycleIndex){const targetHeight=Math.max(1,finiteNumber(target?.contentHeight,state.meta?.parts?.body?.canvas?.h||240));const scale=Math.max(0.001,finiteNumber(scene.sceneScale,1));const anchorTop=finiteNumber(target?.anchorTopY,finiteNumber(target?.targetTopY,NaN));const anchorBottom=finiteNumber(target?.anchorBaseY,finiteNumber(target?.targetBaseY,NaN));const hasAnchorBounds=Number.isFinite(anchorTop)&&Number.isFinite(anchorBottom)&&anchorBottom>anchorTop;const x=finiteNumber(target?.anchorX,finiteNumber(target?.targetX,finiteNumber(scene.targetX,canvas.width*0.9)));const y=hasAnchorBounds?anchorBottom-(anchorBottom-anchorTop)*state.plan.hitPointRate:finiteNumber(scene.targetBaseY,canvas.height*0.8)-targetHeight*state.plan.hitPointRate*scale;state.activeEffect={cycleIndex:impactCycleIndex,x,y,scale};}"""
new_position = """if(!state.activeEffect||state.activeEffect.cycleIndex!==impactCycleIndex){const targetHeight=Math.max(1,finiteNumber(target?.contentHeight,state.meta?.parts?.body?.canvas?.h||240));const scale=Math.max(0.001,finiteNumber(scene.sceneScale,1));const anchorTop=finiteNumber(target?.anchorTopY,finiteNumber(target?.targetTopY,NaN));const anchorBottom=finiteNumber(target?.anchorBaseY,finiteNumber(target?.targetBaseY,NaN));const hasAnchorBounds=Number.isFinite(anchorTop)&&Number.isFinite(anchorBottom)&&anchorBottom>anchorTop;const centeredOnTarget=!state.plan.hasProjectile;let x=finiteNumber(target?.anchorX,finiteNumber(target?.targetX,finiteNumber(scene.targetX,canvas.width*0.9)));let y=centeredOnTarget?finiteNumber(target?.anchorCenterY,hasAnchorBounds?(anchorTop+anchorBottom)*0.5:finiteNumber(scene.targetBaseY,canvas.height*0.8)-targetHeight*0.5*scale):hasAnchorBounds?anchorBottom-(anchorBottom-anchorTop)*state.plan.hitPointRate:finiteNumber(scene.targetBaseY,canvas.height*0.8)-targetHeight*state.plan.hitPointRate*scale;if(centeredOnTarget){const effectMeta=await loadEffectMeta();const originOffset=await loadEffectOriginOffset(effectMeta);x-=originOffset.x*scale;y-=originOffset.y*scale;}state.activeEffect={cycleIndex:impactCycleIndex,x,y,scale};}"""
replace_once(old_position, new_position, "no-projectile target centering")

path.write_text(source, encoding="utf-8")
