// Each scene keeps its own silhouette and timing. Outer anchors place the art,
// while the inner groups can move without overwriting SVG positioning.
const star='M0-1.8.42-.42 1.8 0 .42.42 0 1.8-.42.42-1.8 0-.42-.42Z';
const shard='M0-2.4 1.1-.4.5 1.8-.7 2.1-1.1-.4Z';

const scenes={
  flame({at,layer,shape,stroke,ring}){
    ring(9,21,11,2.5,'#ff854e',layer('echo'));
    for(let i=0;i<8;i++){
      const x=-1+i*2.8;
      const jet=at(x,21-Math.abs(3.5-i)*.5,'beat',-.12*Math.abs(3.5-i));
      shape('M0 1Q-3.6-1.5-.8-5Q-1-2 .4-3.7Q2.4-5.5 1-8Q5-3 2.2.1Z',i%2?'#ffb544':'#ff654a',jet);
      shape('M.2 0Q-1.1-1.1.7-3.6Q2.5-1 .2 0Z','#fff2ae',jet);
      stroke('M-1-8l-.4-1.4M2.8-6l.5-1.2','#ffae56',.5,at(x,16,'embers',-.17*i));
    }
  },
  galaxy({at,layer,shape,stroke,ring}){
    const arms=layer('beat');
    for(const angle of [0,180]){
      const arm=at(9,10,'',0,arms,angle);
      stroke('M0 0C-4-7 5-11 10-6Q15-1 10 5','#8b82fa',2.2,arm,{opacity:'.56'});
      stroke('M0 0C-4-7 5-11 10-6Q15-1 10 5','#d8bcff',.62,arm);
    }
    ring(9,10,12,5,'#a0b7ff',layer('echo'),{transform:'rotate(-28 9 10)'});
    for(let i=0;i<10;i++){
      const a=i*Math.PI/5;
      shape(star,i%2?'#cfc2ff':'#fff4c4',at(9+12*Math.cos(a),10+10*Math.sin(a),'glint',-.13*i));
    }
  },
  snow({at,shape,stroke}){
    for(let i=0;i<6;i++){
      const angle=i*Math.PI/3,flake=at(9+10.5*Math.cos(angle),9+10.5*Math.sin(angle),'beat',-.14*i);
      stroke('M0-2.5v5M-2.2-1.25l4.4 2.5M-2.2 1.25l4.4-2.5M-.7-2l.7.6.7-.6M-.7 2l.7-.6.7.6','#9adeff',.57,flake);
      shape('M0-.6.6 0 0 .6-.6 0Z','#f5ffff',flake);
      shape(shard,'#bdeeff',at(8+11*Math.cos(angle+.4),10+11*Math.sin(angle+.4),'frost',-.16*i));
    }
  },
  runes({at,layer,shape,stroke,ring}){
    const seal=layer('beat');
    ring(9,10,11.7,11.7,'#c29aff',seal,{width:.65,dash:'2.5 1.4'});
    ring(9,10,9.7,9.7,'#7961da',seal);
    stroke('M9-1-1 16h20ZM9 21-1 4h20Z','#d6b1ff',.46,seal,{opacity:'.65'});
    const glyphs=['M0 1.5v-3l1 .6M0 .1l.8-.4','M-.8 1.5l1.6-3M-.8-1.5l1.6 3','M-.8-1.5h1.6L0 0l.8 1.5H-.8','M0 1.5v-3M-1-.6 0 .4 1-.6'];
    for(let i=0;i<8;i++){
      const a=i*Math.PI/4;
      stroke(glyphs[i%4],'#fff2cc',.47,at(9+11.7*Math.cos(a),10+11.7*Math.sin(a),'glint',-.12*i,seal));
    }
    shape(star,'#fff2cc',at(9,-2,'glint'));
  },
  lightning({at,layer,shape,stroke,ring}){
    const hits=['M3-5 .2 2 3.3 1-3 10 1.4 8-1 19','M18-4 20 2 17 3 22 9 19.4 10 23 18'];
    hits.forEach((d,i)=>{
      const strike=layer('beat',i?-.38:0);
      stroke(d,'#7165fc',2.6,strike,{opacity:'.62'});
      stroke(d,'#e5f9ff',.86,strike);
      stroke(i?'M22 9l-1 4-3 2':'M-3 10l-2 3 2 2','#a7d9ff',.45,strike);
      shape(star,'#fffce4',at(i?22:-3,i?9:10,'',0,strike));
    });
    ring(9,21,12,2,'#8ba9ff',layer('echo'));
  },
  swords({at,shape,stroke}){
    for(const [i,angle] of [-48,44,152].entries()){
      const slash=at(9,10,'beat',-.29*i,undefined,angle);
      shape('M-14 5Q-8-8 14-4Q-5-2-14 5Z','#a98aff',slash,{opacity:'.7'});
      stroke('M-14 5Q-8-8 14-4','#f6efff',.8,slash);
      const blade=at(11,-4,'',0,slash,46);
      shape('M0-3.5.7-2.2.52 1.5H-.52L-.7-2.2Z','#f3f3ff',blade,{stroke:'#9d86e4','stroke-width':'.27'});
      stroke('M-1.2 1.5h2.4M0 1.5v1.8','#ffe0a6',.54,blade);
      shape(star,'#e8c5ff',at(i===1?20:-2,i===2?17:4,'glint',-.29*i));
    }
  },
  phoenixfire({at,layer,shape,stroke,ring}){
    const wings=layer('beat');
    for(const side of [-1,1]){
      const wing=at(9,13,'',0,wings);
      for(let i=0;i<4;i++){
        const tip=side*(13-i*2),y=-14+i*2.6;
        shape(`M0 1Q${side*5} ${y+2} ${tip} ${y}Q${tip-side} ${y+8} 0 5Z`,i%2?'#ff944a':'#ff624e',wing);
        stroke(`M0 2Q${side*6} ${y+3} ${tip} ${y}`,'#ffe796',.5,wing);
      }
      for(let i=0;i<3;i++)shape(shard,'#ffc760',at(9+side*(8+i*1.7),15+i,'embers',-.15*i));
    }
    ring(9,20,11,2,'#ff9958',layer('echo'));
  },
  void({at,layer,shape,stroke,ring}){
    const rift=layer('beat');
    shape('M10-5 18 1 15 5 22 10 18 15 21 19 11 24 2 20-4 14-1 8-4 2 4 0Z','#271143',rift,{opacity:'.86'});
    stroke('M10-5 18 1 15 5 22 10 18 15 21 19 11 24M4 0-4 2-1 8-4 14 2 20 11 24','#db8fff',.74,rift);
    ring(9,10,12.5,9,'#9d53e7',layer('echo'),{transform:'rotate(-42 9 10)'});
    for(let i=0;i<6;i++)shape(shard,'#cc83ff',at(i%2?20:-2,2+i*3,'suction',-.2*i));
  },
  poison({at,layer,shape,stroke,ring}){
    const pool=layer('beat');
    ring(9,21,11.6,2.8,'#aaf466',pool,{fill:'#729c483d',width:.64});
    for(let i=0;i<7;i++){
      const x=-1+i*3.35,bubble=at(x,19+i%2*2,'bubble',-.21*i);
      ring(0,0,1.2,1.35,'#c6ff84',bubble,{fill:'#78c44c88'});
      stroke('M-.75-.4q.2-.55.65-.6','#f5ffbb',.36,bubble);
    }
    for(const [i,x] of [-1,19].entries()){
      const skull=at(x,10,'fume',-.65*i);
      shape('M-1.2 1v-2a1.2 1.2 0 1 1 2.4 0v2h-.7v.7h-1V1Z','#d1fa7a',skull);
      stroke('M-.65-.4h.2M.45-.4h.2','#376144',.42,skull);
    }
  },
  crystals({at,layer,shape,stroke,ring}){
    ring(9,21,11.6,2.7,'#83dfff',layer('echo'));
    for(let i=0;i<6;i++){
      const crystal=at(-1+i*4,21,'beat',-.1*Math.min(i,5-i));
      shape('M-2 0-1.4-4.6.1-7.4 2.1-3.2 1.8 0Z',i%2?'#7bc5ff':'#5f97ef',crystal);
      shape('M-1.4-4.6.1-7.4.5-3.6-2 0Z','#d5faff',crystal);
      stroke('M.1-7.4.5-3.6 2.1-3.2','#f2ffff',.42,crystal);
    }
  },
  meteors({at,shape,stroke,ring}){
    for(let i=0;i<6;i++){
      const x=-3+i*4.2,y=1+i%3*5,meteor=at(x,y,'beat',-.31*i);
      shape('M-5.5-7.5 1 .2-.3 1.4Z','#ff7d60',meteor);
      stroke('M-4.4-6.3.2.3','#ffc26e',.75,meteor);
      ring(.1,.4,.76,.76,'#fff5d1',meteor,{fill:'#fff0a1'});
    }
    for(let i=0;i<3;i++)ring(1+i*8,21,3.1,1.4,'#ffa86d',at(0,0,'echo',-.31*i));
  },
  dragonsoul({at,layer,shape,stroke,ring}){
    const spirit=layer('beat');
    const trail='M-1 19C-9 14-2 6 7 9S24 17 21 7Q20 4 17 3';
    stroke(trail,'#4c92df',2.6,spirit,{opacity:'.58'});
    stroke(trail,'#8af9ea',.9,spirit);
    shape('M17 5 14 3 13 .5 11-1 14.2-.8 12.5-3 16-1 17.5-1.8 18 0 21.2 1 22.1 2.8 20 4 17.7 3.5Z','#8af9ea',spirit,{stroke:'#f2fff8','stroke-width':'.35'});
    stroke('M16.8.8l1-.3M18.7 2.8l2.3-.25','#244d76',.43,spirit);
    stroke('M20.5 1.8q2-1 3.1.5M20.5 3q2.1.1 2.4 1.7','#b1fff1',.28,spirit);
    ring(9,11,12,6,'#79d9f6',layer('echo'),{transform:'rotate(-30 9 11)'});
    for(let i=0;i<5;i++)shape(star,'#b1fff1',at(i%2?20:-1,3+i*4,'glint',-.21*i));
  },
  holy({at,layer,shape,stroke,ring}){
    const light=layer('beat');
    shape('M6-5h6l7 26H-1Z','#ffdc7b',light,{opacity:'.32'});
    stroke('M9-5v12M5-3 2 15M13-3l3 18','#ffe6a0',.6,light);
    ring(9,0,6,1.7,'#ffe6a0',light,{width:.7});
    ring(9,21,11,2.4,'#fff1a9',layer('echo'),{width:.6});
    for(const [i,[x,y]] of [[-1,5],[19,7],[2,16],[17,17]].entries()){
      shape('M-.45-2h.9v1.5H2v1H.45V2h-.9V.5H-2v-1h1.55Z','#fff3c0',at(x,y,'glint',-.19*i));
    }
  },
  ravens({at,shape,stroke}){
    for(let i=0;i<5;i++){
      const bird=at(-2+i*5,1+i%2*6,'beat',-.29*i);
      for(const side of [-1,1]){
        const wing=at(0,0,side<0?'flap-left':'flap-right',0,bird);
        shape(`M0 1Q${side*2} -3 ${side*4} -2L${side*3} .6 ${side*2} .5 ${side} 1.6Z`,'#48305f',wing,{stroke:'#b49ade','stroke-width':'.35'});
      }
      shape('M-1.1.1 0-.8 1.3.2 0 2Z','#4d376b',bird);
      stroke('M.6.1h.2','#f9c1fe',.42,bird);
    }
  },
  neonloop({at,layer,stroke,ring}){
    const loop=layer('beat'),d='M-2 12C-2 5 7 5 9 10S20 17 20 9 12 4 9 10-2 19-2 12Z';
    stroke(d,'#30d5cc',2.1,loop,{opacity:'.55'});
    stroke(d,'#aefdf1',.67,loop);
    stroke(d,'#ffc1f2',.88,layer('neon-trace'),{'stroke-dasharray':'7 12'});
    for(let i=0;i<4;i++)ring(0,0,.72,.72,'#dcfff9',at(i%2?20:-2,6+i*2,'glint',-.16*i));
  },
  vinylbeat({at,layer,shape,stroke,ring}){
    const record=layer('beat');
    for(let i=0;i<3;i++)ring(9,10,10.7+i*.75,9.7+i*.75,i%2?'#e2a4ff':'#907bf3',record,{dash:i===2?'11 4 2 4':undefined});
    const meters=layer('equalizer');
    for(let i=0;i<10;i++)stroke(`M${-1+i*2.25} 21v-${2+(i*7)%5}`,i%2?'#f7a2de':'#91f5ee',1,at(0,0,'bar',-.07*i,meters));
    for(const [i,x] of [-1,20].entries()){
      const note=at(x,5,'glint',-.25*i);
      stroke('M0 1v-3l1.7-.4v2.7','#fff0ca',.45,note);
      shape('M0 1q-1-.8-1.5.1Q-.8 2 0 1Z','#fff0ca',note);
    }
  },
  chromehaze({at,layer,shape,stroke}){
    for(const [i,angle] of [-28,43].entries()){
      const ribbon=at(9,10,'beat',-.62*i,undefined,angle);
      shape('M-14 2Q-9-6 1-1T14-3Q9 4 1 2T-14 2Z','#87a0c9',ribbon);
      stroke('M-14 2Q-9-6 1-1T14-3','#e5f3ff',.65,ribbon);
      stroke('M-11 1Q-6-2 1 1T10 0','#46578f',.55,ribbon);
    }
    const sheen=layer('echo');
    for(let i=0;i<4;i++)shape(star,'#effbff',at(9+i*4,-1+i*4,'glint',-.17*i,sheen));
  },
  prism({at,layer,shape,stroke}){
    const split=layer('beat');
    stroke('M-5 14 4 9','#e7feff',1,split);
    for(const [i,color] of ['#f58ecc','#ffc27e','#f9ed9a','#92f3d4','#91d0ff','#c29cf8'].entries()){
      stroke(`M13 9 ${21+i*.48} ${3+i*2.4}`,color,.65,at(0,0,'ray',-.055*i,split));
    }
    for(const [i,[x,y]] of [[9,-.5],[-1,11],[19,13]].entries()){
      shape('M0-2.1 1.7 0 0 2.1-1.7 0Z','#c5acfb',at(x,y,'glint',-.16*i),{stroke:'#fff0fb','stroke-width':'.38'});
    }
  },
};

export function drawImpactEffect(kind,parent,{make,ellipse}){
  if(!Object.hasOwn(scenes,kind))return false;
  const scene=make('g',{class:'avatar-impact-scene','data-impact-effect':kind},parent);
  const layer=(role,delay=0,group=scene)=>make('g',{
    class:`impact-${role}`,...(delay?{style:`--impact-delay:${delay}s`}:{}),
  },group);
  const at=(x,y,role,delay=0,group=scene,angle=0)=>{
    const anchor=make('g',{transform:`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${angle})`},group);
    return role?layer(role,delay,anchor):anchor;
  };
  const shape=(d,fill,group=scene,attrs={})=>make('path',{d,fill,...attrs},group);
  const stroke=(d,color,width,group=scene,attrs={})=>shape(d,'none',group,{
    stroke:color,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round',...attrs,
  });
  const ring=(x,y,rx,ry,color,group=scene,{width=.4,dash,fill='none',...attrs}={})=>ellipse(x,y,rx,ry,{
    fill,stroke:color,'stroke-width':width,...(dash?{'stroke-dasharray':dash}:{}),...attrs,
  },group);
  scenes[kind]({at,layer,shape,stroke,ring});
  return true;
}
