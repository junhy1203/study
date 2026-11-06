// Small original SVG companions shared by profile cards and world followers.
import {STATIONERY,drawStationery} from './avatar-stationery.js?v=20261106-stationery1';
const spectrum=['#ff82c0','#ffbb7a','#ffe98d','#99f4c2','#91e6ff','#b5a3ff','#e7a4ff'];
export const ACCESSORIES={
  sproutorb:['orb','#b0db91','#f0ffcc'],cloudlet:['cloud','#c2dcf4','#fff'],starbud:['star','#ffce76','#fff1bf'],bubblebot:['robot','#99cdd5','#eaffff'],honeybee:['bee','#ffd475','#57495c'],jellybean:['slime','#bca8ed','#f5dbff'],
  moonbunny:['bunny','#d2c2f4','#fff6db'],minidrone:['drone','#84e9e0','#505e87'],spellbook:['book','#ad9bdf','#fff0b0'],crystalwing:['butterfly','#a3e5ed','#d3b2f4'],tinywhale:['whale','#9ec6ed','#e0f5ff'],treasureling:['chest','#dfb06f','#fff2a9'],
  flamefox:['fox','#ffa56c','#ffe3ab'],icejelly:['jelly','#96e6f4','#e4d6ff'],chronorb:['clock','#e6c885','#fff5ce'],ufo:['ufo','#adadee','#90ffe0'],cometcat:['cat','#c5b0ed','#ffe6ab'],
  stardragon:['dragon','#a9c4ff','#f5d2ff'],sunphoenix:['bird','#ffbd71','#fff2ac'],voidwhale:['whale','#b396e4','#92efe6'],royalorb:['crown','#ffdc85','#fff4cf'],
  rainbowseraph:['seraph','#f4d7ff','#fff'],prismleviathan:['dragon','#b2ecff','#f9daff'],universeling:['universe','#c8a2ff','#fff1be'],
  ...STATIONERY,
};
const sparkle='M0-1.3 .35-.35 1.3 0 .35.35 0 1.3-.35.35-1.3 0-.35-.35Z';
export function drawAccessory(value,parent,{make}){
  const spec=ACCESSORIES[value];if(!spec)return null;
  const [shape,color,light]=spec,mythic=['rainbowseraph','prismleviathan','universeling'].includes(value)||spec[3]==='신화';
  const floating=make('g',{class:'avatar-accessory-float','data-accessory-value':value},parent);
  const art=make('g',{class:mythic?'avatar-accessory-art is-mythic':'avatar-accessory-art'},floating);
  const path=(d,fill=color,extra={})=>make('path',{d,fill,stroke:'#566078','stroke-width':'.18','stroke-linejoin':'round',...extra},art);
  const oval=(x,y,rx,ry,fill=color,extra={})=>make('ellipse',{cx:x,cy:y,rx,ry,fill,...extra},art);
  const face=(y=.5)=>{for(const x of [-1,1])oval(x,y,.22,.3,'#35435b');path(`M-.5 ${y+1}q.5 .5 1 0`,'none',{'stroke-width':'.2'});};
  if(STATIONERY[value])drawStationery(shape,art,{make},color,light);
  else if(['orb','slime','crown'].includes(shape)){
    oval(0,.5,3,shape==='slime'?2.3:3);oval(-.9,-.5,.8,.5,light);face();
    if(shape==='orb')path('M0-2v-2q-3-1-2 .6Q0-2 0-3q2-2 3-.5Q2-2 0-2','#91bd71');
    if(shape==='crown')path('M-2-2-3-4-1-3 0-5 1-3 3-4 2-2Z','#ffdc85');
  }else if(shape==='cloud'){
    path('M-3 2Q-5 0-3-1q0-3 3-2 3-2 4 1 3 1 0 4Z');face();
  }else if(shape==='star'){
    path('M0-4 1.3-1.4 4-1 2 1 2.5 4 0 2.6-2.5 4-2 1-4-1-1.3-1.4Z');face();
  }else if(['robot','drone'].includes(shape)){
    make('rect',{x:-2.6,y:-2,width:5.2,height:4.5,rx:1,fill:color,stroke:'#566078','stroke-width':'.2'},art);face();
    path('M0-2v-1.3','none');oval(0,-3.5,.5,.5,light);
    if(shape==='drone')for(const x of [-3.5,3.5]){path(`M${x} 0v-2`,'none');oval(x,-2.2,1.6,.35,light);}
  }else if(shape==='bee'){
    oval(-1.5,-2,1.6,1.2,'#e4faff');oval(1.5,-2,1.6,1.2,'#e4faff');oval(0,.5,3,2);path('M-1.2-1v3M.2-1.4v3.8','none',{stroke:light,'stroke-width':'.65'});oval(2,.4,.25,.3,'#35435b');
  }else if(['cat','fox','bunny'].includes(shape)){
    path(shape==='bunny'?'M-2-1q-2-6 0-4l1 3h2q1-5 2-3l-1 4Z':'M-3-1-3-4 0-2 3-4 3-1Z');oval(0,.5,3,2.7);oval(0,1.5,1.5,1,light);face();
    if(shape==='cat')path('M3 2q4-4 1-5','none',{stroke:color,'stroke-width':'.8'});
  }else if(shape==='book'){
    path('M-4-2q2-1 4 .3 2-1.3 4-.3V3q-2-.7-4 .5Q-2 2.3-4 3Z');path('M0-1.7v5M-3-.5l2 .2m2 0 2-.2M-3 1l2 .2m2 0 2-.2','none',{stroke:light,'stroke-width':'.3'});
  }else if(shape==='butterfly'){
    for(const side of [-1,1]){oval(side*2,-1,2.2,2.3);oval(side*1.8,2,1.6,1.5,light);}path('M0-2v5','none',{'stroke-width':'.6'});path('M0-2-1-3m1 1 1-1','none');
  }else if(shape==='whale'){
    path('M-3 2Q-5-2-1-3 3-4 3 0L5-2 5 2 3 1Q2 4-3 2Z');path('M-2 2q2 1 3-.5',light);oval(-2,-.5,.3,.35,'#35435b');path('M-1-3v-1.4m0 .4-1-.6m1 .6 1-.6','none',{stroke:light,'stroke-width':'.3'});
  }else if(shape==='chest'){
    path('M-3.5-1q0-3 3.5-3t3.5 3V3h-7Z');path('M-3.5 0h7M-2-3v6m4-6v6','none',{stroke:light,'stroke-width':'.45'});make('rect',{x:-.6,y:-.5,width:1.2,height:2,fill:light},art);
  }else if(shape==='jelly'){
    path('M-3.5 0q0-6 3.5-4t3.5 4Z');for(let i=0;i<4;i++)path(`M${-2.5+i*1.6} 0q-1 2 0 4`,'none',{stroke:color,'stroke-width':'.6'});face(-1.5);
  }else if(shape==='clock'){
    for(let i=0;i<8;i++){const a=i*Math.PI/4;oval(Math.cos(a)*3.3,Math.sin(a)*3.3,.55,.55);}
    oval(0,0,3,3);oval(0,0,2.3,2.3,light);path('M0-1.6V0l1.4 .8','none',{'stroke-width':'.4'});
  }else if(shape==='ufo'){
    oval(0,-1,2,2,light);oval(0,1,4,1.3);for(const x of [-2.5,0,2.5])oval(x,1.2,.4,.35,light);
  }else if(['dragon','bird','seraph'].includes(shape)){
    for(const side of [-1,1])path(`M${side} 0 ${side*5}-3 ${side*4} 1 ${side*2} 3Z`,mythic?spectrum[side<0?0:4]:light);
    oval(0,.5,1.9,3);oval(0,-1.5,2.1,1.8);face(-1.7);
    if(shape==='dragon'){path('M-1.5-2-2-4 0-2 2-4 1.5-2Z',light);path('M1 2q5 3 3-1','none',{stroke:color,'stroke-width':'.8'});}
    if(shape==='bird')path('M-1 2-2 5 0 4 2 5 1 2Z',light);
    if(shape==='seraph')oval(0,-4,2.6,.65,'none',{stroke:'#ffe799','stroke-width':'.45'});
  }else if(shape==='universe'){
    oval(0,0,2.6,2.6);for(let i=0;i<3;i++)oval(0,0,4.5,1.5,'none',{stroke:spectrum[i*2],'stroke-width':'.35',transform:`rotate(${i*60} 0 0)`});
  }
  if(mythic){
    for(let i=0;i<7;i++){const a=i*Math.PI*2/7;make('path',{d:sparkle,fill:spectrum[i],transform:`translate(${(Math.cos(a)*5.2).toFixed(2)} ${(Math.sin(a)*5.2).toFixed(2)}) scale(.55)`,class:'avatar-accessory-sparkle',style:`--delay:${-i*.4}s`},art);}
  }
  return floating;
}
