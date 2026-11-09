let hideTimer, leaveAnimation;
export function displayFocusCapsule(children, announcement) {
  if (!document.body) return;
  clearTimeout(hideTimer); leaveAnimation?.cancel();
  const existing=document.querySelector('[data-focus-debit]'), capsule=existing||document.createElement('div');
  capsule.className='focus-debit-capsule'; capsule.dataset.focusDebit=''; capsule.setAttribute('popover','manual'); capsule.setAttribute('role','status'); capsule.setAttribute('aria-label',announcement);
  capsule.style.animation='none'; capsule.style.transform='translate(-50%,0)'; capsule.style.opacity='1'; capsule.replaceChildren(...children);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!existing){document.body.append(capsule);capsule.showPopover?.();if(!reduced)capsule.animate([{opacity:0,transform:'translate(-50%,20px)'},{opacity:1,transform:'translate(-50%,0)'}],{duration:320,easing:'ease-out'});}
  leaveAnimation=reduced?null:capsule.animate([{opacity:1},{opacity:0}],{duration:360,delay:1640,easing:'ease-in',fill:'forwards'});
  hideTimer=setTimeout(()=>{capsule.hidePopover?.();capsule.remove();},2000);
}
export function showToast(message) {
  if (!message || !document.body) return;
  const text=document.createElement('strong'); text.className='focus-debit-message'; text.textContent=message;
  displayFocusCapsule([text],message);
}
