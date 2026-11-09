import {getAuthUser} from './auth.js?v=20261104-1';
import {displayFocusCapsule,showToast} from './notifications.js?v=20261109-capsule1';
export const focusClock=seconds=>{const n=Math.max(0,Math.floor(seconds||0));return [Math.floor(n/3600),Math.floor(n%3600/60),n%60].map(v=>String(v).padStart(2,'0')).join(':');};
export const focusDuration=seconds=>{const n=Math.max(0,Math.floor(seconds||0)),h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;return [h?`${h}시간`:'',m?`${m}분`:'',s?`${s}초`:''].filter(Boolean).join(' ')||'0분';};
export const isFocusBalanceError=error=>/(?:Focus\s*Time|포커스\s*타임).*부족/i.test(error?.message||'');
export function showFocusNotice(message){
  showToast(message);
}
export function announceFocusPurchase(result,{uid=getAuthUser()?.uid,fallbackSpent=0}={}){
  if(!uid||uid!==getAuthUser()?.uid||!Number.isFinite(result?.balanceSeconds)||result.balanceSeconds<0)return;
  const spent=result.alreadyOwned||result.alreadySpent?0:Math.max(0,result.spentSeconds??fallbackSpent);
  for(const node of document.querySelectorAll('[data-focus-balance]'))node.textContent=focusClock(result.balanceSeconds);
  for(const node of document.querySelectorAll('[data-focus-wallet]'))node.textContent=`FOCUS TIME ${focusDuration(result.balanceSeconds)}`;
  window.dispatchEvent(new CustomEvent('study:focus-purchase',{detail:{uid,balanceSeconds:result.balanceSeconds}}));
  if(!spent)return;
  const before=result.previousBalanceSeconds??result.balanceSeconds+spent;
  const label=document.createElement('span');label.className='focus-debit-label';label.textContent='FOCUS TIME';
  const numbers=document.createElement('span');numbers.className='focus-debit-numbers';numbers.setAttribute('aria-hidden','true');
  const from=focusClock(before).padStart(focusClock(result.balanceSeconds).length,'0'),to=focusClock(result.balanceSeconds).padStart(from.length,'0');
  [...to].forEach((digit,i)=>{
    const cell=document.createElement('span');cell.className='focus-counter-cell';
    if(digit===from[i])cell.textContent=digit;
    else{cell.classList.add('is-changing');const reel=document.createElement('span');reel.className='focus-counter-reel';
      const steps=(Number(from[i])-Number(digit)+10)%10||10;reel.style.setProperty('--counter-steps',steps);
      for(let n=0;n<=steps;n++){const face=document.createElement('span');face.textContent=String((Number(from[i])-n+10)%10);reel.append(face);}cell.append(reel);}
    numbers.append(cell);
  });
  const delta=document.createElement('strong');delta.className='focus-debit-amount';delta.textContent=`−${focusDuration(spent)}`;
  displayFocusCapsule([label,numbers,delta],`Focus Time ${focusDuration(spent)} 차감, 잔액 ${focusDuration(result.balanceSeconds)}`);
}
