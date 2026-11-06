import {AVATAR_CATALOG,AVATAR_DEFAULT,ownedAvatarItems} from './functions/avatar-catalog.js?v=20261106-luxury1';
import {pixelAvatar,avatarBackground,avatarItemPreview} from './avatar-renderer.js?v=20261106-luxury1';
import {CINEMATIC_EFFECTS} from './avatar-cinematic.js?v=20261106-cinematic1';
import {getAuthUser} from './auth.js?v=20261104-1';
import {studyCall,element as el,serviceError} from './study-api.js?v=20261024-selfhost1';
import {announceFocusPurchase,focusDuration,isFocusBalanceError,showFocusNotice} from './focus-wallet.js?v=20261105-shop10';
import {reduceProfileMotion,expandProfile,collapseProfile} from './profile-motion.js?v=20261105-shop10';

export function confirmAvatarPurchase(item,anchor){
  return new Promise(resolve=>{
    const scroller=anchor.closest('.avatar-shop-dialog'),shelf=anchor.closest('.avatar-tier-items'),top=scroller?.scrollTop,left=shelf?.scrollLeft;
    const dialog=el('dialog','avatar-purchase-dialog');dialog.setAttribute('aria-labelledby','avatar-purchase-title');
    const title=el('h2','','구매할까요?');title.id='avatar-purchase-title';
    const name=el('p','avatar-confirm-name',item.name),price=el('strong','avatar-confirm-price',focusDuration(item.costSeconds));
    const unit=el('span','avatar-confirm-unit','Focus Time 차감'),actions=el('div','avatar-confirm-actions'),cancel=el('button','secondary-button','취소'),confirm=el('button','avatar-purchase-confirm','구매하기');cancel.type=confirm.type='button';
    actions.append(cancel,confirm);dialog.append(title,name,price,unit,actions);document.body.append(dialog);
    let finished=false;
    const finish=async value=>{if(finished)return;finished=true;await collapseProfile(dialog);dialog.remove();if(anchor.isConnected)anchor.focus({preventScroll:true});if(scroller?.isConnected)scroller.scrollTop=top;if(shelf?.isConnected)shelf.scrollLeft=left;resolve(value);};
    cancel.onclick=()=>finish(false);confirm.onclick=()=>{confirm.disabled=true;finish(true);};dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});dialog.addEventListener('close',()=>finish(false));
    dialog.showModal();
    expandProfile(dialog,anchor);
  });
}

let cinematicPreviewId=0;
export function showCinematicPreview(item,avatar,anchor){
  const dialog=el('dialog','avatar-cinematic-dialog'),heading=el('h2','',item.name),stage=el('div','avatar-cinematic-stage');
  heading.id=`cinematic-preview-${++cinematicPreviewId}`;dialog.setAttribute('aria-labelledby',heading.id);
  stage.append(pixelAvatar({...avatar,effect:item.value}));
  if(avatar.background&&avatar.background!=='none')avatarBackground(stage,avatar);
  const price=el('strong','avatar-cinematic-price',`${focusDuration(item.costSeconds)} · Focus Time`),close=el('button','secondary-button','닫기');close.type='button';
  dialog.append(heading,stage,price,close);document.body.append(dialog);let closing=false;
  const finish=async()=>{if(closing)return;closing=true;await collapseProfile(dialog);dialog.remove();if(anchor?.isConnected)anchor.focus({preventScroll:true});};
  close.onclick=finish;dialog.addEventListener('cancel',event=>{event.preventDefault();void finish();});dialog.addEventListener('close',()=>void finish());
  dialog.showModal();expandProfile(dialog,anchor);return dialog;
}

