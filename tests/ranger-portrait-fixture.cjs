/* Interactive fixture for manual browser regression checks. */
module.exports = String.raw`<!doctype html><meta charset="utf-8"><title>Ranger portrait regression fixture</title>
<style>
body {font:16px sans-serif; padding:24px; color:#123; background:#f4f7f7}
img {width:78px;height:78px;object-fit:contain;background:#fff;border:1px solid #ccc;border-radius:12px}
button {padding:10px;margin:5px} #detail {width:140px;height:140px} #usage {width:52px;height:52px}
.team {display:flex;gap:12px;margin:20px 0} [hidden] {display:none}
</style>
<h1>角色圖片共用裁切測試</h1>
<p>同一隻角色：角色列表、詳細資料、使用率、隊伍，取景一致。</p>
<div class="team">
<img id="list" src="https://res.warmycat.com/u003u-bella/u003u-bella-thum.png" alt="列表">
<img id="detail" src="https://res.warmycat.com/u003u-bella/u003u-bella-thum.png" alt="詳細資料">
<img id="usage" src="https://res.warmycat.com/u003u-bella/u003u-bella-thum.png" alt="使用率">
<img id="slot" src="https://res.warmycat.com/u003u-bella/u003u-bella-thum.png" alt="隊伍欄位">
</div>
<button id="switch">切換隊伍角色</button><button id="reset">還原相同角色</button>
<button id="detach">移除欄位</button><button id="attach">重新加入欄位</button>
<button id="hiddenToggle">開啟隱藏隊伍</button><button id="fallback">測試舊版圖檔</button>
<button id="race">快速切換角色</button>
<div id="team" class="team" hidden><img src="https://res.warmycat.com/u88-dwight/u88-dwight-thum.png" alt="隱藏角色"></div>
<p id="result" role="status"></p>
<script src="/assets/js/site.js"></script>
<script>
const slot = document.getElementById('slot');
const set = (id, suffix='-thum.png') => {slot.src='https://res.warmycat.com/'+id+'/'+id+suffix};
document.getElementById('switch').onclick=()=>set('u99-susu');
document.getElementById('reset').onclick=()=>set('u003u-bella');
document.getElementById('detach').onclick=()=>{set('u88-dwight');slot.remove()};
document.getElementById('attach').onclick=()=>document.querySelector('.team').append(slot);
document.getElementById('hiddenToggle').onclick=()=>document.getElementById('team').hidden=false;
document.getElementById('fallback').onclick=()=>set('u003u-bella','-thum-140.png');
document.getElementById('race').onclick=()=>{set('u99-susu');set('u88-dwight');set('u003u-bella')};
new MutationObserver(()=>{
 const same=['list','detail','usage','slot'].map(id=>document.getElementById(id));
 document.getElementById('result').textContent=same.every(img=>img?.dataset.rangerPortrait==='u003u-bella') &&
 same.every(img=>img.src===same[0].src) ? '四種尺寸的裁切像素一致' : '圖片正在載入，或已切換角色';
}).observe(document.body,{subtree:true,attributes:true,attributeFilter:['data-ranger-portrait']});
</script>
`;
