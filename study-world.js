import {createStudyRoom} from './study-room.js?v=20261106-world5';
import {ROOM_EMOTES} from './functions/study-room.js?v=20261106-world5';
import {pixelAvatar} from './avatar-renderer.js?v=20261105-shop10';
import {serviceError} from './study-api.js?v=20261024-selfhost1';

const node=(tag,className='',text)=>{const n=document.createElement(tag);n.className=className;if(text)n.textContent=text;return n;};
const button=(text,fn)=>{const b=node('button','',text);b.type='button';b.onclick=fn;return b;};
const HANDS={rock:['✊','바위'],paper:['✋','보'],scissors:['✌️','가위']};
export function createStudyWorld(root,{uid,avatar,room,onSave,call,onExit=()=>{}}){
  let host=uid,view=null,disposed=false,polling=false,switching=false,lastInvites=0,participants=[],ownRoom=room,pendingMessage=null;
  let sequence=Promise.resolve(),epoch=0,lastServerMs=0,popup=null,popupMode=null,game=null,gameSignature='',lastEmoteSignature='';
  const abort=new AbortController(),signal=abort.signal;
  root.className='study-world';root.replaceChildren();
  const topbar=node('header','world-topbar'),brand=node('div','world-brand');
  brand.append(node('span','world-eyebrow','STUDY WORLD'),node('h1','','가상 공부방'));
  const count=node('span','world-count','접속 중'),back=button('내 방으로',()=>void switchHome());back.hidden=true;
  const invite=button('친구 초대',()=>void showFriends()),exit=button('나가기 ↗',()=>onExit());
  exit.className='world-exit';topbar.append(brand,count,back,invite,exit);
  const scene=node('section',''),social=node('aside','room-social');social.setAttribute('aria-label','채팅과 친구');
  const heading=node('div','room-social-heading'),name=node('h2','','나의 공부방'),chatTitle=node('h3','','채팅');
  heading.append(name,node('span','world-online-dot','ONLINE'));
  const people=node('div','room-people'),friendList=node('div','room-friend-list');friendList.hidden=true;
  friendList.id='world-friends-'+crypto.randomUUID();invite.setAttribute('aria-controls',friendList.id);invite.setAttribute('aria-expanded','false');
  const invitations=node('section','room-invitations');invitations.setAttribute('aria-label','받은 공부방 초대');invitations.hidden=true;
  const chat=node('ol','room-chat');chat.setAttribute('aria-label','공부방 채팅');chat.setAttribute('role','log');chat.setAttribute('aria-live','polite');chat.setAttribute('aria-relevant','additions');
  const form=node('form','room-chat-form'),input=node('input');input.type='text';input.maxLength=300;input.placeholder='친구에게 한마디…';input.setAttribute('aria-label','채팅 메시지');
  const send=node('button','','보내기');send.type='submit';form.append(input,send);
  const status=node('p','world-status');status.setAttribute('role','status');
  social.append(heading,people,friendList,invitations,chatTitle,chat,form,status);
  root.append(topbar,scene,social);
  const emotes=node('div','world-emotes');emotes.setAttribute('aria-label','이모지 말풍선');
  for(const [id,spec]of Object.entries(ROOM_EMOTES)){
    const b=button(spec.emoji,async()=>{b.disabled=true;await action({action:'emote',emote:id});b.disabled=false;});
    b.title=spec.label;b.setAttribute('aria-label',spec.label);b.dataset.worldEmote=id;emotes.append(b);
  }
  function tell(text){status.textContent=text;}
  function request(data,target=host){
    const queued=sequence.then(()=>{if(disposed)throw new Error('공부방을 나갔어요.');return call('updateStudyWorld',{host:target,...data});});
    sequence=queued.catch(()=>{});return queued;
  }
  function popupBody(title,kind){
    if(!popup){
      const dialog=node('dialog','world-popup'),close=button('×',()=>void dismissPopup());close.className='world-popup-close';close.setAttribute('aria-label','팝업 닫기');
      const body=node('div','world-popup-body');dialog.append(close,body);
      const id='world-popup-'+crypto.randomUUID();dialog.setAttribute('aria-labelledby',id);
      dialog.addEventListener('cancel',event=>{event.preventDefault();void dismissPopup();},{signal});
      document.body.append(dialog);dialog.showModal();popup={dialog,body,id,closing:null};
    }
    popupMode=kind;popup.body.replaceChildren();const h=node('h2','',title);h.id=popup.id;popup.body.append(h);return popup.body;
  }
  async function closePopup(){
    if(!popup)return;const current=popup;if(current.closing)return current.closing;
    current.closing=(async()=>{
      current.dialog.classList.add('is-closing');
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches)await current.dialog.animate([{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(20px) scale(.93)'}],{duration:180,easing:'ease-in',fill:'forwards'}).finished.catch(()=>{});
      current.dialog.close();current.dialog.remove();if(popup===current){popup=null;popupMode=null;gameSignature='';}
    })();return current.closing;
  }
  async function dismissPopup(){
    if(popupMode==='game'&&game){const result=await action({action:'rpsClose',gameId:game.id});if(!result)return;}
    await closePopup();
  }
  function showPerson(person){
    if(!participants.some(p=>p.uid===person.uid)||person.uid===uid)return;
    if(game&&['pending','playing'].includes(game.status)){renderGame(game,true);return;}
    const body=popupBody(person.displayName+'님','person'),portrait=node('div','world-person-portrait');portrait.append(pixelAvatar(person.avatar));body.append(portrait,node('p','','같은 공부방에서 함께하고 있어요.'));
    const play=button('가위바위보 하기',async()=>{play.disabled=true;const result=await action({action:'rpsInvite',uid:person.uid,gameId:crypto.randomUUID()});if(!result)play.disabled=false;});
    play.className='world-primary';body.append(play);
  }
  function renderGame(value,force=false){
    game=value;
    if(!value){if(popupMode==='game')void closePopup();return;}
    const signature=JSON.stringify(value);
    if(!force&&gameSignature===signature&&popupMode==='game')return;
    if(popup?.closing)return;
    gameSignature=signature;
    const otherId=value.from===uid?value.to:value.from,other=participants.find(p=>p.uid===otherId),otherName=other?.displayName||'친구';
    const body=popupBody('가위바위보','game');body.dataset.gameStatus=value.status;
    const vs=node('div','world-game-vs'),me=node('div'),them=node('div');
    me.append(pixelAvatar(avatar),node('strong','','나'));them.append(pixelAvatar(other?.avatar||{}),node('strong','',otherName));
    vs.append(me,node('span','','VS'),them);body.append(vs);
    if(value.status==='pending'){
      body.append(node('p','world-game-notice',value.from===uid?otherName+'님이 수락하기를 기다리고 있어요.':otherName+'님이 가위바위보를 신청했어요!'));
      if(value.to===uid){const row=node('div','world-game-actions');row.append(button('거절',()=>void action({action:'rpsDecline',gameId:value.id})),button('수락하고 시작',()=>void action({action:'rpsAccept',gameId:value.id})));body.append(row);}
      else body.append(button('신청 취소',()=>void dismissPopup()));
    }else if(value.status==='playing'){
      body.append(node('p','world-game-notice',value.myChoice?'선택 완료! 상대가 고르면 함께 공개돼요.':'가위, 바위, 보! 하나를 선택해 주세요.'));
      const row=node('div','world-game-hands');
      for(const [choice,[emoji,label]]of Object.entries(HANDS)){const b=button(emoji+' '+label,()=>void action({action:'rpsChoose',gameId:value.id,choice}));b.disabled=Boolean(value.myChoice);b.setAttribute('aria-pressed',String(choice===value.myChoice));row.append(b);}body.append(row);
      body.append(node('small','',value.opponentReady?'상대가 선택을 마쳤어요.':'상대도 손을 고르고 있어요.'));
    }else if(value.status==='done'){
      const result=value.winnerUid===null?'무승부!':value.winnerUid===uid?'내가 이겼어요!':'친구가 이겼어요!';
      const hands=node('div','world-game-reveal');hands.append(node('span','',HANDS[value.myChoice][0]),node('span','','VS'),node('span','',HANDS[value.opponentChoice][0]));
      body.append(hands,node('p','world-game-result',result));
      const row=node('div','world-game-actions');
      row.append(button('닫기',()=>void dismissPopup()),button('한 판 더',()=>void action({action:'rpsInvite',uid:otherId,gameId:crypto.randomUUID()})));body.append(row);
    }else body.append(node('p','world-game-notice',value.status==='declined'?'친구가 이번 게임을 사양했어요.':'친구가 나갔거나 게임이 종료됐어요.'),button('닫기',()=>void dismissPopup()));
  }
  function mount(layout,readOnly=false){
    view?.destroy();pendingMessage=null;input.value='';game=null;gameSignature='';void closePopup();
    view=createStudyRoom(scene,{uid,avatar,room:layout,readOnly,participants,keyboardTarget:root,onPerson:showPerson,onSave:async value=>{await onSave(value);ownRoom=value;}});
    scene.append(emotes);back.hidden=!readOnly;invite.hidden=readOnly;friendList.hidden=true;invite.setAttribute('aria-expanded','false');chat.replaceChildren();delete chat.dataset.signature;lastServerMs=0;
  }
  function apply(snapshot){
    if(snapshot.serverNowMs<lastServerMs)return;lastServerMs=snapshot.serverNowMs||0;
    participants=snapshot.participants||[];name.textContent=host===uid?'나의 공부방':snapshot.displayName+'님의 공부방';count.textContent=participants.length+'명 접속 중';
    view.updateWorld(snapshot);
    const personSignature=JSON.stringify(participants.map(p=>[p.uid,p.displayName]));
    if(people.dataset.signature!==personSignature){
      people.replaceChildren();for(const person of participants){
        const chip=button(person.displayName+(person.uid===uid?' (나)':''),()=>showPerson(person));chip.className='room-person';chip.disabled=person.uid===uid;
        const wrapper=node('span','room-person-wrap');wrapper.append(chip);
        if(host===uid&&person.uid!==uid){const kick=button('×',()=>void action({action:'kick',uid:person.uid}));kick.className='room-kick';kick.setAttribute('aria-label',person.displayName+' 내보내기');wrapper.append(kick);}
        people.append(wrapper);
      }people.dataset.signature=personSignature;
    }
    const signature=JSON.stringify(snapshot.messages||[]);
    if(chat.dataset.signature!==signature){
      const nearBottom=chat.scrollHeight-chat.scrollTop-chat.clientHeight<45,key=m=>m.uid+':'+m.id,oldIds=new Set([...chat.children].map(child=>child.dataset.id)),messages=snapshot.messages||[];
      for(const row of [...chat.children])if(!messages.some(m=>key(m)===row.dataset.id))row.remove();
      for(const message of messages){if(oldIds.has(key(message)))continue;
        const li=node('li',message.uid===uid?'room-message room-message-self':'room-message');li.dataset.id=key(message);
        const time=node('time','',new Date(message.atMs).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}));time.dateTime=new Date(message.atMs).toISOString();
        li.append(node('strong','',message.displayName),time,node('p','',message.text));chat.append(li);
      }chat.dataset.signature=signature;if(nearBottom)chat.scrollTop=chat.scrollHeight;
    }
    renderGame(snapshot.game||null);
  }
  async function action(data){
    const current=host,token=epoch;
    try{const result=await request({...data,position:view.position()},current);if(disposed||host!==current||token!==epoch)return null;if(result.participants)apply(result);return result;}
    catch(error){if(data.action==='message'&&/(invalid-argument|resource-exhausted|permission-denied|unauthenticated)$/.test(error.code||''))pendingMessage=null;if(!disposed&&host===current)tell(serviceError(error));return null;}
  }
  async function showFriends(){
    if(!friendList.hidden){friendList.hidden=true;invite.setAttribute('aria-expanded','false');return;}
    const current=host,token=epoch;invite.disabled=true;invite.textContent='불러오는 중…';invite.setAttribute('aria-expanded','true');friendList.hidden=false;
    friendList.replaceChildren(node('p','room-hint','친구 목록을 불러오는 중…'));
    try{
      const result=await call('getStudySocial',{includeLists:true,revision:-1});if(disposed||host!==current||epoch!==token)return;friendList.replaceChildren();
      for(const friend of result.friends||[]){
        const row=node('div','room-friend-row'),b=button('초대',async()=>{b.disabled=true;const result=await action({action:'invite',uid:friend.uid});if(result){b.textContent='초대 보냄';tell('초대는 30분 동안 유효해요.');}else b.disabled=false;});
        row.append(node('span','',friend.displayName),b);friendList.append(row);
      }
      if(!friendList.children.length)friendList.append(node('p','room-hint','플레이의 친구 메뉴에서 친구를 먼저 추가해 주세요.'));
      friendList.hidden=false;
    }catch(error){if(disposed||host!==current||epoch!==token)return;friendList.replaceChildren(node('p','room-hint',serviceError(error)),button('다시 불러오기',()=>{friendList.hidden=true;void showFriends();}));tell(serviceError(error));}
    finally{invite.disabled=false;invite.textContent='친구 초대';}
  }
  async function switchHome(){
    if(switching)return;switching=true;const previous=host;++epoch;
    try{
      const snapshot=await request({action:'sync'},uid);if(disposed)return;
      await request({action:'leave'},previous).catch(()=>{});if(disposed)return;
      host=uid;participants=snapshot.participants;mount(ownRoom);apply(snapshot);tell('내 공부방으로 돌아왔어요.');
    }catch(error){tell(serviceError(error));}finally{switching=false;}
  }
  async function acceptInvite(invitation){
    if(switching)return;
    if(host===uid&&view.isDirty()){tell('방 변경을 저장하거나 변경 취소한 뒤 입장해 주세요.');return;}
    switching=true;++epoch;
    try{
      const snapshot=await request({action:'accept'},invitation.host);if(disposed)return;
      if(host!==invitation.host)await request({action:'leave'}).catch(()=>{});if(disposed)return;
      host=invitation.host;participants=snapshot.participants;mount(snapshot.room,true);apply(snapshot);lastInvites=0;tell('친구의 공부방에 입장했어요.');
    }catch(error){tell(serviceError(error));}finally{switching=false;}
  }
  async function pollInvites(){
    const result=await call('getStudyWorldInvites');if(disposed)return;const items=result.invites||[];
    const signature=JSON.stringify(items);if(invitations.dataset.signature===signature)return;invitations.dataset.signature=signature;
    invitations.hidden=!items.length;invitations.replaceChildren();if(!items.length)return;invitations.append(node('h3','','받은 초대'));
    for(const invitation of items){
      const row=node('div','room-friend-row'),accept=button('입장',()=>void acceptInvite(invitation));
      const decline=button('거절',async()=>{decline.disabled=true;try{await request({action:'decline'},invitation.host);row.remove();if(invitations.children.length===1)invitations.hidden=true;delete invitations.dataset.signature;}catch(error){tell(serviceError(error));decline.disabled=false;}});
      row.append(node('span','',invitation.displayName+'님의 공부방'),accept,decline);invitations.append(row);
    }
  }
  async function tick(){
    if(disposed||polling||switching||document.hidden||!root.isConnected)return;polling=true;
    const current=host,token=epoch;
    try{
      const snapshot=await request({action:'sync',position:view.position(),...(current===uid?{room:view.layout()}:{})},current);if(disposed||host!==current||epoch!==token)return;apply(snapshot);
      if(Date.now()-lastInvites>15000){await pollInvites();lastInvites=Date.now();}
    }catch(error){
      if(disposed)return;tell(serviceError(error));
      if(host!==uid&&/permission-denied/.test(error.code||'')){++epoch;host=uid;participants=[];mount(ownRoom);tell('방 입장이 종료되어 내 공부방으로 돌아왔어요.');}
    }finally{polling=false;}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();const text=input.value.trim();if(!text||send.disabled)return;
    if(pendingMessage&&pendingMessage.text!==text){tell('이전 메시지를 다시 보내 결과를 확인해 주세요.');return;}
    pendingMessage??={action:'message',text,messageId:crypto.randomUUID()};send.disabled=true;
    const result=await action(pendingMessage);if(result){pendingMessage=null;input.value='';tell('');chat.scrollTop=chat.scrollHeight;}send.disabled=false;
  },{signal});
  const viewport=()=>{root.style.setProperty('--world-height',(window.visualViewport?.height||window.innerHeight)+'px');};
  window.visualViewport?.addEventListener('resize',viewport,{signal});viewport();
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)void tick();},{signal});
  mount(room);const timer=setInterval(()=>void tick(),500);void tick();
  return {uid,updateAvatar(value){avatar=value;view.updateAvatar(value);},destroy(){
    if(disposed)return;disposed=true;++epoch;clearInterval(timer);abort.abort();view.destroy();
    if(popup){popup.dialog.close();popup.dialog.remove();popup=null;}root.replaceChildren();
    // Finish any queued request before leaving so a late sync cannot rejoin.
    sequence.finally(()=>call('updateStudyWorld',{host,action:'leave'})).catch(()=>{});
  }};
}
