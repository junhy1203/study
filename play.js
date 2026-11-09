import {authReady,getAuthUser} from './auth.js?v=20261104-1';
import {getStudyData,setLoading} from './data.js?v=20261107-face-meals1';
import {studyCall,element as el,duration,serviceError} from './study-api.js?v=20261024-selfhost1';
import {showToast} from './notifications.js?v=20261109-capsule1';
const DEFAULT={character:'sprout',hat:'none',glasses:'none',effect:'none'};
import {pixelAvatar,avatarBackground} from './avatar-renderer.js?v=20261107-impact1';
import {createAvatarEditor} from './avatar-shop.js?v=20261107-impact1';
import {announceFocusPurchase,isFocusBalanceError,showFocusNotice} from './focus-wallet.js?v=20261105-shop10';
import {renderFriendCard} from './friend-card.js?v=20261107-impact1';
import {expandProfile,collapseProfile} from './profile-motion.js?v=20261105-shop10';
import {createStudyWorld} from './study-world.js?v=20261107-impact1';
import {STUDY_TYPE_GROUPS,studyRadar} from './study-personality-types.js?v=20261109-types1';
export {pixelAvatar};
let owner=null,profile=null,loading=false,revision=0,loadedPage=null;
let personalityRequest=null;
let studyRoomView=null,studyRoomRoot=null,studyRoomDialog=null,worldClosing=null;
function clearStudyRoom(){studyRoomView?.destroy();studyRoomView=null;studyRoomRoot=null;studyRoomDialog?.close();studyRoomDialog?.remove();studyRoomDialog=null;document.documentElement.classList.remove('study-world-open');}
async function exitStudyRoom(){
  if(worldClosing)return worldClosing;if(!studyRoomDialog)return;
  const dialog=studyRoomDialog;
  worldClosing=(async()=>{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)await dialog.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(20px)'}],{duration:180,easing:'ease-in',fill:'forwards'}).finished.catch(()=>{});if(studyRoomDialog===dialog)clearStudyRoom();worldClosing=null;})();
  return worldClosing;
}
async function openStudyRoom(anchor){
  if(studyRoomDialog?.open)return;
  if(!getAuthUser()){showToast('로그인 후 가상현실에 입장할 수 있어요.');return;}
  if(!profile)await load();if(!profile){showToast('아바타 정보를 불러온 뒤 다시 입장해 주세요.');return;}
  const dialog=el('dialog','study-world-dialog'),root=el('div');dialog.setAttribute('aria-label','가상 공부방');dialog.append(root);document.body.append(dialog);studyRoomDialog=dialog;studyRoomRoot=root;
  dialog.addEventListener('cancel',event=>{event.preventDefault();void exitStudyRoom();});
  dialog.addEventListener('close',()=>{if(studyRoomDialog===dialog)clearStudyRoom();if(anchor?.isConnected)anchor.focus();},{once:true});
  dialog.showModal();document.documentElement.classList.add('study-world-open');paintStudyRoom();
}
function paintStudyRoom(){
  const root=studyRoomRoot;
  if(!root||!profile||!owner)return;
  if(studyRoomView&&studyRoomRoot===root&&studyRoomView.uid===owner){studyRoomView.updateAvatar(profile.avatar);return;}
  const uid=owner;
  studyRoomView=createStudyWorld(root,{uid,avatar:profile.avatar,room:profile.studyRoom,onExit:()=>void exitStudyRoom(),call:async(name,input)=>{
    if(getAuthUser()?.uid!==uid)throw new Error('다시 로그인해 주세요.');
    const result=await studyCall(name,input);
    if(getAuthUser()?.uid!==uid)throw new Error('계정이 변경되었습니다.');
    return result;
  },onSave:async studyRoom=>{
    if(getAuthUser()?.uid!==uid)throw new Error('다시 로그인해 주세요.');
    const result=await studyCall('updatePlayProfile',{studyRoom});
    if(getAuthUser()?.uid!==uid)throw new Error('계정이 변경되었습니다.');
    if(!result.studyRoom)throw new Error('공부방 저장을 지원하는 서버 업데이트가 필요해요.');
    profile.studyRoom=result.studyRoom;
  }});
}
const format=seconds=>`${Math.floor(seconds/3600)}시간 ${Math.floor(seconds%3600/60)}분`;
function status(text){if(text)showToast(text);}
function personalityStatus(text){if(text)showToast(text);}
function paint(){
  if(!profile)return;
  paintStudyRoom();
  for(const root of document.querySelectorAll('[data-avatar-preview]')){setLoading(root,false);root.replaceChildren(pixelAvatar(profile.avatar));avatarBackground(root,profile.avatar);avatarBackground(root.closest('.play-avatar-card')||root,profile.avatar);}
  for(const node of document.querySelectorAll('[data-phone-balance]')){setLoading(node,false);node.textContent=format(profile.phoneBalanceSeconds||0);}
  for(const node of document.querySelectorAll('[data-personality-name]'))node.textContent=profile.personality?.scholar||'공부 기록으로 만나는 나의 학자';
  for(const node of document.querySelectorAll('[data-personality-reason]'))node.textContent=profile.personality?.reason||'최근 7일 공부 기록을 분석해 16명의 학자 중 나와 닮은 공부 스타일을 찾아요. 매주 자동 갱신됩니다.';
  const radar=document.querySelector('#personality-radar-dialog[open] [data-personality-radar]');
  if(radar)paintPersonalityRadar(radar);
  for(const root of document.querySelectorAll('[data-friend-self]')){renderFriendCard(root,profile,{self:true});root.setAttribute('aria-label','내 프로필 보기');}
}
async function load(){
  const page=document.querySelector('[data-avatar-preview],[data-friend-self]');
  if(!page)return;
  const uid=getAuthUser()?.uid,{ready,profile:studyProfile,failed}=getStudyData();
  if(!uid||!studyProfile){
    if(!uid){owner=null;profile=null;revision++;}
    const pending=!failed.has('profile')&&(!ready||Boolean(uid));
    for(const node of document.querySelectorAll('[data-avatar-preview],[data-phone-balance]'))setLoading(node,pending);
    return;
  }
  if(loading||owner===uid&&loadedPage===page)return;
  owner=uid;loadedPage=page;loading=true;const token=++revision;
  if(!profile)for(const node of document.querySelectorAll('[data-avatar-preview],[data-phone-balance]'))setLoading(node,true);
  try{const result=await studyCall('getPlayProfile');if(token!==revision||getAuthUser()?.uid!==uid)return;profile=result;paint();
    if(!profile.personality||profile.personality.nextUpdateAtMs<=Date.now())await analyze(false);
  }catch(error){if(token===revision){for(const node of document.querySelectorAll('[data-avatar-preview],[data-phone-balance]'))setLoading(node,false);status(serviceError(error),true);}}finally{loading=false;}
}
async function analyze(force){
  const uid=getAuthUser()?.uid;
  if(!uid){personalityStatus('로그인하면 공부 유형을 분석할 수 있어요.',true);return;}
  if(owner!==uid||!profile){personalityStatus('프로필을 불러오는 중이에요. 잠시 후 다시 눌러 주세요.');return;}
  if(personalityRequest?.uid===uid){personalityStatus('최근 7일 공부 기록을 분석하고 있어요…');return;}
  const request={uid};
  personalityRequest=request;
  personalityStatus('최근 7일 공부 기록을 분석하고 있어요…');
  try{
    const result=await studyCall('getStudyPersonality',{force});
    if(uid!==getAuthUser()?.uid||!profile)return;
    profile.personality=result;
    paint();
    personalityStatus('공부 유형을 갱신했어요.');
  }catch(error){
    if(uid===getAuthUser()?.uid)personalityStatus(serviceError(error),true);
  }finally{
    if(personalityRequest===request)personalityRequest=null;
  }
}
function openPersonalityDialog(anchor){
  const dialog=document.getElementById(anchor.getAttribute('aria-controls'));
  if(!dialog||dialog.open)return;
  const list=dialog.querySelector('[data-personality-types-list]');
  if(list&&!list.childElementCount){
    for(const [title,types] of STUDY_TYPE_GROUPS){
      const group=el('section','personality-type-group');
      group.append(el('h3','',title));
      for(const [scholar,criterion] of types){
        const item=el('article','personality-type');
        item.append(el('h4','',scholar),el('p','',`${criterion} 이 유형에 가까워요.`));
        group.append(item);
      }
      list.append(group);
    }
  }
  const radar=dialog.querySelector('[data-personality-radar]');
  if(radar)paintPersonalityRadar(radar);
  if(!dialog.dataset.bound){
    dialog.dataset.bound='true';
    dialog.addEventListener('cancel',event=>{event.preventDefault();void collapseProfile(dialog);});
    dialog.querySelector('[data-personality-types-close]').addEventListener('click',()=>void collapseProfile(dialog));
    dialog.addEventListener('click',event=>{
      if(event.target!==dialog)return;
      const {left,right,top,bottom}=dialog.getBoundingClientRect();
      if(event.clientX<left||event.clientX>right||event.clientY<top||event.clientY>bottom)void collapseProfile(dialog);
    });
  }
  dialog.addEventListener('close',()=>{if(anchor.isConnected)anchor.focus();},{once:true});
  dialog.showModal();
  dialog.scrollTop=0;
  expandProfile(dialog,anchor);
}
function paintPersonalityRadar(root){
  const metrics=studyRadar(profile?.studyStats);
  const type=profile?.personality;
  const heading=el('h3','',type?.scholar||'나의 공부 기록');
  root.replaceChildren(heading);
  if(type?.reason)root.append(el('p','personality-reason',type.reason));
  if(!metrics.length){
    root.append(el('p','muted',getAuthUser()?'최근 7일 학습 기록이 쌓이면 그래프가 표시돼요.':'로그인하면 내 학습 기록을 볼 수 있어요.'));
    return;
  }
  const svg=(name,attrs={})=>{
    const node=document.createElementNS('http://www.w3.org/2000/svg',name);
    for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
    return node;
  };
  const point=(index,radius)=>{
    const angle=index*Math.PI/3-Math.PI/2;
    return [150+Math.cos(angle)*radius,122+Math.sin(angle)*radius];
  };
  const hexagon=ratios=>ratios.map((ratio,index)=>point(index,85*ratio).join(',')).join(' ');
  const chart=svg('svg',{class:'personality-radar',viewBox:'0 0 300 244','aria-hidden':'true'});
  for(const level of [.25,.5,.75,1])chart.append(svg('polygon',{class:'personality-radar-grid',points:hexagon(metrics.map(()=>level))}));
  metrics.forEach((metric,index)=>{
    const [x,y]=point(index,85),[tx,ty]=point(index,108);
    chart.append(svg('line',{class:'personality-radar-grid',x1:150,y1:122,x2:x,y2:y}));
    const label=svg('text',{x:tx,y:ty,'text-anchor':'middle','dominant-baseline':'middle'});
    label.textContent=metric.label;
    chart.append(label);
  });
  if(metrics.every(metric=>metric.score!==null)){
    chart.append(svg('polygon',{class:'personality-radar-shape',points:hexagon(metrics.map(metric=>metric.score/100))}));
  }
  const values=el('dl','personality-radar-values');
  metrics.forEach(metric=>{
    const row=el('div');
    row.append(el('dt','',metric.label),el('dd','',metric.score===null?'기록 없음':`${metric.score}점 · ${metric.detail}`));
    values.append(row);
  });
  root.append(chart,values);
}
function closeProfile(dialog){return collapseProfile(dialog);}
async function openProfile(uid,{edit=false,anchor}={}){
  const current=getAuthUser()?.uid;if(!current)return;
  try{
    const data=await studyCall('getPlayProfile',{uid});if(getAuthUser()?.uid!==current||anchor&&!anchor.isConnected)return;
    if(uid===current)profile=data;
    const dialog=el('dialog','profile-dialog'),close=el('button','profile-dialog-close','×');close.type='button';close.setAttribute('aria-label','프로필 닫기');close.onclick=()=>closeProfile(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.append(close);dialog.setAttribute('aria-labelledby','profile-dialog-title');
    dialog.addEventListener('cancel',event=>{event.preventDefault();void closeProfile(dialog);});
    const body=el('div','play-profile'),preview=el('div','profile-avatar-scene');let avatar={...DEFAULT,...data.avatar};preview.replaceChildren(pixelAvatar(avatar));avatarBackground(preview,avatar);
    if(uid===current&&edit){
      dialog.classList.add('avatar-shop-dialog');
      const title=el('h2','avatar-editor-title','아바타 꾸미기');title.id='profile-dialog-title';dialog.append(title);
      body.append(createAvatarEditor(data,{onPurchase:result=>{if(profile){profile.avatarInventory=result.avatarInventory;profile.focusBalanceSeconds=result.balanceSeconds;}},onSave:async input=>{const result=await studyCall('updatePlayProfile',input);if(getAuthUser()?.uid!==current)return;profile={...(profile||data),...result};paint();closeProfile(dialog);showToast('프로필을 저장했어요.');}}));
    }else{
      const name=el('h2','profile-display-name',data.displayName);name.id='profile-dialog-title';body.classList.add('public-play-profile');body.append(preview,name,el('p','profile-bio',data.bio||'함께 공부하는 친구'));
      if(data.personality?.scholar){const personality=el('section','profile-personality');personality.append(el('h3','',`공부 성향 · ${data.personality.scholar}`),el('p','',data.personality.reason||'최근 7일 공부 기록으로 분석한 나와 닮은 학자 유형입니다.'));body.append(personality);}
      const stats=data.studyStats||{},panel=el('section','friend-study-stats');panel.setAttribute('aria-label','공부 시간 통계');panel.append(el('h3','','공부 시간 통계'));
      const totals=el('div','friend-study-totals');for(const [label,key]of [['오늘','todaySeconds'],['최근 7일','weekSeconds'],['누적','totalSeconds']]){const card=el('div');card.append(el('span','',label),el('strong','',format(stats[key]||0)));totals.append(card);}panel.append(totals);
      const days=el('div','friend-study-days'),records=stats.days||[],max=Math.max(1,...records.map(day=>day.seconds));
      for(const day of [...records].reverse()){const column=el('div','friend-study-day'),bar=el('span','friend-study-bar');bar.style.height=`${Math.max(2,day.seconds/max*70)}px`;column.title=`${day.date} · ${format(day.seconds)}`;column.append(el('small','',format(day.seconds)),bar,el('span','',day.date.slice(5)));days.append(column);}panel.append(days);body.append(panel);
    }
    dialog.append(body);document.body.append(dialog);dialog.showModal();expandProfile(dialog,anchor);
  }catch(error){showToast(serviceError(error));}
}
let purchasing=false,pendingPurchase=null;
const purchaseKey=uid=>`study:pending-phone-purchase:${uid}`;
function clearPurchase(uid){try{localStorage.removeItem(purchaseKey(uid));}catch{}pendingPurchase=null;}
document.addEventListener('click',async event=>{
  const types=event.target.closest('[data-personality-types-open]');if(types){openPersonalityDialog(types);return;}
  const enter=event.target.closest('[data-world-enter]');if(enter){void openStudyRoom(enter);return;}
  const edit=event.target.closest('[data-avatar-edit]');if(edit){void openProfile(getAuthUser()?.uid,{edit:true,anchor:edit});return;}
  const self=event.target.closest('[data-friend-self]');if(self){void openProfile(getAuthUser()?.uid,{anchor:self});return;}
  const analyzeButton=event.target.closest('[data-personality-refresh]');if(analyzeButton){analyzeButton.disabled=true;try{await analyze(true);}finally{analyzeButton.disabled=false;}return;}
  const buy=event.target.closest('[data-phone-buy]');if(!buy||purchasing)return;purchasing=true;buy.disabled=true;
  const uid=getAuthUser()?.uid,seconds=Number(buy.dataset.phoneBuy);
  if(!pendingPurchase)try{const saved=JSON.parse(localStorage.getItem(purchaseKey(uid))||'null');if(saved&&[300,900,1800].includes(saved.seconds)&&typeof saved.purchaseId==='string')pendingPurchase=saved;}catch{}
  pendingPurchase??={seconds,purchaseId:crypto.randomUUID()};
  try{localStorage.setItem(purchaseKey(uid),JSON.stringify(pendingPurchase));}catch{}
  if(pendingPurchase.seconds!==seconds){showToast('이전 구매 결과 확인을 위해 같은 시간을 다시 눌러 주세요.');purchasing=false;buy.disabled=false;return;}
  try{const result=await studyCall('purchasePhoneTime',pendingPurchase);clearPurchase(uid);if(uid!==getAuthUser()?.uid)return;if(profile){profile.phoneBalanceSeconds=result.phoneBalanceSeconds;profile.focusBalanceSeconds=result.balanceSeconds;}announceFocusPurchase(result,{uid,fallbackSpent:seconds*2});paint();status('');}
  catch(error){if(/functions\/(invalid-argument|failed-precondition|permission-denied|unauthenticated|already-exists)$/.test(error.code||''))clearPurchase(uid);if(uid===getAuthUser()?.uid){if(isFocusBalanceError(error)){status('');showFocusNotice(serviceError(error));}else status(serviceError(error),true);}}finally{purchasing=false;buy.disabled=false;}
});
window.addEventListener('study:open-profile',event=>void openProfile(event.detail.uid,{anchor:event.detail.anchor}));
window.addEventListener('study:auth-changed',()=>{if(owner!==getAuthUser()?.uid){clearStudyRoom();profile=null;loadedPage=null;pendingPurchase=null;revision++;}void load();});
window.addEventListener('study:navigated',()=>{clearStudyRoom();void load();});
window.addEventListener('study:data-changed',()=>void load());
authReady.then(load);