export function createAvatarEditor(data,{onSave,onPurchase}={}){
  const form=el('form','avatar-studio'),balance=el('strong','avatar-wallet'),tabs=el('div','avatar-shop-tabs'),grid=el('div','avatar-shop-grid'),feedback=el('p','auth-status');balance.dataset.focusWallet='';feedback.hidden=true;feedback.setAttribute('role','status');
  let avatar={...AVATAR_DEFAULT,...data.avatar},owned=new Set(ownedAvatarItems(data)),slot='character',busy=false,confirming=false,wallet=data.focusBalanceSeconds||0;
  let categoryAnimation;
  const shelfOffsets=new Map();
  const cardViews=new Map();let renderedSlot=null,previewKey='';
  const preview=el('div','avatar-selected-preview');preview.setAttribute('aria-label','선택한 아바타와 배경');
  const bio=el('textarea');bio.maxLength=100;bio.value=data.bio||'';bio.setAttribute('aria-label','한 줄 소개');bio.placeholder='나를 소개하는 한 줄';
  const save=el('button','primary-button','프로필 저장');save.type='submit';
  const message=(text,error=false)=>{feedback.textContent=text;feedback.hidden=!text;feedback.classList.toggle('is-error',error);};
  function decoratePreview(image,item){
    if(item.slot!=='effect'||!CINEMATIC_EFFECTS[item.value])return image;
    image.setAttribute('role','button');image.setAttribute('tabindex','0');image.setAttribute('aria-label',`${item.name} 크게 보기`);
    image.onclick=()=>showCinematicPreview(item,avatar,image);
    image.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();showCinematicPreview(item,avatar,image);}};
    return image;
  }
  function updateCard(view){
    const {item,card,action,price}=view,isOwned=owned.has(item.id),equipped=avatar[item.slot]===item.value;
    card.classList.toggle('is-owned',isOwned);card.classList.toggle('is-equipped',equipped);action.className=isOwned?'avatar-equip':'avatar-item-buy';action.textContent=isOwned?(equipped?'장착 중':'장착'):'구매';action.disabled=busy;action.setAttribute('aria-label',`${item.name} ${isOwned?'장착':'구매'}`);action.setAttribute('aria-pressed',String(equipped));price.textContent=isOwned?'보유 중':focusDuration(item.costSeconds);
    const imageKey=['effect','background'].includes(item.slot)?JSON.stringify({...avatar,[item.slot]:item.value}):item.id;
    if(view.imageKey!==imageKey){const next=decoratePreview(avatarItemPreview(item,avatar),item);view.image.replaceWith(next);view.image=next;view.imageKey=imageKey;}
  }
  function refresh(){
    const nextPreviewKey=JSON.stringify(avatar);if(previewKey!==nextPreviewKey){preview.replaceChildren(pixelAvatar(avatar));avatarBackground(preview,avatar);previewKey=nextPreviewKey;}
    balance.textContent=`FOCUS TIME ${focusDuration(wallet)}`;save.disabled=busy;
    for(const button of tabs.children){button.setAttribute('aria-pressed',String(button.dataset.slot===slot));button.disabled=busy;}
    if(renderedSlot===slot){for(const view of cardViews.values())updateCard(view);return;}
    const fragment=document.createDocumentFragment(),shelves=[];cardViews.clear();renderedSlot=slot;
    for(const tier of ['일반','레어','에픽','레전드','신화']){
      const items=AVATAR_CATALOG.filter(item=>item.slot===slot&&item.tier===tier);if(!items.length)continue;
      const section=el('section','avatar-tier-section'),heading=el('h3',`avatar-tier-heading rarity-${tier}`,tier),itemsGrid=el('div','avatar-tier-items');section.dataset.tier=tier;
      itemsGrid.style.setProperty('--shelf-rows',String(Math.min(2,items.length)));itemsGrid.tabIndex=0;itemsGrid.setAttribute('role','region');itemsGrid.setAttribute('aria-label',`${tier} 아이템 · 좌우로 스크롤`);
      itemsGrid.append(...items.map(item=>{
      const card=el('article','avatar-shop-card');card.dataset.avatarItem=item.id;
      card.dataset.itemTier=item.tier;
      if(slot==='effect'&&CINEMATIC_EFFECTS[item.value])card.dataset.cinematicItem=item.value;
      const image=decoratePreview(avatarItemPreview(item,avatar),item);
      if(slot==='background')avatarBackground(card,{background:item.value});
      const action=el('button'),price=el('strong','avatar-shop-price');action.type='button';
      card.append(el('span',`avatar-rarity rarity-${item.tier}`,item.tier),image,el('strong','avatar-shop-name',item.name),price,action);
      const view={item,card,action,price,image,imageKey:['effect','background'].includes(item.slot)?JSON.stringify({...avatar,[item.slot]:item.value}):item.id};cardViews.set(item.id,view);updateCard(view);
      action.onclick=async()=>{
        if(busy||confirming)return;
        if(owned.has(item.id)){avatar[slot]=item.value;refresh();return;}
        confirming=true;let approved=false;try{approved=await confirmAvatarPurchase(item,action);}finally{confirming=false;}
        if(!approved||getAuthUser()?.uid!==data.uid)return;
        busy=true;message('');refresh();
        try{
          const result=await studyCall('purchaseAvatarItem',{itemId:item.id});if(getAuthUser()?.uid!==data.uid)return;
          owned=new Set(result.avatarInventory);wallet=result.balanceSeconds;avatar[item.slot]=item.value;
          announceFocusPurchase(result,{uid:data.uid,fallbackSpent:item.costSeconds});onPurchase?.(result);message('');
        }catch(error){if(getAuthUser()?.uid!==data.uid)return;if(isFocusBalanceError(error)){message('');showFocusNotice(serviceError(error));}else message(serviceError(error),true);}finally{busy=false;refresh();}
      };
      return card;
      }));section.append(heading,itemsGrid);fragment.append(section);shelves.push([itemsGrid,`${slot}:${tier}`]);
    }
    grid.replaceChildren(fragment);for(const [shelf,key]of shelves){shelf.scrollLeft=shelfOffsets.get(key)||0;shelf.addEventListener('scroll',()=>shelfOffsets.set(key,shelf.scrollLeft),{passive:true});}
  }
  for(const [key,label]of [['character','캐릭터'],['hat','모자'],['glasses','안경'],['effect','움직이는 효과'],['background','배경'],['accessory','액세서리']]){
    const button=el('button','',label);button.type='button';button.dataset.slot=key;button.onclick=()=>{
      if(slot===key||busy||confirming)return;
      const previous=[...tabs.children].findIndex(node=>node.dataset.slot===slot),next=[...tabs.children].indexOf(button),height=grid.getBoundingClientRect().height;
      categoryAnimation?.cancel();slot=key;refresh();
      if(!reduceProfileMotion()){const target=grid.getBoundingClientRect().height;categoryAnimation=grid.animate([{opacity:.15,transform:`translateX(${next>previous?32:-32}px)`,height:`${height}px`},{opacity:1,transform:'translateX(0)',height:`${target}px`}],{duration:280,easing:'cubic-bezier(.2,.8,.2,1)'});}
    };tabs.append(button);
  }
  form.onsubmit=async event=>{event.preventDefault();if(busy||confirming)return;busy=true;refresh();try{await onSave?.({avatar,bio:bio.value});}catch(error){message(serviceError(error),true);}finally{busy=false;refresh();}};
  form.append(balance,preview,tabs,grid,bio,save,feedback);refresh();return form;
}
