// Wide scene effects: bounded SVG geometry and CSS animations, no frame loop.
export const CINEMATIC_EFFECTS=Object.freeze({
  celestialwings:{format:'wings'},rainbowthrone:{format:'throne'},meteorcathedral:{format:'meteors'},prismfireworks:{format:'fireworks'},galacticgate:{format:'portal'},cosmiccoronation:{format:'coronation'},
});
const colors=['#ff7cbd','#ffb477','#ffe58b','#98f2bc','#8eeaff','#b3a2ff','#e9a7ff'];
const star='M0-1.6 .4-.4 1.6 0 .4.4 0 1.6-.4.4-1.6 0-.4-.4Z';
export function drawCinematicEffect(kind,parent,{make,ellipse}){
  if(!CINEMATIC_EFFECTS[kind])return;
  const scene=make('g',{class:`avatar-cinematic-scene cinematic-${kind}`,'data-effect-format':CINEMATIC_EFFECTS[kind].format},parent);
  const path=(d,attrs,group=scene)=>make('path',{d,fill:'none',...attrs},group);
  const jewel=(x,y,i,scale=1,group=scene)=>path(star,{fill:colors[i%7],stroke:'#fff','stroke-width':'.12',transform:`translate(${x} ${y}) scale(${scale})`,class:'cinematic-star',style:`--scene-delay:${-i*.37}s`},group);
  const floor=make('g',{class:'cinematic-floor'},scene);
  for(let i=0;i<3;i++)ellipse(9,24,22-i*3.5,3.5-i*.6,{fill:i?'none':'#b899ff18',stroke:colors[i*2],'stroke-width':'.28',opacity:'.7'},floor);
  function wings(){
    for(const side of [-1,1]){
      const wing=make('g',{class:`cinematic-wing cinematic-wing-${side<0?'left':'right'}`},scene);
      for(let i=0;i<7;i++){
        const tip=9+side*(24-i*1.6),top=-11+i*3.4;
        path(`M9 13Q${9+side*10} ${top-2} ${tip} ${top}Q${tip-side*2} ${top+12} ${9+side*(5+i*.35)} 19Z`,{fill:colors[i],opacity:'.68',stroke:'#fff6','stroke-width':'.25'},wing);
        path(`M${9+side*3} 15Q${9+side*12} ${top+5} ${tip} ${top}`,{stroke:'#fff9','stroke-width':'.22'},wing);
      }
    }
  }
  function beams(){
    const rays=make('g',{class:'cinematic-rays'},scene);
    for(let i=0;i<14;i++){
      const a=i*Math.PI*2/14,x=9+Math.cos(a)*25,y=8+Math.sin(a)*23;
      path(`M9 13 ${x.toFixed(2)} ${(y-1.2).toFixed(2)} ${(x+1.8).toFixed(2)} ${(y+1.2).toFixed(2)}Z`,{fill:colors[i%7],opacity:'.15'},rays);
    }
  }
  function fireworks(){
    for(const [burst,[x,y,r]]of [[-8,-5,7.5],[26,-7,7.5],[9,-12,6]].entries()){
      const anchor=make('g',{transform:`translate(${x} ${y})`},scene);
      const bloom=make('g',{class:'cinematic-firework',style:`--scene-delay:${-burst*1.7}s`},anchor);
      for(let i=0;i<14;i++){
        const a=i*Math.PI*2/14,dx=Math.cos(a),dy=Math.sin(a);
        path(`M${dx*r*.35} ${dy*r*.35} ${dx*r} ${dy*r}`,{stroke:colors[(i+burst)%7],'stroke-width':'.45','stroke-linecap':'round'},bloom);
        ellipse(dx*r,dy*r,.32,.32,{fill:'#fff3d5'},bloom);
      }
      jewel(0,0,burst,1.2,bloom);
    }
  }
  function meteors(){
    for(let i=0;i<10;i++){
      const anchor=make('g',{transform:`translate(${-10+i*4.1} ${-10+i%3*8})`},scene);
      const trail=make('g',{class:'cinematic-meteor',style:`--scene-delay:${-i*.73}s;--scene-duration:${3.5+i%3*.6}s`},anchor);
      path('M-4-7 0 0-1-5Z',{fill:colors[i%7],opacity:'.6'},trail);jewel(0,0,i,.75,trail);
    }
  }
  function throne(){
    const palace=make('g',{class:'cinematic-palace'},scene);
    for(const side of [-1,1]){
      path(`M${9+side*19} 24V-4l${side*2} -5 ${side*2} 5v28Z`,{fill:colors[side<0?4:0],opacity:'.45',stroke:'#fff8','stroke-width':'.3'},palace);
      for(let i=0;i<3;i++)jewel(9+side*19,2+i*7,i,.65,palace);
    }
    path('M-8-4Q9-24 26-4M-6-3Q9-20 24-3',{stroke:'#d6a8ff','stroke-width':'.5'},palace);
    path('M2-8 1-13 5-11 9-16 13-11 17-13 16-8Z',{fill:'#fff0b7',stroke:'#f3b4ff','stroke-width':'.4'},palace);
    for(let i=0;i<5;i++)jewel(3+i*3,-9.6,i,.5,palace);
  }
  function portal(){
    const halo=make('g',{class:'cinematic-portal'},scene);
    ellipse(9,8,22,22,{fill:'#9f79f324',stroke:'#c9baff','stroke-width':'.7'},halo);
    for(let i=0;i<7;i++)ellipse(9,8,21-i*1.2,21-i*1.2,{fill:'none',stroke:colors[i],'stroke-width':'.45','stroke-dasharray':`${9+i} ${4+i}`,opacity:'.7'},halo);
    for(let i=0;i<12;i++){const a=i*Math.PI/6;jewel(9+Math.cos(a)*23,8+Math.sin(a)*23,i,.8,halo);}
  }
  if(kind==='celestialwings'){wings();beams();}
  if(kind==='rainbowthrone'){beams();throne();}
  if(kind==='meteorcathedral'){portal();meteors();}
  if(kind==='prismfireworks'){fireworks();beams();}
  if(kind==='galacticgate'){portal();beams();}
  if(kind==='cosmiccoronation'){beams();wings();throne();fireworks();}
  for(const [i,[x,y]]of [[-11,15],[30,16],[-8,2],[27,1],[0,27],[19,27]].entries())jewel(x,y,i,.7);
}
