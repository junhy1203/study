import {pixelAvatar,accessoryAvatar} from './avatar-renderer.js?v=20261106-accessory1';
import {ACCESSORIES} from './avatar-accessories.js?v=20261106-accessory1';
import {ROOM_EMOTES} from './functions/study-room.js?v=20261106-world4';

const NS='http://www.w3.org/2000/svg';
const make=(tag,attrs,parent)=>{const element=document.createElementNS(NS,tag);for(const [key,value]of Object.entries(attrs))element.setAttribute(key,String(value));parent.append(element);return element;};
export function createRoomResidents(layer,{uid,point}){
  const actors=new Map();
  function sync(residents,now,canStand){
    const present=new Set(),entries=[];let nextExpiry=Infinity;
    for(const resident of residents){
      const p=resident.position;if(!p||!canStand(p))continue;present.add(resident.uid);
      const self=resident.uid===uid;let actor=actors.get(resident.uid);
      if(!actor){
        const node=make('g',{class:'room-resident',...(self?{'data-room-self':'','pointer-events':'none'}:{'data-room-guest':resident.uid,role:'button',tabindex:0})},layer);
        node.style.setProperty('--room-move-duration',self?'130ms':'450ms');
        make('ellipse',{cx:0,cy:0,rx:20,ry:6,fill:'#24322d33','data-room-shadow':''},node);
        make('rect',{x:-28,y:-64,width:56,height:72,fill:'transparent','data-room-character-hit':''},node);
        const label=make('text',{x:0,y:-65,'text-anchor':'middle','font-size':13,fill:'#354638',stroke:'#fffaf0','stroke-width':4,'paint-order':'stroke','pointer-events':'none'},node);
        actor={node,label,avatar:null,signature:null,bubble:null,emoteToken:null,accessory:null,accessoryValue:null};actors.set(resident.uid,actor);
      }
      const signature=JSON.stringify(['character','hat','glasses','effect'].map(slot=>resident.avatar?.[slot]||null));
      if(signature!==actor.signature){
        const avatar=pixelAvatar({...resident.avatar,accessory:'none'},{sceneOverflow:true});avatar.classList.add('room-avatar');avatar.style.pointerEvents='none';
        for(const [key,value]of Object.entries({x:-38,y:-72,width:76,height:80}))avatar.setAttribute(key,String(value));
        if(actor.avatar)actor.avatar.replaceWith(avatar);else actor.node.insertBefore(avatar,actor.label);
        actor.avatar=avatar;actor.signature=signature;
      }
      if(actor.label.textContent!==resident.displayName)actor.label.textContent=resident.displayName;
      if(!self)actor.node.setAttribute('aria-label',resident.displayName+' 캐릭터, 가위바위보 하기');
      const [x,y]=point(p.x+.5,p.y+.5);
      const accessoryValue=ACCESSORIES[resident.avatar?.accessory]?resident.avatar.accessory:null;
      if(accessoryValue!==actor.accessoryValue){
        actor.accessory?.remove();actor.accessory=null;actor.accessoryValue=accessoryValue;
        if(accessoryValue){
          actor.accessory=make('g',{class:'room-accessory','data-accessory-owner':resident.uid,'pointer-events':'none'},layer);
          actor.accessory.style.setProperty('--accessory-follow-duration',self?'280ms':'600ms');
          const sprite=accessoryAvatar(accessoryValue);for(const [key,value]of Object.entries({x:-17,y:-19,width:34,height:38}))sprite.setAttribute(key,String(value));actor.accessory.append(sprite);
        }
      }
      if(actor.accessory){
        actor.accessory.style.transform=`translate(${x+38}px, ${y-32}px)`;
        entries.push({node:actor.accessory,depth:p.y+1.02});
      }
      if(actor.x!==x||actor.y!==y){actor.node.style.transform=`translate(${x}px, ${y}px)`;actor.x=x;actor.y=y;actor.node.dataset.cellX=String(p.x);actor.node.dataset.cellY=String(p.y);}
      const emote=ROOM_EMOTES[resident.emote],token=resident.emote+':'+resident.emoteAtMs;
      if(emote&&resident.emoteExpiresAtMs>now){
        nextExpiry=Math.min(nextExpiry,resident.emoteExpiresAtMs);
        if(!actor.bubble||actor.emoteToken!==token){
          actor.bubble?.remove();actor.emoteToken=token;
          actor.bubble=make('g',{class:'room-emote is-new','data-emote-owner':resident.uid,'aria-label':emote.label},actor.node);
          make('rect',{x:-25,y:-128,width:50,height:44,rx:15,fill:'#fffdf6',stroke:'#d5d9cd','stroke-width':2},actor.bubble);
          make('path',{d:'M-7 -84l7 8 7-8',fill:'#fffdf6'},actor.bubble);
          make('text',{x:0,y:-96,'text-anchor':'middle','font-size':29},actor.bubble).textContent=emote.emoji;
        }
      }else if(actor.bubble){actor.bubble.remove();actor.bubble=null;}
      entries.push({node:actor.node,depth:p.y+1});
    }
    for(const [id,actor]of actors)if(!present.has(id)){actor.node.remove();actor.accessory?.remove();actors.delete(id);}
    return {entries,nextExpiry};
  }
  return {sync,destroy(){for(const actor of actors.values()){actor.node.remove();actor.accessory?.remove();}actors.clear();}};
}
