// Bounded SVG layers; animation is shared CSS, with no timers or render loop.
export const RAINBOW=['#ff75b5','#ffae73','#ffe783','#8bffc7','#80eaff','#a7a0ff','#e3a0ff'];
export const LUXURY_CHARACTERS={rainbowsovereign:['무지개 다이아 대공','#f6d6ff','#a58bcf','#ffffff']};
export const LUXURY_EFFECTS={rainbowparade:{count:18},sharalashower:{count:21},prismnova:{count:24}};
const star='M0-1.7 .4-.4 1.7 0 .4.4 0 1.7-.4.4-1.7 0-.4-.4Z';

export function drawLuxuryCharacter(kind,body,{make,rect}){
  if(!LUXURY_CHARACTERS[kind])return;
  const cape=make('g',{class:'avatar-luxury-shimmer'},body);
  for(let i=0;i<7;i++){
    rect(2+i*2,14,2,6,RAINBOW[i],cape);
    make('path',{d:`M${i<4?3:15} 14 ${i<4?-3:21} ${5+i%4} ${i<4?1:17} 17Z`,fill:RAINBOW[i],opacity:'.7'},cape);
  }
  make('path',{d:'M5 14 9 16 13 14 12 20H6Z',fill:'#fff5ff',stroke:'#cc94e8','stroke-width':'.3'},body);
  make('path',{d:'M9 15 11 17 9 19 7 17Z',fill:'#92f4ff',stroke:'#fff','stroke-width':'.4'},body);
  for(const [x,y]of [[1,12],[16,12],[9,17]])make('path',{d:star,fill:'#fff',transform:`translate(${x} ${y}) scale(.65)`,class:'avatar-luxury-glint'},body);
}

export function drawLuxuryHat(kind,body,{make,rect,ellipse}){
  if(!['prismcrown','discohalo'].includes(kind))return;
  const jewels=make('g',{class:'avatar-luxury-shimmer'},body);
  if(kind==='prismcrown'){
    make('path',{d:'M2 4 1-1 5 1 9-4 13 1 17-1 16 4Z',fill:'#ffe8a5',stroke:'#a176b9','stroke-width':'.35'},jewels);
    rect(2,3,14,1.5,'#fff2d2',jewels);
    for(let i=0;i<7;i++)make('path',{d:'M0-1.3 1 0 0 1.3-1 0Z',fill:RAINBOW[i],transform:`translate(${3+i*2} ${i===3?-1:2})`},jewels);
  }else{
    for(let i=0;i<7;i++)ellipse(9,0,7-i*.55,2.5-i*.19,{fill:'none',stroke:RAINBOW[i],'stroke-width':'.42'},jewels);
    for(let i=0;i<7;i++)make('path',{d:star,fill:RAINBOW[i],transform:`translate(${1+i*2.6} ${-3+Math.abs(i-3)*.45}) scale(.6)`,class:'avatar-luxury-glint',style:`--delay:${-i*.4}s`},jewels);
  }
}

export function drawLuxuryGlasses(kind,body,{make,ellipse}){
  if(!['diamondgaze','prismveil'].includes(kind))return;
  const jewels=make('g',{class:'avatar-luxury-shimmer'},body);
  make('path',{d:kind==='prismveil'?'M2 7 6 6 9 8 12 6 16 7 14 11 10 10 9 11 8 10 4 11Z':'M3 9H15',fill:kind==='prismveil'?'#ac8bdf':'none',stroke:'#fff0bc','stroke-width':'.5'},jewels);
  for(const [i,x]of [6,12].entries()){
    make('path',{d:`M${x} 6.5 ${x+2.5} 8.5 ${x} 11 ${x-2.5} 8.5Z`,fill:RAINBOW[i*4],stroke:'#fff','stroke-width':'.45'},jewels);
    make('path',{d:star,fill:'#fff',transform:`translate(${x-.6} 8) scale(.5)`,class:'avatar-luxury-glint'},jewels);
    for(let j=0;j<3;j++)ellipse(x-1+j,11+j%2*.6,.22,.3,{fill:RAINBOW[j+i*3]},jewels);
  }
}

export function drawLuxuryEffect(kind,parent,{make,ellipse}){
  if(!LUXURY_EFFECTS[kind])return;
  const fx=make('g',{class:`avatar-luxury-fx avatar-luxury-${kind}`},parent);
  const rings=make('g',{class:'avatar-luxury-rings'},fx);
  for(let i=0;i<7;i++)ellipse(9,10,11-i*.38,kind==='rainbowparade'?5+i*.7:12-i*.5,{fill:'none',stroke:RAINBOW[i],'stroke-width':kind==='prismnova'?'.32':'.2',opacity:'.7',transform:`rotate(${i*25} 9 10)`},rings);
  const orbit=make('g',{class:'avatar-orbit'},fx),count=LUXURY_EFFECTS[kind].count;
  for(let i=0;i<count;i++){
    const angle=i*Math.PI*2/count,x=9+Math.cos(angle)*(10+i%3*.6),y=10+Math.sin(angle)*12;
    const anchor=make('g',{transform:`translate(${x.toFixed(2)} ${y.toFixed(2)})`},orbit);
    const glint=make('g',{class:`avatar-luxury-glint${kind==='sharalashower'?' avatar-luxury-shower':''}`,style:`--delay:${-i*.31}s;--duration:${2.8+i%4*.4}s`},anchor);
    if(kind==='prismnova')make('path',{d:`M0 0 ${-Math.cos(angle)*3} ${-Math.sin(angle)*3}`,stroke:RAINBOW[i%7],'stroke-width':'.3',opacity:'.65'},glint);
    make('path',{d:kind==='rainbowparade'?'M0-1.5 1 0 0 1.5-1 0Z':star,fill:RAINBOW[i%7],stroke:'#fff','stroke-width':'.15'},glint);
    ellipse(0,0,.22,.22,{fill:'#fff'},glint);
  }
}
