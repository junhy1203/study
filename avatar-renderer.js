import {AVATAR_DEFAULT,avatarItem} from './functions/avatar-catalog.js?v=20261106-luxury1';
import {LUXURY_CHARACTERS,LUXURY_EFFECTS,drawLuxuryCharacter,drawLuxuryHat,drawLuxuryGlasses,drawLuxuryEffect} from './avatar-luxury.js?v=20261106-luxury1';
import {ACCESSORIES,drawAccessory} from './avatar-accessories.js?v=20261106-accessory1';
import {CINEMATIC_EFFECTS,drawCinematicEffect} from './avatar-cinematic.js?v=20261106-cinematic1';
import {RPG_CHARACTERS,RPG_EFFECTS,drawRPGCharacter,drawRPGHat,drawRPGGlasses,drawRPGParticle} from './avatar-rpg.js?v=20261105-shop10';
import {STREET_CHARACTERS,STREET_EFFECTS,drawStreetCharacter,drawStreetHat,drawStreetGlasses,drawStreetParticle} from './avatar-street.js?v=20261105-shop10';
const COLORS={sprout:['#b9d59a','#91b66e','#dcedc3'],cat:['#efbd7a','#d88b51','#ffe2af'],fox:['#ed9a55','#c86838','#ffcf8a'],penguin:['#708ca7','#3f607e','#b5ccdc'],robot:['#9cb9ca','#648999','#d6edf1'],bunny:['#d5b4da','#a57db0','#f4dff3'],bear:['#c79360','#97653e','#e9c693'],dragon:['#9d99e0','#6661b0','#d9d0ff']};
const NAMES={sprout:'새싹',cat:'고양이',fox:'여우',penguin:'펭귄',robot:'로봇',bunny:'토끼',bear:'곰',dragon:'드래곤'};
for(const [key,[name,...colors]]of Object.entries({...RPG_CHARACTERS,...STREET_CHARACTERS,...LUXURY_CHARACTERS})){NAMES[key]=name;COLORS[key]=colors;}
export function avatarBackground(node,avatar){node.dataset.avatarBackground=avatarItem('background',avatar?.background)?.value||'none';return node;}
export function pixelAvatar(value=AVATAR_DEFAULT,{sceneOverflow=false}={}){
  const a={...AVATAR_DEFAULT,...value},NS='http://www.w3.org/2000/svg';
  const make=(tag,attrs,parent)=>{const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));parent?.append(n);return n;};
  const companion=ACCESSORIES[a.accessory];
  const accessoryName=avatarItem('accessory',a.accessory)?.name;
  const cinematic=Boolean(CINEMATIC_EFFECTS[a.effect]),viewBox=cinematic&&!sceneOverflow?'-18 -19 54 53':companion?'-7 -7 43 34':'-7 -7 32 34';
  const svg=make('svg',{viewBox,class:'pixel-avatar','data-effect':a.effect,role:'img','aria-label':`${NAMES[a.character]||'새싹'} 아바타${companion?`, ${accessoryName}`:''}`,...(companion?{'data-has-accessory':''}:{}),...(cinematic?{'data-cinematic-effect':a.effect}:{})});
  const rect=(x,y,w,h,c,parent,extra={})=>make('rect',{x,y,width:w,height:h,fill:c,...extra},parent);
  const ellipse=(x,y,rx,ry,attrs,parent)=>make('ellipse',{cx:x,cy:y,rx,ry,...attrs},parent);
  const [c,shade,light]=COLORS[a.character]||COLORS.sprout,ink='#293d40';
  const effect=make('g',{class:`avatar-fx avatar-fx-${a.effect}`},svg);
  if(cinematic)drawCinematicEffect(a.effect,effect,{make,ellipse});
  else if(LUXURY_EFFECTS[a.effect])drawLuxuryEffect(a.effect,effect,{make,ellipse});
  else if(a.effect!=='none'){
    const hues={stars:'#f6c96b',leaves:'#77dda2',sparkles:'#c4a4ff',flame:'#ff955d',galaxy:'#9cafff',snow:'#a5e9ff',hearts:'#ff8fba'},hue=STREET_EFFECTS[a.effect]?.color||RPG_EFFECTS[a.effect]?.color||hues[a.effect]||hues.stars;
    ellipse(9,20,10,2.5,{fill:hue,opacity:'.13',class:'avatar-aura'},effect);
    if(['stars','galaxy','sparkles','snow'].includes(a.effect)||RPG_EFFECTS[a.effect]?.ring){
      for(let i=0;i<2;i++)ellipse(9,11,11-i*1.3,4+i*4,{fill:'none',stroke:hue,'stroke-width':i?.14:.24,opacity:'.5',transform:`rotate(${i?52:-22} 9 11)`,class:'avatar-halo'},effect);
    }
    if(a.effect==='galaxy')ellipse(9,10,11.5,13,{fill:'none',stroke:'#e1b1ff','stroke-width':'.35','stroke-dasharray':'1 1.5',class:'avatar-galaxy-ring'},effect);
    if(RPG_EFFECTS[a.effect]?.ring){ellipse(9,10,10.5,12,{fill:'none',stroke:hue,'stroke-width':'.3','stroke-dasharray':a.effect==='runes'?'1.5 .5':'.4 2',class:'avatar-galaxy-ring'},effect);}
    if(STREET_EFFECTS[a.effect]?.ring){ellipse(9,10,11,12,{fill:'none',stroke:hue,'stroke-width':a.effect==='chromehaze'?'.65':'.4','stroke-dasharray':'8 4 1 4',class:'avatar-street-ring'},effect);ellipse(9,11,11.5,4,{fill:'none',stroke:a.effect==='neonloop'?'#d7ace9':hue,'stroke-width':'.35',transform:'rotate(-18 9 11)',opacity:'.6'},effect);}
    const orbit=make('g',{class:'avatar-orbit'},effect),count=a.effect==='flame'?12:9;
    for(let i=0;i<count;i++){
      const angle=i*Math.PI*2/count,x=9+Math.cos(angle)*11,y=10+Math.sin(angle)*11.5;
      const particle=make('g',{class:`avatar-particle avatar-particle-${a.effect}`,style:`--delay:${-i*.47}s;--duration:${2.6+i%4*.4}s;--drift:${(i%2?1:-1)*(1+i%3)}px;--spin:${i%2?32:-28}deg`},orbit);
      const anchor=make('g',{transform:`translate(${x.toFixed(2)} ${y.toFixed(2)})`},particle);
      if(STREET_EFFECTS[a.effect])drawStreetParticle(a.effect,anchor,{make,ellipse},hue,i);
      else if(RPG_EFFECTS[a.effect])drawRPGParticle(a.effect,anchor,{make,ellipse},hue,i);
      else if(a.effect==='leaves')make('path',{d:'M-1.2 1Q-2-1 1.5-1.7Q2.2.5-1.2 1M-1 1 1-1',fill:i%2?'#bfe990':hue,stroke:'#438d67','stroke-width':'.12'},anchor);
      else if(a.effect==='hearts')make('path',{d:'M0 1.4-1.6-.1Q-2.3-1.6-.8-1.7Q0-1.8 0-.9Q.8-2.2 1.6-1.3Q2.2-.5 0 1.4',fill:i%2?'#ffd2e3':hue},anchor);
      else if(a.effect==='flame')make('path',{d:'M0 2Q-2.5.8-1-1Q-.4-1.8-.5-3Q2-.5 1.5 1Q1 2 0 2',fill:i%2?'#ffd478':hue},anchor);
      else if(a.effect==='snow'){make('path',{d:'M-1.5 0h3M0-1.5v3M-1-1 2 2M-1 1 1-1',fill:'none',stroke:i%2?'#ecfbff':hue,'stroke-width':'.3'},anchor);}
      else make('path',{d:'M0-1.7 .45-.45 1.7 0 .45.45 0 1.7-.45.45-1.7 0-.45-.45Z',fill:i%2?'#fff2ca':hue},anchor);
    }
  }
  ellipse(9,20.7,6.2,1.1,{fill:'#253e3a',opacity:'.16',class:'avatar-ground-shadow'},svg);
  const body=make('g',{class:'avatar-body'},svg);
  rect(4,18,4,2,ink,body);rect(10,18,4,2,ink,body);rect(5,18,2,1,shade,body);rect(11,18,2,1,shade,body);
  if(['cat','fox','dragon'].includes(a.character)){rect(3,2,3,5,ink,body);rect(12,2,3,5,ink,body);rect(4,3,1,3,light,body);rect(13,3,1,3,light,body);}
  if(a.character==='bunny'){rect(4,-1,3,8,ink,body);rect(11,-1,3,8,ink,body);rect(5,0,1,5,'#f9cee2',body);rect(12,0,1,5,'#f9cee2',body);}
  if(a.character==='bear'){rect(3,3,4,4,ink,body);rect(11,3,4,4,ink,body);rect(4,4,2,2,shade,body);rect(12,4,2,2,shade,body);}
  rect(3,6,12,9,ink,body);rect(4,5,10,12,ink,body);rect(5,4,8,13,ink,body);rect(4,6,10,9,c,body);rect(5,5,8,11,c,body);rect(5,5,7,1,light,body);rect(13,7,1,7,shade,body);rect(5,14,8,2,shade,body);
  rect(5,15,8,4,'#4e7e78',body);rect(6,15,6,1,'#86b5a0',body);rect(8,16,2,3,'#c7dbc1',body);rect(1,13,3,4,ink,body);rect(2,13,2,3,c,body);rect(14,13,3,4,ink,body);rect(14,13,2,3,c,body);
  if(['fox','cat','bear'].includes(a.character)){rect(7,10,4,4,light,body);rect(8,10,2,1,ink,body);}
  if(a.character==='penguin'){rect(6,8,6,7,'#fbf0d4',body);rect(8,10,2,2,'#efb961',body);}
  if(a.character==='dragon'){rect(7,12,4,2,'#f8d9a5',body);rect(2,13,1,2,'#b7a0ec',body);rect(15,13,1,2,'#b7a0ec',body);}
  if(a.character==='sprout'){rect(8,1,1,4,'#52784e',body);rect(5,1,3,2,'#8bb674',body);rect(9,0,4,2,'#6c995a',body);rect(9,0,3,1,'#a4ca86',body);}
  if(a.character==='robot'){rect(8,1,1,4,ink,body);rect(7,0,3,2,'#efba69',body);rect(5,12,8,2,shade,body);for(let i=0;i<3;i++)rect(6+i*2,12.4,1,.6,light,body);}
  const eyes=make('g',{class:'avatar-eyes'},body);for(const x of [6,11]){rect(x,8,1,2,ink,eyes);rect(x,8,.4,.5,'#fff9e6',eyes);}rect(8,12,2,.5,ink,body);rect(5,11,1.5,.7,'#e9a49c',body,{opacity:'.65'});rect(11.5,11,1.5,.7,'#e9a49c',body,{opacity:'.65'});
  const rpgDraw={make,rect,ellipse,ink};drawRPGCharacter(a.character,body,rpgDraw);
  drawStreetCharacter(a.character,body,rpgDraw);
  drawLuxuryCharacter(a.character,body,rpgDraw);
  function drawHat(body){
  const hat=a.hat;
  if(hat==='cap'){rect(4,3,10,2,'#416a9d',body);rect(5,2,8,2,'#78a8d1',body);rect(5,2,6,.6,'#b7d7ed',body);rect(11,4,5,1,'#36567e',body);}
  if(hat==='beanie'){rect(4,3,10,2,'#b75672',body);rect(5,1,8,3,'#e78ea5',body);rect(8,0,2,1,'#f6c3cf',body);for(const x of [6,8,10,12])rect(x,2,.4,2,'#c36a85',body);}
  if(hat==='crown'){rect(4,3,10,2,'#d69b39',body);rect(4,2,10,2,'#f6cf60',body);for(const x of [4,8,12])rect(x,0,2,3,'#ffde7e',body);rect(8.4,2.3,1.2,1.2,'#d56672',body);rect(5,4,8,.4,'#fff1b2',body);}
  if(hat==='wizard'){make('path',{d:'M2 4 16 4 12 2 9-4 6 2Z',fill:'#6757a0',stroke:ink,'stroke-width':'.4'},body);rect(4,3,10,1,'#a99add',body);make('path',{d:'M9-2 9.3-1.2 10-1 9.3-.7 9 0 8.7-.7 8-1 8.7-1.2Z',fill:'#ffe3a3'},body);}
  if(hat==='headphones'){make('path',{d:'M3 9V6Q3-1 9-1T15 6V9',fill:'none',stroke:'#547299','stroke-width':'1.5'},body);for(const x of [2,14]){rect(x,7,2,5,'#293c55',body);rect(x+.4,7.6,1.2,3.8,'#81e0de',body);}}
  if(hat==='halo')ellipse(9,0,5,1.3,{fill:'none',stroke:'#ffcf65','stroke-width':'.7',class:'avatar-halo-crown'},body);
  if(hat==='flower')for(let i=0;i<5;i++){const x=4+i*2.5;make('circle',{cx:x,cy:3,r:1.1,fill:i%2?'#efb6d2':'#f7d98e'},body);make('circle',{cx:x,cy:3,r:.4,fill:'#9a7951'},body);}
  if(hat==='samurai'){make('path',{d:'M3 5 5 1 13 1 15 5Z',fill:'#b25152',stroke:ink,'stroke-width':'.5'},body);make('path',{d:'M4 3 1-1 5 1M14 3 17-1 13 1',fill:'none',stroke:'#efc36b','stroke-width':'.9'},body);rect(8,1,2,3,'#e8c073',body);}
  if(hat==='astronaut'){ellipse(9,9,7.5,9,{fill:'#c9efff',opacity:'.12',stroke:'#b5cbd9','stroke-width':'.7'},body);make('path',{d:'M4 3Q2 5 2 8',fill:'none',stroke:'#effaff','stroke-width':'.6'},body);rect(3,15,12,2,'#b5cbd9',body);}
  drawRPGHat(hat,body,rpgDraw);
  drawStreetHat(hat,body,rpgDraw);
  drawLuxuryHat(hat,body,rpgDraw);
  }
  function drawGlasses(body){
  if(a.glasses==='round'||a.glasses==='sun'||a.glasses==='goggles'){
    const lens=a.glasses==='sun'?'#283d5d':a.glasses==='goggles'?'#9ad3c8':'#e9d7a0';for(const x of [6.5,11.5])ellipse(x,9,2,1.8,{fill:lens,'fill-opacity':a.glasses==='round'?'.13':'.9',stroke:a.glasses==='goggles'?'#986b45':'#4b4653','stroke-width':'.45'},body);rect(8.5,8.5,1,.4,'#4b4653',body);for(const x of [5.5,10.5])rect(x,8.2,.6,.5,'#fff8eb',body,{opacity:'.7'});
  }
  if(a.glasses==='heart')for(const x of [6.5,11.5])make('path',{d:`M${x} 10.5l-2-1.6q-1-2 1-2l1 .7 1-.7q2 0 1 2Z`,fill:'#e989ac',stroke:'#8e4973','stroke-width':'.3'},body);
  if(a.glasses==='visor'){rect(4.5,7,9,3,'#33456e',body);rect(5,7.6,8,1.3,'#69e8e4',body);rect(5,7.6,3,.4,'#d5ffff',body);}
  if(a.glasses==='monocle'){ellipse(11.5,9,2,2,{fill:'none',stroke:'#e1b45d','stroke-width':'.45'},body);make('path',{d:'M13 10.5Q15 13 13 16',fill:'none',stroke:'#d3af68','stroke-width':'.25'},body);}
  drawRPGGlasses(a.glasses,body,rpgDraw);
  drawStreetGlasses(a.glasses,body,rpgDraw);
  drawLuxuryGlasses(a.glasses,body,rpgDraw);
  }
  drawHat(make('g',{class:'avatar-hat'},body));drawGlasses(make('g',{class:'avatar-glasses'},body));
  if(companion)drawAccessory(a.accessory,make('g',{class:'avatar-accessory',transform:'translate(28 11)'},svg),{make});
  return svg;
}
export function avatarItemPreview(item,value=AVATAR_DEFAULT){
  if(item.slot==='accessory'){const svg=accessoryAvatar(item.value);svg.dataset.avatarPreviewSlot=item.slot;return svg;}
  const standalone=['character','hat','glasses'].includes(item.slot),avatar=standalone?{...AVATAR_DEFAULT,[item.slot]:item.value}:{...value,[item.slot]:item.value},svg=pixelAvatar(avatar);svg.dataset.avatarPreviewSlot=item.slot;
  if(item.slot==='hat'||item.slot==='glasses'){
    const layer=svg.querySelector(item.slot==='hat'?'.avatar-hat':'.avatar-glasses');svg.replaceChildren(layer);
    if(item.value==='none'){
      svg.setAttribute('viewBox','0 0 24 24');const ns='http://www.w3.org/2000/svg',circle=document.createElementNS(ns,'circle'),line=document.createElementNS(ns,'path');circle.setAttribute('cx','12');circle.setAttribute('cy','12');circle.setAttribute('r','7');circle.setAttribute('fill','none');circle.setAttribute('stroke','currentColor');circle.setAttribute('stroke-width','1');line.setAttribute('d','M7 17 17 7');line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width','1');svg.replaceChildren(circle,line);svg.style.opacity='.45';
    }else if(item.slot==='glasses')svg.setAttribute('viewBox',['monocle','plague','goldmask','dragonmask','ninjawrap'].includes(item.value)?'1 4 16 14':'2 5 14 9');
    else{
      const box={astronaut:'-1 -2 20 22',headphones:'0 -4 18 18',earmuffs:'-1 -4 20 18',earbuds:'0 5 18 9',halo:'2 -4 14 8',crown:'2 -2 14 9',wizard:'0 -6 18 13',witchhat:'-2 -6 22 14',antlers:'-2 -7 22 15',voidhorns:'-2 -7 22 15',sunhalo:'-1 -6 20 13',dragonhelm:'-1 -5 20 15',valkyrie:'-2 -5 22 14',jester:'-2 -6 22 13',phoenixcrest:'-2 -7 22 14',ninja:'-1 -4 24 12'};svg.setAttribute('viewBox',box[item.value]||'-1 -4 20 12');
    }
  }
  svg.setAttribute('aria-label',item.name);return svg;
}

export function accessoryAvatar(value){
  const ns='http://www.w3.org/2000/svg';
  const make=(tag,attrs,parent)=>{const n=document.createElementNS(ns,tag);for(const [key,v]of Object.entries(attrs))n.setAttribute(key,String(v));parent?.append(n);return n;};
  const svg=make('svg',{viewBox:'-7 -8 14 16',class:'pixel-accessory',role:'img','aria-label':avatarItem('accessory',value)?.name||'액세서리 없음'});
  if(!drawAccessory(value,svg,{make})){
    make('circle',{cx:0,cy:0,r:4,fill:'none',stroke:'currentColor','stroke-width':'.4'},svg);
    make('path',{d:'M-3 3 3-3',stroke:'currentColor','stroke-width':'.4'},svg);
  }
  return svg;
}
