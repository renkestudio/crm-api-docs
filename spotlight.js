// Spotlight nos cards .rk-card + contador [data-count]. Colar na raiz (testar se o Mintlify carrega .js na POC).
(function(){
 if(window.__rkfx)return;window.__rkfx=1;
 document.addEventListener('pointermove',function(e){
  var c=e.target.closest&&e.target.closest('.rk-card');if(!c)return;
  var r=c.getBoundingClientRect();c.style.setProperty('--x',(e.clientX-r.left)+'px');c.style.setProperty('--y',(e.clientY-r.top)+'px');
 },{passive:true});
 var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 function run(el){var t=+el.dataset.count;if(reduce){el.textContent=t;return}var s=performance.now();
  (function f(n){var p=Math.min((n-s)/1200,1);el.textContent=Math.round(t*(1-Math.pow(1-p,3)));if(p<1)requestAnimationFrame(f)})(s)}
 var io=new IntersectionObserver(function(es){es.forEach(function(x){if(x.isIntersecting&&!x.target.__done){x.target.__done=1;run(x.target)}})});
 function scan(){document.querySelectorAll('[data-count]').forEach(function(el){io.observe(el)})}
 scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
})();
