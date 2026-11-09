import {createRoomResidents} from './room-residents.js?v=20261107-impact1';
import {ROOM_SIZE,ROOM_THEMES,ROOM_ITEMS,roomFootprint,canPlace,isRoomFree,roomPath,defaultRoom,validateRoom} from './functions/study-room.js?v=20261106-world5';

const NS='http://www.w3.org/2000/svg';
// Front-facing elevated view: horizontal X, vertical Y, no diagonal floor.
const point=(x,y,z=0)=>[64+x*64,132+y*48-z*.65];
function svg(tag,attrs={},parent){const node=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));parent?.append(node);return node;}
function polygon(parent,points,fill,attrs={}){return svg('polygon',{points:points.map(p=>p.join(',')).join(' '),fill,...attrs},parent);}
function surface(parent,x,y,w,h,z,color){return polygon(parent,[point(x,y,z),point(x+w,y,z),point(x+w,y+h,z),point(x,y+h,z)],color);}
function block(parent,x,y,w,h,z,height,color){
  polygon(parent,[point(x,y+h,z),point(x+w,y+h,z),point(x+w,y+h,z+height),point(x,y+h,z+height)],color,{filter:'brightness(.88)'});
  polygon(parent,[point(x+w,y,z),point(x+w,y+h,z),point(x+w,y+h,z+height),point(x+w,y,z+height)],color,{filter:'brightness(.74)'});
  surface(parent,x,y,w,h,z+height,color);
}
function furniture(parent,item,selected){
  const spec=ROOM_ITEMS[item.kind],{w,h}=roomFootprint(item),{x,y}=item,g=svg('g',{'data-room-item':item.id,role:'button',tabindex:0,'aria-label':spec.name,'aria-pressed':selected?'true':'false'},parent);
  if(selected)surface(g,x,y,w,h,1,'#e9b955').setAttribute('stroke','#987320');
  const c=spec.color;
  if(item.kind==='rug'){surface(g,x+.05,y+.05,w-.1,h-.1,1,c);for(let i=0;i<4;i++)surface(g,x+.12+i*.44,y+.12,.17,h-.24,2,'#ead7c8');}
  else if(item.kind==='plant'){block(g,x+.25,y+.25,.5,.5,0,19,'#c99072');for(const [dx,dy,z]of [[.3,.5,35],[.7,.45,43],[.5,.6,53]]){const [cx,cy]=point(x+dx,y+dy,z);svg('ellipse',{cx,cy,rx:10,ry:15,fill:c,transform:`rotate(${dx<.5?-30:30} ${cx} ${cy})`},g);}}
  else if(item.kind==='lamp'){block(g,x+.3,y+.3,.4,.4,0,5,'#798271');const [a,b]=point(x+.5,y+.5,4),[cx,cy]=point(x+.5,y+.5,55);svg('path',{d:`M${a} ${b}V${cy}`,stroke:'#887650','stroke-width':4},g);svg('path',{d:`M${cx-8} ${cy-12}h16l10 19h-36Z`,fill:c},g);}
  else if(item.kind==='shelf'){block(g,x+.08,y+.12,w-.16,h-.24,0,78,c);for(let row=0;row<3;row++){block(g,x+.14,y+.76,.7,.08,8+row*23,18,'#725d4d');for(let b=0;b<4;b++)block(g,x+.17+b*.16,y+.81,.12,.08,9+row*23,12+b%2*4,['#9bb6ad','#ddbd7d','#bc8e89','#8a99b4'][b]);}}
  else if(item.kind==='sofa'){block(g,x+.05,y+.06,w-.1,h-.12,0,20,c);block(g,x+.05,y+.06,item.rotation?.23:w-.1,item.rotation?h-.12:.23,20,24,c);surface(g,x+.2,y+.3,w-.4,h-.45,22,'#c6d3bc');}
  else if(item.kind==='chair'){block(g,x+.2,y+.2,.6,.6,0,18,c);block(g,x+.2,y+.15,item.rotation?.12:.6,item.rotation?.6:.12,18,20,c);}
  else {for(const dx of [.15,w-.3])for(const dy of [.15,h-.3])block(g,x+dx,y+dy,.12,.12,0,spec.height-5,'#826950');block(g,x+.05,y+.05,w-.1,h-.1,spec.height-5,5,c);if(item.kind==='desk'){surface(g,x+.4,y+.25,.6,.42,spec.height+1,'#f6eddc');surface(g,x+.6,y+.25,.02,.42,spec.height+2,'#b5ab93');block(g,x+w-.45,y+.25,.2,.2,spec.height,8,'#7f9d8c');}}
  return g;
}
const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);return b;};

