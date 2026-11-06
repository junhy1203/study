export const reduceProfileMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const dialogs=new WeakMap();
const originTransform=(origin,target)=>origin?`translate(${origin.x+origin.width/2-target.x-target.width/2}px,${origin.y+origin.height/2-target.y-target.height/2}px) scale(${Math.max(.2,Math.min(.9,origin.width/target.width))},${Math.max(.15,Math.min(.8,origin.height/target.height))})`:'translateY(24px) scale(.94)';
export function expandProfile(dialog,anchor){
  const target=dialog.getBoundingClientRect(),origin=anchor?.isConnected?anchor.getBoundingClientRect():null;
  const state={anchor,origin};dialogs.set(dialog,state);if(reduceProfileMotion())return;
  state.animation=dialog.animate([{opacity:.15,transform:originTransform(origin,target),borderRadius:'30px'},{opacity:1,transform:'translate(0,0) scale(1)',borderRadius:'22px'}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'});
}
export function collapseProfile(dialog){
  const state=dialogs.get(dialog)||{};if(state.closing)return state.closing;
  state.closing=(async()=>{
    if(!dialog.open)return;
    if(!reduceProfileMotion()){
      const visual=getComputedStyle(dialog),start={opacity:visual.opacity,transform:visual.transform};state.animation?.cancel();
      const origin=state.anchor?.isConnected?state.anchor.getBoundingClientRect():state.origin,target=dialog.getBoundingClientRect();
      state.exitAnimation=dialog.animate([start,{opacity:0,transform:originTransform(origin,target),borderRadius:'30px'}],{duration:240,easing:'cubic-bezier(.4,0,.8,.2)',fill:'forwards'});
      await state.exitAnimation.finished.catch(()=>{});
    }
    if(dialog.open)dialog.close();state.exitAnimation?.cancel();dialogs.delete(dialog);
  })();dialogs.set(dialog,state);return state.closing;
}
