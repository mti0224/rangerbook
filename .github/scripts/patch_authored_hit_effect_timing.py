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
    "function animDuration(part,animationResult){if(!animationResult)return 0;return animationResult.anim.frame_count/Math.max(1,part?.anim_rate||24);}function namedAnimationDuration",
    "function animDuration(part,animationResult){if(!animationResult)return 0;return animationResult.anim.frame_count/Math.max(1,part?.anim_rate||24);}function animationHasVisibleContent(animationResult){return Boolean(animationResult?.anim?.frames?.some((frame)=>(frame||[]).some((item)=>{const color=item?.[3];return!Array.isArray(color)||Number(color[3]??255)>0;})));}function namedAnimationDuration",
    "visible-content helper",
)

replace_once(
    "const finishAnimation=getAnim(bulletPart,[\"finish\",\"hit\",\"end\"]);const spawnTime=",
    "const finishAnimation=getAnim(bulletPart,[\"finish\",\"hit\",\"end\"]);const authoredFinishStartsAtSpawn=projectileConfig?.motion?.enabled===false&&!animationHasVisibleContent(outboundAnimation)&&Boolean(finishAnimation);const spawnTime=",
    "authored finish timing flag",
)

replace_once(
    "beamLength,beamDuration,};projectile.normalEnd=projectileNormalEnd(section,projectile,bodyPart);projectile.lifetime=estimateProjectileLifetime(section,projectile,bodyPart);return projectile;",
    "beamLength,beamDuration,authoredFinishStartsAtSpawn,};projectile.normalEnd=authoredFinishStartsAtSpawn?0:projectileNormalEnd(section,projectile,bodyPart);projectile.lifetime=authoredFinishStartsAtSpawn?projectile.finishDuration:estimateProjectileLifetime(section,projectile,bodyPart);return projectile;",
    "authored impact and lifetime",
)

path.write_text(source, encoding="utf-8")