export function createStudyRoom(root,{uid,avatar,room,onSave,readOnly=false,onMove=()=>{},onPerson=()=>{},participants=[],keyboardTarget}){
  let state;try{state=validateRoom(room);}catch{state=defaultRoom();}
  let saved=JSON.stringify(state),position={...state.spawn},editing=false,selected=null,adding=null,walking=null,saving=false,disposed=false;
  const abort=new AbortController(),signal=abort.signal;let emoteTimer=null,clock={server:Date.now(),local:performance.now()},lastKeyStep=0;
  root.replaceChildren();root.className='card study-room';
  const header=document.createElement('div');header.className='room-header';
  const title=document.createElement('div');title.innerHTML='<span class="room-eyebrow">MY STUDY WORLD</span><h2>나의 공부방</h2>';
  const edit=button('방 꾸미기',()=>{if(walking){clearInterval(walking);walking=null;}editing=!editing;selected=null;adding=null;render();});edit.hidden=readOnly;header.append(title,edit);
  const stage=document.createElement('div');stage.className='room-stage';stage.tabIndex=0;stage.setAttribute('aria-label','공부방. 바닥을 누르거나 방향키와 WASD로 이동하세요.');
  const canvas=svg('svg',{viewBox:'0 0 640 560',class:'room-world',role:'group','aria-label':'정면 위쪽에서 내려다보는 공부방'},stage);
  const scenery=svg('g',{'data-room-scenery':''},canvas),objects=svg('g',{'data-room-objects':''},canvas);
  const residentsView=createRoomResidents(objects,{uid,point});let scenerySignature='',furnishings=[];
  const panel=document.createElement('div');panel.className='room-panel';
  const hint=document.createElement('p');hint.className='room-hint';hint.setAttribute('role','status');
  const actions=document.createElement('div');actions.className='room-actions';
  const save=button('방 저장',async()=>{
    if(saving)return;saving=true;renderControls();
    try{const value=validateRoom({...state,spawn:position});await onSave(value);if(disposed)return;state=value;saved=JSON.stringify(value);message('공부방을 계정에 저장했어요.');}
    catch(error){if(!disposed)message(error.message||'저장하지 못했어요. 다시 시도해 주세요.');}
    finally{saving=false;if(!disposed)renderControls();}
  });
  const undo=button('변경 취소',()=>{if(walking)clearInterval(walking);walking=null;state=JSON.parse(saved);position={...state.spawn};selected=null;adding=null;render();message('마지막으로 저장한 방으로 돌아왔어요.');});
  actions.append(undo,save);actions.hidden=readOnly;root.append(header,stage,panel,actions,hint);
  function message(text){hint.textContent=text;}
  function renderControls(){edit.disabled=saving;save.disabled=saving||saved===JSON.stringify({...state,spawn:position});save.textContent=saving?'저장 중…':'방 저장';undo.disabled=saving||save.disabled;panel.inert=saving;}
  function render(controls=true){
    if(disposed)return;
    const signature=JSON.stringify([state.theme,state.items,selected]);
    if(signature!==scenerySignature){
      scenerySignature=signature;scenery.replaceChildren();
      for(const entry of furnishings)entry.node.remove();furnishings=[];
      const theme=ROOM_THEMES[state.theme];
      polygon(scenery,[point(0,0),point(8,0),point(8,0,96),point(0,0,96)],theme.wall);
      svg('rect',{x:58,y:132,width:524,height:394,rx:8,fill:theme.side},scenery);
      polygon(scenery,[point(2,0,37),point(4.5,0,37),point(4.5,0,83),point(2,0,83)],state.theme==='night'?'#a2b4da':'#fff1c7',{stroke:'#fbf6e8','stroke-width':5});
      for(let y=0;y<ROOM_SIZE;y++)for(let x=0;x<ROOM_SIZE;x++)surface(scenery,x,y,1,1,0,theme.floor).setAttribute('stroke','#b79e7d55');
      const floor=svg('g',{},scenery);
      for(let y=0;y<ROOM_SIZE;y++)for(let x=0;x<ROOM_SIZE;x++)surface(floor,x,y,1,1,2,'transparent').setAttribute('data-room-cell',x+','+y);
      for(const item of state.items){
        if(ROOM_ITEMS[item.kind].walkable)furniture(scenery,item,item.id===selected);
        else furnishings.push({node:furniture(objects,item,item.id===selected),depth:item.y+roomFootprint(item).h});
      }
    }
    const now=clock.server+performance.now()-clock.local;
    const residents=[{...(participants.find(person=>person.uid===uid)||{}),uid,avatar,position,displayName:'나'},...participants.filter(person=>person.uid!==uid)];
    const actors=residentsView.sync(residents.map(person=>({...person,position:person.position&&isRoomFree(state.items,person.position.x,person.position.y)?person.position:position})),now,p=>isRoomFree(state.items,p.x,p.y));
    const ordered=[...furnishings,...actors.entries].sort((a,b)=>a.depth-b.depth);
    let cursor=objects.firstElementChild;
    for(const entry of ordered){
      if(entry.node===cursor){cursor=cursor.nextElementSibling;continue;}
      if(typeof objects.moveBefore==='function')objects.moveBefore(entry.node,cursor);
      else objects.insertBefore(entry.node,cursor);
    }
    if(emoteTimer)clearTimeout(emoteTimer);
    if(Number.isFinite(actors.nextExpiry))emoteTimer=setTimeout(()=>render(false),Math.max(10,actors.nextExpiry-now+10));
    if(!controls){renderControls();return;}
    edit.textContent=editing?'꾸미기 완료':'방 꾸미기';edit.setAttribute('aria-pressed',String(editing));
    panel.hidden=!editing;panel.replaceChildren();
    actions.hidden=readOnly||!editing;
    if(editing){
      const themes=document.createElement('div');themes.className='room-themes';for(const [id,theme]of Object.entries(ROOM_THEMES)){const b=button(theme.name,()=>{state.theme=id;render();});b.setAttribute('aria-pressed',String(state.theme===id));themes.append(b);}panel.append(themes);
      const catalog=document.createElement('div');catalog.className='room-catalog';for(const [id,spec]of Object.entries(ROOM_ITEMS)){const b=button(`+ ${spec.name}`,()=>{adding=id;selected=null;render();message(`${spec.name}을 놓을 바닥을 눌러 주세요.`);});b.setAttribute('aria-pressed',String(adding===id));catalog.append(b);}panel.append(catalog);
      const item=state.items.find(i=>i.id===selected);if(item){const tools=document.createElement('div');tools.className='room-selection';const label=document.createElement('strong');label.textContent=ROOM_ITEMS[item.kind].name;tools.append(label,button('회전',()=>{const rotated={...item,rotation:1-item.rotation};if(!canPlace(state.items,rotated)||!isRoomFree(state.items.filter(i=>i.id!==item.id).concat(rotated),position.x,position.y)){message('회전할 공간이 부족해요.');return;}Object.assign(item,rotated);render();}),button('보관',()=>{state.items=state.items.filter(i=>i.id!==item.id);selected=null;render();message('가구를 보관했어요. 목록에서 다시 꺼낼 수 있어요.');}));panel.append(tools);}
    }
    renderControls();
    message(editing?'가구를 선택한 뒤 빈 바닥을 눌러 옮기세요. 가구는 최대 32개까지 놓을 수 있어요.':'바닥을 눌러 산책하세요 · 방향키 / WASD로도 이동할 수 있어요.');
  }
  function walk(target){
    if(walking)clearInterval(walking);walking=null;
    const path=roomPath(state.items,position,target);if(!path.length){message('가구가 없는, 이어진 바닥을 선택해 주세요.');return;}
    const step=()=>{if(disposed||!root.isConnected){clearInterval(walking);walking=null;return;}position=path.shift();onMove({...position});render(false);if(!path.length){clearInterval(walking);walking=null;}};
    step();if(path.length)walking=setInterval(step,130);
  }
  canvas.addEventListener('click',event=>{
    if(saving)return;
    const guest=event.target.closest('[data-room-guest]');if(guest){const person=participants.find(p=>p.uid===guest.dataset.roomGuest);if(person)onPerson(person);return;}
    const item=event.target.closest('[data-room-item]');if(item){if(editing){selected=item.dataset.roomItem;adding=null;render();message('빈 바닥을 누르면 선택한 가구를 옮겨요.');}else message(`${ROOM_ITEMS[state.items.find(i=>i.id===item.dataset.roomItem).kind].name} · 방 꾸미기에서 옮길 수 있어요.`);return;}
    const tile=event.target.closest('[data-room-cell]');if(!tile)return;const [x,y]=tile.dataset.roomCell.split(',').map(Number);
    if(!editing){walk({x,y});return;}
    if(!adding&&!selected){message('아래 목록에서 가구를 고르거나 방 안의 가구를 선택하세요.');return;}
    const previous=state.items.find(i=>i.id===selected),candidate=previous?{...previous,x,y}:{id:crypto.randomUUID(),kind:adding,x,y,rotation:0};
    if(!previous&&state.items.length>=32){message('가구는 32개까지 배치할 수 있어요.');return;}
    const next=state.items.filter(i=>i.id!==candidate.id).concat(candidate);
    if(!canPlace(state.items,candidate)||!isRoomFree(next,position.x,position.y)){message('가구가 겹치거나 아바타가 서 있는 자리예요. 다른 곳을 골라 주세요.');return;}
    state.items=next;selected=candidate.id;adding=null;render();
  },{signal});
  (keyboardTarget?document:stage).addEventListener('keydown',event=>{
    if(keyboardTarget){
      if(!root.isConnected)return;
      const dialogs=[...document.querySelectorAll('dialog[open]')],top=dialogs.at(-1);
      if(top&&!top.contains(root))return;
      if(!top&&!keyboardTarget.contains(event.target)&&event.target!==document.body)return;
    }
    if(saving||disposed||event.defaultPrevented||event.ctrlKey||event.altKey||event.metaKey)return;
    if(event.target.isContentEditable||event.target.closest('input,textarea,select,[role="textbox"]'))return;
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-room-item],[data-room-guest]')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));return;}
    const directions={ArrowUp:[0,-1],KeyW:[0,-1],w:[0,-1],ArrowDown:[0,1],KeyS:[0,1],s:[0,1],ArrowLeft:[-1,0],KeyA:[-1,0],a:[-1,0],ArrowRight:[1,0],KeyD:[1,0],d:[1,0]};
    const delta=directions[event.code]||directions[event.key]||directions[event.key?.toLowerCase()]||({87:[0,-1],83:[0,1],65:[-1,0],68:[1,0],38:[0,-1],40:[0,1],37:[-1,0],39:[1,0]})[event.keyCode]||({'ㅈ':[0,-1],'ㅉ':[0,-1],'ㄴ':[0,1],'ㅁ':[-1,0],'ㅇ':[1,0]})[event.key];
    if(!delta||editing)return;event.preventDefault();const now=performance.now();if(event.repeat&&now-lastKeyStep<120)return;lastKeyStep=now;walk({x:position.x+delta[0],y:position.y+delta[1]});
  },{signal});
  render();
  stage.focus({preventScroll:true});
  return {
    uid,position:()=>({...position}),
    layout:()=>validateRoom({...state,spawn:isRoomFree(state.items,state.spawn.x,state.spawn.y)?state.spawn:position}),
    isDirty:()=>saved!==JSON.stringify(state),
    updateWorld(value){
      participants=value.participants||[];
      if(value.serverNowMs)clock={server:value.serverNowMs,local:performance.now()};
      if(readOnly&&value.room){try{
        const next=validateRoom(value.room);
        if(JSON.stringify(next.items)!==JSON.stringify(state.items)){if(walking)clearInterval(walking);walking=null;}
        state=next;
        if(!isRoomFree(state.items,position.x,position.y))position={...state.spawn};
      }catch{}}
      render(false);
    },
    updateAvatar(value){avatar=value;render(false);},
    destroy(){disposed=true;abort.abort();residentsView.destroy();if(walking)clearInterval(walking);if(emoteTimer)clearTimeout(emoteTimer);root.replaceChildren();}
  };
}
