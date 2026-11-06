// Animate the whole friend-add section, including its surrounding layout.
const transitions=new WeakMap();
document.addEventListener('click',event=>{
  const summary=event.target.closest('[data-friend-add]>summary');if(!summary)return;
  event.preventDefault();
  const details=summary.parentElement,previous=transitions.get(details),expand=!(previous?.expand??details.open),start=details.getBoundingClientRect().height;
  previous?.animation.cancel();
  summary.textContent=expand?'닫기':'친구 추가';summary.setAttribute('aria-expanded',String(expand));
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){details.open=expand;transitions.delete(details);return;}
  details.open=true;
  const end=expand?details.scrollHeight:summary.getBoundingClientRect().height;
  const animation=details.animate([{height:`${start}px`},{height:`${end}px`}],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'}),state={animation,expand};
  transitions.set(details,state);
  void animation.finished.then(()=>{if(transitions.get(details)!==state)return;details.open=expand;animation.cancel();transitions.delete(details);}).catch(()=>{});
});
